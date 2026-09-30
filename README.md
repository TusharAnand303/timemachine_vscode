# TimeMachine

TimeMachine shows what happened between Git commits: project opens, text file saves, integrated terminal commands, command results, and common development server readiness messages. When a command fails, it highlights the files saved since the previous passing run of that same command.

TimeMachine keeps its history in VS Code's local workspace storage. It does not create Git commits or upload your source code.

Requires VS Code 1.93 or newer because command tracking uses the stable terminal shell integration API.

## What you can do

- Browse recent saves and commands in the **TimeMachine** Activity Bar view.
- Open a saved version or compare its before and after snapshots.
- Restore the version before a save into an unsaved editor buffer, then review and save it.
- Expand a failed command to see changes made since its last passing run. This is a time-based clue, not proof of the cause.
- Run **TimeMachine: Check Setup** if the timeline is empty or terminal commands do not appear.

## Try it

1. Open a project folder in VS Code and click the TimeMachine clock in the Activity Bar. You should see **Project opened**. The status bar also shows **TimeMachine** when the extension is active.
2. Save a text file in that project. A save appears with added and removed line counts. Right-click it for **Compare Change** and **Restore Before Change**.
3. Open a **new integrated terminal** in the same VS Code window and run a command. A completed command appears as passed, failed, or unknown. A long-running `npm run dev` command appears as running; common server-ready output adds a readiness event.

For a repeatable failure example, create `check.js` with `process.exitCode = 0;`, save it, and run `node check.js`. Change it to `process.exitCode = 1;`, save, and run `node check.js` again. Expand the failed run to see the intervening save.

## If commands do not appear

Run **TimeMachine: Check Setup** from the Command Palette. It opens the TimeMachine output channel and reports the open project, event count, and shell integration status for each terminal.

TimeMachine receives command events only from terminals with [VS Code shell integration](https://code.visualstudio.com/docs/terminal/shell-integration). It cannot see commands run in macOS Terminal, iTerm, or terminals in another VS Code window. If shell integration is off, enable `terminal.integrated.shellIntegration.enabled` in VS Code settings and open a new integrated terminal. On macOS, zsh and bash are supported. Some custom shell configurations prevent automatic integration.

## Limits and privacy

- TimeMachine keeps up to 500 events in local workspace storage. Text snapshots are stored only for files up to 512 KiB.
- Terminal output is inspected only to recognize a few server-ready messages; it is not stored. Command lines and exit codes are stored locally.
- Only saved text files are tracked. Unsaved edits and commands in external terminals are not captured.
- Restore changes the open editor buffer; it does not save automatically.

## Development

Use Node.js 22 or newer for the test and packaging tools.

```sh
npm install
npm run compile
npm test
npm run vsix
```

Use **Run → Start Debugging** or **Run → Run Without Debugging** with this repository open. The Extension Development Host starts with this repository as its project. To test TimeMachine in a different project, install the generated VSIX in your regular VS Code window using **Extensions → … → Install from VSIX**.

See [PUBLISHING.md](PUBLISHING.md) for Marketplace setup and release steps. For problems or feature requests, see [SUPPORT.md](SUPPORT.md).
