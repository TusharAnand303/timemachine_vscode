import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { ActivityTracker } from './activityTracker';

export class FocusView implements vscode.WebviewViewProvider, vscode.Disposable {
	private view: vscode.WebviewView | undefined;
	private readonly subscriptions: vscode.Disposable[];

	constructor(private readonly extensionUri: vscode.Uri, private readonly tracker: ActivityTracker) {
		this.subscriptions = [
			tracker.onDidChange(() => this.refresh()),
			vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
		];
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] };
		view.webview.html = this.html(view.webview);
		const listener = view.webview.onDidReceiveMessage((message: unknown) => {
			void this.onMessage(message).catch(error => {
				void vscode.window.showErrorMessage(`TimeMachine could not update coding time: ${String(error)}`);
			});
		});
		view.onDidDispose(() => { listener.dispose(); if (this.view === view) { this.view = undefined; } });
	}

	refresh(): void {
		if (!this.view) { return; }
		const projects = (vscode.workspace.workspaceFolders ?? []).map(folder => ({
			id: folder.uri.toString(), name: folder.name, path: folder.uri.fsPath,
			activity: this.tracker.summary(folder.uri.toString()),
		}));
		void this.view.webview.postMessage({ type: 'data', projects });
	}

	private async onMessage(message: unknown): Promise<void> {
		if (!message || typeof message !== 'object') { return; }
		const data = message as { type?: unknown; projectId?: unknown; mode?: unknown };
		if (data.type === 'ready') { this.refresh(); return; }
		if (data.type === 'pause') { await this.tracker.pause(); return; }
		const folder = vscode.workspace.workspaceFolders?.find(item => item.uri.toString() === data.projectId);
		if (data.type === 'export' && folder) { await vscode.commands.executeCommand('timemachine.exportReport', folder.uri.toString()); return; }
		if (data.type === 'start' && folder && (data.mode === 'coding' || data.mode === 'ai')) {
			await this.tracker.start(folder.uri.toString(), data.mode);
		}
	}

	private html(webview: vscode.Webview): string {
		const css = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'focus.css'));
		const js = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'focus.js'));
		const nonce = randomUUID();
		return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"><title>TimeMachine Coding Time</title></head>
<body>
<main>
  <div class="field-label">PROJECT FOLDER</div>
  <select id="project" aria-label="Project to record coding time for" hidden></select>
  <strong id="project-name" class="project-name">Open a project folder</strong>
  <div id="project-path" class="project-path"></div>
  <div class="tracking"><span id="status" role="status" aria-live="polite">Paused</span></div>
  <nav id="ranges" class="ranges" aria-label="Coding time range"><button data-range="today" type="button">Today</button><button data-range="week" type="button">7 days</button><button data-range="all" type="button">All time</button></nav>
  <div class="totals"><div><strong id="coding-time">0s</strong><span>My coding</span></div><div><strong id="ai-time">0s</strong><span>AI-assisted</span></div></div>
  <div class="actions"><button id="coding" type="button" aria-pressed="false">My coding</button><button id="ai" type="button" aria-pressed="false">AI-assisted</button><button id="pause" type="button" disabled>Pause</button></div>
  <p id="hint">Choose a mode to record time while VS Code is focused.</p>
  <details><summary>Daily breakdown · last 7 days</summary><table><thead><tr><th scope="col">Day</th><th scope="col">My coding</th><th scope="col">AI-assisted</th></tr></thead><tbody id="days"></tbody></table></details>
  <button id="export" class="utility" type="button">Export project report</button>
</main>
<script nonce="${nonce}" src="${js}"></script></body></html>`;
	}

	dispose(): void { for (const disposable of this.subscriptions) { disposable.dispose(); } }
}
