# TimeMachine terminal history and timer troubleshooting

## Commands do not appear

Run **TimeMachine: Check Setup**. The TimeMachine output channel shows open projects, event counts, and shell integration for each terminal.

- Open a new integrated terminal after installing or activating the extension.
- Keep the terminal's working directory inside an open workspace folder.
- Enable `terminal.integrated.shellIntegration.enabled` if disabled.
- Check [VS Code shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) if a custom shell setup blocks integration.

Commands in external terminals, other VS Code windows, or before activation cannot be recovered. When the shell does not report its working directory and exactly one project is open, the folder is marked as assumed.

## The folder name or new buttons are missing

Confirm that **TimeMachine - Coding Time & Command History** is version **1.5.0** or newer in Extensions. Install the latest VSIX and reload VS Code. In the TimeMachine Activity Bar container, expand **Coding Time**. If the view was moved or hidden, use VS Code's Views menu to restore it.

Opening records use the current workspace folder name in the main tree label, including records created by older versions. Hover an entry for its full path or select it to open the graph details.

## The coding timer is paused

Select **My coding** or **AI-assisted** to start. Time counts while the VS Code window is focused, including time spent reading or thinking. Switching modes preserves both totals. Reloading the window starts with the timer paused. Long gaps from computer sleep or a stalled extension host are capped rather than counted as continuous work.

## A snapshot or older event is missing

The local timeline retains up to 500 events across the workspace. Older events and their snapshots are removed as new events arrive. Focus-time totals have separate storage and survive event pruning. Snapshots are limited to saved text files up to 512 KiB. Opening a project does not import its Git history or record earlier versions.

## Report export

Choose JSON or CSV in the save dialog. Reports include retained activity and all recorded daily totals for the selected project, even if the graph currently has filters. They include command text and paths, but exclude source snapshot contents. A report is an export; it cannot be imported as a timeline backup.

[Report a bug](https://github.com/TusharAnand303/timemachine_vscode/issues/new/choose) · [Privacy and limits](privacy.md)
