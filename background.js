"use strict";

const SESSION_SELECTION_KEY = "prismpathCurrentSelection";

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanel();
});

configureSidePanel();

function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.tabs.onActivated.addListener(() => {
  notifyExtensionPages({ type: "PP_ACTIVE_TAB_CHANGED" });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active || (!changeInfo.url && changeInfo.status !== "complete")) return;
  notifyExtensionPages({ type: "PP_ACTIVE_TAB_CHANGED", status: changeInfo.status });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  const handlers = {
    PP_GET_ACTIVE_CONTEXT: () => getActiveContext(),
    PP_START_IDENTIFY: () => startIdentify(),
    PP_CONTENT_SELECTED: () => receiveSelection(message.payload, sender),
    PP_CONTENT_CANCELLED: () => receiveCancellation(sender),
    PP_VALIDATE_XPATH: () => validateXPathOnActiveTab(message),
    PP_RELOAD_ACTIVE_TAB: () => reloadActiveTab(),
    PP_CLEAR_HIGHLIGHTS: () => clearHighlightsOnActiveTab()
  };

  const handler = handlers[message.type];
  if (!handler) return false;

  Promise.resolve()
    .then(handler)
    .then((result) => sendResponse(result ?? { ok: true }))
    .catch((error) => sendResponse({ ok: false, error: friendlyError(error) }));
  return true;
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab?.id) throw new Error("No active browser tab was found.");
  return tab;
}

async function getActiveContext() {
  const tab = await getActiveTab();
  return {
    ok: true,
    tab: {
      id: tab.id,
      title: tab.title || "Untitled page",
      url: tab.url || "",
      urlBase: normaliseUrlBase(tab.url || ""),
      status: tab.status || "unknown",
      supported: isSupportedUrl(tab.url || "")
    }
  };
}

async function ensureContentScripts(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PP_PING" }, { frameId: 0 });
    if (response?.ok) return;
  } catch (_) {
    // Existing tabs are not automatically injected immediately after installation.
  }

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["src/xpath-engine.js", "src/content-script.js"]
  });
}

async function startIdentify() {
  const tab = await getActiveTab();
  if (!isSupportedUrl(tab.url || "")) {
    throw new Error("PrismPath cannot inspect browser-internal or extension pages. Open a normal web page first.");
  }

  await ensureContentScripts(tab.id);
  await chrome.storage.session.remove(SESSION_SELECTION_KEY);
  await chrome.tabs.sendMessage(tab.id, { type: "PP_START_IDENTIFY" });
  return { ok: true, tabId: tab.id };
}

async function receiveSelection(payload, sender) {
  if (!sender.tab?.id || !payload) throw new Error("The selected page context is no longer available.");

  await stopIdentify(sender.tab.id);
  const selection = {
    ...payload,
    tabId: sender.tab.id,
    frameId: Number.isInteger(sender.frameId) ? sender.frameId : 0,
    pageUrl: sender.tab.url || payload.pageUrl || "",
    pageUrlBase: normaliseUrlBase(sender.tab.url || payload.pageUrl || ""),
    pageTitle: sender.tab.title || payload.pageTitle || "Untitled page",
    selectedAt: new Date().toISOString()
  };

  await chrome.storage.session.set({ [SESSION_SELECTION_KEY]: selection });
  notifyExtensionPages({ type: "PP_SELECTION_UPDATED", selection });
  return { ok: true };
}

async function receiveCancellation(sender) {
  if (sender.tab?.id) await stopIdentify(sender.tab.id);
  notifyExtensionPages({ type: "PP_IDENTIFY_CANCELLED" });
  return { ok: true };
}

async function stopIdentify(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PP_STOP_IDENTIFY" });
  } catch (_) {
    // The page may have navigated while capture was active.
  }
}

async function validateXPathOnActiveTab(message) {
  const tab = await getActiveTab();
  if (!isSupportedUrl(tab.url || "")) throw new Error("This browser page cannot be inspected.");
  const xpath = String(message.xpath || "").trim();
  if (!xpath) throw new Error("The XPath is empty.");

  const scope = message.scope || {};
  const target = { tabId: tab.id };
  if (Number.isInteger(scope.frameId) && scope.frameId >= 0 && scope.liveSelection) {
    target.frameIds = [scope.frameId];
  } else if (scope.isFrame) {
    target.allFrames = true;
  } else {
    target.frameIds = [0];
  }

  let injections;
  try {
    injections = await chrome.scripting.executeScript({
      target,
      func: evaluateAndHighlight,
      args: [
        xpath,
        Boolean(message.highlight),
        scope.frameUrlBase || "",
        String(message.highlightLabel || "").trim().slice(0, 180),
        Boolean(message.preserveHighlights)
      ]
    });
  } catch (error) {
    throw new Error(`Could not test this XPath: ${friendlyError(error)}`);
  }

  const results = injections
    .map((injection) => ({ frameId: injection.frameId, ...(injection.result || {}) }))
    .filter((result) => !result.skipped);
  const invalid = results.find((result) => result.error);
  if (invalid) {
    return { ok: false, status: "invalid", count: 0, error: invalid.error, frames: results };
  }

  const count = results.reduce((sum, result) => sum + (result.count || 0), 0);
  return {
    ok: count === 1,
    status: count === 1 ? "valid" : count === 0 ? "missing" : "multiple",
    count,
    frames: results,
    error:
      count === 1
        ? ""
        : count === 0
          ? "No element matched this XPath in the saved page/frame context."
          : `${count} elements matched this XPath. A Blue Prism selector must resolve to exactly one element.`
  };
}

async function reloadActiveTab() {
  const tab = await getActiveTab();
  if (!isSupportedUrl(tab.url || "")) throw new Error("This browser page cannot be reloaded by PrismPath.");
  await chrome.tabs.reload(tab.id);
  await waitForTabComplete(tab.id, 30000);
  return { ok: true, tabId: tab.id };
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
    };
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      cleanup();
      setTimeout(resolve, 350);
    };
    chrome.tabs.onUpdated.addListener(listener);
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("The page did not finish loading within 30 seconds."));
    }, timeoutMs);
  });
}

async function clearHighlightsOnActiveTab() {
  const tab = await getActiveTab();
  if (!isSupportedUrl(tab.url || "")) return { ok: true };
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: () => document.querySelectorAll("[data-prismpath-match]").forEach((node) => node.remove())
  });
  return { ok: true };
}

function evaluateAndHighlight(xpath, shouldHighlight, requiredFrameUrlBase, highlightLabel, preserveHighlights) {
  const frameUrlBase = (() => {
    try {
      const url = new URL(location.href);
      return `${url.origin}${url.pathname}`;
    } catch (_) {
      return location.href.split("#")[0].split("?")[0];
    }
  })();

  if (requiredFrameUrlBase && frameUrlBase !== requiredFrameUrlBase) {
    return { skipped: true, href: location.href, frameUrlBase };
  }

  if (!preserveHighlights) {
    document.querySelectorAll("[data-prismpath-match]").forEach((node) => node.remove());
  }

  let snapshot;
  try {
    snapshot = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  } catch (error) {
    return { count: 0, error: error.message || "Invalid XPath expression.", href: location.href, frameUrlBase };
  }

  const elements = [];
  for (let index = 0; index < snapshot.snapshotLength; index += 1) {
    const node = snapshot.snapshotItem(index);
    if (node?.nodeType === Node.ELEMENT_NODE) elements.push(node);
  }

  if (shouldHighlight) {
    elements.slice(0, 50).forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      const marker = document.createElement("div");
      marker.dataset.prismpathMatch = "true";
      const savedName = String(highlightLabel || "").trim();
      const markerLabel = savedName
        ? elements.length === 1
          ? savedName
          : `${savedName} (${index + 1} of ${elements.length})`
        : elements.length === 1
          ? "PrismPath match"
          : `Match ${index + 1} of ${elements.length}`;
      marker.dataset.prismpathLabel = markerLabel;
      const canUseTopLayer = typeof marker.showPopover === "function";
      if (canUseTopLayer) marker.setAttribute("popover", "manual");
      const styles = {
        position: "fixed",
        inset: "auto",
        left: `${rect.left - 3}px`,
        top: `${rect.top - 3}px`,
        right: "auto",
        bottom: "auto",
        width: `${Math.max(0, rect.width + 6)}px`,
        height: `${Math.max(0, rect.height + 6)}px`,
        margin: "0",
        padding: "0",
        border: "3px solid #ff334e",
        borderRadius: "5px",
        boxSizing: "border-box",
        background: "rgba(255, 51, 78, 0.08)",
        boxShadow: "0 0 0 2px rgba(255,255,255,.9), 0 8px 24px rgba(14,23,38,.28)",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: "2147483647"
      };
      Object.entries(styles).forEach(([name, value]) => marker.style.setProperty(name, value, "important"));

      const label = document.createElement("span");
      label.textContent = markerLabel;
      const alignRight = rect.left > window.innerWidth / 2;
      const labelStyles = {
        position: "absolute",
        left: alignRight ? "auto" : "-3px",
        right: alignRight ? "-3px" : "auto",
        top: rect.top >= 32 ? "-29px" : "calc(100% + 5px)",
        maxWidth: `${Math.max(120, Math.min(320, window.innerWidth - 16))}px`,
        padding: "4px 8px",
        borderRadius: "4px",
        background: "#e11435",
        color: "#ffffff",
        font: "600 12px/1.2 Arial, sans-serif",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        boxShadow: "0 2px 8px rgba(0,0,0,.2)"
      };
      Object.entries(labelStyles).forEach(([name, value]) => label.style.setProperty(name, value, "important"));
      marker.appendChild(label);
      (document.documentElement || document.body).appendChild(marker);
      if (canUseTopLayer) {
        try {
          marker.showPopover();
        } catch (_) {
          marker.removeAttribute("popover");
        }
      }

      let positionFrame = 0;
      let resizeObserver = null;
      const removeMarker = () => {
        if (positionFrame) cancelAnimationFrame(positionFrame);
        window.removeEventListener("scroll", scheduleMarkerPosition, true);
        window.removeEventListener("resize", scheduleMarkerPosition);
        resizeObserver?.disconnect();
        marker.remove();
      };
      const updateMarkerPosition = () => {
        positionFrame = 0;
        if (!marker.isConnected || !element.isConnected) {
          removeMarker();
          return;
        }
        const liveRect = element.getBoundingClientRect();
        const visible =
          liveRect.width > 0 &&
          liveRect.height > 0 &&
          liveRect.bottom > 0 &&
          liveRect.right > 0 &&
          liveRect.top < window.innerHeight &&
          liveRect.left < window.innerWidth;
        marker.style.setProperty("left", `${liveRect.left - 3}px`, "important");
        marker.style.setProperty("top", `${liveRect.top - 3}px`, "important");
        marker.style.setProperty("width", `${Math.max(0, liveRect.width + 6)}px`, "important");
        marker.style.setProperty("height", `${Math.max(0, liveRect.height + 6)}px`, "important");
        marker.style.setProperty("visibility", visible ? "visible" : "hidden", "important");
        const alignLiveLabelRight = liveRect.left + liveRect.width / 2 > window.innerWidth / 2;
        label.style.setProperty("left", alignLiveLabelRight ? "auto" : "-3px", "important");
        label.style.setProperty("right", alignLiveLabelRight ? "-3px" : "auto", "important");
        label.style.setProperty("top", liveRect.top >= 32 ? "-29px" : "calc(100% + 5px)", "important");
        label.style.setProperty("max-width", `${Math.max(120, Math.min(320, window.innerWidth - 16))}px`, "important");
      };
      function scheduleMarkerPosition() {
        if (!positionFrame) positionFrame = requestAnimationFrame(updateMarkerPosition);
      }
      window.addEventListener("scroll", scheduleMarkerPosition, true);
      window.addEventListener("resize", scheduleMarkerPosition);
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(scheduleMarkerPosition);
        resizeObserver.observe(element);
      }
      updateMarkerPosition();
      setTimeout(removeMarker, 5000);
    });
  }

  return { count: elements.length, href: location.href, frameUrlBase };
}

function notifyExtensionPages(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

function normaliseUrlBase(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch (_) {
    return String(value || "").split("#")[0].split("?")[0];
  }
}

function isSupportedUrl(value) {
  return /^(https?|file):/i.test(value);
}

function friendlyError(error) {
  const message = error?.message || String(error || "Unknown error");
  if (/Cannot access|extensions gallery|Chrome Web Store/i.test(message)) {
    return "The browser does not allow extensions to inspect this protected page.";
  }
  if (/Receiving end does not exist/i.test(message)) {
    return "PrismPath could not connect to the page. Reload the tab and try again.";
  }
  return message;
}
