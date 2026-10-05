# Publish TimeMachine 1.6.0

The extension ID remains `itstushar.timemachine`. The display name is **TimeMachine — Your project's flight recorder**. This repository prepares the VSIX and listing assets; packaging does not publish them.

## Prepare the release

1. Use Node.js 22 or newer. Run `npm install`, `npm test`, and `node scripts/check-release.mjs`.
2. Run `npm run vsix` to create `releases/timemachine-1.6.0.vsix`.
3. Install the VSIX in normal VS Code through **Extensions → … → Install from VSIX**. Check the pass-to-fail workflow, What Changed?, checkpoints, session summary, sidebar timers, saved-change comparison, and JSON/CSV export.
4. Commit and push source, documentation, and `media/screenshots/` to the default branch before Marketplace upload. The packaged README rewrites relative image and documentation URLs to the GitHub repository.

## Update the Marketplace listing

Sign in to [Marketplace publisher management](https://marketplace.visualstudio.com/manage/publishers/) with the account managing publisher `itstushar`. Update the existing TimeMachine item with the new VSIX; if the item has never been published, add a Visual Studio Code extension under that publisher. Confirm the rendered title, description, screenshots, preview status, and version before submitting.

The VSIX contains the listing metadata from `package.json` and the product README. After upload, check the public page for `itstushar.timemachine` and verify it displays version 1.6.0 before announcing the release. [Official publishing guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## Prepare GitHub discovery

Use `marketing/github-metadata.json` for About text, topics, and the Marketplace homepage link. Upload `marketing/github-social-preview.png` in repository **Settings → Social preview**. Draft 1.6.0 release notes from [CHANGELOG.md](CHANGELOG.md) and attach the generated VSIX to the matching source revision. The complete sequence and measurement plan are in [the launch kit](marketing/launch-plan.md).

For later releases, bump the package and lockfile versions, update the changelog, VSIX output name, documentation, and release draft, then recheck and package. Marketplace versions cannot be reused for a different uploaded build.
