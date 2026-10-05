import { ChangeReport, CommandEvent, TimelineEvent, lastKnownGood, whatChanged } from './timeline';
import { isDependencyInstall } from './privacy';

function stamp(at: number): string { return new Date(at).toLocaleString(); }
function code(value: string): string { return '`' + value.replace(/`/g, 'ˈ') + '`'; }

export function changeReportMarkdown(report: ChangeReport): string {
	const { good, failure, files, commands, branchChanges } = report;
	const lines = [
		'# What Changed?',
		'',
		`**Last Known Good:** ${code(good.command)} passed at ${stamp(good.finishedAt ?? good.at)} (exit 0).`,
		`**Failure:** ${code(failure.command)} failed at ${stamp(failure.finishedAt ?? failure.at)} (exit ${failure.exitCode ?? 'unknown'}).`,
		'',
		'Changes below happened between these runs. Their timing and type may help investigate; they are not proof of cause.',
		'',
		'## Files, ranked for review',
		'',
	];
	if (!files.length) { lines.push('No file changes were recorded in this interval.'); }
	for (const file of files) {
		const flags = [/(?:^|\/)package\.json$/i.test(file.name) || /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|composer\.lock|Cargo\.lock|go\.sum)$/i.test(file.name) ? 'dependency manifest or lockfile' : '', /(?:^|\/)(?:[^/]*config\.[^/]+|tsconfig\.json|\.github\/[^/]+)$/i.test(file.name) ? 'configuration' : ''].filter(Boolean);
		lines.push(`- ${code(file.name)} — ${file.change}${file.oldName ? ` from ${code(file.oldName)}` : ''}; ${file.saves} ${file.saves === 1 ? 'save' : 'saves'}${flags.length ? `; ${flags.join(', ')}` : ''}`);
	}
	lines.push('', '## Terminal commands', '');
	if (!commands.length) { lines.push('No terminal commands were recorded in this interval.'); }
	for (const command of commands) { lines.push(`- ${stamp(command.at)} — ${code(command.command)}${isDependencyInstall(command.command) ? ' 📦 dependency install' : ''} — ${command.status}${command.exitCode !== undefined ? ` (exit ${command.exitCode})` : ''}`); }
	lines.push('', '## Git branch changes', '');
	if (!branchChanges.length) { lines.push('No branch change was recorded in this interval.'); }
	for (const branch of branchChanges) { lines.push(`- ${stamp(branch.at)} — ${code(branch.from)} → ${code(branch.to)}${branch.commit ? ` (${branch.commit})` : ''}`); }
	lines.push('', '_TimeMachine records local activity visible to this VS Code window. Missing events do not rule out other changes._');
	return lines.join('\n');
}

export function currentLastKnownGood(events: readonly TimelineEvent[], folderUri: string): CommandEvent | undefined {
	return lastKnownGood(events, folderUri);
}

export function reportForFailure(events: readonly TimelineEvent[], failure: CommandEvent): string | undefined {
	const report = whatChanged(events, failure);
	return report && changeReportMarkdown(report);
}
