import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

export type FocusMode = 'coding' | 'ai';
type DayTotals = { codingMs: number; aiMs: number };
type TotalsByProject = Record<string, Record<string, DayTotals>>;
export type FocusDay = DayTotals & { date: string };
export type FocusSummary = {
	today: DayTotals; week: DayTotals; all: DayTotals; days: FocusDay[];
	mode: FocusMode | null; focused: boolean; activeProjectId: string | null;
};

function dayKey(at: number): string {
	const date = new Date(at);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export class ActivityTracker implements vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<void>();
	readonly onDidChange = this.changed.event;
	private totals: TotalsByProject = {};
	private active: { projectId: string; mode: FocusMode; lastAt: number } | undefined;
	private focused = true;
	private writeQueue: Promise<void> = Promise.resolve();
	private readonly filePath: string;

	constructor(storageUri: vscode.Uri, private readonly now: () => number = Date.now) {
		this.filePath = path.join(storageUri.fsPath, 'activity.json');
	}

	async load(): Promise<void> {
		try {
			const parsed: unknown = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) { this.totals = parsed as TotalsByProject; }
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
		}
	}

	private addInterval(projectId: string, mode: FocusMode, start: number, end: number): void {
		// Ignore long gaps caused by sleep or a paused extension host.
		let cursor = Math.max(start, end - 45_000);
		while (cursor < end) {
			const nextDay = new Date(cursor);
			nextDay.setHours(24, 0, 0, 0);
			const until = Math.min(end, nextDay.getTime());
			const days = this.totals[projectId] ??= {};
			const totals = days[dayKey(cursor)] ??= { codingMs: 0, aiMs: 0 };
			totals[mode === 'coding' ? 'codingMs' : 'aiMs'] += until - cursor;
			cursor = until;
		}
	}

	private async persist(): Promise<void> {
		const content = JSON.stringify(this.totals);
		this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
			await fs.mkdir(path.dirname(this.filePath), { recursive: true });
			const temporary = `${this.filePath}.tmp`;
			await fs.writeFile(temporary, content, 'utf8');
			await fs.rename(temporary, this.filePath);
		});
		await this.writeQueue;
	}

	async tick(): Promise<void> {
		if (!this.active) { return; }
		const end = this.now();
		const active = this.active;
		const start = active.lastAt;
		active.lastAt = end;
		if (this.focused && end > start) {
			this.addInterval(active.projectId, active.mode, start, end);
			await this.persist();
			this.changed.fire();
		}
	}

	async start(projectId: string, mode: FocusMode): Promise<void> {
		await this.tick();
		this.active = { projectId, mode, lastAt: this.now() };
		this.changed.fire();
	}

	async pause(): Promise<void> {
		await this.tick();
		this.active = undefined;
		this.changed.fire();
	}

	async setFocused(focused: boolean): Promise<void> {
		await this.tick();
		this.focused = focused;
		if (this.active) { this.active.lastAt = this.now(); }
		this.changed.fire();
	}

	history(projectId: string): FocusDay[] {
		const days = Object.fromEntries(Object.entries(this.totals[projectId] ?? {}).map(([date, totals]) => [date, { ...totals }]));
		if (this.active?.projectId === projectId && this.focused) {
			const end = this.now();
			let cursor = Math.max(this.active.lastAt, end - 45_000);
			const key = this.active.mode === 'coding' ? 'codingMs' : 'aiMs';
			while (cursor < end) {
				const nextDay = new Date(cursor); nextDay.setHours(24, 0, 0, 0);
				const until = Math.min(end, nextDay.getTime());
				const totals = days[dayKey(cursor)] ??= { codingMs: 0, aiMs: 0 };
				totals[key] += until - cursor; cursor = until;
			}
		}
		return Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).map(([date, totals]) => ({ date, ...totals }));
	}

	summary(projectId: string): FocusSummary {
		const history = this.history(projectId);
		const totals = new Map(history.map(day => [day.date, { codingMs: day.codingMs, aiMs: day.aiMs }]));
		const date = new Date(this.now()); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - 6);
		const days: FocusDay[] = [];
		for (let i = 0; i < 7; i++) {
			const key = dayKey(date.getTime());
			days.push({ date: key, ...(totals.get(key) ?? { codingMs: 0, aiMs: 0 }) }); date.setDate(date.getDate() + 1);
		}
		const sum = (items: DayTotals[]): DayTotals => items.reduce((total, day) => ({ codingMs: total.codingMs + day.codingMs, aiMs: total.aiMs + day.aiMs }), { codingMs: 0, aiMs: 0 });
		return { today: totals.get(dayKey(this.now())) ?? { codingMs: 0, aiMs: 0 }, week: sum(days), all: sum(history), days, mode: this.active?.projectId === projectId ? this.active.mode : null, focused: this.focused, activeProjectId: this.active?.projectId ?? null };
	}

	async clearProject(projectId: string): Promise<void> {
		await this.tick();
		if (this.active?.projectId === projectId) { this.active = undefined; }
		delete this.totals[projectId];
		await this.persist();
		this.changed.fire();
	}

	get activeProjectId(): string | undefined { return this.active?.projectId; }
	dispose(): void { this.changed.dispose(); }
}
