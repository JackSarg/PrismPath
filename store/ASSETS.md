# PrismPath store artwork

Run the complete artwork pipeline from the repository root:

```powershell
npm run icons
npm run test:integration
npm run assets
```

The selected PrismPath identity is the **prism-framed locator**: a cyan prism/diamond surrounding a white selection target and mint DOM node. The editable master is `icons/icon-source.svg`; `scripts/generate-icons.ps1` deterministically produces every PNG size.

## Extension package icons

The manifest uses these files directly:

| File | Use |
| --- | --- |
| `icons/icon-16.png` | Browser toolbar and compact UI |
| `icons/icon-32.png` | High-density toolbar UI |
| `icons/icon-48.png` | Extension management UI |
| `icons/icon-128.png` | Chrome/Edge package and Chrome Web Store icon |

The 128 px artwork follows Chrome's recommended 96 px mark with 16 px transparent padding on every side. Small runtime sizes use simplified geometry for clarity.

## Chrome Web Store uploads

| Canonical file | Requirement |
| --- | --- |
| `icons/icon-128.png` | Required package/store icon |
| `store/promo-small-440x280.png` | Required small promo tile |
| `store/promo-marquee-1400x560.png` | Optional marquee artwork |
| `store/screenshots/prismpath-generated-1280x800.png` | Listing screenshot |
| `store/screenshots/prismpath-saved-1280x800.png` | Listing screenshot |

Chrome accepts up to five screenshots at either 1280x800 or 640x400. See [Supplying Images](https://developer.chrome.com/docs/webstore/images) and [Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing).

## Microsoft Edge Add-ons uploads

| Canonical file | Requirement |
| --- | --- |
| `store/logo-300x300.png` | Required listing logo; 300 px is Microsoft's recommended size |
| `store/promo-small-440x280.png` | Small promotional tile |
| `store/promo-marquee-1400x560.png` | Large promotional tile |
| `store/screenshots/prismpath-generated-1280x800.png` | Listing screenshot |
| `store/screenshots/prismpath-saved-1280x800.png` | Listing screenshot |

Edge accepts up to six screenshots at either 1280x800 or 640x480. See [Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

The files are shared wherever the stores require identical artwork. This avoids committing duplicate binaries under store-specific folders.
