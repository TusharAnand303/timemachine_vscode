# TimeMachine for VS Code

TimeMachine records what happens **between Git commits**. It builds a local timeline of file saves, terminal commands, exit codes, and detected development-server readiness so you can inspect a change before a failed command.

## Use it

1. Open a project in VS Code and select the TimeMachine clock in the Activity Bar (or run **TimeMachine: Open Timeline**).
2. Edit and save a text file. TimeMachine records the change and its added/removed line counts.
3. Run commands in VS Code's integrated terminal. When shell integration reports an exit code, the timeline marks the command as passed or failed.
4. Expand a failed command to see saves since the previous passing run of the same command. Select a suggested save to compare it.
5. On a save, use **View Saved Version**, **Compare Change**, or **Restore Before Change**. Restore changes the editor buffer; review it and save to keep it.

The suggestion is a time-based clue, not proof that a save caused the failure.

## How history is stored

TimeMachine stores its timeline and text snapshots in VS Code's local workspace storage. It does not create commits, change Git history, upload source, or capture terminal output. At most 500 events are kept. Files larger than 512 KiB are recorded without snapshots or line counts.

Terminal events depend on VS Code shell integration. A command with no reported exit code is shown as **unknown**. Server readiness is detected from a few common readiness messages for dev/start commands; other servers may only show the running command. Unsaved edits are not recorded until saved.

## Development

```sh
npm install
npm run compile
npm run test:unit
```

Press **F5** in VS Code with this repository open to launch an Extension Development Host.
