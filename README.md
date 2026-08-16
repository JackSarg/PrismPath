# PrismPath XPath Assistant

PrismPath is a fully local Manifest V3 extension for Chrome and Microsoft Edge. It helps Blue Prism developers replace fragile, fully structural browser paths with ranked XPath alternatives that have been verified against the live page.

The extension never sends page data, selectors, or usage information anywhere. All generation happens inside the inspected page, and saved selectors stay in the browser's local extension storage.

## Intended Blue Prism workflow

1. Spy the element in Blue Prism Application Modeller using Browser mode.
2. Remove attributes that are blank, volatile, or non-unique.
3. Open PrismPath and select **Identify element**.
4. Click the same element on the page.
5. Review the ranked XPath alternatives. Every offered candidate matched the exact selected element once when generated.
6. Use **Highlight** for a fresh one-match check, then **Copy** the XPath into Blue Prism's **Web Path/XPath** attribute.
7. Save important selectors and use **Retest page** or **Reload + retest** after page changes. Matching elements are outlined in red and labeled with their saved element names.

## What it generates

- Stable ID and automation attributes such as `data-testid`, `data-qa`, and `data-automation-id`
- Short semantic attribute paths using `name`, ARIA labels, placeholder text, and similar attributes
- Carefully combined attribute expressions
- Stable ancestor plus descendant or local child paths
- Label/control, sibling, and other relationship-based expressions
- Exact or distinctive visible-text expressions when appropriate
- Class-token expressions that do not depend on class ordering
- A full absolute XPath as an explicitly fragile fallback
- A legacy structural Web Path for Blue Prism 6.8
- A persistent compatibility toggle for showing or hiding the Blue Prism 6.8 legacy option

Expressions use conservative XPath 1.0 features supported by Chromium's native XPath evaluator. Likely GUIDs, timestamps, hashes, framework-generated IDs, long numeric suffixes, and generated class tokens are excluded.

## Compatibility

| Target | Support |
| --- | --- |
| Blue Prism 7.4.1 | Primary target |
| Blue Prism 6.9–7.x | Free-form XPath candidates |
| Blue Prism 6.8 | Legacy structural Web Path candidate; verify with Application Modeller Highlight |
| Google Chrome | Manifest V3, version 114 or later |
| Microsoft Edge | Manifest V3, version 114 or later |

Blue Prism 6.9 introduced the ability to enter XPath expressions in the renamed **Web Path/XPath** attribute. For that reason, PrismPath labels modern expressions as **Blue Prism 6.9+**. The 6.8 candidate uses the documented structural form such as `HTML/BODY(1)/TABLE(4)` and is clearly marked as legacy. Users who only target Blue Prism 6.9 or later can hide that legacy option with the version toggle in the Generated view.

Official references:

- [Blue Prism 6.9 release notes: Web Path/XPath expressions](https://documentation.blueprism.com/bp-6-9/en-us/Release%20Notes/Release%20Notes/rn-6-9.htm)
- [Blue Prism web page attributes](https://documentation.blueprism.com/bp-7-3/en-us/attributes-webpage.htm)
- [Blue Prism attribute-tuning guidance](https://documentation.blueprism.com/bp-7-1/en-us/Guides/attribute-tuning/attribute-tuning-example.htm)
- [Blue Prism 6.8 Chrome, Edge, and Firefox Application Modeller](https://documentation.blueprism.com/bp-6-8/en-us/Guides/chrome-firefox/application-modeller-chrome-firefox.htm)
- [Blue Prism 7.4 Chrome and Edge Application Modeller](https://documentation.blueprism.com/bp-7-4/en-us/Guides/chrome-firefox/application-modeller-chrome-firefox.htm)

## Install PrismPath

Visit [prismpath.jacksarg.com](https://prismpath.jacksarg.com/) for the main PrismPath page, product information, and the latest installation options.

### Install from an extension store (recommended)

- [Install PrismPath XPath Assistant from the Chrome Web Store](https://chromewebstore.google.com/detail/prismpath-xpath-assistant/lenbdbogeijpchncpofliobfpchajebi)
- [Install PrismPath XPath Assistant from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/prismpath-xpath-assistant/oelbgmjhfanihghhpillngkceblpckia)

Existing pages may need one reload immediately after the extension is first installed. Browser-internal pages, extension stores, and some other protected pages cannot be inspected by any extension.

### Install an unpacked copy (local testing)

Use this option when developing PrismPath, testing a local change, or when you specifically need an unpacked copy.

First, clone the repository or download and extract GitHub's **Code → Download ZIP** archive:

```powershell
git clone https://github.com/JackSarg/PrismPath.git
cd PrismPath
```

The repository root is the unpacked extension folder—it is the directory containing `manifest.json`. The `dist/` directory is generated locally only when a developer runs `npm run package`; it is not stored in GitHub.

### Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the extracted `PrismPath` repository folder containing `manifest.json`.
5. Pin PrismPath if desired. Selecting its toolbar icon opens the persistent side panel.

### Microsoft Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the extracted `PrismPath` repository folder containing `manifest.json`.

## Saved selector regression checks

Saved entries are automatically organised into a compact, collapsed list of webpage folders. The current webpage is marked and moved to the top whenever it has saved entries. Click a webpage row to open its saved elements. A folder initially uses the webpage title, keeps the page address visible, and can be given a memorable friendly name using its pen icon. Each saved element has its own pen-icon rename control.

Saved entries retain the page path and iframe context in which they were captured. On the relevant page:

- **Retest page** validates every saved selector for that page without reloading, then labels every found element in red with its saved name.
- **Reload + retest** reloads the active tab, waits for it to finish, and then validates and labels every saved selector.
- A pass requires exactly one match. Zero matches and multiple matches are both failures.
- **Highlight** and an individual saved-selector **Retest** draw a named red box around a single match. When there are multiple matches, all available matches are boxed, numbered, and reported as an error.

The library can be copied as JSON and pasted into another PrismPath installation. Website folder names are included. Imports merge with existing entries and skip duplicates.

## Iframes and Shadow DOM

XPath is evaluated within one document. For iframe selections, PrismPath saves the frame URL context and retests only matching frames. If several matching frames produce matches, the total must still be exactly one.

Standard XPath cannot cross a Shadow DOM boundary. PrismPath detects an element selected inside open Shadow DOM and refuses to offer a misleading expression. Closed Shadow DOM may expose only its host element to extensions; Blue Prism compatibility must be tested against the host.

## Permissions

- **Access to web pages (`<all_urls>`)**: required to inspect arbitrary enterprise web applications and their cross-origin frames. The content script remains idle until the user selects Identify or Highlight.
- **Storage**: saves the user's selector library locally.
- **Tabs**: finds and reloads the active page for regression testing.
- **Scripting**: validates and highlights XPath matches across frame contexts.
- **Side panel**: keeps results visible while the developer clicks the webpage.
- **Clipboard write**: provides one-click XPath and JSON copying.

See [PRIVACY.md](PRIVACY.md) for the complete data-handling statement.

## Development and verification

No runtime packages or remote assets are used.

```powershell
npm run icons
npm test
npm run test:integration
npm run assets
npm run package
```

`npm test` validates the manifest and runtime files, checks JavaScript syntax when Node.js is available, then runs the XPath engine suite inside an installed Chrome or Edge browser.

`npm run test:integration` refreshes the live extension screenshots. `npm run assets` regenerates and dimension-checks the canonical Chrome Web Store and Microsoft Edge Add-ons artwork under `store/`; see [store/ASSETS.md](store/ASSETS.md) for each store's upload map.

`npm run package` regenerates icons, runs all checks, and creates a Chrome/Edge submission archive under `dist/`.

## Accuracy model

PrismPath provides evidence, not a permanent guarantee about a web application it does not control. A candidate is only shown when it resolves to the exact selected element once in the current document. Its score then considers semantic intent, volatility patterns, structural depth, positional indexes, and expression length. Persistent retesting is included because even a strong selector can become invalid when the application itself changes.

PrismPath is an independent developer tool and is not affiliated with or endorsed by SS&C Blue Prism.
