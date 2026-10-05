import * as path from 'node:path';
import * as vscode from 'vscode';
import { changesSinceLastPass, checkKind, lastKnownGood, TimelineEvent, whatChanged } from './timeline';
import { TimelineStore } from './storage';
import { TimelineView } from './views';
import { ActivityTracker, FocusMode } from './activityTracker';
import { isDependencyInstall } from './privacy';

type GraphEvent = TimelineEvent & {
	directory: string;
	relatedIds?: string[];
	linkToId?: string;
	hasPreviousPass?: boolean;
	lastKnownGood?: boolean;
	canInvestigate?: boolean;
	dependencyInstall?: boolean;
};

function directoryFor(event: TimelineEvent, folder: vscode.WorkspaceFolder): string {
	if (event.kind === 'save') { return path.dirname(event.name) === '.' ? folder.name : `${folder.name}/${path.dirname(event.name)}`; }
	if (event.kind === 'command' && event.cwd) {
		try {
			const relative = path.relative(folder.uri.fsPath, vscode.Uri.parse(event.cwd).fsPath);
			if (!relative.startsWith('..') && !path.isAbsolute(relative)) { return relative ? `${folder.name}/${relative}` : folder.name; }
		} catch { /* Older records may contain a non-URI cwd. */ }
	}
	return folder.name;
}

export class GraphView implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private panelSubscriptions: vscode.Disposable[] = [];

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly store: TimelineStore,
		private readonly timeline: TimelineView,
		private readonly tracker: ActivityTracker,
		private readonly onHistoryChanged: () => void,
	) {}

	open(eventId?: string, section?: 'graph' | 'history'): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.One);
			this.refresh(eventId, section);
			return;
		}
		const panel = vscode.window.createWebviewPanel('timemachine.graph', 'TimeMachine · Activity Graph', vscode.ViewColumn.One, {
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
		});
		this.panel = panel;
		panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'timemachine.svg');
		panel.webview.html = this.html(panel.webview);
		this.panelSubscriptions.push(panel.onDidDispose(() => {
			this.panel = undefined;
			for (const subscription of this.panelSubscriptions.splice(0)) { subscription.dispose(); }
		}));
		this.panelSubscriptions.push(panel.webview.onDidReceiveMessage((message: unknown) => {
			void this.onMessage(message, eventId, section).catch(error => {
				void vscode.window.showErrorMessage(`TimeMachine could not update history: ${String(error)}`);
			});
		}));
	}

	private async onMessage(message: unknown, initialEventId?: string, initialSection?: 'graph' | 'history'): Promise<void> {
		if (!message || typeof message !== 'object') { return; }
		const data = message as { type?: unknown; id?: unknown; projectId?: unknown; mode?: unknown };
		if (data.type === 'ready') { this.refresh(initialEventId, initialSection); return; }
		if (data.type === 'refresh') { this.refresh(); return; }
		const folder = typeof data.projectId === 'string'
			? vscode.workspace.workspaceFolders?.find(item => item.uri.toString() === data.projectId) : undefined;
		if (data.type === 'exportReport' && folder) { await vscode.commands.executeCommand('timemachine.exportReport', folder.uri.toString()); return; }
		if (data.type === 'startTimer' && folder && (data.mode === 'coding' || data.mode === 'ai')) {
			await this.tracker.start(folder.uri.toString(), data.mode as FocusMode);
			this.refresh();
			return;
		}
		if (data.type === 'pauseTimer') { await this.tracker.pause(); this.refresh(); return; }
		if (data.type === 'clearCommands' && folder) {
			const ids = new Set(this.timeline.projectEvents(folder).filter(event => event.kind === 'command').map(event => event.id));
			if (!ids.size) { return; }
			const answer = await vscode.window.showWarningMessage(`Delete ${ids.size} recorded commands from ${folder.name}? Related server-ready events will also be removed.`, { modal: true }, 'Delete commands');
			if (answer !== 'Delete commands') { return; }
			await this.store.removeIds(ids);
			this.onHistoryChanged(); this.refresh();
			return;
		}
		if (data.type === 'clearProject' && folder) {
			const ids = new Set(this.timeline.projectEvents(folder).map(event => event.id));
			const answer = await vscode.window.showWarningMessage(`Delete all recorded activity and coding-time totals for ${folder.name}? Saved snapshots and checkpoints will be deleted.`, { modal: true }, 'Delete project history');
			if (answer !== 'Delete project history') { return; }
			await this.store.removeIds(ids);
			await this.tracker.clearProject(folder.uri.toString());
			this.onHistoryChanged(); this.refresh();
			return;
		}
		if (data.type === 'copyProjectPath' && folder) {
			await vscode.env.clipboard.writeText(folder.uri.fsPath);
			vscode.window.setStatusBarMessage('TimeMachine: project path copied', 2500);
			void this.panel?.webview.postMessage({ type: 'projectPathCopied' });
			return;
		}
		if (data.type === 'revealProject' && folder) { await vscode.commands.executeCommand('revealInExplorer', folder.uri); return; }
		if (typeof data.id !== 'string') { return; }
		const event = this.store.all.find(item => item.id === data.id);
		if (!event) { return; }
		if (data.type === 'copyCommand' && event.kind === 'command') {
			await vscode.env.clipboard.writeText(event.command);
			vscode.window.setStatusBarMessage('TimeMachine: command copied', 2500);
			return;
		}
		if (data.type === 'deleteEvent') {
			const name = event.kind === 'command' ? event.command : event.kind === 'save' || event.kind === 'file' || event.kind === 'checkpoint' ? event.name : event.kind === 'branch' ? `${event.from} → ${event.to}` : event.kind === 'ready' ? 'server-ready event' : 'project-open event';
			const answer = await vscode.window.showWarningMessage(`Delete this recorded ${event.kind} event? ${name}`, { modal: true }, 'Delete event');
			if (answer !== 'Delete event') { return; }
			await this.store.removeIds(new Set([event.id]));
			this.onHistoryChanged(); this.refresh();
			return;
		}
		const actions: Record<string, string> = {
			whatChanged: 'timemachine.whatChanged',
			compareCheckpoint: 'timemachine.compareWithCheckpoint',
			compare: 'timemachine.compare',
			restore: 'timemachine.restore',
			view: 'timemachine.viewChange',
			openFile: 'timemachine.openFile',
		};
		const command = typeof data.type === 'string' ? actions[data.type] : undefined;
		if (command) { await vscode.commands.executeCommand(command, data.id); }
	}

	refresh(revealId?: string, section?: 'graph' | 'history'): void {
		if (!this.panel) { return; }
		const projects = (vscode.workspace.workspaceFolders ?? []).map(folder => {
			const events = this.timeline.projectEvents(folder);
			const latestGood = lastKnownGood(events, folder.uri.toString());
			const graphEvents: GraphEvent[] = events.map(event => ({
				...event,
				directory: directoryFor(event, folder),
				...(event.kind === 'command' ? { check: event.check ?? checkKind(event.command) } : {}),
				...(event.id === latestGood?.id ? { lastKnownGood: true } : {}),
				...(event.kind === 'command' && isDependencyInstall(event.command) ? { dependencyInstall: true } : {}),
				...(event.kind === 'command' && event.status === 'failed'
					? {
					canInvestigate: !!whatChanged(events, event),
					relatedIds: changesSinceLastPass(events, event).map(save => save.id),
					hasPreviousPass: events.some(item => item.kind === 'command' && item.command === event.command && item.status === 'passed' && (item.finishedAt ?? item.at) < event.at),
				} : {}),
				...(event.kind === 'ready' ? { linkToId: event.commandId } : {}),
			}));
			return { id: folder.uri.toString(), name: folder.name, path: folder.uri.fsPath, events: graphEvents, activity: this.tracker.summary(folder.uri.toString()) };
		});
		void this.panel.webview.postMessage({ type: 'data', projects, revealId, section });
	}

	dispose(): void {
		this.panel?.dispose();
		for (const subscription of this.panelSubscriptions.splice(0)) { subscription.dispose(); }
	}

	private html(webview: vscode.Webview): string {
		const css = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'graph.css'));
		const js = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'graph.js'));
		return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}; img-src ${webview.cspSource} data:">
<title>TimeMachine Activity Graph</title><link rel="stylesheet" href="${css}"></head>
<body>
<div class="app">
  <header class="topbar"><div class="brand"><span class="brand-mark">◷</span><span>TimeMachine</span><span class="brand-version">1.6.0</span></div><div class="top-actions"><span class="live-dot"></span><span>Local activity</span><button id="refresh" class="icon-button" type="button" title="Refresh activity" aria-label="Refresh activity">↻</button></div></header>
  <div class="content">
    <main class="main">
	      <section class="hero"><div class="eyebrow">TIMEMACHINE</div><h1>Your project's flight recorder</h1><p>See what changed between passing and failing runs, alongside saved files and terminal commands.</p></section>
      <section class="project-bar" aria-label="Current project"><div class="project-heading"><span class="project-symbol" aria-hidden="true">⌁</span><div><div class="field-label">PROJECT FOLDER</div><select id="project" aria-label="Project folder"></select></div></div><div class="project-context"><div id="project-path" class="project-path"></div><div id="project-summary" class="project-summary"></div><div class="project-actions"><button id="reveal-project" type="button">Show in Explorer</button><button id="copy-project-path" type="button">Copy path</button><button id="export-report" type="button">Export report</button><span id="project-feedback" class="project-feedback" role="status" aria-live="polite"></span></div></div></section>
      <section id="stats" class="stats" aria-label="Activity summary"></section>

      <section class="toolbar"><div class="toolbar-heading"><h2>Activity graph</h2><span id="result-count" class="result-count"></span></div><div class="controls"><input id="search" type="search" placeholder="Search commands, files, folders…" aria-label="Search activity"><select id="folder" aria-label="Project folder"></select><select id="range" aria-label="Time range"><option value="all">All time</option><option value="today">Today</option><option value="week">Last 7 days</option></select></div></section>
      <nav id="sections" class="sections" aria-label="Activity views"><button data-section="graph" class="active" type="button">Activity graph</button><button data-section="history" type="button">Command history</button></nav>
      <nav id="filters" class="filters" aria-label="Event filters"><button data-filter="all" class="active" type="button">All activity</button><button data-filter="commands" type="button">Commands</button><button data-filter="saves" type="button">Saved files</button><button data-filter="openings" type="button">Project openings</button><button data-filter="failures" type="button">Failures</button></nav>
      <div id="lane-headings" class="timeline-guide"><span>Newest first · Select an event for details · Use ↑ and ↓ to browse</span><span>Project openings also include extension restarts.</span></div>
      <div id="graph-scroll" class="graph-scroll"><div id="graph" class="graph"><svg id="edges" aria-hidden="true"></svg><div id="nodes"></div></div><div id="empty" class="empty" hidden></div></div>
      <footer id="graph-footer" class="graph-footer"><span>Solid lines connect consecutive events. Dashed lines link commands to related saves or server-ready events.</span><button id="latest" type="button">Jump to latest ↑</button></footer>
      <section id="history" class="history" hidden><div class="history-heading"><div><h2>Recorded runs</h2><p>Search every recorded command in this project.</p></div><button id="clear-commands" type="button">Delete command history</button></div><input id="command-search" type="search" placeholder="Search command text, terminal, or folder…" aria-label="Search command history"><div id="history-count" class="history-count"></div><div id="history-list" class="history-list"></div></section>
      <section class="focus-panel" aria-label="Coding time"><div class="focus-heading"><div><div class="field-label">FOCUS TIME · TODAY</div><p>Choose a mode to track time in this project while VS Code is focused.</p></div><span id="focus-status" class="focus-status">Paused</span></div><div class="focus-content"><div class="focus-total"><strong id="coding-time">0m</strong><span>My coding</span><small id="coding-all">All time 0m</small></div><div class="focus-total ai"><strong id="ai-time">0m</strong><span>AI-assisted</span><small id="ai-all">All time 0m</small></div><div class="focus-actions"><button id="start-coding" type="button">Start coding</button><button id="start-ai" type="button">Start AI-assisted</button><button id="pause-timer" type="button">Pause</button></div></div></section>
      <div class="project-footer"><button id="clear-project" type="button">Delete all project history and time totals</button></div>
    </main>
    <aside id="detail" class="detail" aria-label="Event details"></aside>
  </div>
</div>
<script src="${js}"></script></body></html>`;
	}
}
