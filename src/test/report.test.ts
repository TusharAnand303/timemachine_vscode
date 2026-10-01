import * as assert from 'node:assert/strict';
import { createProjectReport, reportCsv } from '../report';
import { TimelineEvent } from '../timeline';

suite('TimeMachine reports', () => {
	test('exports ordered activity and daily time without saved source or snapshot references', () => {
		const events: TimelineEvent[] = [
			{ kind: 'save', id: 'save', at: 2000, uri: 'file:///app/main.ts', name: 'main.ts', added: 2, removed: 1, before: 'private-before.txt', after: 'private-after.txt' },
			{ kind: 'command', id: 'command', at: 1000, command: 'npm test', terminal: 'zsh', status: 'failed', exitCode: 1, finishedAt: 1500 },
		];
		const report = createProjectReport({ name: 'app', path: '/app' }, events, [{ date: '2026-10-01', codingMs: 10000, aiMs: 2000 }], 3000);
		assert.equal(report.events[0].id, 'command');
		assert.equal(report.summary.failures, 1);
		assert.equal(report.focusTime.days[0].codingMs, 10000);
		assert.ok(!JSON.stringify(report).includes('private-before'));
		assert.ok(!JSON.stringify(report).includes('private-after'));
		assert.equal(report.generatedAt, new Date(3000).toISOString());
		assert.equal(events[0].at, 2000, 'Export must not reorder or alter recorded events');
	});

	test('quotes CSV command text and prevents spreadsheet formula execution', () => {
		const report = createProjectReport({ name: 'app', path: '/app' }, [
			{ kind: 'command', id: 'command', at: 1000, command: '=HYPERLINK("https://example.com","run")\nnext line', terminal: 'test', status: 'failed', exitCode: -1 },
		], [{ date: '2026-10-01', codingMs: 10000, aiMs: 2500 }]);
		const csv = reportCsv(report);
		assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"",""run"")\nnext line"'));
		assert.ok(csv.includes('"10","2.5","",""'));
		assert.ok(csv.includes('"-1"'));
	});
});
