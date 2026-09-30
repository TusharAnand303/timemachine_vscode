import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('TimeMachine extension', () => {
	test('opens the timeline in a workspace and registers snapshot actions', async () => {
		assert.ok(vscode.workspace.workspaceFolders?.length);
		await vscode.commands.executeCommand('timemachine.openTimeline');
		const commands = await vscode.commands.getCommands(true);
		for (const command of ['timemachine.viewChange', 'timemachine.compare', 'timemachine.restore']) {
			assert.ok(commands.includes(command), `${command} was not registered`);
		}
	});
});
