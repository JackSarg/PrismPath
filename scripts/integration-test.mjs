import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolvePromise, rejectPromise) => {
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener("error", rejectPromise, { once: true });
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (!message.id || !this.pending.has(message.id)) return;
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result || {});
      });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const profileDirectory = join(tmpdir(), `prismpath-integration-${process.pid}`);
const screenshotsDirectory = join(projectRoot, "store", "screenshots");
const fixturePath = join(projectRoot, "tests", "manual-fixture.html");

const chromeCandidates = [
  join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env["ProgramFiles(x86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe")
];
const browserExecutable = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
if (!browserExecutable) throw new Error("Chrome or Edge is required for integration tests.");

await mkdir(profileDirectory, { recursive: true });
await mkdir(screenshotsDirectory, { recursive: true });

const fixtureHtml = await readFile(fixturePath);
const server = createServer((request, response) => {
  if (request.url === "/manual-fixture.html" || request.url === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(fixtureHtml);
    return;
  }
  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("Not found");
});
await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
const serverAddress = server.address();
const fixtureUrl = `http://127.0.0.1:${serverAddress.port}/manual-fixture.html`;
const otherPageUrl = `http://127.0.0.1:${serverAddress.port}/another-page.html`;

const browserProcess = spawn(
  browserExecutable,
  [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    `--disable-extensions-except=${projectRoot}`,
    `--load-extension=${projectRoot}`,
    "about:blank"
  ],
  { stdio: ["ignore", "ignore", "pipe"], windowsHide: true }
);

let browserErrors = "";
browserProcess.stderr.on("data", (chunk) => {
  browserErrors += chunk.toString();
});

try {
  const debugPort = await waitForDebugPort(profileDirectory);
  const debuggerBase = `http://127.0.0.1:${debugPort}`;
  const extensionId = await waitForExtensionId(debuggerBase);

  const panelTarget = await createTarget(debuggerBase, `chrome-extension://${extensionId}/sidepanel/index.html`);
  const panel = new CdpClient(panelTarget.webSocketDebuggerUrl);
  await panel.connect();
  await panel.send("Runtime.enable");
  await panel.send("Page.enable");

  await waitFor(async () => (await evaluate(panel, "document.readyState")) === "complete", 5000, "side panel document");
  const footerLinks = await evaluate(panel, "[...document.querySelectorAll('footer a')].map(link => link.href)");
  const expectedFooterLinks = [
    "https://prismpath.jacksarg.com/",
    "https://github.com/JackSarg/PrismPath",
    "https://www.linkedin.com/in/jacksarg/"
  ];
  if (JSON.stringify(footerLinks) !== JSON.stringify(expectedFooterLinks)) {
    throw new Error(`Unexpected footer links: ${JSON.stringify(footerLinks)}`);
  }
  const headerLinks = await evaluate(panel, "[...document.querySelectorAll('.header-links a')].map(link => link.href)");
  const expectedHeaderLinks = [
    "https://github.com/JackSarg/PrismPath",
    "https://www.linkedin.com/in/jacksarg/",
    "https://buymeacoffee.com/jacksarg"
  ];
  if (JSON.stringify(headerLinks) !== JSON.stringify(expectedHeaderLinks)) {
    throw new Error(`Unexpected header links: ${JSON.stringify(headerLinks)}`);
  }
  if (await evaluate(panel, "Boolean(document.querySelector('.local-badge'))")) {
    throw new Error("The removed Local only badge is still present.");
  }
  const fixtureTabId = await evaluate(panel, `chrome.tabs.create({url:${JSON.stringify(fixtureUrl)},active:true}).then(tab => tab.id)`);
  const fixtureTarget = await waitForTarget(debuggerBase, fixtureUrl);
  const fixture = new CdpClient(fixtureTarget.webSocketDebuggerUrl);
  await fixture.connect();
  await fixture.send("Runtime.enable");
  await fixture.send("Page.enable");
  await waitFor(async () => {
    const tab = await evaluate(panel, `chrome.tabs.get(${Number(fixtureTabId)})`);
    return tab?.status === "complete" && tab?.url === fixtureUrl;
  }, 10000, "fixture tab completion");
  await evaluate(panel, `chrome.tabs.update(${Number(fixtureTabId)}, {active:true}).then(() => refreshActiveContext())`);
  await waitFor(async () => (await evaluate(panel, "document.querySelector('#page-context .context-copy span')?.textContent"))?.includes("127.0.0.1"), 10000, "side panel page context");

  const initialConsoleErrors = await evaluate(panel, `window.__prismpathTestErrors || []`);
  if (initialConsoleErrors.length) throw new Error(`Side panel errors: ${initialConsoleErrors.join("; ")}`);

  await evaluate(panel, "document.querySelector('#identify-button').click(); true");
  await waitFor(async () => Boolean(await evaluate(fixture, "document.querySelector('[id^=prismpath-inspector-]')")), 5000, "content script capture overlay");
  await evaluate(fixture, "document.querySelector('[data-testid=customer-email-input]').click(); true");
  await waitFor(async () => Number(await evaluate(panel, "document.querySelectorAll('.candidate-card').length")) >= 3, 10000, "generated XPath cards");

  const candidateCount = Number(await evaluate(panel, "document.querySelectorAll('.candidate-card').length"));
  const uniqueBadges = Number(await evaluate(panel, "Array.from(document.querySelectorAll('.candidate-card .chip.valid')).filter(node => node.textContent.includes('Exactly 1 match')).length"));
  if (candidateCount < 3 || uniqueBadges !== candidateCount) {
    throw new Error(`Expected each of ${candidateCount} candidates to carry strict uniqueness evidence; found ${uniqueBadges}.`);
  }
  const legacyCount = Number(await evaluate(panel, "Array.from(document.querySelectorAll('.candidate-card')).filter(card => card.textContent.includes('Blue Prism 6.8')).length"));
  if (legacyCount !== 1) throw new Error(`Expected one visible Blue Prism 6.8 legacy candidate; found ${legacyCount}.`);
  await evaluate(panel, `(() => {
    const toggle = document.querySelector('#legacy-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(async () => Number(await evaluate(panel, "document.querySelectorAll('.candidate-card').length")) === candidateCount - 1, 3000, "legacy selector filtering");
  const hiddenLegacyCount = Number(await evaluate(panel, "Array.from(document.querySelectorAll('.candidate-card')).filter(card => card.textContent.includes('Blue Prism 6.8')).length"));
  if (hiddenLegacyCount !== 0) throw new Error("The Blue Prism 6.8 candidate remained visible after disabling it.");
  await waitFor(async () => (await evaluate(panel, `chrome.storage.local.get(${JSON.stringify("prismpathShowLegacyCandidates")})`)).prismpathShowLegacyCandidates === false, 3000, "legacy preference persistence");
  await evaluate(panel, `(() => {
    const toggle = document.querySelector('#legacy-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(async () => Number(await evaluate(panel, "document.querySelectorAll('.candidate-card').length")) === candidateCount, 3000, "legacy selector restoration");

  await evaluate(panel, "document.querySelector('#toast').hidden = true; true");
  await setViewport(panel, 420, 800);
  await capture(panel, join(screenshotsDirectory, "sidepanel-generated.png"));

  await setViewport(fixture, 1280, 800);
  const topLayerFixtureReady = await evaluate(fixture, `(() => {
    const target = document.querySelector('[data-testid=customer-email-input]');
    const rect = target.getBoundingClientRect();
    const blocker = document.createElement('div');
    blocker.id = 'prismpath-top-layer-test';
    blocker.setAttribute('popover', 'manual');
    Object.assign(blocker.style, {
      position: 'fixed',
      inset: 'auto',
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      margin: '0',
      padding: '0',
      border: '0',
      background: '#17283a'
    });
    document.documentElement.appendChild(blocker);
    blocker.showPopover();
    return blocker.matches(':popover-open');
  })()`);
  if (!topLayerFixtureReady) throw new Error("Could not create the top-layer highlight regression fixture.");
  await evaluate(panel, "document.querySelector('button[data-action=highlight]').click(); true");
  await waitFor(async () => Number(await evaluate(fixture, "document.querySelectorAll('[data-prismpath-match]').length")) === 1, 6000, "one-match highlight");
  const highlightUsesTopLayer = await evaluate(fixture, "document.querySelector('[data-prismpath-match]').matches(':popover-open')");
  if (!highlightUsesTopLayer) throw new Error("The match highlight was not promoted above the page's top layer.");
  await evaluate(fixture, "document.querySelector('#prismpath-top-layer-test').remove(); true");
  const initialHighlightPosition = await evaluate(fixture, `(() => ({
    markerTop: parseFloat(document.querySelector('[data-prismpath-match]').style.top),
    targetTop: document.querySelector('[data-testid=customer-email-input]').getBoundingClientRect().top
  }))()`);
  await evaluate(fixture, "window.scrollBy(0, 120); true");
  await waitFor(async () => {
    const position = await evaluate(fixture, `(() => ({
      markerTop: parseFloat(document.querySelector('[data-prismpath-match]').style.top),
      targetTop: document.querySelector('[data-testid=customer-email-input]').getBoundingClientRect().top
    }))()`);
    return Math.abs(position.markerTop - (position.targetTop - 3)) < 1
      && Math.abs(position.markerTop - initialHighlightPosition.markerTop) > 50;
  }, 3000, "highlight scroll tracking");
  await evaluate(fixture, "window.scrollTo(0, 0); true");
  await waitFor(async () => {
    const position = await evaluate(fixture, `(() => ({
      markerTop: parseFloat(document.querySelector('[data-prismpath-match]').style.top),
      targetTop: document.querySelector('[data-testid=customer-email-input]').getBoundingClientRect().top
    }))()`);
    return Math.abs(position.markerTop - (position.targetTop - 3)) < 1
      && Math.abs(position.markerTop - initialHighlightPosition.markerTop) < 1;
  }, 3000, "highlight scroll restoration");
  await capture(fixture, join(screenshotsDirectory, "fixture-highlight.png"));

  await evaluate(panel, "document.querySelector('button[data-action=save]').click(); true");
  await waitFor(async () => Number(await evaluate(panel, "document.querySelector('#saved-count').textContent")) === 1, 5000, "saved selector");
  await evaluate(panel, "document.querySelector('[data-tab=saved]').click(); true");
  await waitFor(async () => Number(await evaluate(panel, "document.querySelectorAll('.saved-card').length")) === 1, 5000, "saved selector card");
  const websiteFolderCount = Number(await evaluate(panel, "document.querySelectorAll('.website-folder').length"));
  if (websiteFolderCount !== 1) throw new Error(`Expected one website folder; found ${websiteFolderCount}.`);
  const collapsedByDefault = Boolean(await evaluate(panel, "document.querySelector('.website-elements').hidden"));
  if (!collapsedByDefault) throw new Error("Expected saved website folders to be collapsed by default.");
  await evaluate(panel, "document.querySelector('[data-action=edit-website-name]').click(); true");
  await evaluate(panel, `(() => {
    const input = document.querySelector('.website-name');
    input.value = 'Customer Portal';
    document.querySelector('[data-action=save-website-name]').click();
    return true;
  })()`);
  await waitFor(async () => (await evaluate(panel, "document.querySelector('.website-identity strong')?.textContent")) === "Customer Portal", 5000, "website rename render");
  await evaluate(panel, "document.querySelector('.website-open').click(); true");
  await waitFor(async () => !Boolean(await evaluate(panel, "document.querySelector('.website-elements').hidden")), 3000, "website folder expansion");
  await evaluate(panel, "document.querySelector('[data-action=edit-element-name]').click(); true");
  await evaluate(panel, `(() => {
    const element = document.querySelector('.saved-name');
    element.value = 'Customer email field';
    document.querySelector('[data-action=save-element-name]').click();
    return true;
  })()`);
  await waitFor(async () => (await evaluate(panel, "document.querySelector('.element-name-row strong')?.textContent")) === "Customer email field", 5000, "element rename render");
  await waitFor(async () => {
    const stored = await evaluate(panel, "chrome.storage.local.get(['prismpathSavedWebsites','prismpathSavedSelectors'])");
    const websiteName = Object.values(stored.prismpathSavedWebsites || {})[0]?.name;
    return websiteName === "Customer Portal" && stored.prismpathSavedSelectors?.[0]?.name === "Customer email field";
  }, 5000, "website and element renames");
  await evaluate(panel, "document.querySelector('.website-open').click(); true");
  await waitFor(async () => Boolean(await evaluate(panel, "document.querySelector('.website-elements').hidden")), 3000, "website folder collapse");

  await evaluate(panel, `(async () => {
    const keys = ['prismpathSavedWebsites', 'prismpathSavedSelectors'];
    const stored = await chrome.storage.local.get(keys);
    const original = stored.prismpathSavedSelectors[0];
    const second = {
      ...original,
      id: 'save-customer-selector',
      name: 'Save customer button',
      xpath: "//BUTTON[@data-automation-id='save-customer']",
      validationXPath: "//BUTTON[@data-automation-id='save-customer']",
      elementSummary: '<button> — Save customer',
      createdAt: new Date(Date.now() + 1000).toISOString(),
      lastStatus: 'untested',
      lastCount: 0,
      lastTestedAt: ''
    };
    const otherUrl = ${JSON.stringify(otherPageUrl)};
    const other = {
      ...original,
      id: 'other-page-selector',
      name: 'Another page element',
      pageTitle: 'Another portal',
      pageUrl: otherUrl,
      pageUrlBase: otherUrl,
      lastStatus: 'untested',
      lastCount: 0,
      lastTestedAt: ''
    };
    stored.prismpathSavedSelectors = [other, second, original];
    stored.prismpathSavedWebsites[otherUrl] = {
      name: 'Another portal',
      defaultName: 'Another portal',
      pageUrl: otherUrl,
      createdAt: new Date().toISOString(),
      updatedAt: ''
    };
    await chrome.storage.local.set(stored);
    state.saved = stored.prismpathSavedSelectors.map(normaliseStoredSelector).filter(Boolean);
    state.websites = normaliseStoredWebsites(stored.prismpathSavedWebsites);
    ensureWebsitesForSelectors(state.saved);
    await refreshActiveContext();
    renderSaved();
    renderCounts();
    return true;
  })()`);
  await waitFor(async () => Number(await evaluate(panel, "document.querySelectorAll('.website-folder').length")) === 2, 5000, "two saved website folders");
  const currentPageFirst = await evaluate(panel, `(() => {
    const folders = [...document.querySelectorAll('.website-folder')];
    return folders[0]?.dataset.websiteKey === ${JSON.stringify(fixtureUrl)}
      && Boolean(folders[0].querySelector('.current-page-badge'))
      && folders.every(folder => folder.querySelector('.website-elements').hidden);
  })()`);
  if (!currentPageFirst) throw new Error("Expected the current page folder first, marked Current, with the URL list collapsed.");
  await evaluate(panel, "document.querySelector('.website-folder .website-open').click(); true");
  await waitFor(async () => !Boolean(await evaluate(panel, "document.querySelector('.website-folder .website-elements').hidden")), 3000, "current website folder expansion");

  await evaluate(panel, `chrome.tabs.update(${Number(fixtureTabId)}, {active:true}).then(() => true)`);
  await evaluate(panel, "document.querySelector('#retest-button').click(); true");
  await waitFor(async () => (await evaluate(panel, "document.querySelector('#retest-button').textContent")) === "Retest page", 5000, "bulk retest completion");
  await waitFor(async () => Number(await evaluate(fixture, "document.querySelectorAll('[data-prismpath-match]').length")) === 2, 5000, "two named bulk retest markers");
  const bulkMarkerLabels = await evaluate(fixture, "Array.from(document.querySelectorAll('[data-prismpath-match]')).map(marker => marker.dataset.prismpathLabel).sort()");
  const expectedBulkMarkerLabels = ["Customer email field", "Save customer button"];
  if (JSON.stringify(bulkMarkerLabels) !== JSON.stringify(expectedBulkMarkerLabels)) {
    throw new Error(`Unexpected bulk retest marker labels: ${JSON.stringify(bulkMarkerLabels)}`);
  }
  await fixture.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.addEventListener('DOMContentLoaded', () => {
      const button = document.querySelector("[data-automation-id='save-customer']");
      if (!button?.parentNode) return;
      const placeholder = document.createComment('delayed-save-customer');
      button.parentNode.insertBefore(placeholder, button);
      button.remove();
      window.__prismpathDelayedSaveRestored = false;
      setTimeout(() => {
        placeholder.replaceWith(button);
        window.__prismpathDelayedSaveRestored = true;
      }, 1800);
    }, { once: true });`
  });
  await evaluate(panel, "document.querySelector('#reload-retest-button').click(); true");
  await waitFor(async () => (await evaluate(panel, "document.querySelector('.saved-card .status-pill')?.textContent")) === "1 match", 15000, "reload and retest pass");
  await waitFor(async () => (await evaluate(panel, "document.querySelector('#retest-button').textContent")) === "Retest page", 5000, "retest completion");
  await waitFor(async () => Number(await evaluate(fixture, "document.querySelectorAll('[data-prismpath-match]').length")) === 2, 5000, "reload and retest markers");
  const reloadMarkerLabels = await evaluate(fixture, `Array.from(document.querySelectorAll('[data-prismpath-match]')).map(marker => ({
    name: marker.dataset.prismpathLabel,
    overflow: getComputedStyle(marker).overflow,
    labelWidth: marker.querySelector('span')?.getBoundingClientRect().width || 0,
    labelHeight: marker.querySelector('span')?.getBoundingClientRect().height || 0
  })).sort((left, right) => left.name.localeCompare(right.name))`);
  if (JSON.stringify(reloadMarkerLabels.map(marker => marker.name)) !== JSON.stringify(expectedBulkMarkerLabels)) {
    throw new Error(`Unexpected Reload + retest marker labels: ${JSON.stringify(reloadMarkerLabels)}`);
  }
  if (reloadMarkerLabels.some(marker => marker.overflow !== "visible" || marker.labelWidth <= 0 || marker.labelHeight <= 0)) {
    throw new Error(`Reload + retest labels were clipped or hidden: ${JSON.stringify(reloadMarkerLabels)}`);
  }
  if (!(await evaluate(fixture, "window.__prismpathDelayedSaveRestored === true"))) {
    throw new Error("The delayed element was not restored during Reload + retest.");
  }
  await evaluate(panel, "document.querySelector('#toast').hidden = true; true");
  await capture(panel, join(screenshotsDirectory, "sidepanel-saved.png"));

  const savedStatus = await evaluate(panel, "document.querySelector('.saved-card .status-pill')?.textContent");
  console.log(`PASS extension loaded with id ${extensionId}`);
  console.log(`PASS generated ${candidateCount} strictly unique candidate cards`);
  console.log("PASS highlighted exactly one live element above page top-layer content");
  console.log("PASS highlight followed its element while scrolling");
  console.log(`PASS bulk retest labeled ${bulkMarkerLabels.length} matched elements with their saved names`);
  console.log(`PASS Reload + retest waited for a delayed element and displayed ${reloadMarkerLabels.length} unclipped names`);
  console.log("PASS current-page-first URL accordion with pen-icon website and element renaming");
  console.log(`PASS saved selector reload test: ${savedStatus}`);
  console.log(`PASS screenshots written to ${screenshotsDirectory}`);

  await fixture.close();
  await panel.close();
} catch (error) {
  if (browserErrors) console.error(browserErrors.slice(-4000));
  throw error;
} finally {
  server.close();
  browserProcess.kill();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
  const resolvedTemp = resolve(tmpdir());
  const resolvedProfile = resolve(profileDirectory);
  if (resolvedProfile.startsWith(resolvedTemp) && resolvedProfile.includes("prismpath-integration-")) {
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

async function waitForDebugPort(profilePath) {
  const portFile = join(profilePath, "DevToolsActivePort");
  await waitFor(() => existsSync(portFile), 12000, "Chrome DevTools port");
  const contents = await readFile(portFile, "utf8");
  return Number(contents.split(/\r?\n/)[0]);
}

async function waitForExtensionId(debuggerBase) {
  let found = "";
  await waitFor(async () => {
    const targets = await fetch(`${debuggerBase}/json/list`).then((response) => response.json());
    const extensionTargets = targets.filter((target) => /^chrome-extension:\/\/[a-p]{32}\//.test(target.url) && target.webSocketDebuggerUrl);
    for (const target of extensionTargets) {
      const client = new CdpClient(target.webSocketDebuggerUrl);
      try {
        await client.connect();
        const name = await evaluate(client, "chrome.runtime?.getManifest?.().name || ''");
        if (name === "PrismPath XPath Assistant") {
          found = new URL(target.url).hostname;
          client.close();
          return true;
        }
      } catch (_) {
        // Ignore unrelated built-in extension targets.
      }
      client.close();
    }
    return false;
  }, 12000, "extension service worker");
  return found;
}

async function createTarget(debuggerBase, url) {
  const response = await fetch(`${debuggerBase}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not create browser target: ${response.status}`);
  return response.json();
}

async function waitForTarget(debuggerBase, url) {
  let found;
  await waitFor(async () => {
    const targets = await fetch(`${debuggerBase}/json/list`).then((response) => response.json());
    found = targets.find((target) => target.url === url && target.webSocketDebuggerUrl);
    return Boolean(found);
  }, 10000, `browser target ${url}`);
  return found;
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Browser evaluation failed.");
  }
  return response.result?.value;
}

async function setViewport(client, width, height) {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
}

async function capture(client, destination) {
  const response = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(destination, Buffer.from(response.data, "base64"));
}

async function waitFor(check, timeout, label) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeout) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}.`);
}
