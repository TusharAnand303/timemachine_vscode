import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { ActivityTracker } from '../activityTracker';

suite('TimeMachine focus time', () => {
	test('splits live time at midnight and limits the weekly summary to seven calendar days', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'timemachine-midnight-'));
		let now = new Date(2026, 9, 1, 23, 59, 58).getTime();
		const tracker = new ActivityTracker({ fsPath: directory } as vscode.Uri, () => now);
		try {
			await tracker.start('project', 'coding'); now += 4000;
			assert.deepEqual(tracker.summary('project').today, { codingMs: 2000, aiMs: 0 });
			assert.deepEqual(tracker.summary('project').all, { codingMs: 4000, aiMs: 0 });
			await tracker.pause();
			now = new Date(2026, 9, 8, 12).getTime();
			assert.equal(tracker.summary('project').week.codingMs, 2000);
			assert.equal(tracker.summary('project').days.length, 7);
			const history = tracker.history('project'); history[0].codingMs = 9999;
			assert.equal(tracker.history('project')[0].codingMs, 2000);
		} finally { tracker.dispose(); await fs.rm(directory, { recursive: true, force: true }); }
	});
	test('keeps coding and AI-assisted time separate by project and pauses while unfocused', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'timemachine-focus-'));
		try {
			let now = Date.now();
			const uri = { fsPath: directory } as vscode.Uri;
			const tracker = new ActivityTracker(uri, () => now);
			await tracker.load();
			await tracker.start('project-a', 'coding');
			now += 5_000;
			await tracker.setFocused(false);
			now += 7_000;
			await tracker.setFocused(true);
			now += 3_000;
			await tracker.start('project-a', 'ai');
			now += 2_000;
			await tracker.pause();
			assert.deepEqual(tracker.summary('project-a').all, { codingMs: 8_000, aiMs: 2_000 });
			await tracker.start('project-b', 'coding');
			now += 4_000;
			await tracker.pause();
			const reloaded = new ActivityTracker(uri, () => now);
			await reloaded.load();
			assert.deepEqual(reloaded.summary('project-a').all, { codingMs: 8_000, aiMs: 2_000 });
			assert.deepEqual(reloaded.summary('project-b').all, { codingMs: 4_000, aiMs: 0 });
			await reloaded.clearProject('project-a');
			assert.deepEqual(reloaded.summary('project-a').all, { codingMs: 0, aiMs: 0 });
			assert.deepEqual(reloaded.summary('project-b').all, { codingMs: 4_000, aiMs: 0 });
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});
});
