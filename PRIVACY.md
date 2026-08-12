# PrismPath Privacy Statement

Effective date: 12 August 2026

PrismPath XPath Assistant is designed to operate entirely on the user's machine.

## Data collected

PrismPath does not collect, transmit, sell, or share personal information, browsing history, page content, selectors, analytics, diagnostics, or usage information.

## Local processing

When the user explicitly selects **Identify**, PrismPath examines the selected element and nearby Document Object Model information to generate XPath candidates. When the user selects **Highlight**, **Retest**, or **Reload + retest**, the supplied XPath is evaluated against the active page or saved frame context.

This processing occurs locally in the browser. PrismPath makes no network requests and contains no remote scripts, tracking pixels, advertising code, or analytics SDKs.

## Local storage

Selectors saved by the user are stored using the browser extension's local storage. A saved entry may include:

- The XPath and its equivalent validation XPath
- A user-editable name
- The page and iframe URLs used to scope later tests
- Element type and candidate-quality metadata
- The latest local validation result and timestamp

This data remains within the user's browser profile unless the user deliberately copies the library as JSON and shares it. Users can delete individual entries or the entire library from the extension.

## Permissions

PrismPath requests access to web pages so it can work with arbitrary web applications, including iframe content. It uses this access only for user-initiated identification, validation, and visual highlighting. Page information is not transmitted.

## Data retention

Generated candidates remain in temporary browser-session storage. Saved selectors remain in local extension storage until the user deletes them or removes the extension. Removing the extension normally removes its local storage according to the browser's extension-data behaviour.

## Changes

If PrismPath's data practices change, this statement and the extension version history will be updated before release. A version that introduces network communication, analytics, or external data processing must not reuse this statement unchanged.

## Contact

For support or privacy inquiries, use the publisher contact shown on the extension's store listing or internal distribution page.
