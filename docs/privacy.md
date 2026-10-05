# TimeMachine privacy, data storage, and limits

TimeMachine runs inside the VS Code extension host. It does not add analytics, transmit your activity to a service, require an account, or create Git commits. The extension stores its records in VS Code workspace storage, falling back to its extension global storage when workspace storage is unavailable. Storage location follows the extension host; remote workspaces can store data on their host.

| Data | What is retained |
| --- | --- |
| Project openings | Folder identity, time, and opening source for newer records |
| Saved text files | File URI, relative name, line changes, and available before/after snapshots |
| Terminal commands | Redacted command text, working directory, terminal name, result, exit code, and timing |
| Terminal output | Inspected for a few server-ready patterns; output text is not stored |
| File operations and Git context | VS Code file creation/deletion/rename events and locally detected branch changes; no Git history is copied |
| Checkpoints | Selected saved source files in local extension storage, bounded by file count and size |
| Coding time | Per-project daily totals for the mode you select |
| Folder browsing | Directories read on demand; file contents are not retained by the browser |

The timeline keeps up to 500 events. Text snapshots are limited to files up to 512 KiB. Files in build, vendor, generated, Git, and dependency directories are ignored, as are `.env`, private key, certificate, and common credential files. Checkpoints capture at most 200 eligible saved files, at most 64 KiB each and 2 MiB total. They do not copy unsaved editor changes.

TimeMachine redacts common password, token, API key, Bearer, Authorization, and credential-bearing URL patterns before recording a command. Commands that reference credential files or contain structured secret fields are replaced with a private marker. Redaction cannot recognize every possible custom secret format, so review local exports before sharing them. Unsaved edits, external terminals, and commands before activation are not recorded. Focus timers measure labeled time while the window is focused, rather than keystrokes or detected AI authorship. After restart, timers stay paused until you select a mode.

Use the graph's deletion controls to remove an event, project command history, or a project's entire activity and time totals. Deleting a save removes its local snapshots, and deleting a checkpoint removes its local copies. Project source files are not deleted. CSV and JSON report files you export are separate files and remain until you remove them yourself.

Reports contain command text and paths. Snapshot contents are excluded. Review exported reports and setup logs before choosing to share them. The privacy statements here describe the TimeMachine extension; VS Code and other installed extensions have their own policies.

[Getting started](getting-started.md) · [Support](../SUPPORT.md) · [License](../LICENSE)
