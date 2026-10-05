import * as path from 'node:path';
import * as vscode from 'vscode';
import { changesSinceLastPass, checkKind, lastKnownGood, SaveEvent, TimelineEvent } from './timeline';
import { TimelineStore } from './storage';

export type TimelineNode =
	| { kind: 'project'; folder: vscode.WorkspaceFolder; events: TimelineEvent[] }
	| { kind: 'day'; folder: vscode.WorkspaceFolder; events: TimelineEvent[]; date: string }
	| { kind: 'event'; folder: vscode.WorkspaceFolder; event: TimelineEvent }
	| { kind: 'related'; folder: vscode.WorkspaceFolder; event: SaveEvent }
	| { kind: 'hint'; label: string };

export function time(at: number): string {
	return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dateKey(at: number): string {
	const date = new Date(at);
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(at: number): string {
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	if (dateKey(at) === dateKey(today.getTime())) { return 'Today'; }
	if (dateKey(at) === dateKey(yesterday.getTime())) { return 'Yesterday'; }
	return new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function saveSummary(event: SaveEvent): string {
	return event.added === undefined || event.removed === undefined ? 'snapshot unavailable' : `+${event.added} −${event.removed}`;
}

export class TimelineView implements vscode.TreeDataProvider<TimelineNode> {
	private readonly changed = new vscode.EventEmitter<TimelineNode | undefined>();
	readonly onDidChangeTreeData = this.changed.event;

	constructor(private readonly store: TimelineStore, private readonly legacyFolderUri?: string) {}
	refresh(): void { this.changed.fire(undefined); }

	private folderFor(event: TimelineEvent): vscode.WorkspaceFolder | undefined {
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (event.folderUri) { return folders.find(folder => folder.uri.toString() === event.folderUri); }
		if (event.kind === 'save') { return vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(event.uri)); }
		if (event.kind === 'ready') {
			const command = this.store.all.find(item => item.kind === 'command' && item.id === event.commandId);
			if (command) { return this.folderFor(command); }
		}
		// Version 1.1 stored no project identity. Only a workspace-scoped history
		// can safely be assigned to its sole folder.
		return folders.find(folder => folder.uri.toString() === this.legacyFolderUri);
	}

	projectEvents(folder: vscode.WorkspaceFolder): TimelineEvent[] {
		return this.store.all.filter(event => this.folderFor(event)?.uri.toString() === folder.uri.toString());
	}

	getChildren(node?: TimelineNode): TimelineNode[] {
		if (!node) {
			return (vscode.workspace.workspaceFolders ?? []).map(folder => ({ kind: 'project', folder, events: this.projectEvents(folder) }));
		}
		if (node.kind === 'project') {
			if (!node.events.length) { return [{ kind: 'hint', label: 'Save a file or run a command in a new terminal' }]; }
			const days = new Map<string, TimelineEvent[]>();
			for (const event of node.events) {
				const key = dateKey(event.at);
				const group = days.get(key) ?? [];
				group.push(event);
				days.set(key, group);
			}
			return [...days.entries()].sort((a, b) => Math.max(...b[1].map(event => event.at)) - Math.max(...a[1].map(event => event.at)))
				.map(([date, events]) => ({ kind: 'day', folder: node.folder, date, events }));
		}
		if (node.kind === 'day') {
			return [...node.events].sort((a, b) => b.at - a.at).map(event => ({ kind: 'event', folder: node.folder, event }));
		}
		if (node.kind === 'event' && node.event.kind === 'command' && node.event.status === 'failed') {
			return changesSinceLastPass([...this.store.all], node.event).map(event => ({ kind: 'related', folder: node.folder, event }));
		}
		return [];
	}

	getTreeItem(node: TimelineNode): vscode.TreeItem {
		if (node.kind === 'hint') {
			const item = new vscode.TreeItem(node.label);
			item.iconPath = new vscode.ThemeIcon('info');
			return item;
		}
		if (node.kind === 'project') {
			const item = new vscode.TreeItem(node.folder.name, vscode.TreeItemCollapsibleState.Expanded);
			item.id = `project:${node.folder.uri.toString()}`;
			item.description = `${node.events.length} events`;
			item.tooltip = `Project folder: ${node.folder.uri.fsPath}\n${node.events.length} recorded events`;
			item.iconPath = new vscode.ThemeIcon('root-folder');
			return item;
		}
		if (node.kind === 'day') {
			const item = new vscode.TreeItem(`${dayLabel(node.events[0].at)} · ${node.events.length}`, dateKey(Date.now()) === node.date ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
			item.id = `day:${node.folder.uri.toString()}:${node.date}`;
			item.iconPath = new vscode.ThemeIcon('calendar');
			return item;
		}
		if (node.kind === 'related') {
			const item = new vscode.TreeItem(`Possible cause: ${node.event.name}`);
			item.description = saveSummary(node.event);
			item.tooltip = 'This file was saved after the last passing run of the same command. Timing suggests a possible cause.';
			item.iconPath = new vscode.ThemeIcon('search');
			item.contextValue = node.event.before && node.event.after ? 'save' : 'saveUnavailable';
			if (node.event.before && node.event.after) { item.command = { command: 'timemachine.compare', title: 'Compare Change', arguments: [node.event.id] }; }
			return item;
		}
		const event = node.event;
		let label: string;
		let description: string;
		let icon: string;
		if (event.kind === 'opened') {
			label = `${node.folder.name} opened`;
			description = event.reason === 'startup' ? 'extension started' : event.reason === 'folder-added' ? 'folder added' : 'opening recorded';
			icon = 'folder-opened';
		} else if (event.kind === 'save') {
			label = `${event.name} saved`; description = saveSummary(event); icon = 'save';
		} else if (event.kind === 'ready') {
			label = 'Server ready'; description = event.terminal; icon = 'server';
		} else if (event.kind === 'file') {
			label = `${event.name} ${event.change}`; description = event.oldName ? `from ${event.oldName}` : 'file operation'; icon = event.change === 'deleted' ? 'trash' : event.change === 'renamed' ? 'arrow-swap' : 'new-file';
		} else if (event.kind === 'branch') {
			label = `Branch ${event.from} → ${event.to}`; description = event.commit ?? 'Git branch changed'; icon = 'git-branch';
		} else if (event.kind === 'checkpoint') {
			label = `Checkpoint: ${event.name}`; description = `${event.files.length} files`; icon = 'bookmark';
		} else {
			label = event.command;
			icon = event.status === 'failed' ? 'error' : event.status === 'passed' ? 'pass' : event.status === 'running' ? 'loading~spin' : 'terminal';
			const location = event.cwd ? vscode.Uri.parse(event.cwd) : node.folder.uri;
			const relative = path.relative(node.folder.uri.fsPath, location.fsPath);
			const directory = relative && !relative.startsWith('..') ? relative : node.folder.name;
			const good = event.status === 'passed' && (event.check ?? checkKind(event.command)) && lastKnownGood(this.projectEvents(node.folder), event.folderUri)?.id === event.id;
			description = `${event.status}${good ? ' · LAST KNOWN GOOD' : ''}${event.exitCode !== undefined && event.exitCode !== 0 ? ` (${event.exitCode})` : ''} · ${directory}${event.cwdInferred ? ' (assumed)' : ''}`;
		}
		const related = event.kind === 'command' && event.status === 'failed' ? changesSinceLastPass([...this.store.all], event) : [];
		const item = new vscode.TreeItem(`${time(event.at)}  ${label}`, related.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		item.id = `event:${event.id}`;
		item.description = description;
		item.iconPath = new vscode.ThemeIcon(icon);
		item.tooltip = event.kind === 'save' ? `${event.uri}\n${description}` : event.kind === 'command' ? `${event.command}\n${description}\nTerminal: ${event.terminal}` : `${label}\n${node.folder.uri.fsPath}`;
		item.contextValue = 'event';
		if (event.kind !== 'save') {
			item.command = { command: 'timemachine.showInGraph', title: 'Show Event Details', arguments: [node] };
			if (event.kind === 'opened' || event.kind === 'ready') { item.tooltip = `${label}\nProject folder: ${node.folder.uri.fsPath}\n${description}\nRecorded: ${new Date(event.at).toLocaleString()}`; }
		}
		if (event.kind === 'save') {
			item.contextValue = event.before && event.after ? 'save' : 'saveUnavailable';
			if (event.after) { item.command = { command: 'timemachine.viewChange', title: 'View Saved Version', arguments: [event.id] }; }
		}
		return item;
	}
}

type FolderNode = { uri: vscode.Uri; root: boolean; name: string };

export class ProjectFoldersView implements vscode.TreeDataProvider<FolderNode> {
	private readonly changed = new vscode.EventEmitter<FolderNode | undefined>();
	readonly onDidChangeTreeData = this.changed.event;
	refresh(): void { this.changed.fire(undefined); }

	async getChildren(node?: FolderNode): Promise<FolderNode[]> {
		if (!node) { return (vscode.workspace.workspaceFolders ?? []).map(folder => ({ uri: folder.uri, root: true, name: folder.name })); }
		try {
			const entries = await vscode.workspace.fs.readDirectory(node.uri);
			return entries.filter(([, type]) => (type & vscode.FileType.Directory) !== 0)
				.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
				.map(([name]) => ({ uri: vscode.Uri.joinPath(node.uri, name), root: false, name }));
		} catch { return []; }
	}

	getTreeItem(node: FolderNode): vscode.TreeItem {
		const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed);
		item.id = `folder:${node.uri.toString()}`;
		item.iconPath = new vscode.ThemeIcon(node.root ? 'root-folder' : 'folder');
		item.tooltip = node.uri.fsPath;
		if (node.root) { item.description = node.uri.fsPath; }
		return item;
	}
}
