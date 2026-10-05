import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { checkKind, CommandEvent, SaveEvent, TimelineEvent } from './timeline';
import { redactCommand } from './privacy';

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
			let sanitized = false;
			for (const event of this.events) {
				if (event.kind === 'command') {
					const safe = redactCommand(event.command);
					if (safe !== event.command) { event.command = safe; sanitized = true; }
				}
			}
			if (sanitized) { await this.persist(); }
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
		}
	}

	get all(): readonly TimelineEvent[] { return this.events; }

	async associateLegacy(folderUri: string): Promise<void> {
		this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
			let changed = false;
			for (const event of this.events) {
				if (!event.folderUri) { event.folderUri = folderUri; changed = true; }
			}
			if (changed) { await this.persist(); }
		});
		await this.writeQueue;
	}

	async add(event: TimelineEvent, snapshots?: { before: string; after: string }): Promise<void> {
		this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
			if (event.kind === 'command') { event.command = redactCommand(event.command); }
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
			const removed: TimelineEvent[] = [];
			while (this.events.length > maximumEvents) {
				const latestGood = new Map<string, string>();
				for (const item of this.events) {
					if (item.kind === 'command' && item.status === 'passed' && (item.check ?? checkKind(item.command))) {
						latestGood.set(`${item.folderUri ?? ''}\0${item.command}`, item.id);
					}
				}
				const protectedIds = new Set(latestGood.values());
				const index = this.events.findIndex(item => !protectedIds.has(item.id));
				removed.push(...this.events.splice(index < 0 ? 0 : index, 1));
			}
			await this.persist();
			for (const old of removed) {
				if (old.kind === 'save') {
					for (const name of [old.before, old.after]) {
						if (name) { await fs.rm(path.join(this.directory, 'snapshots', name), { force: true }); }
					}
				}
				if (old.kind === 'checkpoint') { await this.deleteCheckpoint(old.id); }
			}
		});
		await this.writeQueue;
	}

	async finishCommand(id: string, status: CommandEvent['status'], exitCode?: number, commandLine?: string): Promise<void> {
		this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
			const command = this.events.find((event): event is CommandEvent => event.kind === 'command' && event.id === id);
			if (!command) { return; }
			command.status = status;
			if (commandLine?.trim()) { command.command = redactCommand(commandLine); }
			command.check = checkKind(command.command);
			command.exitCode = exitCode;
			command.finishedAt = Date.now();
			await this.persist();
		});
		await this.writeQueue;
	}

	async removeIds(ids: ReadonlySet<string>): Promise<number> {
		let count = 0;
		this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
			const removed = this.events.filter(event => ids.has(event.id) || (event.kind === 'ready' && ids.has(event.commandId)));
			if (!removed.length) { return; }
			const removedIds = new Set(removed.map(event => event.id));
			this.events = this.events.filter(event => !removedIds.has(event.id));
			count = removed.length;
			await this.persist();
			for (const event of removed) {
				if (event.kind === 'checkpoint') { await this.deleteCheckpoint(event.id); }
				if (event.kind !== 'save') { continue; }
				for (const name of [event.before, event.after]) {
					if (name) { await fs.rm(path.join(this.directory, 'snapshots', name), { force: true }); }
				}
			}
		});
		await this.writeQueue;
		return count;
	}

	private async persist(): Promise<void> {
		const temporary = `${this.timelinePath}.tmp`;
		await fs.writeFile(temporary, JSON.stringify(this.events), 'utf8');
		await fs.rename(temporary, this.timelinePath);
	}

	private async deleteCheckpoint(id: string): Promise<void> {
		if (/^[A-Za-z0-9-]{1,100}$/.test(id)) { await fs.rm(path.join(this.directory, 'checkpoints', id), { recursive: true, force: true }); }
	}

	async snapshot(event: SaveEvent, side: 'before' | 'after'): Promise<string> {
		const name = event[side];
		if (!name || !this.events.some(item => item.id === event.id)) { throw new Error('Snapshot is unavailable'); }
		return fs.readFile(path.join(this.directory, 'snapshots', name), 'utf8');
	}

	async saveCheckpoint(id: string, files: ReadonlyMap<string, string>): Promise<void> {
		if (!/^[A-Za-z0-9-]{1,100}$/.test(id)) { throw new Error('Invalid checkpoint ID'); }
		const directory = path.join(this.directory, 'checkpoints', id);
		await fs.mkdir(directory, { recursive: true });
		await Promise.all([...files].map(async ([name, content]) => {
			const target = path.resolve(directory, name);
			if (!target.startsWith(directory + path.sep)) { throw new Error('Invalid checkpoint path'); }
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.writeFile(target, content, 'utf8');
		}));
	}

	async checkpointFile(id: string, name: string): Promise<string> {
		if (!/^[A-Za-z0-9-]{1,100}$/.test(id)) { throw new Error('Invalid checkpoint ID'); }
		const directory = path.join(this.directory, 'checkpoints', id);
		const target = path.resolve(directory, name);
		if (!target.startsWith(directory + path.sep)) { throw new Error('Invalid checkpoint path'); }
		return fs.readFile(target, 'utf8');
	}
}
