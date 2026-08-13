# PrismPath verification guide

## Automated checks

Run from the project root:

```powershell
npm test
```

The test runner validates required package files, checks JavaScript syntax, and launches the XPath engine fixtures in installed Edge or Chrome. It covers stable and volatile IDs, automation attributes, label relationships, scoped parent/child selectors, ambiguity rejection, quote escaping, absolute paths, Blue Prism 6.8 legacy paths, and Shadow DOM refusal.

Run the unpacked-extension workflow test and regenerate QA screenshots with:

```powershell
npm run test:integration
npm run assets
```

The integration test launches an isolated Edge/Chrome profile, loads the extension, selects a fixture element, confirms strict candidate badges, checks the single red highlight, saves the selector into a webpage folder, renames the website and element, checks folder collapse/expand, reloads the page, and requires a one-match regression pass.

## Browser acceptance test

1. Load the project as an unpacked extension in Chrome and Edge.
2. Open `tests/manual-fixture.html` when present, or a representative test application.
3. Open PrismPath from the toolbar.
4. Select **Identify element** and choose an input, button, label, select, option, checkbox, radio button, and nested text element.
5. Confirm the page click is prevented while selecting.
6. Confirm every candidate says **Exactly 1 match**.
7. Select **Highlight** and confirm a red outline appears on only the selected element.
8. Save several candidates, refresh the page, and run **Retest page**.
9. Run **Reload + retest** and confirm the results update after load.
10. Deliberately change a saved XPath to an ambiguous expression via exported/imported JSON and confirm the extension reports multiple matches.
11. Run **Retest page** with multiple saved selectors and confirm every found element has a red outline labeled with its saved element name.
12. Copy the library JSON, clear the library, import it again, and confirm entries return without duplication.
13. Repeat inside a same-origin and cross-origin iframe test page.

## Blue Prism acceptance matrix

For each supported Blue Prism version and both browsers where available:

1. Spy the test element using Browser mode.
2. Keep **Web Path/XPath** selected and remove unrelated non-unique attributes.
3. Paste a PrismPath candidate.
4. Use Application Modeller **Highlight** repeatedly.
5. Reload and navigate away/back before highlighting again.
6. Exercise the element from a Navigate, Read, or Write stage as appropriate.
7. Run at least 100 repeated interactions on a stable test application.

Record results for:

| Blue Prism | Chrome | Edge | Candidate types |
| --- | --- | --- | --- |
| 6.8 | Required if deployed | Required if deployed | Legacy structural Web Path |
| 6.9 | Recommended | Recommended | XPath 1.0 candidates |
| 7.4.1 | Required | Required | All modern candidates |

No browser-side test can prove that a particular Blue Prism/browser-extension build parses every expression identically. Application Modeller Highlight is the final compatibility gate.
