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

	test('removes commands with readiness events and deletes only selected snapshots', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'timemachine-delete-'));
		try {
			const store = new TimelineStore({ fsPath: directory } as vscode.Uri);
			await store.load();
			const save: SaveEvent = { kind: 'save', id: 'save-a', at: 1, folderUri: 'project-a', uri: 'file:///project-a/file.ts', name: 'file.ts' };
			await store.add(save, { before: 'old', after: 'new' });
			await store.add({ kind: 'command', id: 'command-a', at: 2, folderUri: 'project-a', command: 'npm test', terminal: 'a', status: 'passed' });
			await store.add({ kind: 'ready', id: 'ready-a', at: 3, folderUri: 'project-a', commandId: 'command-a', terminal: 'a' });
			await store.add({ kind: 'command', id: 'command-b', at: 4, folderUri: 'project-b', command: 'npm run build', terminal: 'b', status: 'passed' });
			assert.equal(await store.removeIds(new Set(['command-a'])), 2);
			assert.deepEqual(store.all.map(event => event.id), ['save-a', 'command-b']);
			assert.equal(await store.snapshot(save, 'before'), 'old');
			assert.equal(await store.removeIds(new Set(['save-a'])), 1);
			await assert.rejects(store.snapshot(save, 'before'));
			assert.deepEqual(store.all.map(event => event.id), ['command-b']);
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});
});
