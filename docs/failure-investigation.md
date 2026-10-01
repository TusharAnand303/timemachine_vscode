# Investigate a failed terminal command in VS Code

TimeMachine connects a failed command to saved files from the same project. It compares the failure with the most recent earlier passing run of the same command text. The result is a list of possible changes to inspect.

## A small, repeatable example

1. Open a project folder and create `check.js` with `process.exitCode = 0;`.
2. Save the file. In a new shell-integrated terminal inside the project, run `node check.js`.
3. Change the file to `process.exitCode = 1;`, save, and run `node check.js` again.
4. Open **Activity Graph**, select **Failures**, and select the failed `node check.js` event.
5. Inspect **Changes before failure**, then select the saved file and **Compare saved change**.

When there is no earlier passing run, TimeMachine suggests the most recent preceding saved file. If nothing suitable is retained in the timeline, the details panel says that no related save was found.

## Read the clues correctly

A solid line connects consecutive visible events. A dashed line connects a command to related saves or a recognized server-ready event. Related saves are timing clues. They do not prove a change caused the failure, replace test output, or account for dependencies, environment variables, or external changes.

## Compare and restore

Saved files with available before and after snapshots offer **Compare saved change** and **Restore before save**. Restore updates the editor buffer. Review the restored text and save it yourself. Files larger than 512 KiB may have an activity entry without snapshots.

Use **Copy command** to retrieve the command text, or export the project report for your own review. For a public issue, use a small reproduction instead of sharing private command lines or project paths.

[Get started](getting-started.md) · [Privacy and retention](privacy.md)
