import { FocusDay } from './activityTracker';
import { TimelineEvent } from './timeline';

export function createProjectReport(project: { name: string; path: string }, events: readonly TimelineEvent[], days: FocusDay[], at = Date.now()) {
	return {
		schemaVersion: 1, generatedAt: new Date(at).toISOString(), project,
		summary: {
			events: events.length,
			commands: events.filter(event => event.kind === 'command').length,
			failures: events.filter(event => event.kind === 'command' && event.status === 'failed').length,
			fileSaves: events.filter(event => event.kind === 'save').length,
			projectOpenings: events.filter(event => event.kind === 'opened').length,
		},
		focusTime: { unit: 'milliseconds', labeling: 'Modes are selected by the user; they do not identify authorship of individual edits.', days },
		events: [...events].sort((a, b) => a.at - b.at).map(event => {
			if (event.kind === 'save') {
				return { kind: event.kind, id: event.id, at: new Date(event.at).toISOString(), uri: event.uri, name: event.name, added: event.added, removed: event.removed, snapshotAvailable: Boolean(event.before && event.after) };
			}
			return { ...event, at: new Date(event.at).toISOString(), ...(event.kind === 'command' && event.finishedAt ? { finishedAt: new Date(event.finishedAt).toISOString() } : {}) };
		}),
	};
}

function cell(value: string | number | undefined): string {
	let text = value === undefined ? '' : String(value);
	// Keep command text and paths from becoming formulas when opened in a spreadsheet.
	if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) { text = `'${text}`; }
	return `"${text.replaceAll('"', '""')}"`;
}

export function reportCsv(report: ReturnType<typeof createProjectReport>): string {
	const rows: (string | number | undefined)[][] = [['record_type', 'date', 'project', 'folder', 'activity', 'status', 'exit_code', 'coding_seconds', 'ai_seconds', 'lines_added', 'lines_removed']];
	for (const day of report.focusTime.days) {
		rows.push(['focus_time', day.date, report.project.name, report.project.path, 'User-labeled time', '', '', day.codingMs / 1000, day.aiMs / 1000, '', '']);
	}
	for (const event of report.events) {
		rows.push([event.kind, event.at, report.project.name, event.kind === 'command' ? event.cwd || report.project.path : report.project.path,
			event.kind === 'command' ? event.command : event.kind === 'save' || event.kind === 'file' || event.kind === 'checkpoint' ? event.name : event.kind === 'branch' ? `${event.from} → ${event.to}` : event.kind === 'opened' ? event.label : 'Server ready',
			event.kind === 'command' ? event.status : '', event.kind === 'command' ? event.exitCode : undefined, '', '',
			event.kind === 'save' ? event.added : undefined, event.kind === 'save' ? event.removed : undefined]);
	}
	return rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
