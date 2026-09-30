import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { TimelineStore } from '../storage';
import { CommandEvent, SaveEvent } from '../timeline';

suite('TimeMachine storage', () => {
	test('persists snapshots and command results across reloads', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'timemachine-store-'));
		try {
			const uri = { fsPath: directory } as vscode.Uri;
			const store = new TimelineStore(uri);
			await store.load();
			const save: SaveEvent = { kind: 'save', id: 'save-1', at: 1, uri: 'file:///project/auth.ts', name: 'auth.ts', added: 1, removed: 1 };
			const command: CommandEvent = { kind: 'command', id: 'command-1', at: 2, command: 'npm test', terminal: 'test', status: 'running' };
			await store.add(save, { before: 'before\n', after: 'after\n' });
			await store.add(command);
			await store.finishCommand(command.id, 'failed', 1);
			const reloaded = new TimelineStore(uri);
			await reloaded.load();
			assert.equal(await reloaded.snapshot(save, 'before'), 'before\n');
			assert.equal(await reloaded.snapshot(save, 'after'), 'after\n');
			assert.equal((reloaded.all[1] as CommandEvent).status, 'failed');
			assert.equal((reloaded.all[1] as CommandEvent).exitCode, 1);
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});
});
