# Publish TimeMachine to the VS Code Marketplace

The extension ID is `tusharanand303.timemachine`. The `publisher` field in `package.json` must match the Marketplace publisher ID exactly. The current release version is `1.1.0`.

1. Sign in with a Microsoft account at the [Marketplace publisher management page](https://marketplace.visualstudio.com/manage/publishers/). Create a publisher with ID `tusharanand303` if it is available. If it is taken, choose another ID and update `publisher` in `package.json` before packaging.
2. Install Node.js 22 or newer. From this repository, run `npm install`, `npm test`, and `npm run vsix`. The last command creates `timemachine-1.1.0.vsix` in the repository root.
3. Test the VSIX in normal VS Code: open Extensions, select the `…` menu, choose **Install from VSIX**, and select the generated file. Reload VS Code, open a project, and follow the example in `README.md`.
4. In the [publisher management page](https://marketplace.visualstudio.com/manage/publishers/), use **Add extension → Visual Studio Code** to upload the VSIX. Confirm the listing, icon, description, and version before submitting.

You can also publish with `vsce publish`, but that requires Azure DevOps Marketplace credentials. Manual VSIX upload is simpler for the first release. Never commit a personal access token or paste one into an issue or chat.

For later releases, update `version` in `package.json` to a higher SemVer number, update `CHANGELOG.md`, run the tests and `npm run vsix`, then upload the new VSIX. A version already published cannot be reused for another upload.
