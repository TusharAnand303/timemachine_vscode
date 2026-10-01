import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ProjectFoldersView, TimelineView } from '../views';
import { TimelineStore } from '../storage';
import { FocusView } from '../focusView';
import { ActivityTracker } from '../activityTracker';

interface SetupStatus {
	recordedEvents: number;
	shellIntegrationEnabled: boolean;
	terminals: { name: string; shellIntegration: boolean }[];
	projects: { name: string; path: string; recordedEvents: number; focusTime: { mode: 'coding' | 'ai' | null }; recentCommands: { command: string; cwd?: string; status: string }[] }[];
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 10000): Promise<void> {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		if (await predicate()) { return; }
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	assert.fail('TimeMachine did not record the expected event');
}

suite('TimeMachine extension', () => {
	test('opens the timeline in a workspace and registers snapshot actions', async () => {
		assert.ok(vscode.workspace.workspaceFolders?.length);
		await vscode.commands.executeCommand('timemachine.openTimeline');
		await waitFor(async () => vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.label.includes('Activity Graph'))));
		await vscode.commands.executeCommand('timemachine.folders.focus');
		await vscode.commands.executeCommand('timemachine.focus.focus');
		assert.equal((await vscode.commands.executeCommand<SetupStatus>('timemachine.showStatus')).projects[0].name, vscode.workspace.workspaceFolders[0].name);
		const commands = await vscode.commands.getCommands(true);
		for (const command of ['timemachine.openGraph', 'timemachine.showInGraph', 'timemachine.openFile', 'timemachine.viewChange', 'timemachine.compare', 'timemachine.restore', 'timemachine.exportReport']) {
			assert.ok(commands.includes(command), `${command} was not registered`);
		}
	});

	test('switches sidebar coding modes and pauses the selected project', async () => {
		try {
			await vscode.commands.executeCommand('timemachine.startCoding');
			assert.equal((await vscode.commands.executeCommand<SetupStatus>('timemachine.showStatus')).projects[0].focusTime.mode, 'coding');
			await vscode.commands.executeCommand('timemachine.startAi');
			assert.equal((await vscode.commands.executeCommand<SetupStatus>('timemachine.showStatus')).projects[0].focusTime.mode, 'ai');
		} finally { await vscode.commands.executeCommand('timemachine.pauseTimer'); }
		assert.equal((await vscode.commands.executeCommand<SetupStatus>('timemachine.showStatus')).projects[0].focusTime.mode, null);
	});

	test('puts the folder name in the main label of older opening records', () => {
		const folder = vscode.workspace.workspaceFolders![0];
		const view = new TimelineView(new TimelineStore(folder.uri));
		const item = view.getTreeItem({ kind: 'event', folder, event: { kind: 'opened', id: 'legacy-opening', at: Date.now(), folderUri: folder.uri.toString(), label: 'Project opened' } });
		assert.ok(String(item.label).includes(`${folder.name} opened`));
		assert.ok(String(item.tooltip).includes(folder.uri.fsPath));
		assert.equal(item.command?.command, 'timemachine.showInGraph');
	});

	test('starts and pauses recording from the sidebar button messages', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'timemachine-sidebar-'));
		const tracker = new ActivityTracker(vscode.Uri.file(directory));
		const provider = new FocusView(vscode.Uri.file(directory), tracker);
		const folder = vscode.workspace.workspaceFolders![0];
		let receive = (_message: unknown): void => {};
		const messages: { type: string; projects: { name: string; path: string }[] }[] = [];
		const webview = {
			html: '', options: {}, cspSource: 'https://test.invalid',
			asWebviewUri: (uri: vscode.Uri) => uri,
			onDidReceiveMessage: (listener: (message: unknown) => void) => { receive = listener; return new vscode.Disposable(() => {}); },
			postMessage: async (message: typeof messages[number]) => { messages.push(message); return true; },
		};
		try {
			provider.resolveWebviewView({ webview, onDidDispose: () => new vscode.Disposable(() => {}) } as unknown as vscode.WebviewView);
			assert.match(webview.html, /id="coding"/);
			assert.match(webview.html, /id="ai"/);
			receive({ type: 'ready' });
			assert.equal(messages.at(-1)?.projects[0].path, folder.uri.fsPath);
			receive({ type: 'start', projectId: folder.uri.toString(), mode: 'coding' });
			await waitFor(async () => tracker.summary(folder.uri.toString()).mode === 'coding');
			receive({ type: 'start', projectId: folder.uri.toString(), mode: 'ai' });
			await waitFor(async () => tracker.summary(folder.uri.toString()).mode === 'ai');
			receive({ type: 'pause' });
			await waitFor(async () => tracker.summary(folder.uri.toString()).mode === null);
			assert.ok(messages.length >= 4, 'Sidebar did not receive timer updates');
		} finally {
			provider.dispose(); tracker.dispose();
			await fs.rm(directory, { recursive: true, force: true });
		}
	});

	test('shows the open project and nested folder names', async () => {
		const folder = vscode.workspace.workspaceFolders![0];
		const child = vscode.Uri.joinPath(folder.uri, 'timemachine-folder-test');
		const grandchild = vscode.Uri.joinPath(child, 'nested');
		await vscode.workspace.fs.createDirectory(grandchild);
		try {
			const browser = new ProjectFoldersView();
			const roots = await browser.getChildren();
			assert.ok(roots.some(node => node.name === folder.name));
			const children = await browser.getChildren(roots.find(node => node.name === folder.name));
			const match = children.find(node => node.name === 'timemachine-folder-test');
			assert.ok(match);
			assert.ok((await browser.getChildren(match)).some(node => node.name === 'nested'));
			const timeline = new TimelineView(new TimelineStore(folder.uri));
			assert.equal(timeline.getChildren()[0].kind, 'project');
		} finally {
			await vscode.workspace.fs.delete(child, { recursive: true });
		}
	});

	test('groups project commands under the folder and day', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'timemachine-view-'));
		try {
			const folder = vscode.workspace.workspaceFolders![0];
			const store = new TimelineStore(vscode.Uri.file(directory));
			await store.load();
			await store.add({ kind: 'command', id: 'ui-command', at: Date.now(), folderUri: folder.uri.toString(), cwd: folder.uri.toString(), command: 'npm run dev', terminal: 'test', status: 'running' });
			const view = new TimelineView(store);
			const project = view.getChildren()[0];
			assert.equal(project.kind, 'project');
			if (project.kind !== 'project') { return; }
			assert.equal(view.getTreeItem(project).label, folder.name);
			const day = view.getChildren(project)[0];
			assert.equal(day.kind, 'day');
			const command = view.getChildren(day)[0];
			assert.equal(command.kind, 'event');
			assert.match(String(view.getTreeItem(command).label), /npm run dev/);
			assert.match(String(view.getTreeItem(command).description), /running/);
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});

	test('records a save in the open project', async () => {
		const folder = vscode.workspace.workspaceFolders![0];
		const file = vscode.Uri.joinPath(folder.uri, 'timemachine-integration-test.txt');
		await vscode.workspace.fs.writeFile(file, Buffer.from('before\n'));
		try {
			const document = await vscode.workspace.openTextDocument(file);
			const editor = await vscode.window.showTextDocument(document);
			const before = (await vscode.commands.executeCommand<SetupStatus>('timemachine.showStatus')).recordedEvents;
			await editor.edit(edit => edit.insert(new vscode.Position(1, 0), 'after\n'));
			assert.equal(await document.save(), true);
			await waitFor(async () => (await vscode.commands.executeCommand<SetupStatus>('timemachine.showStatus')).recordedEvents > before);
			const details = await vscode.commands.executeCommand<SetupStatus>('timemachine.showStatus');
			assert.ok(details.projects[0].recordedEvents > 0);
		} finally {
			await vscode.workspace.fs.delete(file);
		}
	});

	test('records a command from a shell-integrated terminal', async function () {
		this.timeout(30000);
		const folder = vscode.workspace.workspaceFolders![0];
		const terminal = vscode.window.createTerminal({ name: 'TimeMachine Test', cwd: folder.uri.fsPath });
		try {
			terminal.show();
			await waitFor(async () => !!terminal.shellIntegration, 15000);
			const before = (await vscode.commands.executeCommand<SetupStatus>('timemachine.showStatus')).recordedEvents;
			const execution = terminal.shellIntegration!.executeCommand('echo timemachine-test');
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => { listener.dispose(); reject(new Error('Terminal command did not finish')); }, 10000);
				const listener = vscode.window.onDidEndTerminalShellExecution(event => {
					if (event.execution === execution) { clearTimeout(timer); listener.dispose(); resolve(); }
				});
			});
			await waitFor(async () => (await vscode.commands.executeCommand<SetupStatus>('timemachine.showStatus')).projects[0].recentCommands.some(item => item.command === 'echo timemachine-test'));
			const details = await vscode.commands.executeCommand<SetupStatus>('timemachine.showStatus');
			assert.ok(details.recordedEvents > before);
			assert.ok(details.projects[0].recentCommands.some(item => item.command === 'echo timemachine-test' && item.cwd === folder.uri.toString()));
		} finally {
			terminal.dispose();
		}
	});

	test('does not associate a command outside the open project', async function () {
		this.timeout(30000);
		const terminal = vscode.window.createTerminal({ name: 'TimeMachine Outside', cwd: os.tmpdir() });
		try {
			terminal.show();
			await waitFor(async () => !!terminal.shellIntegration, 15000);
			const execution = terminal.shellIntegration!.executeCommand('echo timemachine-outside');
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => { listener.dispose(); reject(new Error('Outside command did not finish')); }, 10000);
				const listener = vscode.window.onDidEndTerminalShellExecution(event => {
					if (event.execution === execution) { clearTimeout(timer); listener.dispose(); resolve(); }
				});
			});
			const details = await vscode.commands.executeCommand<SetupStatus>('timemachine.showStatus');
			assert.ok(details.projects.every(project => project.recentCommands.every(item => item.command !== 'echo timemachine-outside')));
		} finally {
			terminal.dispose();
		}
	});
});
