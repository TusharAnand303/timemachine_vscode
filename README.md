# TimeMachine: coding time and command history for VS Code

Track your coding time, revisit terminal commands, and inspect saved file changes in one local project timeline.

[Install from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=itstushar.timemachine) · [Getting started](docs/getting-started.md) · [Report a bug](https://github.com/TusharAnand303/timemachine_vscode/issues/new/choose)

**Free to use · VS Code 1.93+ · No account required · Preview release**

TimeMachine helps you answer practical questions: What did I work on? Which command failed? What changed since it last passed? How much time did I label as my own coding or AI-assisted work?

![TimeMachine activity graph with a failed command, related saves, full project folder path, and event details](media/screenshots/activity-graph.png)

*Product screenshots use illustrative data from an example project.*

## Coding time, directly in the sidebar

Choose **My coding** or **AI-assisted** in the **Coding Time** panel. Switch modes as you work, pause when finished, and review **Today**, **7 days**, or **All time**. Expand the daily breakdown to see both modes for each of the past seven calendar days.

The timer counts while the VS Code window is focused. It pauses while unfocused and starts paused after reloading VS Code. Modes are labels you select; TimeMachine does not detect AI authorship of individual edits.

![Coding Time sidebar showing the project folder, time ranges, My coding and AI-assisted buttons, daily breakdown, and report export](media/screenshots/coding-time.png)

## Searchable terminal command history

Find an earlier command by its text, folder, terminal, or result. See running, passed, failed, and unknown results, with exit codes and duration where available. **Copy command** retrieves the command text. **View in graph** brings its surrounding project activity into view.

![Searchable command history with command results, folders, timing, and copy actions](media/screenshots/command-history.png)

Commands must run in a shell-integrated terminal inside an open project. Start a new integrated terminal after installation. External terminals and commands run before activation are not captured.

## Inspect the changes before a failure

Select a failed command to see files saved since the previous passing run of that command in the same project. Compare available before/after snapshots or restore an earlier version into the editor for review. Without an earlier passing run, TimeMachine suggests the latest preceding save.

Dashed links are timing clues, rather than proof of the cause. [Try the repeatable failure example](docs/failure-investigation.md).

## Project context and local activity reports

The sidebar and graph show the opened folder's name and full path. Browse nested project folders, filter activity by folder or time range, and use the arrow keys to browse events. Older opening records also show the current project folder name; newer records explain whether the folder was added or the extension started with it open.

Export the selected project's retained activity and daily coding totals as **JSON** or **CSV**, directly from the sidebar, graph, or Command Palette. Reports contain command text and paths; saved source contents and snapshot files are excluded. Report export is independent of the graph's current filters.

## Get started in three steps

1. Install **TimeMachine - Coding Time & Command History**, open a project folder, and select the TimeMachine clock in the Activity Bar.
2. In **Coding Time**, select **My coding** or **AI-assisted**. Save a text file and run a command in a new integrated terminal inside the project.
3. Select the graph icon above **Project Timeline** to inspect activity. Use **Command history** to find past runs or **Export report** to save your project report.

To install the local release, open **Extensions → … → Install from VSIX**, choose `releases/timemachine-1.5.0.vsix`, and reload VS Code. [Detailed setup](docs/getting-started.md).

## Useful commands

| Command Palette action | Use it to |
| --- | --- |
| TimeMachine: Open Activity Graph | Inspect project events and saved changes |
| TimeMachine: Search Command History | Find and copy a recorded command |
| TimeMachine: Start Coding Timer | Start a My coding session |
| TimeMachine: Start AI-Assisted Timer | Start an AI-assisted session |
| TimeMachine: Pause Coding Timer | Stop recording focus time |
| TimeMachine: Export Project Activity Report | Save a JSON or CSV report |
| TimeMachine: Check Setup | Diagnose project and shell integration setup |

## Privacy and practical limits

TimeMachine stores its records in VS Code's extension storage. It does not upload your activity, add analytics, require an account, or create Git commits. Remote-workspace storage follows the extension host. [Read the data and privacy details](docs/privacy.md).

- Up to **500 events** are retained across the workspace, with text snapshots for saved files up to **512 KiB**.
- Focus-time totals are stored separately and survive timeline event pruning.
- Restore updates the editor buffer; review and save it yourself.
- Timers count focused window time, including reading or thinking, rather than keyboard activity.
- Reports are local exports; importing reports as a timeline backup is not supported.

## Frequently asked questions

**Does TimeMachine automatically track AI coding?**

You select My coding or AI-assisted. It tracks the time spent in the mode you choose while VS Code is focused; it does not analyze edits or connect to an AI provider.

**Why are my commands missing?**

Use a new integrated terminal inside an open project. Run **TimeMachine: Check Setup** and check [terminal shell integration troubleshooting](docs/troubleshooting.md).

**Does this replace Git?**

TimeMachine records local activity and available saved-file snapshots. It does not create commits, import Git history, or provide a backup service.

**Can I clear my recorded history?**

The graph offers confirmed deletion for an event, a project's commands, or all activity and time totals for that project. Project source files are not deleted.

**Is it open source?**

The repository is public, and the unmodified extension is free to use. Modification and redistribution require permission under the [source license](LICENSE).

## Support and development

[Report a bug or request a feature](https://github.com/TusharAnand303/timemachine_vscode/issues/new/choose) · [Troubleshooting](docs/troubleshooting.md) · [Development guide](docs/development.md) · [Changelog](CHANGELOG.md) · [Publishing](PUBLISHING.md)
