# Changelog

## Unreleased

- Added a persistent Generated-view toggle for hiding Blue Prism 6.8 legacy Web Paths
- Replaced the header's Local only badge with GitHub, LinkedIn, and Buy Me a Coffee icon links
- Added named red page markers for individual and bulk saved-selector retests
- Promoted highlight markers into the browser top layer so page elements cannot cover them, while keeping element-name labels unclipped
- Added a bounded readiness retry to Reload + retest for elements rendered shortly after page load
- Made active highlight boxes and labels follow their matched elements while the page scrolls or resizes
- Replaced the original chevron icon with the selected prism-framed locator identity and generated complete Chrome/Edge store artwork
- Replaced the Step 1 card's abstract background square with a faded, angled PrismPath logo

## 1.2.0 — 2026-08-12

- Reworked Saved into a compact webpage URL accordion that starts collapsed
- Moved the active webpage to the top of the Saved list and marked it as Current
- Replaced always-visible rename fields with subtle pen-icon editing for websites and elements
- Added PrismPath website, GitHub, and LinkedIn links to the side-panel footer

## 1.1.0 — 2026-08-12

- Grouped saved elements into collapsible webpage folders
- Added persistent friendly-name editing for website folders
- Simplified default saved-element names and retained individual renaming
- Included website folder names in JSON export/import
- Clarified Retest success feedback so it no longer claims that a non-highlighted match was outlined

## 1.0.0 — 2026-08-12

- Initial Manifest V3 release for Chrome and Microsoft Edge
- Ranked XPath 1.0 generation with strict exact-element uniqueness validation
- Volatile attribute and generated class-token rejection
- Direct, compound, text, label, sibling, parent/child, absolute, and Blue Prism 6.8 legacy candidates
- Persistent side panel with copy, highlight, save, rename, delete, search, local JSON sharing, and import
- Page and iframe-aware retesting, including reload-and-retest
- Explicit Shadow DOM safety refusal
- Local-only privacy design with no analytics or network requests
