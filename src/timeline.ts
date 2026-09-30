import { diffLines } from 'diff';

export type TimelineEvent = OpenEvent | SaveEvent | CommandEvent | ReadyEvent;

interface BaseEvent {
	id: string;
	at: number;
}

export interface OpenEvent extends BaseEvent {
	kind: 'opened';
	label: string;
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
	status: 'running' | 'passed' | 'failed' | 'unknown';
	exitCode?: number;
	finishedAt?: number;
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

export function changesSinceLastPass(events: TimelineEvent[], failure: CommandEvent): SaveEvent[] {
	const lastPass = events
		.filter((event): event is CommandEvent => event.kind === 'command' && event.command === failure.command && event.status === 'passed' && (event.finishedAt ?? event.at) < failure.at)
		.sort((a, b) => (b.finishedAt ?? b.at) - (a.finishedAt ?? a.at))[0];
	const saves = events
		.filter((event): event is SaveEvent => event.kind === 'save' && event.at < failure.at && (!lastPass || event.at > (lastPass.finishedAt ?? lastPass.at)))
		.sort((a, b) => b.at - a.at);
	return lastPass ? saves : saves.slice(0, 1);
}
