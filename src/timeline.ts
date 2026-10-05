import { diffLines } from 'diff';

export type TimelineEvent = OpenEvent | SaveEvent | CommandEvent | ReadyEvent | FileEvent | BranchEvent | CheckpointEvent;

interface BaseEvent {
	id: string;
	at: number;
	folderUri?: string;
}

export interface OpenEvent extends BaseEvent {
	kind: 'opened';
	label: string;
	reason?: 'startup' | 'folder-added';
}

export interface SaveEvent extends BaseEvent {
	kind: 'save';
	uri: string;
	name: string;
	added?: number;
	removed?: number;
	before?: string;
	after?: string;
}

export interface CommandEvent extends BaseEvent {
	kind: 'command';
	command: string;
	terminal: string;
	cwd?: string;
	cwdInferred?: boolean;
	status: 'running' | 'passed' | 'failed' | 'unknown';
	exitCode?: number;
	finishedAt?: number;
	check?: 'test' | 'build';
}

export interface FileEvent extends BaseEvent {
	kind: 'file';
	change: 'created' | 'deleted' | 'renamed';
	name: string;
	oldName?: string;
}

export interface BranchEvent extends BaseEvent {
	kind: 'branch';
	from: string;
	to: string;
	commit?: string;
}

export interface CheckpointEvent extends BaseEvent {
	kind: 'checkpoint';
	name: string;
	files: string[];
}

export interface ReadyEvent extends BaseEvent {
	kind: 'ready';
	commandId: string;
	terminal: string;
}

export function lineCounts(before: string, after: string): { added: number; removed: number } | undefined {
	let added = 0;
	let removed = 0;
	const parts = diffLines(before, after, { timeout: 500 });
	if (!parts) { return undefined; }
	for (const part of parts) {
		const count = part.value.split('\n').length - (part.value.endsWith('\n') ? 1 : 0);
		if (part.added) { added += count; }
		if (part.removed) { removed += count; }
	}
	return { added, removed };
}

export function isServerReadyOutput(output: string): boolean {
	return /(?:\bready in\s+\d+|\bserver (?:started|running|ready)\b|\blistening on\b|\blocal:\s*https?:\/\/)/i.test(output);
}

export function changesSinceLastPass(events: TimelineEvent[], failure: CommandEvent): SaveEvent[] {
	const lastPass = events
		.filter((event): event is CommandEvent => event.kind === 'command' && event.folderUri === failure.folderUri && event.command === failure.command && event.status === 'passed' && (event.finishedAt ?? event.at) < failure.at)
		.sort((a, b) => (b.finishedAt ?? b.at) - (a.finishedAt ?? a.at))[0];
	const saves = events
		.filter((event): event is SaveEvent => event.kind === 'save' && event.folderUri === failure.folderUri && event.at < failure.at && (!lastPass || event.at > (lastPass.finishedAt ?? lastPass.at)))
		.sort((a, b) => b.at - a.at);
	return lastPass ? saves : saves.slice(0, 1);
}

export function checkKind(command: string): 'test' | 'build' | undefined {
	const value = command.trim().replace(/^(?:[A-Za-z_][A-Za-z_0-9]*=(?:[^\s]+)\s+)*/, '');
	if (/^(?:(?:npm\s+(?:run\s+)?|(?:yarn|pnpm|bun)\s+(?:run\s+)?)(?:test|test:[\w-]+)|(?:npx\s+)?(?:jest|vitest|mocha|playwright\s+test)|pytest|python(?:3)?\s+-m\s+pytest|(?:vendor\/bin\/)?phpunit|go\s+test|cargo\s+test|dotnet\s+test|mvn\s+test|gradle\s+test|\.\/gradlew\s+test)(?:\s|$)/i.test(value)) { return 'test'; }
	if (/^(?:(?:npm\s+run\s+|(?:yarn|pnpm|bun)\s+(?:run\s+)?)(?:build|build:[\w-]+)|go\s+build|cargo\s+build|dotnet\s+build|mvn\s+package|gradle\s+build|\.\/gradlew\s+build|make(?:\s+all)?)(?:\s|$)/i.test(value)) { return 'build'; }
	return undefined;
}

export function lastKnownGood(events: readonly TimelineEvent[], folderUri?: string, command?: string): CommandEvent | undefined {
	return events.filter((event): event is CommandEvent => event.kind === 'command' && event.folderUri === folderUri && event.status === 'passed' && !!(event.check ?? checkKind(event.command)) && (!command || event.command === command))
		.sort((a, b) => (b.finishedAt ?? b.at) - (a.finishedAt ?? a.at))[0];
}

export function passToFail(events: readonly TimelineEvent[], failure: CommandEvent): CommandEvent | undefined {
	if (failure.status !== 'failed' || !(failure.check ?? checkKind(failure.command))) { return undefined; }
	const previous = events.filter((event): event is CommandEvent => event.kind === 'command' && event.id !== failure.id && event.folderUri === failure.folderUri && event.command === failure.command && (event.check ?? checkKind(event.command)) === (failure.check ?? checkKind(failure.command)) && event.status !== 'running' && (event.finishedAt ?? event.at) < failure.at)
		.sort((a, b) => (b.finishedAt ?? b.at) - (a.finishedAt ?? a.at))[0];
	return previous?.status === 'passed' ? previous : undefined;
}

export interface ChangeReport {
	good: CommandEvent;
	failure: CommandEvent;
	files: { name: string; saves: number; change: 'modified' | FileEvent['change']; oldName?: string; score: number }[];
	commands: CommandEvent[];
	branchChanges: BranchEvent[];
}

export function whatChanged(events: readonly TimelineEvent[], failure: CommandEvent): ChangeReport | undefined {
	const good = lastKnownGood(events.filter(event => event.at < failure.at), failure.folderUri, failure.command);
	if (!good) { return undefined; }
	const start = good.finishedAt ?? good.at;
	const end = failure.finishedAt ?? failure.at;
	const between = events.filter(event => event.folderUri === failure.folderUri && event.at > start && event.at < end && event.id !== failure.id);
	const files = new Map<string, ChangeReport['files'][number]>();
	for (const event of between) {
		if (event.kind !== 'save' && event.kind !== 'file') { continue; }
		const entry = files.get(event.name) ?? { name: event.name, saves: 0, change: 'modified' as const, score: 0 };
		if (event.kind === 'save') { entry.saves++; }
		else { entry.change = event.change; entry.oldName = event.oldName; }
		files.set(event.name, entry);
	}
	for (const file of files.values()) {
		file.score = Math.min(file.saves, 5) + (file.change !== 'modified' ? 2 : 0) + (/(?:^|\/)(?:package\.json|.*lock(?:\.json|\.yaml)?|.*config\.[^/]+|tsconfig\.json|\.github\/[^/]+)$/i.test(file.name) ? 4 : 0);
	}
	return { good, failure, files: [...files.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)), commands: between.filter((event): event is CommandEvent => event.kind === 'command'), branchChanges: between.filter((event): event is BranchEvent => event.kind === 'branch') };
}
