import * as assert from 'node:assert/strict';
import { changesSinceLastPass, CommandEvent, lineCounts, SaveEvent, TimelineEvent } from '../timeline';

suite('TimeMachine timeline', () => {
	test('counts line additions and removals', () => {
		assert.deepEqual(lineCounts('a\nb\n', 'a\nc\nd\n'), { added: 2, removed: 1 });
		assert.deepEqual(lineCounts('', 'new'), { added: 1, removed: 0 });
	});

	test('links a failure to saves after the previous pass of the same command', () => {
		const command = (id: string, at: number, name: string, status: CommandEvent['status']): CommandEvent => ({ kind: 'command', id, at, command: name, terminal: 'test', status });
		const save = (id: string, at: number): SaveEvent => ({ kind: 'save', id, at, uri: `file:///${id}`, name: id, added: 1, removed: 0 });
		const events: TimelineEvent[] = [save('old', 10), command('pass', 20, 'npm test', 'passed'), save('auth.ts', 30), command('other', 35, 'npm run lint', 'passed'), save('service.ts', 40)];
		const failed = command('failure', 50, 'npm test', 'failed');
		assert.deepEqual(changesSinceLastPass(events, failed).map(item => item.name), ['service.ts', 'auth.ts']);
		assert.deepEqual(changesSinceLastPass([save('old', 10), save('new', 20)], failed).map(item => item.name), ['new']);
	});
});
