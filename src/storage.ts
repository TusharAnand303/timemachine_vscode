import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CommandEvent, SaveEvent, TimelineEvent } from './timeline';

const maximumEvents = 500;

export class TimelineStore {
	private events: TimelineEvent[] = [];
	private writeQueue: Promise<void> = Promise.resolve();
	private readonly directory: string;
	private readonly timelinePath: string;

	constructor(storageUri: vscode.Uri) {
		this.directory = storageUri.fsPath;
		this.timelinePath = path.join(this.directory, 'timeline.json');
	}

	async load(): Promise<void> {
		await fs.mkdir(this.directory, { recursive: true });
		try {
			const parsed: unknown = JSON.parse(await fs.readFile(this.timelinePath, 'utf8'));
			if (Array.isArray(parsed)) {
				this.events = parsed.filter((event): event is TimelineEvent => typeof event === 'object' && event !== null && typeof event.id === 'string' && typeof event.kind === 'string' && typeof event.at === 'number').slice(-maximumEvents);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
		}
	}

	get all(): readonly TimelineEvent[] { return this.events; }

	async add(event: TimelineEvent, snapshots?: { before: string; after: string }): Promise<void> {
		this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
			if (snapshots && event.kind === 'save') {
				const snapshotsDirectory = path.join(this.directory, 'snapshots');
				await fs.mkdir(snapshotsDirectory, { recursive: true });
				event.before = `${event.id}-before.txt`;
				event.after = `${event.id}-after.txt`;
				await Promise.all([
					fs.writeFile(path.join(snapshotsDirectory, event.before), snapshots.before, 'utf8'),
					fs.writeFile(path.join(snapshotsDirectory, event.after), snapshots.after, 'utf8'),
				]);
			}
			this.events.push(event);
			const removed = this.events.length > maximumEvents ? this.events.splice(0, this.events.length - maximumEvents) : [];
			await this.persist();
			for (const old of removed) {
				if (old.kind === 'save') {
					for (const name of [old.before, old.after]) {
						if (name) { await fs.rm(path.join(this.directory, 'snapshots', name), { force: true }); }
					}
				}
			}
		});
		await this.writeQueue;
	}

	async finishCommand(id: string, status: CommandEvent['status'], exitCode?: number): Promise<void> {
		this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
			const command = this.events.find((event): event is CommandEvent => event.kind === 'command' && event.id === id);
			if (!command) { return; }
			command.status = status;
			command.exitCode = exitCode;
			command.finishedAt = Date.now();
			await this.persist();
		});
		await this.writeQueue;
	}

	private async persist(): Promise<void> {
		const temporary = `${this.timelinePath}.tmp`;
		await fs.writeFile(temporary, JSON.stringify(this.events), 'utf8');
		await fs.rename(temporary, this.timelinePath);
	}

	async snapshot(event: SaveEvent, side: 'before' | 'after'): Promise<string> {
		const name = event[side];
		if (!name || !this.events.some(item => item.id === event.id)) { throw new Error('Snapshot is unavailable'); }
		return fs.readFile(path.join(this.directory, 'snapshots', name), 'utf8');
	}
}
