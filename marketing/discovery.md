# Marketplace and GitHub discoverability

## Search intent and matching content

| Search intent | Primary content |
| --- | --- |
| VS Code coding time tracker | Listing title, opening README text, Coding Time section |
| AI-assisted coding time | Explicit labels section and authorship FAQ |
| VS Code terminal command history | Searchable command history section and troubleshooting guide |
| Local file history / compare saved changes | Failure-investigation guide and privacy limits |
| Export coding activity CSV | Project reports section and getting-started guide |

These terms describe implemented features. There is no fabricated search-volume data, competitor comparison, install count, or ranking claim.

## What is implemented

- A descriptive Marketplace display name and short description that explain the product before installation.
- Relevant keywords and accurate Visualization, Testing, and Other categories.
- A README with a clear first heading, install link, use cases, descriptive screenshot alt text, a short setup path, and FAQ.
- Focused documentation pages linked from the README and each other.
- Prepared GitHub topics, About text, a Marketplace homepage link, and a social-preview image.
- A matching changelog, release draft, and versioned installable package.

The extension keeps the existing `itstushar.timemachine` identity. Public GitHub source does not imply an open-source license. Publishing retains the preview designation.

## Platform controls

Marketplace and GitHub host and render these pages. Their HTML titles, canonical URLs, robots directives, and sitemaps are controlled by those platforms. Adding a robots file or JSON-LD to this extension repository does not configure those hosted pages. This release targets their supported listing and content fields; a separate website is outside this launch's chosen scope.

After publication, check the actual listing by extension ID, verify the version and image links, and inspect repository topic pages. Review Marketplace installs and GitHub traffic on a regular schedule if those views are available to the owner. There is no guaranteed indexing or ranking outcome.

## Official references

- [VS Code extension manifest and Marketplace presentation](https://code.visualstudio.com/api/references/extension-manifest): search fields, keyword limit, categories, and README presentation.
- [VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension): VSIX packaging, image handling, and release workflow.
- [GitHub topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics): supported topic format and limits.
- [GitHub social preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview): image upload and recommended dimensions.
- [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): helpful readable content and realistic search expectations.
