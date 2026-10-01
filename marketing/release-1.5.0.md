# TimeMachine 1.5.0: coding time and project reports in VS Code

TimeMachine keeps your project activity in view: the time you label as My coding or AI-assisted, commands run in integrated terminals, saved file changes, and possible changes to inspect after a failure.

## New in this release

- **Time ranges in the sidebar:** switch between Today, 7 days, and All time, with a daily breakdown for the last seven calendar days.
- **JSON and CSV reports:** export retained project activity and daily focus totals locally, without saved source contents or snapshot files.
- **Copy command:** retrieve command text from command history or an event's details.
- **Clear project identity:** see the opened folder's name in every opening label, including older records, and its full path in the sidebar and graph.
- **Reliable daily totals:** live sessions that cross midnight split into the correct days.

## Install

Search for `itstushar.timemachine` in VS Code Extensions or choose **Extensions → … → Install from VSIX** and select the attached `timemachine-1.5.0.vsix`. Reload VS Code, open a project, and expand Coding Time in the TimeMachine Activity Bar container.

Choose My coding or AI-assisted, save a text file, and run a command in a new integrated terminal inside the project. Open Activity Graph to inspect the result or Command history to find earlier runs.

This is a preview release. Modes are selected by you and do not detect authorship of edits. Commands require VS Code shell integration. Activity stays in VS Code extension storage; report files are saved wherever you choose.

[Getting started](https://github.com/TusharAnand303/timemachine_vscode/blob/main/docs/getting-started.md) · [Privacy and limits](https://github.com/TusharAnand303/timemachine_vscode/blob/main/docs/privacy.md) · [Report an issue](https://github.com/TusharAnand303/timemachine_vscode/issues/new/choose)
