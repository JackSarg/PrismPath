# Chrome Web Store and Microsoft Edge Add-ons listing

## Product name

PrismPath XPath Assistant

## Short description

Generate, verify, save, and retest stable XPath selectors for Blue Prism browser automation—entirely on your machine.

## Category

Developer Tools

## Detailed description

PrismPath helps Blue Prism developers replace fragile `/HTML/BODY/DIV/...` paths with ranked XPath alternatives based on stable attributes, accessible labels, semantic relationships, and reliable parent/child anchors.

Start Identify, click the element already spied in Blue Prism, and PrismPath generates several XPath approaches. Every offered candidate is evaluated against the live document and must resolve to the exact selected element once.

Key capabilities:

- Ranked short, compound, relationship, parent/child, text, and long-form XPath candidates
- Detection and avoidance of likely generated IDs, GUIDs, hashes, timestamps, and volatile class names
- Strict exactly-one-match validation
- On-page red highlight for fresh visual verification
- Persistent local selector library
- Collapsible webpage folders with editable website and element names
- Retest all selectors for the active page
- Reload the page and rerun selector regression checks
- Iframe-aware saved context
- Local JSON copy/paste for sharing with colleagues
- Blue Prism 6.9+ XPath compatibility labels
- Legacy structural Web Path output for Blue Prism 6.8
- No analytics, accounts, advertising, or network communication

PrismPath is intended to complement—not replace—Application Modeller testing. Always use Blue Prism's own Highlight action before promoting an application model into production.

PrismPath is an independent developer tool and is not affiliated with or endorsed by SS&C Blue Prism.

## Single-purpose statement

PrismPath generates and locally regression-tests XPath selectors for elements that a user explicitly selects in a web page, for use in Blue Prism browser automation.

## Permission justifications

### Host access: all websites

Blue Prism developers automate internal and external web applications on arbitrary domains. PrismPath must inspect the user-selected element and evaluate XPath in the active document, including cross-origin iframe documents. The content script is inert until the user initiates identification or validation. No page information is transmitted.

### Storage

Stores the selector library, labels, page/frame test context, and latest validation result locally in the user's browser profile.

### Tabs

Identifies the active tab and supports the explicit **Reload + retest** workflow.

### Scripting

Evaluates and highlights XPath matches in the active page and appropriate frame context.

### Side panel

Keeps generated results open while the user selects an element in the webpage.

### Clipboard write

Copies a chosen XPath or the user's exported JSON library after an explicit button click.

## Privacy questionnaire answers

- Collects personally identifiable information: No
- Collects health information: No
- Collects financial/payment information: No
- Collects authentication information: No
- Collects personal communications: No
- Collects location: No
- Collects browsing history: No
- Collects user activity/analytics: No
- Sends data off-device: No
- Uses remote code: No
- Contains advertising: No

The extension temporarily reads DOM attributes and text near the explicitly selected element to perform its single purpose. Processing is local and the data is not collected by the publisher.

## Submission checklist

- [x] Manifest V3 package
- [x] 16, 32, 48, and 128 pixel icons
- [x] No remotely hosted code or assets
- [x] Privacy statement prepared
- [x] Permission rationale prepared
- [x] Automated DOM/XPath tests
- [x] Chrome/Edge ZIP build script
- [ ] Add the publisher's support email/URL to the store account and distribution page
- [ ] Host `PRIVACY.md` at a public HTTPS URL if required by the chosen store/publisher account
- [x] Two 1280×800 store screenshots and a 440×280 promotional tile
- [ ] Complete publisher identity and support URL fields
- [ ] Perform hands-on Blue Prism 6.8, 6.9, and 7.4.1 Application Modeller verification
