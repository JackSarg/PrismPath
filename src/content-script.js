(() => {
  "use strict";

  if (globalThis.__PRISMPATH_CONTENT_LOADED__) return;
  globalThis.__PRISMPATH_CONTENT_LOADED__ = true;

  let captureActive = false;
  let hoveredElement = null;
  let overlayHost = null;
  let overlayBox = null;
  let overlayTooltip = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;
    if (message.type === "PP_PING") {
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "PP_START_IDENTIFY") {
      startCapture();
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "PP_STOP_IDENTIFY") {
      stopCapture(false);
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  function startCapture() {
    if (captureActive) return;
    captureActive = true;
    createOverlay();
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", updateOverlay, true);
    window.addEventListener("resize", updateOverlay, true);
  }

  function stopCapture(notify) {
    if (!captureActive && !overlayHost) return;
    captureActive = false;
    hoveredElement = null;
    document.removeEventListener("pointerover", onPointerOver, true);
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", updateOverlay, true);
    window.removeEventListener("resize", updateOverlay, true);
    overlayHost?.remove();
    overlayHost = null;
    overlayBox = null;
    overlayTooltip = null;
    if (notify) chrome.runtime.sendMessage({ type: "PP_CONTENT_CANCELLED" }).catch(() => {});
  }

  function onPointerOver(event) {
    const candidate = elementFromEvent(event);
    if (!candidate || candidate === overlayHost) return;
    hoveredElement = candidate;
    updateOverlay();
  }

  function onPointerMove(event) {
    const candidate = elementFromEvent(event);
    if (candidate && candidate !== hoveredElement && candidate !== overlayHost) {
      hoveredElement = candidate;
      updateOverlay();
    }
  }

  function onClick(event) {
    if (!captureActive) return;
    const selected = elementFromEvent(event) || hoveredElement;
    if (!selected || selected === overlayHost) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    stopCapture(false);

    try {
      const generated = globalThis.PrismPathEngine.generate(selected);
      const isFrame = window.top !== window;
      const payload = {
        ...generated,
        frame: {
          isFrame,
          url: location.href,
          urlBase: normaliseUrlBase(location.href),
          title: document.title || "Untitled frame",
          name: getFrameName()
        },
        pageTitle: document.title || "Untitled page",
        pageUrl: location.href
      };
      if (isFrame) {
        payload.warnings = [
          ...(payload.warnings || []),
          "This element is inside an iframe. PrismPath will retest it only within the saved frame URL context."
        ];
      }
      chrome.runtime.sendMessage({ type: "PP_CONTENT_SELECTED", payload }).catch(() => {});
    } catch (error) {
      chrome.runtime
        .sendMessage({
          type: "PP_CONTENT_SELECTED",
          payload: {
            candidates: [],
            diagnostics: { generated: 0, ambiguous: 0, mismatched: 0, invalid: 0, duplicates: 0 },
            warnings: [error.message || "PrismPath could not inspect this element."],
            unsupported: "generation-error",
            element: { tag: selected.tagName.toLowerCase(), summary: `<${selected.tagName.toLowerCase()}>` },
            frame: {
              isFrame: window.top !== window,
              url: location.href,
              urlBase: normaliseUrlBase(location.href),
              title: document.title || "Untitled frame",
              name: getFrameName()
            }
          }
        })
        .catch(() => {});
    }
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    stopCapture(true);
  }

  function elementFromEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const candidate = path.find((node) => node?.nodeType === Node.ELEMENT_NODE) || event.target;
    return candidate?.nodeType === Node.ELEMENT_NODE ? candidate : candidate?.parentElement || null;
  }

  function createOverlay() {
    overlayHost = document.createElement("div");
    overlayHost.id = `prismpath-inspector-${Math.random().toString(36).slice(2)}`;
    overlayHost.style.setProperty("all", "initial", "important");
    overlayHost.style.setProperty("position", "fixed", "important");
    overlayHost.style.setProperty("inset", "0", "important");
    overlayHost.style.setProperty("pointer-events", "none", "important");
    overlayHost.style.setProperty("z-index", "2147483647", "important");

    const shadow = overlayHost.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      #box {
        position: fixed;
        border: 3px solid #19c3dc;
        border-radius: 5px;
        box-sizing: border-box;
        background: rgba(25, 195, 220, .08);
        box-shadow: 0 0 0 2px rgba(255,255,255,.92), 0 10px 30px rgba(2,12,28,.28);
        transition: left 45ms linear, top 45ms linear, width 45ms linear, height 45ms linear;
      }
      #tooltip {
        position: fixed;
        max-width: min(420px, calc(100vw - 24px));
        padding: 7px 10px;
        border-radius: 6px;
        background: #071525;
        color: #f4fbff;
        box-shadow: 0 6px 24px rgba(2,12,28,.35);
        font: 600 12px/1.35 Inter, Arial, sans-serif;
        letter-spacing: .01em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #tooltip span { color: #76deed; font-weight: 700; }
    `;
    overlayBox = document.createElement("div");
    overlayBox.id = "box";
    overlayBox.hidden = true;
    overlayTooltip = document.createElement("div");
    overlayTooltip.id = "tooltip";
    overlayTooltip.innerHTML = "Click to inspect <span>· Esc to cancel</span>";
    shadow.append(style, overlayBox, overlayTooltip);
    (document.documentElement || document.body).appendChild(overlayHost);
    positionTooltipWithoutTarget();
  }

  function updateOverlay() {
    if (!hoveredElement || !overlayBox || !overlayTooltip || !hoveredElement.isConnected) return;
    const rect = hoveredElement.getBoundingClientRect();
    overlayBox.hidden = false;
    overlayBox.style.left = `${Math.max(0, rect.left - 2)}px`;
    overlayBox.style.top = `${Math.max(0, rect.top - 2)}px`;
    overlayBox.style.width = `${Math.max(0, rect.width + 4)}px`;
    overlayBox.style.height = `${Math.max(0, rect.height + 4)}px`;

    const descriptor = describeForTooltip(hoveredElement);
    overlayTooltip.innerHTML = `${escapeHtml(descriptor)} <span>· Click to inspect · Esc to cancel</span>`;
    const tooltipWidth = Math.min(420, Math.max(190, overlayTooltip.getBoundingClientRect().width || 260));
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - tooltipWidth - 8));
    const preferredTop = rect.top - 38;
    const top = preferredTop >= 8 ? preferredTop : Math.min(window.innerHeight - 38, rect.bottom + 8);
    overlayTooltip.style.left = `${left}px`;
    overlayTooltip.style.top = `${Math.max(8, top)}px`;
  }

  function positionTooltipWithoutTarget() {
    if (!overlayTooltip) return;
    overlayTooltip.style.left = "12px";
    overlayTooltip.style.top = "12px";
  }

  function describeForTooltip(element) {
    const tag = element.tagName.toLowerCase();
    const id = element.id && !globalThis.PrismPathEngine.isLikelyVolatile(element.id, "id") ? `#${element.id}` : "";
    const classes = globalThis.PrismPathEngine.stableClassTokens(element).slice(0, 2).map((token) => `.${token}`).join("");
    const name = element.getAttribute("name") ? ` [name=\"${truncate(element.getAttribute("name"), 28)}\"]` : "";
    return `<${tag}>${id}${classes}${name}`;
  }

  function getFrameName() {
    try {
      return window.frameElement?.getAttribute("name") || window.frameElement?.id || "";
    } catch (_) {
      return "";
    }
  }

  function normaliseUrlBase(value) {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch (_) {
      return String(value || "").split("#")[0].split("?")[0];
    }
  }

  function truncate(value, maximum) {
    const text = String(value || "");
    return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
