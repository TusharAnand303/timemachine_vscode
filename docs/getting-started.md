# Track coding time and project history in VS Code

TimeMachine records a local timeline of project openings, saved text files, and integrated terminal commands. You choose whether your focus time is **My coding** or **AI-assisted**.

## Install and open your project

Search for `itstushar.timemachine` in VS Code Extensions, or install the latest VSIX from this repository using **Extensions → … → Install from VSIX**. Reload when prompted. Open a project folder in the same VS Code window and select the TimeMachine clock in the Activity Bar.

## Record coding time

1. In **Coding Time**, check the project folder name and full path. Select a project if the workspace has multiple folders.
2. Select **My coding** for your own coding session or **AI-assisted** while working with AI assistance.
3. Switch between **Today**, **7 days**, and **All time** to review totals. Expand **Daily breakdown** for the past seven calendar days, including today.
4. Press **Pause** to end recording. Losing window focus pauses counting automatically; returning to the window resumes the selected mode. After reloading VS Code, select a mode again to start recording.

The modes label time you choose to track. They do not detect the author of individual edits, measure typing activity, or infer AI usage from another extension.

## Save a file and run a command

Save a text file to record a change. Open a **new integrated terminal** with its working directory inside the project and run `npm test`, your development server, or another command. Command tracking requires [VS Code terminal shell integration](https://code.visualstudio.com/docs/terminal/shell-integration).

Click the graph icon above **Project Timeline** to open **Activity Graph**. Select an event for its folder, time, command result, saved change, or opening source. The main label of a project opening includes its folder name. Reopening a window or restarting the extension can add an opening record.

## Search or copy an earlier command

Open **Command history** in the graph, or run **TimeMachine: Search Command History**. Search by command text, terminal, folder, or result. **Copy command** puts the command text on the clipboard for you to review and use.

## Export a project report

Use **Export project report** in the sidebar, **Export report** in the graph, or **TimeMachine: Export Project Activity Report** in the Command Palette. Pick a location and select JSON or CSV in the save dialog.

The report contains the project's retained activity, recorded daily totals, command text, and paths. JSON preserves event details; CSV presents daily time and event rows for a spreadsheet. Saved source contents and snapshot files are excluded. Export covers the selected project's retained history, independently of the current graph filters.

Continue with [failure investigation](failure-investigation.md), [terminal troubleshooting](troubleshooting.md), or [privacy and limits](privacy.md).
