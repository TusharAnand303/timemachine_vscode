# Change Log

## 1.5.0

- Add Today, 7 days, and All time summaries plus a daily focus-time breakdown in the sidebar.
- Export project activity and daily coding totals to JSON or CSV, without exporting snapshot contents.
- Copy recorded commands from history or event details.
- Split live time correctly across midnight and keep timer changes synchronized across views.
- Improve Marketplace discovery with a descriptive title, focused keywords, product screenshots, and setup documentation.

## 1.4.1

- Add a Coding Time panel directly in the TimeMachine sidebar with My coding, AI-assisted, and Pause buttons, a project selector, and daily totals.
- Keep sidebar and graph timers synchronized, including focus changes and switching modes.
- Show the project folder name in every opening label, including older records, with a full path in the tooltip and details.
- Improve the responsive activity view, folder actions, opening context, and keyboard navigation.

## 1.4.0

- Add a dedicated searchable command history with status, exit code, terminal, folder, and duration for each run.
- Add confirmed deletion for individual events, project command history, and all history for one project, including saved snapshots and focus-time totals.
- Add explicit Coding and AI-assisted focus timers with per-project daily and all-time totals. Timers pause when VS Code loses focus; the extension does not infer AI authorship from edits.
- Collect VSIX packages in `releases/` and output new packages there.

## 1.3.0

- Add an Activity Graph with connected lanes for saved files, commands, and project events, plus visual links from failed commands to potentially related saves and from server readiness to its command.
- Show project and folder names on graph nodes and in an event details panel, alongside command status, exit code, duration, and file change counts.
- Add project and folder selectors, search, time range and event filters, failure focus, and actions to open, compare, or restore saved files.
- Keep the graph updated as new events arrive and add a shortcut from the Project Timeline to a selected graph event.

## 1.2.0

- Group the timeline by open project folder and day, with clearer command status and file change details.
- Browse all project directories in a separate, expandable Project Folders view.
- Associate terminal commands with the project containing their working directory and keep failure suggestions within that project.
- Show the open project name in the timeline header and status bar, and add a refresh action.

## 1.1.0

- Open the project automatically in the Extension Development Host.
- Show an active status bar item and a setup command that reports terminal shell integration.
- Record commands from any integrated terminal in the current VS Code window.
- Add Marketplace metadata, a PNG icon, and a packaged VSIX workflow.

## 0.0.1

- Record project opens, file saves, terminal commands, exit codes, and common server-ready messages.
- Compare saved text snapshots and restore a file's version before a save.
- Suggest saves made between a passing and a failing run of the same command.
