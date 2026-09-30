import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

interface SetupStatus {
	recordedEvents: number;
	shellIntegrationEnabled: boolean;
	terminals: { name: string; shellIntegration: boolean }[];
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
		const commands = await vscode.commands.getCommands(true);
		for (const command of ['timemachine.viewChange', 'timemachine.compare', 'timemachine.restore']) {
			assert.ok(commands.includes(command), `${command} was not registered`);
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
			await waitFor(async () => (await vscode.commands.executeCommand<SetupStatus>('timemachine.showStatus')).recordedEvents > before);
		} finally {
			terminal.dispose();
		}
	});
});
