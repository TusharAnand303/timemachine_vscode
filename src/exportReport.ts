import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ActivityTracker } from './activityTracker';
import { createProjectReport, reportCsv } from './report';
import { TimelineView } from './views';

export async function exportProjectReport(folder: vscode.WorkspaceFolder, timeline: TimelineView, tracker: ActivityTracker): Promise<void> {
	const name = folder.name.replace(/[^\p{L}\p{N}_-]/gu, '-');
	const target = await vscode.window.showSaveDialog({
		title: `Export activity report for ${folder.name}`,
		defaultUri: vscode.Uri.file(path.join(os.homedir(), `${name}-timemachine-report.json`)),
		filters: { 'JSON activity report': ['json'], 'CSV spreadsheet': ['csv'] },
		saveLabel: 'Export report',
	});
	if (!target) { return; }
	const report = createProjectReport({ name: folder.name, path: folder.uri.fsPath }, timeline.projectEvents(folder), tracker.history(folder.uri.toString()));
	const content = path.extname(target.path).toLowerCase() === '.csv' ? reportCsv(report) : JSON.stringify(report, null, 2) + '\n';
	await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
	vscode.window.setStatusBarMessage('TimeMachine: project report exported', 4000);
}
