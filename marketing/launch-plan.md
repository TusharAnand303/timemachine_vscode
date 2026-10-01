# Marketplace and GitHub launch kit

Release: **1.5.0**, prepared October 1, 2026. This kit contains local publishing assets; it does not represent a live Marketplace update or an uploaded GitHub release.

## Positioning

**One sentence:** TimeMachine is a VS Code extension for coding time, terminal command history, and local project activity.

**Audience:** developers who want to review their own workflow, retrieve commands, and inspect saved changes around a failed run without adding an account or cloud activity service.

**Primary benefit:** connect what ran, what changed, and how you labeled your time in the same project context.

**Product boundaries:** preview software; explicit time labels; no automatic AI authorship detection; no Git replacement; no cloud backup. The source is not licensed as open source. Use these boundaries in every announcement.

## Ready assets

- `README.md`: the Marketplace description and GitHub repository front page, including an install link, real feature details, FAQ, and demonstration screenshots.
- `package.json`: searchable display name, description, relevant keywords, and categories.
- `marketing/github-metadata.json`: the GitHub About description, topics, homepage, and social-preview path.
- `marketing/github-social-preview.png`: a 1280 × 640 sharing image; the editable source is `marketing/social-preview.html`.
- `marketing/release-1.5.0.md`: a GitHub release body to use with the 1.5.0 VSIX.
- `docs/`: setup, failure investigation, terminal troubleshooting, privacy, and development instructions.
- `.github/ISSUE_TEMPLATE/`: bug and feature forms that collect useful feedback.

## Publication sequence

1. Commit and push the final source, docs, and screenshots to the repository's default branch. Marketplace README images link to that branch, so they must be reachable before upload.
2. Install and check `releases/timemachine-1.5.0.vsix` in a normal VS Code window. Confirm sidebar modes, command history, file comparison, and both report formats.
3. Upload the VSIX as an update to **itstushar.timemachine** through Marketplace publisher management. Check the rendered README and screenshot links. Verify that the listing version is 1.5.0 before announcing it.
4. Set the GitHub About fields from `github-metadata.json` and upload the social image in repository Settings → Social preview.
5. Publish a GitHub release for the matching source revision with `release-1.5.0.md` and attach the generated VSIX. Share the release link from the repository's normal announcement channel if one exists.

## Two-week plan after publication

| When | Concrete work | Measure |
| --- | --- | --- |
| Launch day | Publish the listing and GitHub release, verify install links and screenshots | Record Marketplace installs and GitHub traffic as the baseline |
| Days 1–3 | Respond to setup issues; add common shell-integration fixes to the FAQ | Repeated setup questions and confirmed successful installs |
| Days 4–7 | Add a short screen recording of timer → save → command → graph → report to the GitHub release | Views and user feedback, when the hosting platform exposes them |
| Days 8–14 | Review installation feedback, improve one confusing step, and correct documentation gaps | Install trend, issue patterns, and resolved setup problems |

Use changes in installs and feedback as signals. Do not attribute every change to SEO; releases, exposure, and product quality also affect discovery. Gather feedback through GitHub issues rather than adding telemetry to the extension.

## GitHub announcement draft

I built TimeMachine to make a coding day easier to revisit inside VS Code.

Version 1.5.0 adds Today / 7 days / All time summaries and local JSON or CSV project reports. The sidebar has My coding and AI-assisted buttons, and command history lets you find and copy a past run. A failed command can point you to saved files since its previous passing run.

The mode is a label you choose; it doesn't detect who authored a line of code. No account is required, and the extension keeps its activity in VS Code storage. It's a preview, and I'd welcome feedback on setup and the daily workflow.

Install: https://marketplace.visualstudio.com/items?itemName=itstushar.timemachine

Repository: https://github.com/TusharAnand303/timemachine_vscode

## Demo script, approximately 45 seconds

Open an example project → point out its folder name and path → press My coding → switch to AI-assisted → show 7-day totals → save a small file → run a passing then failing command → inspect the related saved change → copy the command → export a CSV report. Use example files and commands rather than private work history.
