import { checkKind, CommandEvent, lastKnownGood, TimelineEvent } from './timeline';

function duration(ms: number): string {
	const minutes = Math.floor(Math.max(0, ms) / 60000);
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function sessionSummaryMarkdown(events: readonly TimelineEvent[], folderUri: string, projectName: string, branch: string | undefined, now = Date.now(), fallbackStart = now): string {
	const sessionStart = [...events].reverse().find(event => event.kind === 'opened' && event.folderUri === folderUri && event.reason === 'startup');
	const start = sessionStart?.at ?? fallbackStart;
	const session = events.filter(event => event.folderUri === folderUri && event.at >= start);
	const commands = session.filter((event): event is CommandEvent => event.kind === 'command');
	const checks = commands.filter(event => !!(event.check ?? checkKind(event.command)));
	const files = new Set(session.filter(event => event.kind === 'save' || event.kind === 'file').map(event => event.name));
	const checkpoints = session.filter(event => event.kind === 'checkpoint');
	const good = lastKnownGood(events, folderUri);
	return [
		`# ${projectName} · Session Summary`, '',
		`- Session started: ${new Date(start).toLocaleString()}`,
		`- Duration so far: ${duration(now - start)}`,
		`- Files touched: ${files.size}${files.size ? ` — ${[...files].sort().join(', ')}` : ''}`,
		`- Terminal commands: ${commands.length}`,
		`- Tests/builds run: ${checks.length} (${checks.filter(event => event.status === 'passed').length} passed, ${checks.filter(event => event.status === 'failed').length} failed)`,
		`- Checkpoints: ${checkpoints.length}${checkpoints.length ? ` — ${checkpoints.map(event => event.name).join(', ')}` : ''}`,
		`- Current branch: ${branch ?? 'unavailable'}`,
		`- Latest Last Known Good: ${good ? `${good.command} at ${new Date(good.finishedAt ?? good.at).toLocaleString()}` : 'none recorded'}`,
	].join('\n');
}
