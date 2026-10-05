# Develop and validate TimeMachine

Use Node.js 22 or newer for the test and packaging tools.

```sh
npm install
npm run compile
npm run test:unit
npm test
npm run vsix
```

The full test suite opens a VS Code extension host. To reuse an already downloaded compatible version, pass `npm test -- --code-version 1.139.1`. `npm run vsix` runs the production type and lint checks, bundles the extension, and creates `releases/timemachine-1.6.0.vsix`.

Open this repository in VS Code and choose **Run → Run Without Debugging** to open an Extension Development Host with the repository as its workspace. On macOS, use the menu if F5 is assigned to Dictation. Select the TimeMachine icon and expand Coding Time and Project Timeline.

Save a text file, open a new integrated terminal inside the project, and run `node -e "process.exit(0)"` and `node -e "process.exit(1)"`. Check mode switching, automatic focus pausing, graph filtering, command copy, comparisons, and report export. Confirm the full folder path in the sidebar and graph.

For marketing screenshots, `node --experimental-websocket scripts/capture-marketing.mjs` renders the current webviews with labeled demonstration data. It requires Google Chrome on macOS. The fixture uses an example project and includes no real user history. `node scripts/check-release.mjs` checks release metadata, documentation links, and image dimensions.

The source license permits use of the unmodified extension and reserves modification and redistribution rights. See [LICENSE](../LICENSE) before distributing a derivative.
