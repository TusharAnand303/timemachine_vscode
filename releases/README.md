# TimeMachine VSIX releases

Run `npm run vsix` from the repository root to build the current package: **timemachine-1.6.0.vsix**.

In VS Code, open **Extensions → … → Install from VSIX**, choose the package, and reload. The 1.6.0 release adds Last Known Good checks, pass-to-fail detection, a What Changed? report, local checkpoints, and session summaries while retaining the existing activity and coding-time tools.

See [publishing instructions](../PUBLISHING.md) for Marketplace upload and [the launch kit](../marketing/launch-plan.md) for GitHub assets. VSIX files are generated artifacts and are ignored by Git; attach the package to a GitHub release when publishing it.
