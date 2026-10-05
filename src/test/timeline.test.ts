import * as assert from 'node:assert/strict';
import { changesSinceLastPass, checkKind, CommandEvent, isServerReadyOutput, lastKnownGood, lineCounts, passToFail, SaveEvent, TimelineEvent, whatChanged } from '../timeline';
import { redactCommand, trackableFile } from '../privacy';
import { sessionSummaryMarkdown } from '../sessionSummary';

suite('TimeMachine timeline', () => {
	test('counts line additions and removals', () => {
		assert.deepEqual(lineCounts('a\nb\n', 'a\nc\nd\n'), { added: 2, removed: 1 });
		assert.deepEqual(lineCounts('', 'new'), { added: 1, removed: 0 });
	});

	test('recognizes Vite server startup output', () => {
		assert.equal(isServerReadyOutput('VITE v5.4.21  ready in 178 ms\nLocal: http://localhost:5174/'), true);
		assert.equal(isServerReadyOutput('Port 5173 is in use, trying another one...'), false);
	});

	test('links a failure to saves after the previous pass of the same command', () => {
		const command = (id: string, at: number, name: string, status: CommandEvent['status']): CommandEvent => ({ kind: 'command', id, at, command: name, terminal: 'test', status });
		const save = (id: string, at: number): SaveEvent => ({ kind: 'save', id, at, uri: `file:///${id}`, name: id, added: 1, removed: 0 });
		const events: TimelineEvent[] = [save('old', 10), command('pass', 20, 'npm test', 'passed'), save('auth.ts', 30), command('other', 35, 'npm run lint', 'passed'), save('service.ts', 40)];
		const failed = command('failure', 50, 'npm test', 'failed');
		assert.deepEqual(changesSinceLastPass(events, failed).map(item => item.name), ['service.ts', 'auth.ts']);
		assert.deepEqual(changesSinceLastPass([save('old', 10), save('new', 20)], failed).map(item => item.name), ['new']);
	});

	test('keeps failure suggestions inside the command project', () => {
		const projectA = 'file:///project-a';
		const projectB = 'file:///project-b';
		const events: TimelineEvent[] = [
			{ kind: 'command', id: 'pass-a', at: 10, folderUri: projectA, command: 'npm test', terminal: 'a', status: 'passed' },
			{ kind: 'save', id: 'save-b', at: 20, folderUri: projectB, uri: 'file:///project-b/other.ts', name: 'other.ts' },
			{ kind: 'save', id: 'save-a', at: 30, folderUri: projectA, uri: 'file:///project-a/auth.ts', name: 'auth.ts' },
		];
		const failure: CommandEvent = { kind: 'command', id: 'fail-a', at: 40, folderUri: projectA, command: 'npm test', terminal: 'a', status: 'failed' };
		assert.deepEqual(changesSinceLastPass(events, failure).map(item => item.name), ['auth.ts']);
	});

	test('detects a pass to fail transition only for a comparable test or build', () => {
		const pass: CommandEvent = { kind: 'command', id: 'pass', at: 10, finishedAt: 20, folderUri: 'project', command: 'npm test', terminal: 't', status: 'passed', exitCode: 0 };
		const fail: CommandEvent = { ...pass, id: 'fail', at: 40, finishedAt: 50, status: 'failed', exitCode: 1 };
		assert.equal(checkKind('pnpm test'), 'test');
		assert.equal(checkKind('pytest -q'), 'test');
		assert.equal(checkKind('phpunit'), 'test');
		assert.equal(checkKind('go test ./...'), 'test');
		assert.equal(checkKind('npm run build'), 'build');
		assert.equal(checkKind('npm install axios'), undefined);
		assert.equal(lastKnownGood([pass, fail], 'project')?.id, 'pass');
		assert.equal(passToFail([pass, fail], fail)?.id, 'pass');
		assert.equal(passToFail([pass, { ...fail, id: 'firstFail', at: 30, finishedAt: 35 }], fail), undefined);
		assert.equal(passToFail([pass], { ...fail, command: 'npm run build' }), undefined);
	});

	test('ranks recorded changes between last good and failure', () => {
		const pass: CommandEvent = { kind: 'command', id: 'pass', at: 10, finishedAt: 20, folderUri: 'project', command: 'npm test', terminal: 't', status: 'passed' };
		const fail: CommandEvent = { ...pass, id: 'fail', at: 70, finishedAt: 80, status: 'failed' };
		const events: TimelineEvent[] = [pass,
			{ kind: 'save', id: 'a', at: 25, folderUri: 'project', name: 'src/auth.ts', uri: 'file:///auth' },
			{ kind: 'save', id: 'b', at: 30, folderUri: 'project', name: 'src/auth.ts', uri: 'file:///auth' },
			{ kind: 'file', id: 'c', at: 35, folderUri: 'project', name: 'src/new.ts', change: 'created' },
			{ kind: 'save', id: 'd', at: 40, folderUri: 'project', name: 'package.json', uri: 'file:///package' },
			{ kind: 'command', id: 'install', at: 45, folderUri: 'project', command: 'npm install axios', terminal: 't', status: 'passed' },
			{ kind: 'branch', id: 'branch', at: 50, folderUri: 'project', from: 'main', to: 'feature' }, fail];
		const report = whatChanged(events, fail)!;
		assert.equal(report.files[0].name, 'package.json');
		assert.equal(report.files.find(file => file.name === 'src/auth.ts')?.saves, 2);
		assert.equal(report.commands[0].command, 'npm install axios');
		assert.equal(report.branchChanges[0].to, 'feature');
	});

	test('redacts credentials and excludes sensitive or generated files', () => {
		assert.equal(redactCommand('curl -H "Authorization: Bearer abc123" https://user:pass@db.example/test?token=xyz').includes('abc123'), false);
		assert.equal(redactCommand('DATABASE_URL=postgres://alice:password@localhost/db npm test').includes('password'), false);
		assert.equal(redactCommand('curl -u alice:password --header "X-API-Key: abc123" https://example.com').includes('password'), false);
		assert.equal(redactCommand('curl -u alice:password --header "X-API-Key: abc123" https://example.com').includes('abc123'), false);
		assert.equal(redactCommand('curl -d \'{"password":"secret"}\' https://example.com'), '[private command]');
		assert.equal(redactCommand('tool --password value').includes('value'), false);
		assert.equal(redactCommand('PGPASSWORD=small npm test').includes('small'), false);
		assert.equal(redactCommand('OPENAI_API_KEY=sk_example npm test').includes('sk_example'), false);
		assert.equal(redactCommand('echo shortsecret'), '[private command]');
		assert.equal(redactCommand('cat .env'), '[private command]');
		assert.equal(trackableFile('src/auth.ts'), true);
		assert.equal(trackableFile('node_modules/x.js'), false);
		assert.equal(trackableFile('src/.env.local'), false);
		assert.equal(trackableFile('certs/server.pem'), false);
	});

	test('summarizes the current recorded session and latest good run', () => {
		const events: TimelineEvent[] = [
			{ kind: 'opened', id: 'start', at: 1_000, folderUri: 'project', label: 'Opened project', reason: 'startup' },
			{ kind: 'save', id: 'save', at: 2_000, folderUri: 'project', name: 'src/auth.ts', uri: 'file:///auth' },
			{ kind: 'command', id: 'pass', at: 3_000, finishedAt: 4_000, folderUri: 'project', command: 'npm test', terminal: 't', status: 'passed', check: 'test' },
			{ kind: 'checkpoint', id: 'cp', at: 5_000, folderUri: 'project', name: 'Before refactor', files: ['src/auth.ts'] },
		];
		const text = sessionSummaryMarkdown(events, 'project', 'Project', 'main', 61_000);
		assert.match(text, /Duration so far: 0h 1m/);
		assert.match(text, /Files touched: 1/);
		assert.match(text, /Tests\/builds run: 1 \(1 passed, 0 failed\)/);
		assert.match(text, /Before refactor/);
		assert.match(text, /Current branch: main/);
	});
});
