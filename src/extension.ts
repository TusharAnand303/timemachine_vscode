import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { checkKind, CheckpointEvent, CommandEvent, isServerReadyOutput, lineCounts, passToFail, SaveEvent, TimelineEvent } from './timeline';
import { TimelineStore } from './storage';
import { ProjectFoldersView, time, TimelineNode, TimelineView } from './views';
import { GraphView } from './graphView';
import { ActivityTracker, FocusMode } from './activityTracker';
import { FocusView } from './focusView';
import { exportProjectReport } from './exportReport';
import { redactCommand, trackableFile } from './privacy';
import { gitContext } from './gitContext';
import { reportForFailure } from './investigation';
import { captureCheckpoint } from './checkpoints';
import { sessionSummaryMarkdown } from './sessionSummary';

const snapshotScheme = 'timemachine-snapshot';
let activeTracker: ActivityTracker | undefined;

async function readDiskBaseline(document: vscode.TextDocument): Promise<string | undefined> {
	try {
		const bytes = await vscode.workspace.fs.readFile(document.uri);
		return bytes.byteLength <= 512 * 1024 ? Buffer.from(bytes).toString('utf8') : undefined;
	} catch (error) {
		return error instanceof vscode.FileSystemError && error.code === 'FileNotFound' ? '' : undefined;
	}
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const sessionStartedAt = Date.now();
	const output = vscode.window.createOutputChannel('TimeMachine');
	context.subscriptions.push(output);
	const storageUri = context.storageUri ?? context.globalStorageUri;
	const store = new TimelineStore(storageUri);
	const tracker = new ActivityTracker(storageUri);
	activeTracker = tracker;
	const legacyFolderUri = context.storageUri && vscode.workspace.workspaceFolders?.length === 1 ? vscode.workspace.workspaceFolders[0].uri.toString() : undefined;
	const view = new TimelineView(store, legacyFolderUri);
	let onHistoryChanged = (): void => view.refresh();
	const graph = new GraphView(context.extensionUri, store, view, tracker, () => onHistoryChanged());
	const focusView = new FocusView(context.extensionUri, tracker);
	context.subscriptions.push(graph, tracker, focusView,
		vscode.window.registerWebviewViewProvider('timemachine.focus', focusView, { webviewOptions: { retainContextWhenHidden: true } }),
		tracker.onDidChange(() => graph.refresh()),
	);
	const tree = vscode.window.createTreeView('timemachine.timeline', { treeDataProvider: view });
	const foldersView = new ProjectFoldersView();
	const foldersTree = vscode.window.createTreeView('timemachine.folders', { treeDataProvider: foldersView });
	const updateTreeMessage = (): void => {
		const folders = vscode.workspace.workspaceFolders ?? [];
		tree.message = folders.length
			? undefined
			: 'Open a project folder in this window to record file saves. Start a new integrated terminal to record commands.';
		foldersTree.message = folders.length ? undefined : 'Open a project folder to browse its directories.';
		tree.description = folders.length === 1 ? folders[0].name : folders.length ? `${folders.length} projects` : undefined;
	};
	updateTreeMessage();
	context.subscriptions.push(tree, foldersTree);
	try { await store.load(); if (legacyFolderUri) { await store.associateLegacy(legacyFolderUri); } }
	catch (error) { output.appendLine(`Could not load earlier timeline events: ${String(error)}`); }
	try { await tracker.load(); }
	catch (error) { output.appendLine(`Could not load coding-time totals: ${String(error)}`); }
	await tracker.setFocused(vscode.window.state.focused);
	view.refresh();
	const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -100);
	status.command = 'timemachine.openTimeline';
	status.show();
	context.subscriptions.push(status);
	const updateStatus = (): void => {
		const folders = vscode.workspace.workspaceFolders ?? [];
		const terminals = vscode.window.terminals;
		const missingShellIntegration = terminals.length > 0 && terminals.every(terminal => !terminal.shellIntegration);
		status.text = `${missingShellIntegration ? '$(warning)' : '$(history)'} ${folders.length === 1 ? folders[0].name : 'TimeMachine'} · ${store.all.length}`;
		status.tooltip = !folders.length
			? 'TimeMachine is active. Open a project folder to record file saves.'
			: missingShellIntegration
				? 'TimeMachine is active, but no terminal has shell integration. Open a new integrated terminal or run TimeMachine: Check Setup.'
				: `TimeMachine is active with ${store.all.length} timeline events. Click to open the activity graph.`;
	};
	onHistoryChanged = () => { view.refresh(); updateStatus(); };
	updateStatus();
	context.subscriptions.push(vscode.window.onDidChangeWindowState(state => {
		void tracker.setFocused(state.focused).catch(error => output.appendLine(`Could not update coding time: ${String(error)}`));
	}));
	const timer = setInterval(() => {
		void tracker.tick().catch(error => output.appendLine(`Could not save coding time: ${String(error)}`));
	}, 15_000);
	context.subscriptions.push({ dispose: () => clearInterval(timer) });
	context.subscriptions.push(vscode.window.onDidOpenTerminal(updateStatus));
	context.subscriptions.push(vscode.window.onDidCloseTerminal(updateStatus));
	context.subscriptions.push(vscode.window.onDidChangeTerminalShellIntegration(updateStatus));
	const record = async (event: TimelineEvent, snapshots?: { before: string; after: string }): Promise<void> => {
		try { await store.add(event, snapshots); view.refresh(); graph.refresh(); updateStatus(); }
		catch (error) { output.appendLine(`Could not record event: ${String(error)}`); }
	};
	const relativeFile = (uri: vscode.Uri): { folder: vscode.WorkspaceFolder; name: string } | undefined => {
		if (uri.scheme !== 'file') { return undefined; }
		const folder = vscode.workspace.getWorkspaceFolder(uri);
		if (!folder) { return undefined; }
		const name = path.relative(folder.uri.fsPath, uri.fsPath);
		return trackableFile(name) ? { folder, name } : undefined;
	};
	const isWorkspaceFile = (document: vscode.TextDocument): boolean => !!relativeFile(document.uri);
	const baselines = new Map<string, Promise<string | undefined>>();
	const prepareBaseline = (document: vscode.TextDocument): void => {
		if (isWorkspaceFile(document) && !baselines.has(document.uri.toString())) {
			baselines.set(document.uri.toString(), readDiskBaseline(document));
		}
	};
	for (const document of vscode.workspace.textDocuments) { prepareBaseline(document); }
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(prepareBaseline));
	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document => baselines.delete(document.uri.toString())));
	context.subscriptions.push(vscode.workspace.onWillSaveTextDocument(event => {
		if (!isWorkspaceFile(event.document)) { return; }
		prepareBaseline(event.document);
		const baseline = baselines.get(event.document.uri.toString());
		if (baseline) { event.waitUntil(baseline.then(() => [] as vscode.TextEdit[])); }
	}));
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
		const file = relativeFile(document.uri);
		if (!file) { return; }
		const uri = document.uri.toString();
		const beforePromise = baselines.get(uri);
		const after = document.getText();
		baselines.set(uri, Promise.resolve(after));
		const at = Date.now();
		void (async () => {
			const before = await beforePromise;
			const canSnapshot = before !== undefined && Buffer.byteLength(before) <= 512 * 1024 && Buffer.byteLength(after) <= 512 * 1024;
			const counts = canSnapshot ? lineCounts(before, after) : undefined;
			const save: SaveEvent = { kind: 'save', id: randomUUID(), at, folderUri: file.folder.uri.toString(), uri, name: file.name, ...counts };
			await record(save, canSnapshot ? { before, after } : undefined);
		})();
	}));
	const executions = new WeakMap<vscode.TerminalShellExecution, string>();
	const commandLocation = (execution: vscode.TerminalShellExecution, terminal: vscode.Terminal, integration: vscode.TerminalShellIntegration): { folderUri: string; cwd: string; cwdInferred: boolean } | undefined => {
		const configured = 'cwd' in terminal.creationOptions ? terminal.creationOptions.cwd : undefined;
		const initialCwd = typeof configured === 'string' ? path.isAbsolute(configured) ? vscode.Uri.file(configured) : undefined : configured;
		const cwd = execution.cwd ?? integration.cwd ?? initialCwd;
		if (cwd) {
			const folder = vscode.workspace.getWorkspaceFolder(cwd);
			return folder ? { folderUri: folder.uri.toString(), cwd: cwd.toString(), cwdInferred: false } : undefined;
		}
		const folders = vscode.workspace.workspaceFolders ?? [];
		return folders.length === 1 ? { folderUri: folders[0].uri.toString(), cwd: folders[0].uri.toString(), cwdInferred: true } : undefined;
	};
	context.subscriptions.push(vscode.window.onDidStartTerminalShellExecution(event => {
		const command = redactCommand(event.execution.commandLine.value);
		const location = commandLocation(event.execution, event.terminal, event.shellIntegration);
		if (!command || !location) { return; }
		const id = randomUUID();
		executions.set(event.execution, id);
		const commandEvent: CommandEvent = { kind: 'command', id, at: Date.now(), ...location, command, terminal: event.terminal.name, status: 'running', check: checkKind(command) };
		void record(commandEvent);
		if (/(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start)\b|\b(?:vite|next dev)\b/i.test(command)) {
			void (async () => {
				let tail = '';
				try {
					for await (const chunk of event.execution.read()) {
						tail = (tail + chunk.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).slice(-400);
						if (isServerReadyOutput(tail)) {
							await record({ kind: 'ready', id: randomUUID(), at: Date.now(), folderUri: location.folderUri, commandId: id, terminal: event.terminal.name });
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
		const command = redactCommand(event.execution.commandLine.value);
		const finishedAt = Date.now();
		const afterFinish = async (commandEvent: CommandEvent): Promise<void> => {
			await checkBranches(commandEvent.at - 1);
			view.refresh(); graph.refresh(); updateStatus();
			if (passToFail(store.all, commandEvent)) {
				const choice = await vscode.window.showWarningMessage('TimeMachine detected that your project changed from passing to failing.', 'What Changed?', 'Open Timeline');
				if (choice === 'What Changed?') { await vscode.commands.executeCommand('timemachine.whatChanged', commandEvent.id); }
				else if (choice === 'Open Timeline') { graph.open(commandEvent.id); }
			}
		};
		if (!id) {
			const location = commandLocation(event.execution, event.terminal, event.shellIntegration);
			if (command && location) {
				const commandEvent: CommandEvent = { kind: 'command', id: randomUUID(), at: finishedAt, ...location, command, terminal: event.terminal.name, status, exitCode: event.exitCode, finishedAt, check: checkKind(command) };
				void store.add(commandEvent).then(() => afterFinish(commandEvent), error => output.appendLine(`Could not record command: ${String(error)}`));
			}
			return;
		}
		void store.finishCommand(id, status, event.exitCode, command).then(async () => {
			const commandEvent = store.all.find((item): item is CommandEvent => item.kind === 'command' && item.id === id);
			if (commandEvent) { commandEvent.check = checkKind(commandEvent.command); await afterFinish(commandEvent); }
		}, error => output.appendLine(`Could not update command: ${String(error)}`));
	}));
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(snapshotScheme, {
		provideTextDocumentContent: async uri => {
			if (uri.authority === 'checkpoint-current') { return ''; }
			if (uri.authority === 'checkpoint') {
				try { return await store.checkpointFile(uri.path.slice(1), decodeURIComponent(uri.query)); }
				catch { return 'Checkpoint snapshot unavailable'; }
			}
			const [id, side] = uri.path.slice(1).split('/');
			const event = store.all.find((item): item is SaveEvent => item.kind === 'save' && item.id === id);
			if (!event || (side !== 'before' && side !== 'after')) { return 'Snapshot unavailable'; }
			try { return await store.snapshot(event, side); }
			catch { return 'Snapshot unavailable'; }
		}
	}));
	const getSave = (argument: unknown): SaveEvent | undefined => {
		const node = typeof argument === 'object' && argument !== null ? argument as TimelineNode : undefined;
		const id = typeof argument === 'string' ? argument : node?.kind === 'related' || node?.kind === 'event' ? node.event.id : undefined;
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
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.openFile', async (argument: unknown) => {
		const event = getSave(argument);
		if (!event) { return; }
		const target = vscode.Uri.parse(event.uri);
		if (vscode.workspace.getWorkspaceFolder(target)) { await vscode.window.showTextDocument(target); }
	}));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.openTimeline', async () => {
		graph.open();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.openGraph', () => graph.open()));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.whatChanged', async (argument?: unknown) => {
		const failure = typeof argument === 'string' ? store.all.find((item): item is CommandEvent => item.kind === 'command' && item.id === argument && item.status === 'failed') : undefined;
		let selected = failure;
		if (!selected) {
			const folder = await chooseProject();
			selected = folder ? [...view.projectEvents(folder)].reverse().find((item): item is CommandEvent => item.kind === 'command' && item.status === 'failed' && !!reportForFailure(store.all, item)) : undefined;
		}
		const markdown = selected && reportForFailure(store.all, selected);
		if (!markdown) { void vscode.window.showInformationMessage('No failed test or build with an earlier passing run was found in the recorded history.'); return; }
		await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: 'markdown', content: markdown }), { preview: false });
	}));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.searchCommands', () => graph.open(undefined, 'history')));
	const chooseProject = async (): Promise<vscode.WorkspaceFolder | undefined> => {
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (folders.length <= 1) { return folders[0]; }
		const picked = await vscode.window.showQuickPick(folders.map(folder => ({ label: folder.name, description: folder.uri.fsPath, folder })), { placeHolder: 'Choose a project to track' });
		return picked?.folder;
	};
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.createCheckpoint', async () => {
		const folder = await chooseProject();
		if (!folder) { return; }
		const name = (await vscode.window.showInputBox({ prompt: `Name a checkpoint for ${folder.name}`, placeHolder: 'Before authentication refactor', validateInput: value => value.trim() ? undefined : 'Enter a checkpoint name' }))?.trim();
		if (!name) { return; }
		try {
			const files = await captureCheckpoint(folder);
			if (!files.size) { void vscode.window.showInformationMessage('No eligible saved source files were found for this checkpoint.'); return; }
			const id = randomUUID();
			await store.saveCheckpoint(id, files);
			await record({ kind: 'checkpoint', id, at: Date.now(), folderUri: folder.uri.toString(), name: name.slice(0, 100), files: [...files.keys()] });
			void vscode.window.showInformationMessage(`TimeMachine checkpoint "${name}" saved with ${files.size} files.`);
		} catch (error) { void vscode.window.showErrorMessage(`TimeMachine could not create checkpoint: ${String(error)}`); }
	}));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.compareWithCheckpoint', async (argument?: unknown) => {
		const requested = typeof argument === 'string' ? store.all.find((event): event is CheckpointEvent => event.kind === 'checkpoint' && event.id === argument) : undefined;
		const folder = requested ? vscode.workspace.workspaceFolders?.find(item => item.uri.toString() === requested.folderUri) : await chooseProject();
		if (!folder) { return; }
		const checkpoints = view.projectEvents(folder).filter((event): event is CheckpointEvent => event.kind === 'checkpoint').reverse();
		const picked = requested ? { event: requested } : await vscode.window.showQuickPick(checkpoints.map(event => ({ label: event.name, description: new Date(event.at).toLocaleString(), event })), { placeHolder: 'Select a checkpoint to compare' });
		if (!picked) { if (!checkpoints.length) { void vscode.window.showInformationMessage('No checkpoints have been created for this project.'); } return; }
		const selected = await vscode.window.showQuickPick(picked.event.files, { placeHolder: 'Select a checkpoint file to compare with its current version' });
		if (!selected) { return; }
		const original = vscode.Uri.from({ scheme: snapshotScheme, authority: 'checkpoint', path: `/${picked.event.id}`, query: encodeURIComponent(selected) });
		const current = vscode.Uri.joinPath(folder.uri, selected);
		let right = current;
		try { await vscode.workspace.fs.stat(current); }
		catch { right = vscode.Uri.from({ scheme: snapshotScheme, authority: 'checkpoint-current', path: `/${picked.event.id}`, query: encodeURIComponent(selected) }); }
		await vscode.commands.executeCommand('vscode.diff', original, right, `${selected} · ${picked.event.name} ↔ current`);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.showSessionSummary', async () => {
		const folder = await chooseProject();
		if (!folder) { return; }
		const current = await gitContext(folder.uri.fsPath);
		const markdown = sessionSummaryMarkdown(view.projectEvents(folder), folder.uri.toString(), folder.name, current?.branch, Date.now(), sessionStartedAt);
		await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: 'markdown', content: markdown }), { preview: false });
	}));
	const startFocus = async (mode: FocusMode): Promise<void> => {
		const folder = await chooseProject();
		if (!folder) { return; }
		await tracker.start(folder.uri.toString(), mode);
	};
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.startCoding', () => startFocus('coding')));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.startAi', () => startFocus('ai')));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.pauseTimer', () => tracker.pause()));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.exportReport', async (projectId?: unknown) => {
		const folder = typeof projectId === 'string' ? vscode.workspace.workspaceFolders?.find(item => item.uri.toString() === projectId) : await chooseProject();
		if (!folder) { return; }
		try { await exportProjectReport(folder, view, tracker); }
		catch (error) { void vscode.window.showErrorMessage(`TimeMachine could not export this report: ${String(error)}`); }
	}));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.showInGraph', (node: TimelineNode) => {
		if (node?.kind === 'event' || node?.kind === 'related') { graph.open(node.event.id); }
	}));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.refresh', () => {
		view.refresh();
		graph.refresh();
		foldersView.refresh();
		updateStatus();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('timemachine.showStatus', () => {
		const shellEnabled = vscode.workspace.getConfiguration('terminal.integrated.shellIntegration').get<boolean>('enabled', true);
		const details = {
			folders: vscode.workspace.workspaceFolders?.map(folder => folder.name) ?? [],
			projects: (vscode.workspace.workspaceFolders ?? []).map(folder => {
				const events = view.projectEvents(folder);
				return {
					name: folder.name,
					path: folder.uri.fsPath,
					recordedEvents: events.length,
					focusTime: tracker.summary(folder.uri.toString()),
					recentCommands: events.filter((item): item is CommandEvent => item.kind === 'command').slice(-5).map(item => ({ command: item.command, cwd: item.cwd, status: item.status })),
				};
			}),
			recordedEvents: store.all.length,
			shellIntegrationEnabled: shellEnabled,
			terminals: vscode.window.terminals.map(terminal => ({ name: terminal.name, shellIntegration: !!terminal.shellIntegration, cwd: terminal.shellIntegration?.cwd?.fsPath ?? 'not reported' })),
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
		if (event.removed.some(folder => folder.uri.toString() === tracker.activeProjectId)) {
			void tracker.pause().then(() => graph.refresh(), error => output.appendLine(`Could not pause coding time: ${String(error)}`));
		}
		updateTreeMessage();
		view.refresh();
		graph.refresh();
		foldersView.refresh();
		updateStatus();
		for (const folder of event.added) { void record({ kind: 'opened', id: randomUUID(), at: Date.now(), folderUri: folder.uri.toString(), label: `Opened ${folder.name}`, reason: 'folder-added' }); }
	}));
	const recordFileOperation = (uri: vscode.Uri, change: 'created' | 'deleted' | 'renamed', oldName?: string): void => {
		const file = relativeFile(uri);
		if (file) { void record({ kind: 'file', id: randomUUID(), at: Date.now(), folderUri: file.folder.uri.toString(), name: file.name, change, oldName }); }
	};
	context.subscriptions.push(vscode.workspace.onDidCreateFiles(event => {
		foldersView.refresh();
		for (const uri of event.files) { recordFileOperation(uri, 'created'); }
	}));
	context.subscriptions.push(vscode.workspace.onDidDeleteFiles(event => {
		foldersView.refresh();
		for (const uri of event.files) { recordFileOperation(uri, 'deleted'); }
	}));
	context.subscriptions.push(vscode.workspace.onDidRenameFiles(event => {
		foldersView.refresh();
		for (const file of event.files) { recordFileOperation(file.newUri, 'renamed', relativeFile(file.oldUri)?.name); }
	}));
	const branches = new Map<string, string>();
	let branchCheck: Promise<void> | undefined;
	const checkBranches = (observedAt = Date.now()): Promise<void> => {
		if (branchCheck) { return branchCheck; }
		branchCheck = (async () => {
			for (const folder of vscode.workspace.workspaceFolders ?? []) {
				const current = await gitContext(folder.uri.fsPath);
				if (!current) { continue; }
				const key = folder.uri.toString();
				const previous = branches.get(key);
				branches.set(key, current.branch);
				if (previous && previous !== current.branch) {
					await record({ kind: 'branch', id: randomUUID(), at: observedAt, folderUri: key, from: previous, to: current.branch, commit: current.commit });
				}
			}
		})().finally(() => { branchCheck = undefined; });
		return branchCheck;
	};
	void checkBranches();
	const branchTimer = setInterval(() => { void checkBranches(); }, 30_000);
	context.subscriptions.push({ dispose: () => clearInterval(branchTimer) });
	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		await record({ kind: 'opened', id: randomUUID(), at: Date.now(), folderUri: folder.uri.toString(), label: `Opened ${folder.name}`, reason: 'startup' });
	}
	output.appendLine('TimeMachine activated. Use TimeMachine: Check Setup to inspect workspace and terminal capture.');
}

export async function deactivate(): Promise<void> { await activeTracker?.tick(); }
