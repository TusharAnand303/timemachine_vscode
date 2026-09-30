import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { changesSinceLastPass, CommandEvent, lineCounts, SaveEvent, TimelineEvent } from './timeline';
import { TimelineStore } from './storage';

type TimelineNode = { event: TimelineEvent; related?: SaveEvent };
const snapshotScheme = 'timemachine-snapshot';

function time(at: number): string {
	return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function saveSummary(event: SaveEvent): string {
	return event.added === undefined || event.removed === undefined ? 'line counts unavailable' : `+${event.added} -${event.removed}`;
}

class TimelineView implements vscode.TreeDataProvider<TimelineNode> {
	private readonly changed = new vscode.EventEmitter<TimelineNode | undefined>();
	readonly onDidChangeTreeData = this.changed.event;
	constructor(private readonly store: TimelineStore) {}
	refresh(): void { this.changed.fire(undefined); }

	getChildren(node?: TimelineNode): TimelineNode[] {
		if (node) {
			if (node.event.kind === 'command' && node.event.status === 'failed') {
				return changesSinceLastPass([...this.store.all], node.event).map(related => ({ event: node.event, related }));
			}
			return [];
		}
		return [...this.store.all].sort((a, b) => b.at - a.at).map(event => ({ event }));
	}

	getTreeItem(node: TimelineNode): vscode.TreeItem {
		if (node.related) {
			const item = new vscode.TreeItem(`Possible cause: ${node.related.name}`, vscode.TreeItemCollapsibleState.None);
			item.description = saveSummary(node.related);
			item.tooltip = 'Saved after the last passing run of this command. This is a clue, not proof of the cause.';
			item.iconPath = new vscode.ThemeIcon('search');
			item.contextValue = node.related.before && node.related.after ? 'save' : 'saveUnavailable';
			if (node.related.before && node.related.after) { item.command = { command: 'timemachine.compare', title: 'Compare Change', arguments: [node.related.id] }; }
			return item;
		}
		const event = node.event;
		let label: string;
		let icon: string;
		let description = '';
		if (event.kind === 'opened') { label = event.label; icon = 'folder-opened'; }
		else if (event.kind === 'save') {
			label = `${event.name} saved`;
			icon = 'save';
			description = saveSummary(event);
		} else if (event.kind === 'ready') { label = 'Server reported ready'; icon = 'server'; description = event.terminal; }
		else {
			label = event.command;
			icon = event.status === 'failed' ? 'error' : event.status === 'passed' ? 'pass' : 'terminal';
			description = event.status === 'failed' ? `failed (${event.exitCode})` : event.status === 'passed' ? 'passed' : event.status;
		}
		const expandable = event.kind === 'command' && event.status === 'failed' && changesSinceLastPass([...this.store.all], event).length > 0;
		const item = new vscode.TreeItem(label, expandable ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		item.description = `${time(event.at)}  ${description}`;
		item.iconPath = new vscode.ThemeIcon(icon);
		item.tooltip = event.kind === 'save' ? `${event.uri}\n${description}` : label;
		if (event.kind === 'save') {
			item.contextValue = event.before && event.after ? 'save' : 'saveUnavailable';
			if (event.after) { item.command = { command: 'timemachine.viewChange', title: 'View Saved Version', arguments: [event.id] }; }
		}
		return item;
	}
}

async function readDiskBaseline(document: vscode.TextDocument): Promise<string | undefined> {
	try {
		const bytes = await vscode.workspace.fs.readFile(document.uri);
		return bytes.byteLength <= 512 * 1024 ? Buffer.from(bytes).toString('utf8') : undefined;
	} catch { return undefined; }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const output = vscode.window.createOutputChannel('TimeMachine');
	context.subscriptions.push(output);
	const store = new TimelineStore(context.storageUri ?? context.globalStorageUri);
	const view = new TimelineView(store);
	const tree = vscode.window.createTreeView('timemachine.timeline', { treeDataProvider: view });
	const updateTreeMessage = (): void => {
		tree.message = vscode.workspace.workspaceFolders?.length
			? undefined
			: 'Open a project folder in this window to record file saves. Start a new integrated terminal to record commands.';
	};
	updateTreeMessage();
	context.subscriptions.push(tree);
	try { await store.load(); }
	catch (error) { output.appendLine(`Could not load earlier timeline events: ${String(error)}`); }
	view.refresh();
	const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -100);
	status.command = 'timemachine.openTimeline';
	status.show();
	context.subscriptions.push(status);
	const updateStatus = (): void => {
		const terminals = vscode.window.terminals;
		const missingShellIntegration = terminals.length > 0 && terminals.every(terminal => !terminal.shellIntegration);
		status.text = `${missingShellIntegration ? '$(warning)' : '$(history)'} TimeMachine ${store.all.length}`;
		status.tooltip = !vscode.workspace.workspaceFolders?.length
			? 'TimeMachine is active. Open a project folder to record file saves.'
			: missingShellIntegration
				? 'TimeMachine is active, but no terminal has shell integration. Open a new integrated terminal or run TimeMachine: Check Setup.'
				: `TimeMachine is active with ${store.all.length} timeline events. Click to open the timeline.`;
	};
	updateStatus();
	context.subscriptions.push(vscode.window.onDidOpenTerminal(updateStatus));
	context.subscriptions.push(vscode.window.onDidCloseTerminal(updateStatus));
	context.subscriptions.push(vscode.window.onDidChangeTerminalShellIntegration(updateStatus));
	const record = async (event: TimelineEvent, snapshots?: { before: string; after: string }): Promise<void> => {
		try { await store.add(event, snapshots); view.refresh(); updateStatus(); }
		catch (error) { output.appendLine(`Could not record event: ${String(error)}`); }
	};
	const isWorkspaceFile = (document: vscode.TextDocument): boolean => document.uri.scheme === 'file' && !!vscode.workspace.getWorkspaceFolder(document.uri);
	const baselines = new Map<string, Promise<string | undefined>>();
	const prepareBaseline = (document: vscode.TextDocument): void => {
		if (isWorkspaceFile(document) && !baselines.has(document.uri.toString())) {
			baselines.set(document.uri.toString(), readDiskBaseline(document));
		}
	};
	for (const document of vscode.workspace.textDocuments) { prepareBaseline(document); }
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(prepareBaseline));
	context.subscriptions.push(vscode.workspace.onWillSaveTextDocument(event => {
		if (!isWorkspaceFile(event.document)) { return; }
		prepareBaseline(event.document);
		const baseline = baselines.get(event.document.uri.toString());
		if (baseline) { event.waitUntil(baseline.then(() => [] as vscode.TextEdit[])); }
	}));
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
		if (!isWorkspaceFile(document)) { return; }
		const uri = document.uri.toString();
		const beforePromise = baselines.get(uri);
		const after = document.getText();
		baselines.set(uri, Promise.resolve(after));
		const at = Date.now();
		void (async () => {
			const before = await beforePromise;
			const folder = vscode.workspace.getWorkspaceFolder(document.uri);
			const relative = folder ? path.relative(folder.uri.fsPath, document.uri.fsPath) : path.basename(document.uri.fsPath);
			const canSnapshot = before !== undefined && Buffer.byteLength(before) <= 512 * 1024 && Buffer.byteLength(after) <= 512 * 1024;
			const counts = canSnapshot ? lineCounts(before, after) : undefined;
			const save: SaveEvent = { kind: 'save', id: randomUUID(), at, uri, name: relative, ...counts };
			await record(save, canSnapshot ? { before, after } : undefined);
		})();
	}));
	const executions = new WeakMap<vscode.TerminalShellExecution, string>();
	context.subscriptions.push(vscode.window.onDidStartTerminalShellExecution(event => {
		const command = event.execution.commandLine.value.trim();
		if (!command) { return; }
		const id = randomUUID();
		executions.set(event.execution, id);
		const commandEvent: CommandEvent = { kind: 'command', id, at: Date.now(), command, terminal: event.terminal.name, status: 'running' };
		void record(commandEvent);
		if (/(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start)\b|\b(?:vite|next dev)\b/i.test(command)) {
			void (async () => {
				let tail = '';
				try {
					for await (const chunk of event.execution.read()) {
						tail = (tail + chunk.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).slice(-400);
						if (/\b(?:ready in|server (?:started|running|ready)|listening on|local:\s*https?:\/\/)\b/i.test(tail)) {
							await record({ kind: 'ready', id: randomUUID(), at: Date.now(), commandId: id, terminal: event.terminal.name });
							break;
						}
					}
				} catch (error) { output.appendLine(`Could not inspect terminal readiness: ${String(error)}`); }
			})();
		}
	}));
	context.subscriptions.push(vscode.window.onDidEndTerminalShellExecution(event => {
		const id = executions.get(event.execution);
		const status = event.exitCode === undefined ? 'unknown' : event.exitCode === 0 ? 'passed' : 'failed';
		if (!id) {
			const command = event.execution.commandLine.value.trim();
			if (command) { void record({ kind: 'command', id: randomUUID(), at: Date.now(), command, terminal: event.terminal.name, status, exitCode: event.exitCode, finishedAt: Date.now() }); }
			return;
		}
		void store.finishCommand(id, status, event.exitCode).then(() => view.refresh(), error => output.appendLine(`Could not update command: ${String(error)}`));
	}));
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(snapshotScheme, {
		provideTextDocumentContent: async uri => {
			const [id, side] = uri.path.slice(1).split('/');
			const event = store.all.find((item): item is SaveEvent => item.kind === 'save' && item.id === id);
			if (!event || (side !== 'before' && side !== 'after')) { return 'Snapshot unavailable'; }
			try { return await store.snapshot(event, side); }
			catch { return 'Snapshot unavailable'; }
		}
	}));
	const getSave = (argument: unknown): SaveEvent | undefined => {
		const id = typeof argument === 'string' ? argument : typeof argument === 'object' && argument !== null && 'related' in argument && (argument as TimelineNode).related
			? (argument as TimelineNode).related?.id
			: typeof argument === 'object' && argument !== null && 'event' in argument ? (argument as TimelineNode).event.id : undefined;
		return store.all.find((event): event is SaveEvent => event.kind === 'save' && event.id === id);
	};
	const snapshotUri = (event: SaveEvent, side: 'before' | 'after'): vscode.Uri => vscode.Uri.from({ scheme: snapshotScheme, path: `/${event.id}/${side}/${encodeURIComponent(path.basename(event.name))}` });
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.viewChange', async (argument: unknown) => {
		const event = getSave(argument);
		if (event?.after) { await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(snapshotUri(event, 'after'))); }
	}));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.compare', async (argument: unknown) => {
		const event = getSave(argument);
		if (event?.before && event.after) {
			await vscode.commands.executeCommand('vscode.diff', snapshotUri(event, 'before'), snapshotUri(event, 'after'), `${event.name} — saved ${time(event.at)}`);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.restore', async (argument: unknown) => {
		const event = getSave(argument);
		if (!event?.before) { return; }
		const target = vscode.Uri.parse(event.uri);
		if (!vscode.workspace.getWorkspaceFolder(target)) { return; }
		const document = await vscode.workspace.openTextDocument(target);
		if (document.isDirty && await vscode.window.showWarningMessage('This file has unsaved changes. Replace the editor contents with the earlier version?', 'Replace') !== 'Replace') { return; }
		const previous = await store.snapshot(event, 'before');
		const edit = new vscode.WorkspaceEdit();
		edit.replace(target, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), previous);
		if (await vscode.workspace.applyEdit(edit)) {
			await vscode.window.showTextDocument(document);
			vscode.window.showInformationMessage(`Restored ${event.name} into the editor. Review and save when ready.`);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.openTimeline', async () => {
		await vscode.commands.executeCommand('timemachine.timeline.focus');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.showStatus', () => {
		const shellEnabled = vscode.workspace.getConfiguration('terminal.integrated.shellIntegration').get<boolean>('enabled', true);
		const details = {
			folders: vscode.workspace.workspaceFolders?.map(folder => folder.name) ?? [],
			recordedEvents: store.all.length,
			shellIntegrationEnabled: shellEnabled,
			terminals: vscode.window.terminals.map(terminal => ({ name: terminal.name, shellIntegration: !!terminal.shellIntegration })),
		};
		output.appendLine(`TimeMachine setup at ${new Date().toLocaleString()}`);
		output.appendLine(JSON.stringify(details, null, 2));
		if (!details.folders.length) { output.appendLine('Open a project folder in this VS Code window to record file saves.'); }
		if (!shellEnabled) { output.appendLine('Enable terminal.integrated.shellIntegration.enabled in VS Code settings, then open a new terminal.'); }
		else if (details.terminals.length && details.terminals.every(terminal => !terminal.shellIntegration)) {
			output.appendLine('Open a new integrated terminal. Commands run in external terminals cannot be detected.');
		}
		output.show(true);
		return details;
	}));
	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(event => {
		updateTreeMessage();
		updateStatus();
		if (event.added.length) { void record({ kind: 'opened', id: randomUUID(), at: Date.now(), label: 'Project opened' }); }
	}));
	await record({ kind: 'opened', id: randomUUID(), at: Date.now(), label: vscode.workspace.workspaceFolders?.length ? 'Project opened' : 'Window opened' });
	output.appendLine('TimeMachine activated. Use TimeMachine: Check Setup to inspect workspace and terminal capture.');
}

export function deactivate(): void {}
