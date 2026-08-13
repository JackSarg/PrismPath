"use strict";

const SAVED_KEY = "prismpathSavedSelectors";
const SAVED_SITES_KEY = "prismpathSavedWebsites";
const SESSION_SELECTION_KEY = "prismpathCurrentSelection";
const SHOW_LEGACY_KEY = "prismpathShowLegacyCandidates";
const RELOAD_RETEST_READY_TIMEOUT_MS = 5000;
const RELOAD_RETEST_RETRY_INTERVAL_MS = 400;

const state = {
  activeTab: null,
  selection: null,
  saved: [],
  websites: {},
  expandedWebsiteKey: "",
  editingWebsiteKey: "",
  editingElementId: "",
  currentView: "generated",
  identifying: false,
  retesting: false,
  showLegacyCandidates: true,
  search: ""
};

const elements = {
  pageContext: document.querySelector("#page-context"),
  identifyButton: document.querySelector("#identify-button"),
  captureHint: document.querySelector("#capture-hint"),
  generatedCount: document.querySelector("#generated-count"),
  savedCount: document.querySelector("#saved-count"),
  legacyToggle: document.querySelector("#legacy-toggle"),
  generatedView: document.querySelector("#generated-view"),
  savedView: document.querySelector("#saved-view"),
  generatedContent: document.querySelector("#generated-content"),
  savedContent: document.querySelector("#saved-content"),
  savedSearch: document.querySelector("#saved-search"),
  retestButton: document.querySelector("#retest-button"),
  reloadRetestButton: document.querySelector("#reload-retest-button"),
  copyLibraryButton: document.querySelector("#copy-library-button"),
  importButton: document.querySelector("#import-button"),
  clearLibraryButton: document.querySelector("#clear-library-button"),
  importDialog: document.querySelector("#import-dialog"),
  importJson: document.querySelector("#import-json"),
  importFile: document.querySelector("#import-file"),
  confirmImportButton: document.querySelector("#confirm-import-button"),
  toast: document.querySelector("#toast")
};

let toastTimer;

initialise();

async function initialise() {
  bindEvents();
  try {
    const [context, localData, sessionData] = await Promise.all([
      sendMessage({ type: "PP_GET_ACTIVE_CONTEXT" }),
      chrome.storage.local.get({ [SAVED_KEY]: [], [SAVED_SITES_KEY]: {}, [SHOW_LEGACY_KEY]: true }),
      chrome.storage.session.get({ [SESSION_SELECTION_KEY]: null })
    ]);
    state.activeTab = context.ok ? context.tab : null;
    state.saved = Array.isArray(localData[SAVED_KEY]) ? localData[SAVED_KEY].map(normaliseStoredSelector).filter(Boolean) : [];
    state.websites = normaliseStoredWebsites(localData[SAVED_SITES_KEY]);
    state.showLegacyCandidates = localData[SHOW_LEGACY_KEY] !== false;
    elements.legacyToggle.checked = state.showLegacyCandidates;
    const migratedWebsites = ensureWebsitesForSelectors(state.saved);
    state.selection = sessionData[SESSION_SELECTION_KEY] || null;
    if (migratedWebsites) await persistSaved();
  } catch (error) {
    showToast(error.message || "PrismPath could not initialise.", "error");
  }
  renderAll();
}

function bindEvents() {
  elements.identifyButton.addEventListener("click", beginIdentify);
  elements.legacyToggle.addEventListener("change", updateLegacyVisibility);
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.tab)));
  elements.generatedContent.addEventListener("click", onGeneratedAction);
  elements.savedContent.addEventListener("click", onSavedAction);
  elements.savedContent.addEventListener("keydown", onSavedKeyDown);
  elements.savedSearch.addEventListener("input", () => {
    state.search = elements.savedSearch.value.trim().toLowerCase();
    renderSaved();
  });
  elements.retestButton.addEventListener("click", () => retestCurrentPage(false));
  elements.reloadRetestButton.addEventListener("click", () => retestCurrentPage(true));
  elements.copyLibraryButton.addEventListener("click", copyLibrary);
  elements.importButton.addEventListener("click", () => elements.importDialog.showModal());
  elements.clearLibraryButton.addEventListener("click", clearLibrary);
  elements.confirmImportButton.addEventListener("click", importLibrary);
  elements.importFile.addEventListener("change", readImportFile);

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== "string") return;
    if (message.type === "PP_SELECTION_UPDATED") {
      state.selection = message.selection;
      state.identifying = false;
      switchView("generated");
      renderAll();
      showToast(`${visibleCandidateEntries(message.selection).length} unique XPath variations generated.`, "success");
    }
    if (message.type === "PP_IDENTIFY_CANCELLED") {
      state.identifying = false;
      renderIdentifyState();
      showToast("Element selection cancelled.");
    }
    if (message.type === "PP_ACTIVE_TAB_CHANGED") refreshActiveContext();
  });
}

async function refreshActiveContext() {
  try {
    const context = await sendMessage({ type: "PP_GET_ACTIVE_CONTEXT" });
    state.activeTab = context.ok ? context.tab : null;
  } catch (_) {
    state.activeTab = null;
  }
  renderContext();
  renderIdentifyState();
  renderGenerated();
  renderSaved();
}

async function beginIdentify() {
  state.identifying = true;
  renderIdentifyState();
  try {
    const response = await sendMessage({ type: "PP_START_IDENTIFY" });
    if (!response.ok) throw new Error(response.error || "Could not start element selection.");
  } catch (error) {
    state.identifying = false;
    renderIdentifyState();
    showToast(error.message, "error");
  }
}

function renderAll() {
  renderContext();
  renderIdentifyState();
  renderGenerated();
  renderSaved();
  renderCounts();
}

function renderContext() {
  const context = state.activeTab;
  const copy = elements.pageContext.querySelector(".context-copy");
  elements.pageContext.classList.toggle("is-error", !context?.supported);
  if (!context) {
    copy.innerHTML = "<strong>No active page</strong><span>Choose a browser tab to inspect</span>";
    return;
  }
  const host = readableUrl(context.url);
  copy.innerHTML = `<strong>${escapeHtml(context.title || "Untitled page")}</strong><span>${escapeHtml(host)}</span>`;
}

function renderIdentifyState() {
  elements.identifyButton.disabled = state.identifying || !state.activeTab?.supported;
  elements.identifyButton.querySelector("span").textContent = state.identifying ? "Waiting for selection…" : "Identify element";
  elements.captureHint.hidden = !state.identifying;
}

function renderGenerated() {
  const selection = state.selection;
  const samePage = selection && state.activeTab && selection.pageUrlBase === state.activeTab.urlBase;
  const candidateEntries = visibleCandidateEntries(selection);
  elements.generatedCount.textContent = candidateEntries.length;

  if (!selection) {
    elements.generatedContent.innerHTML = emptyState(
      "No element selected yet",
      "Identify an element to generate ranked, one-match XPath variations."
    );
    return;
  }

  if (!samePage) {
    elements.generatedContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${targetIcon()}</div>
        <h2>Selection belongs to another page</h2>
        <p>Return to ${escapeHtml(readableUrl(selection.pageUrl))}, or identify an element on this page.</p>
      </div>`;
    return;
  }

  const candidates = candidateEntries.map((entry) => entry.candidate);
  const warnings = Array.isArray(selection.warnings) ? selection.warnings : [];
  const rejected = (selection.diagnostics?.ambiguous || 0) + (selection.diagnostics?.mismatched || 0) + (selection.diagnostics?.invalid || 0);
  const frameText = selection.frame?.isFrame
    ? `Iframe: ${readableUrl(selection.frame.url)}`
    : "Top-level document";

  const summary = `
    <div class="selection-summary">
      <div class="selection-top">
        <div>
          <span class="eyebrow">Selected element</span>
          <h2>${escapeHtml(selection.element?.summary || "Web element")}</h2>
          <div class="selection-meta">${escapeHtml(frameText)}</div>
        </div>
        <div class="unique-total"><strong>${candidates.length}</strong><span>unique</span></div>
      </div>
    </div>
    ${warnings.map((warning) => `<div class="notice">${escapeHtml(warning)}</div>`).join("")}
    ${rejected ? `<div class="notice info">${rejected} unsafe, ambiguous, or incorrect selector idea${rejected === 1 ? " was" : "s were"} rejected.</div>` : ""}
  `;

  if (!candidates.length) {
    elements.generatedContent.innerHTML = `${summary}${emptyState(
      selection.unsupported === "shadow-dom" ? "XPath is not safe here" : "No safe unique XPath found",
      selection.unsupported === "shadow-dom"
        ? "This element is behind a Shadow DOM boundary that standard XPath cannot cross."
        : "A stable automation attribute may need to be added by the web application team."
    )}`;
    return;
  }

  elements.generatedContent.innerHTML = `${summary}<div class="candidate-list">${candidateEntries
    .map((entry, index) => candidateCard(entry.candidate, index, entry.sourceIndex))
    .join("")}</div>`;
}

function candidateCard(candidate, index, sourceIndex) {
  const scoreClass = candidate.score >= 78 ? "" : candidate.score >= 62 ? "medium" : "fragile";
  const risks = candidate.risks?.length ? `<div class="risk-line">Watch: ${escapeHtml(candidate.risks.join(" · "))}</div>` : "";
  return `
    <article class="candidate-card ${index === 0 ? "is-best" : ""}">
      <div class="card-head">
        <div>
          <div class="rank-line"><span class="rank">Option ${index + 1}</span>${index === 0 ? '<span class="best-label">Recommended</span>' : ""}</div>
          <h3 class="card-title">${escapeHtml(candidate.title)}</h3>
        </div>
        <div class="score ${scoreClass}">${candidate.score}<small>${escapeHtml(candidate.reliability)}</small></div>
      </div>
      <div class="chips">
        <span class="chip">${escapeHtml(categoryLabel(candidate.category))}</span>
        <span class="chip">${escapeHtml(candidate.compatibility)}</span>
        <span class="chip valid">Exactly 1 match</span>
      </div>
      <div class="xpath-box"><code>${escapeHtml(candidate.xpath)}</code></div>
      <div class="card-explanation">${escapeHtml(candidate.explanation)}</div>
      ${risks}
      <div class="card-actions">
        <button class="button button-primary button-small" type="button" data-action="copy" data-index="${sourceIndex}">Copy</button>
        <button class="button button-secondary button-small" type="button" data-action="highlight" data-index="${sourceIndex}">Highlight</button>
        <button class="button button-secondary button-small" type="button" data-action="save" data-index="${sourceIndex}">Save</button>
      </div>
    </article>`;
}

async function updateLegacyVisibility() {
  state.showLegacyCandidates = elements.legacyToggle.checked;
  renderGenerated();
  renderCounts();
  try {
    await chrome.storage.local.set({ [SHOW_LEGACY_KEY]: state.showLegacyCandidates });
  } catch (error) {
    showToast(error.message || "The Blue Prism version preference could not be saved.", "error");
  }
}

function visibleCandidateEntries(selection) {
  const candidates = Array.isArray(selection?.candidates) ? selection.candidates : [];
  return candidates
    .map((candidate, sourceIndex) => ({ candidate, sourceIndex }))
    .filter(({ candidate }) => state.showLegacyCandidates || !isLegacyCandidate(candidate));
}

function isLegacyCandidate(candidate) {
  return candidate?.category === "legacy" || candidate?.compatibility === "Blue Prism 6.8";
}

async function onGeneratedAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const candidate = state.selection?.candidates?.[Number(button.dataset.index)];
  if (!candidate) return;
  if (button.dataset.action === "copy") {
    await copyText(candidate.xpath);
    showToast("XPath copied to clipboard.", "success");
  }
  if (button.dataset.action === "highlight") await highlightCandidate(candidate, currentSelectionScope());
  if (button.dataset.action === "save") await saveCandidate(candidate);
}

async function highlightCandidate(candidate, scope) {
  try {
    const response = await sendMessage({
      type: "PP_VALIDATE_XPATH",
      xpath: candidate.validationXPath || candidate.xpath,
      scope,
      highlight: true
    });
    showValidationToast(response, true);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function saveCandidate(candidate) {
  const selection = state.selection;
  if (!selection) return;
  const duplicate = state.saved.some(
    (item) =>
      item.xpath === candidate.xpath &&
      item.pageUrlBase === selection.pageUrlBase &&
      item.frameUrlBase === (selection.frame?.urlBase || "")
  );
  if (duplicate) {
    showToast("This XPath is already saved for the page.");
    return;
  }

  const label = selection.element?.label || selection.element?.tag || "Element";
  const saved = {
    id: makeId(),
    name: label,
    xpath: candidate.xpath,
    validationXPath: candidate.validationXPath || candidate.xpath,
    category: candidate.category,
    score: candidate.score,
    reliability: candidate.reliability,
    compatibility: candidate.compatibility,
    pageTitle: selection.pageTitle || state.activeTab?.title || "Untitled page",
    pageUrl: selection.pageUrl || state.activeTab?.url || "",
    pageUrlBase: selection.pageUrlBase || state.activeTab?.urlBase || "",
    frameIsFrame: Boolean(selection.frame?.isFrame),
    frameUrl: selection.frame?.url || "",
    frameUrlBase: selection.frame?.urlBase || "",
    elementSummary: selection.element?.summary || "Web element",
    createdAt: new Date().toISOString(),
    lastTestedAt: new Date().toISOString(),
    lastStatus: "valid",
    lastCount: 1
  };
  state.saved.unshift(saved);
  ensureWebsiteForSelector(saved);
  await persistSaved();
  renderSaved();
  renderCounts();
  showToast("XPath saved to the local library.", "success");
}

function renderSaved() {
  elements.savedCount.textContent = state.saved.length;
  elements.retestButton.disabled = state.retesting || !state.saved.length || !state.activeTab?.supported;
  elements.reloadRetestButton.disabled = state.retesting || !state.saved.length || !state.activeTab?.supported;
  elements.retestButton.textContent = state.retesting ? "Testing…" : "Retest page";
  elements.reloadRetestButton.textContent = state.retesting ? "Testing…" : "Reload + retest";

  const filtered = state.saved.filter((item) => {
    if (!state.search) return true;
    return [websiteNameFor(item), item.name, item.xpath, item.pageTitle, item.pageUrl, item.elementSummary]
      .join(" ")
      .toLowerCase()
      .includes(state.search);
  });

  if (!state.saved.length) {
    elements.savedContent.innerHTML = emptyState("No saved elements", "Save a generated XPath and it will be organised inside its webpage folder.");
    return;
  }
  if (!filtered.length) {
    elements.savedContent.innerHTML = emptyState("No search results", "Try another selector name, URL, or XPath fragment.");
    return;
  }

  const websites = groupSelectorsByWebsite(filtered);
  elements.savedContent.innerHTML = `<div class="saved-websites">${websites.map(websiteFolder).join("")}</div>`;
}

function websiteFolder(website) {
  const expanded = state.expandedWebsiteKey === website.key;
  const editing = state.editingWebsiteKey === website.key;
  const isCurrentPage = website.key === state.activeTab?.urlBase;
  const validCount = website.selectors.filter((item) => item.lastStatus === "valid").length;
  const attentionCount = website.selectors.filter((item) => ["missing", "multiple", "invalid"].includes(item.lastStatus)).length;
  const statusText = attentionCount
    ? `${attentionCount} need attention`
    : validCount === website.selectors.length
      ? "All passing"
      : `${website.selectors.length} saved`;
  return `
    <section class="website-folder ${expanded ? "is-expanded" : "is-collapsed"} ${isCurrentPage ? "is-current" : ""}" data-website-key="${escapeAttribute(website.key)}">
      <div class="website-header">
        ${editing
          ? `<div class="website-editing">
              <span class="folder-mark">${folderIcon()}</span>
              <label class="website-edit-field">
                <span class="sr-only">Website name</span>
                <input class="website-name" data-editor="website" data-website-key="${escapeAttribute(website.key)}" value="${escapeAttribute(website.name)}" aria-label="Website name">
                <span class="website-url">${escapeHtml(readableUrl(website.url))}</span>
              </label>
            </div>`
          : `<button class="website-open" type="button" data-action="toggle-website" data-website-key="${escapeAttribute(website.key)}" aria-expanded="${String(expanded)}">
              <span class="folder-mark">${folderIcon()}${chevronIcon()}</span>
              <span class="website-identity">
                <strong>${escapeHtml(website.name)}</strong>
                <span class="website-url">${escapeHtml(readableUrl(website.url))}</span>
              </span>
            </button>`}
        <div class="website-edit-actions">
          ${editing
            ? `<button class="edit-icon-button confirm" type="button" data-action="save-website-name" data-website-key="${escapeAttribute(website.key)}" aria-label="Save website name" title="Save website name">${checkIcon()}</button>
               <button class="edit-icon-button" type="button" data-action="cancel-website-name" aria-label="Cancel website rename" title="Cancel">${closeIcon()}</button>`
            : `<button class="edit-icon-button" type="button" data-action="edit-website-name" data-website-key="${escapeAttribute(website.key)}" aria-label="Rename ${escapeAttribute(website.name)}" title="Rename website">${penIcon()}</button>`}
        </div>
        <div class="website-totals">
          ${isCurrentPage ? '<em class="current-page-badge">Current</em>' : ""}
          <strong>${website.selectors.length}</strong>
          <span>${escapeHtml(statusText)}</span>
        </div>
      </div>
      <div class="website-elements" ${expanded ? "" : "hidden"}>
        ${website.selectors.map(savedCard).join("")}
      </div>
    </section>`;
}

function savedCard(item) {
  const status = item.lastStatus || "untested";
  const editing = state.editingElementId === item.id;
  const statusLabel = status === "valid" ? "1 match" : status === "multiple" ? `${item.lastCount || 2} matches` : status;
  const context = item.frameIsFrame ? `Iframe · ${readableUrl(item.frameUrl)}` : item.elementSummary || "Saved web element";
  return `
    <article class="saved-card" data-id="${item.id}">
      <div class="card-head">
        <div class="element-name-field">
          <span class="element-label">Element</span>
          ${editing
            ? `<div class="element-editing">
                <input class="saved-name" data-editor="element" data-id="${item.id}" value="${escapeAttribute(item.name)}" aria-label="Element name">
                <button class="edit-icon-button confirm" type="button" data-action="save-element-name" data-id="${item.id}" aria-label="Save element name" title="Save element name">${checkIcon()}</button>
                <button class="edit-icon-button" type="button" data-action="cancel-element-name" aria-label="Cancel element rename" title="Cancel">${closeIcon()}</button>
              </div>`
            : `<div class="element-name-row">
                <strong>${escapeHtml(item.name)}</strong>
                <button class="edit-icon-button" type="button" data-action="edit-element-name" data-id="${item.id}" aria-label="Rename ${escapeAttribute(item.name)}" title="Rename element">${penIcon()}</button>
              </div>`}
        </div>
        <span class="status-pill ${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="saved-context">${escapeHtml(context)}</div>
      <div class="chips">
        <span class="chip">${escapeHtml(item.compatibility || "Blue Prism 6.9+")}</span>
        <span class="chip">${escapeHtml(categoryLabel(item.category))}</span>
      </div>
      <div class="xpath-box"><code>${escapeHtml(item.xpath)}</code></div>
      <div class="saved-meta">
        <span>Saved ${escapeHtml(formatDate(item.createdAt))}</span>
        <span>${item.lastTestedAt ? `Tested ${escapeHtml(formatDate(item.lastTestedAt))}` : "Not retested"}</span>
      </div>
      <div class="card-actions">
        <button class="button button-primary button-small" data-action="copy" data-id="${item.id}" type="button">Copy</button>
        <button class="button button-secondary button-small" data-action="highlight" data-id="${item.id}" type="button">Highlight</button>
        <button class="button button-secondary button-small" data-action="retest" data-id="${item.id}" type="button">Retest</button>
        <button class="button button-secondary button-small delete-button" data-action="delete" data-id="${item.id}" type="button" aria-label="Delete selector">×</button>
      </div>
    </article>`;
}

async function onSavedAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "toggle-website") {
    const websiteKey = button.dataset.websiteKey;
    state.expandedWebsiteKey = state.expandedWebsiteKey === websiteKey ? "" : websiteKey;
    state.editingWebsiteKey = "";
    state.editingElementId = "";
    renderSaved();
    return;
  }
  if (button.dataset.action === "edit-website-name") {
    state.editingWebsiteKey = button.dataset.websiteKey;
    state.editingElementId = "";
    renderSaved();
    focusActiveEditor();
    return;
  }
  if (button.dataset.action === "save-website-name") {
    const input = button.closest(".website-header")?.querySelector("[data-editor=website]");
    await saveWebsiteName(button.dataset.websiteKey, input?.value);
    return;
  }
  if (button.dataset.action === "cancel-website-name") {
    state.editingWebsiteKey = "";
    renderSaved();
    return;
  }
  if (button.dataset.action === "edit-element-name") {
    state.editingElementId = button.dataset.id;
    state.editingWebsiteKey = "";
    renderSaved();
    focusActiveEditor();
    return;
  }
  if (button.dataset.action === "save-element-name") {
    const input = button.closest(".saved-card")?.querySelector("[data-editor=element]");
    await saveElementName(button.dataset.id, input?.value);
    return;
  }
  if (button.dataset.action === "cancel-element-name") {
    state.editingElementId = "";
    renderSaved();
    return;
  }
  const item = state.saved.find((selector) => selector.id === button.dataset.id);
  if (!item) return;
  const action = button.dataset.action;
  if (action === "copy") {
    await copyText(item.xpath);
    showToast("XPath copied to clipboard.", "success");
  }
  if (action === "highlight" || action === "retest") await validateSaved(item, true);
  if (action === "delete") {
    state.saved = state.saved.filter((selector) => selector.id !== item.id);
    pruneEmptyWebsites();
    await persistSaved();
    renderSaved();
    renderCounts();
    showToast("Saved selector deleted.");
  }
}

async function onSavedKeyDown(event) {
  if (!event.target.matches("[data-editor=website], [data-editor=element]")) return;
  if (event.key === "Enter") {
    event.preventDefault();
    if (event.target.dataset.editor === "website") await saveWebsiteName(event.target.dataset.websiteKey, event.target.value);
    else await saveElementName(event.target.dataset.id, event.target.value);
  }
  if (event.key === "Escape") {
    event.preventDefault();
    state.editingWebsiteKey = "";
    state.editingElementId = "";
    renderSaved();
  }
}

async function saveWebsiteName(websiteKey, value) {
  const website = state.websites[websiteKey];
  if (!website) return;
  website.name = String(value || "").trim().slice(0, 180) || website.defaultName || "Unnamed website";
  website.updatedAt = new Date().toISOString();
  state.editingWebsiteKey = "";
  await persistSaved();
  renderSaved();
  showToast("Website name updated.", "success");
}

async function saveElementName(id, value) {
  const item = state.saved.find((selector) => selector.id === id);
  if (!item) return;
  item.name = String(value || "").trim().slice(0, 180) || "Unnamed element";
  state.editingElementId = "";
  await persistSaved();
  renderSaved();
  showToast("Element name updated.", "success");
}

function focusActiveEditor() {
  requestAnimationFrame(() => {
    const input = elements.savedContent.querySelector("[data-editor=website], [data-editor=element]");
    input?.focus();
    input?.select();
  });
}

async function validateSaved(item, highlight) {
  item.lastStatus = "testing";
  renderSaved();
  let response;
  try {
    response = await sendMessage({
      type: "PP_VALIDATE_XPATH",
      xpath: item.validationXPath || item.xpath,
      scope: savedScope(item),
      highlight,
      highlightLabel: highlight ? item.name : ""
    });
    applyValidationResult(item, response);
    await persistSaved();
    renderSaved();
    showValidationToast(response, highlight);
  } catch (error) {
    item.lastStatus = "invalid";
    item.lastTestedAt = new Date().toISOString();
    await persistSaved();
    renderSaved();
    showToast(error.message, "error");
  }
  return response;
}

async function retestCurrentPage(reloadFirst) {
  if (state.retesting) return;
  state.retesting = true;
  renderSaved();
  try {
    if (reloadFirst) {
      showToast("Reloading the page before validation…");
      const reload = await sendMessage({ type: "PP_RELOAD_ACTIVE_TAB" });
      if (!reload.ok) throw new Error(reload.error || "The page could not be reloaded.");
      await refreshActiveContext();
    }

    const selectors = state.saved.filter((item) => item.pageUrlBase === state.activeTab?.urlBase);
    if (!selectors.length) {
      showToast("No saved selectors belong to this page.");
      return;
    }

    for (const item of selectors) item.lastStatus = "testing";
    renderSaved();
    await sendMessage({ type: "PP_CLEAR_HIGHLIGHTS" });
    const readinessDeadline = reloadFirst ? Date.now() + RELOAD_RETEST_READY_TIMEOUT_MS : 0;
    let passed = 0;
    for (const item of selectors) {
      try {
        const response = await validateForPageRetest(item, readinessDeadline);
        applyValidationResult(item, response);
        if (response.status === "valid") passed += 1;
      } catch (_) {
        item.lastStatus = "invalid";
        item.lastTestedAt = new Date().toISOString();
      }
      renderSaved();
    }
    await persistSaved();
    const failed = selectors.length - passed;
    showToast(
      failed
        ? `${passed} passed; ${failed} selector${failed === 1 ? "" : "s"} need attention. Found matches are labeled in red.`
        : `All ${passed} selectors passed and are labeled in red on the page.`,
      failed ? "error" : "success"
    );
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.retesting = false;
    renderSaved();
  }
}

async function validateForPageRetest(item, readinessDeadline) {
  const request = {
    type: "PP_VALIDATE_XPATH",
    xpath: item.validationXPath || item.xpath,
    scope: savedScope(item),
    preserveHighlights: true
  };

  while (readinessDeadline && Date.now() < readinessDeadline) {
    const readiness = await sendMessage({ ...request, highlight: false });
    if (!["missing", "multiple"].includes(readiness.status)) break;
    const remaining = readinessDeadline - Date.now();
    if (remaining <= 0) break;
    await waitForRetestRetry(Math.min(RELOAD_RETEST_RETRY_INTERVAL_MS, remaining));
  }

  return sendMessage({
    ...request,
    highlight: true,
    highlightLabel: item.name
  });
}

function waitForRetestRetry(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function applyValidationResult(item, response) {
  item.lastStatus = response.status || (response.ok ? "valid" : "invalid");
  item.lastCount = Number.isFinite(response.count) ? response.count : 0;
  item.lastTestedAt = new Date().toISOString();
  item.lastError = response.error || "";
}

function showValidationToast(response, highlighted) {
  if (response.status === "valid") {
    showToast(
      highlighted ? "Exactly one element matched and is highlighted in red." : "Retest passed just now: exactly one element matched.",
      "success"
    );
  } else if (response.status === "multiple") {
    showToast(`${response.count} elements matched. This XPath is not safe for Blue Prism.`, "error");
  } else if (response.status === "missing") {
    showToast("No element matched this XPath on the current page.", "error");
  } else {
    showToast(response.error || "The XPath could not be evaluated.", "error");
  }
}

async function copyLibrary() {
  if (!state.saved.length) {
    showToast("There are no saved selectors to copy.");
    return;
  }
  const payload = {
    schema: "prismpath-library",
    version: 2,
    exportedAt: new Date().toISOString(),
    websites: state.websites,
    selectors: state.saved
  };
  await copyText(JSON.stringify(payload, null, 2));
  showToast(`${state.saved.length} saved selector${state.saved.length === 1 ? "" : "s"} copied as JSON.`, "success");
}

async function readImportFile() {
  const file = elements.importFile.files?.[0];
  if (!file) return;
  if (file.size > 2_000_000) {
    showToast("The JSON file is larger than the 2 MB import limit.", "error");
    return;
  }
  elements.importJson.value = await file.text();
}

async function importLibrary() {
  try {
    const raw = JSON.parse(elements.importJson.value);
    const incoming = Array.isArray(raw) ? raw : raw?.selectors;
    if (!Array.isArray(incoming)) throw new Error("The JSON does not contain a selectors array.");
    if (incoming.length > 2000) throw new Error("A maximum of 2,000 selectors can be imported at once.");

    const importedWebsites = normaliseStoredWebsites(Array.isArray(raw) ? {} : raw?.websites);
    for (const [key, website] of Object.entries(importedWebsites)) {
      if (!state.websites[key]) state.websites[key] = website;
    }

    const existingKeys = new Set(state.saved.map(selectorKey));
    let imported = 0;
    for (const value of incoming) {
      const selector = normaliseImportedSelector(value);
      if (!selector || existingKeys.has(selectorKey(selector))) continue;
      state.saved.push(selector);
      ensureWebsiteForSelector(selector);
      existingKeys.add(selectorKey(selector));
      imported += 1;
    }
    await persistSaved();
    elements.importDialog.close();
    elements.importJson.value = "";
    elements.importFile.value = "";
    renderSaved();
    renderCounts();
    showToast(`${imported} selector${imported === 1 ? "" : "s"} imported; duplicates were skipped.`, "success");
  } catch (error) {
    showToast(error.message || "The JSON could not be imported.", "error");
  }
}

async function clearLibrary() {
  if (!state.saved.length) return;
  if (!confirm(`Delete all ${state.saved.length} saved selectors from this browser?`)) return;
  state.saved = [];
  state.websites = {};
  state.expandedWebsiteKey = "";
  state.editingWebsiteKey = "";
  state.editingElementId = "";
  await persistSaved();
  renderSaved();
  renderCounts();
  showToast("The saved selector library was deleted.");
}

function normaliseStoredSelector(value) {
  if (!value || typeof value !== "object" || typeof value.xpath !== "string" || !value.xpath.trim()) return null;
  return {
    ...value,
    id: safeString(value.id, 100) || makeId(),
    name: safeString(value.name, 180) || "Unnamed selector",
    xpath: safeString(value.xpath, 1200),
    validationXPath: safeString(value.validationXPath, 1200) || safeString(value.xpath, 1200),
    pageUrlBase: safeString(value.pageUrlBase, 1000),
    frameUrlBase: safeString(value.frameUrlBase, 1000),
    lastStatus: safeStatus(value.lastStatus)
  };
}

function normaliseImportedSelector(value) {
  const stored = normaliseStoredSelector(value);
  if (!stored?.xpath || !stored.pageUrlBase) return null;
  return {
    ...stored,
    id: makeId(),
    pageTitle: safeString(value.pageTitle, 300),
    pageUrl: safeString(value.pageUrl, 2000),
    frameIsFrame: Boolean(value.frameIsFrame),
    frameUrl: safeString(value.frameUrl, 2000),
    elementSummary: safeString(value.elementSummary, 300),
    category: safeString(value.category, 40) || "other",
    reliability: safeString(value.reliability, 40),
    compatibility: safeString(value.compatibility, 80) || "Blue Prism 6.9+",
    score: Math.max(0, Math.min(99, Number(value.score) || 0)),
    createdAt: validDate(value.createdAt) ? value.createdAt : new Date().toISOString(),
    lastTestedAt: "",
    lastStatus: "untested",
    lastCount: 0,
    lastError: ""
  };
}

function selectorKey(item) {
  return [item.xpath, item.pageUrlBase, item.frameUrlBase || ""].join("\u241f");
}

function groupSelectorsByWebsite(selectors) {
  const groups = new Map();
  for (const item of selectors) {
    const key = websiteKeyFor(item);
    if (!groups.has(key)) {
      const record = ensureWebsiteForSelector(item);
      groups.set(key, {
        key,
        name: record.name,
        url: record.pageUrl || item.pageUrl || item.pageUrlBase,
        selectors: []
      });
    }
    groups.get(key).selectors.push(item);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      selectors: group.selectors.sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0))
    }))
    .sort((first, second) => {
      const firstActive = first.key === state.activeTab?.urlBase ? 1 : 0;
      const secondActive = second.key === state.activeTab?.urlBase ? 1 : 0;
      if (firstActive !== secondActive) return secondActive - firstActive;
      const firstRecent = Math.max(...first.selectors.map((item) => new Date(item.createdAt || 0).getTime()));
      const secondRecent = Math.max(...second.selectors.map((item) => new Date(item.createdAt || 0).getTime()));
      return secondRecent - firstRecent;
    });
}

function websiteKeyFor(item) {
  return safeString(item?.pageUrlBase, 1000) || safeString(item?.pageUrl, 2000) || "unknown-page";
}

function websiteNameFor(item) {
  return ensureWebsiteForSelector(item).name;
}

function ensureWebsiteForSelector(item) {
  const key = websiteKeyFor(item);
  if (!state.websites[key]) {
    const defaultName = defaultWebsiteName(item);
    state.websites[key] = {
      name: defaultName,
      defaultName,
      pageUrl: safeString(item.pageUrl, 2000) || safeString(item.pageUrlBase, 1000),
      createdAt: validDate(item.createdAt) ? item.createdAt : new Date().toISOString(),
      updatedAt: ""
    };
  }
  return state.websites[key];
}

function ensureWebsitesForSelectors(selectors) {
  let changed = false;
  for (const item of selectors) {
    const key = websiteKeyFor(item);
    if (state.websites[key]) continue;
    ensureWebsiteForSelector(item);
    changed = true;
  }
  return changed;
}

function defaultWebsiteName(item) {
  const title = safeString(item?.pageTitle, 300).trim();
  if (title && !/^untitled (page|frame)$/i.test(title)) return title;
  try {
    return new URL(item?.pageUrl || item?.pageUrlBase).hostname || "Unnamed website";
  } catch (_) {
    return "Unnamed website";
  }
}

function normaliseStoredWebsites(value) {
  const websites = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return websites;
  for (const [key, record] of Object.entries(value)) {
    if (!key || ["__proto__", "prototype", "constructor"].includes(key) || !record || typeof record !== "object") continue;
    const defaultName = safeString(record.defaultName, 180) || safeString(record.name, 180) || "Unnamed website";
    websites[safeString(key, 1000)] = {
      name: safeString(record.name, 180) || defaultName,
      defaultName,
      pageUrl: safeString(record.pageUrl, 2000) || safeString(key, 1000),
      createdAt: validDate(record.createdAt) ? record.createdAt : new Date().toISOString(),
      updatedAt: validDate(record.updatedAt) ? record.updatedAt : ""
    };
  }
  return websites;
}

function pruneEmptyWebsites() {
  const used = new Set(state.saved.map(websiteKeyFor));
  for (const key of Object.keys(state.websites)) {
    if (!used.has(key)) delete state.websites[key];
  }
}

function currentSelectionScope() {
  return {
    isFrame: Boolean(state.selection?.frame?.isFrame),
    frameUrlBase: state.selection?.frame?.urlBase || ""
  };
}

function savedScope(item) {
  return {
    isFrame: Boolean(item.frameIsFrame),
    frameUrlBase: item.frameUrlBase || ""
  };
}

async function persistSaved() {
  await chrome.storage.local.set({ [SAVED_KEY]: state.saved, [SAVED_SITES_KEY]: state.websites });
}

function switchView(view) {
  state.currentView = view === "saved" ? "saved" : "generated";
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === state.currentView;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  elements.generatedView.hidden = state.currentView !== "generated";
  elements.savedView.hidden = state.currentView !== "saved";
}

function renderCounts() {
  elements.generatedCount.textContent = visibleCandidateEntries(state.selection).length;
  elements.savedCount.textContent = state.saved.length;
}

function emptyState(title, message) {
  return `<div class="empty-state"><div class="empty-icon">${targetIcon()}</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></div>`;
}

function targetIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3m18 0v3a2 2 0 0 1-2 2h-3M8 12h8m-4-4v8"/></svg>';
}

function folderIcon() {
  return '<svg class="folder-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.8c0-1 .8-1.8 1.8-1.8h4.1l2 2h7.3c1 0 1.8.8 1.8 1.8v8.4c0 1-.8 1.8-1.8 1.8H5.3c-1 0-1.8-.8-1.8-1.8V6.8Z"/></svg>';
}

function chevronIcon() {
  return '<svg class="folder-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg>';
}

function penIcon() {
  return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.9 4.1 3 3M4 16l.8-3.6 8.8-8.8a1.4 1.4 0 0 1 2 0l.8.8a1.4 1.4 0 0 1 0 2l-8.8 8.8L4 16Z"/></svg>';
}

function checkIcon() {
  return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.2 3.6 3.6L16 5.5"/></svg>';
}

function closeIcon() {
  return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>';
}

function categoryLabel(category) {
  const labels = {
    short: "Short form",
    compound: "Combined attributes",
    anchored: "Parent / child",
    relationship: "Relationship",
    text: "Text based",
    class: "Class based",
    absolute: "Long form",
    legacy: "Legacy Web Path"
  };
  return labels[category] || "XPath";
}

function readableUrl(value) {
  try {
    const url = new URL(value);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.hostname}${path}` || value;
  } catch (_) {
    return String(value || "Unknown page");
  }
}

function formatDate(value) {
  if (!validDate(value)) return "unknown";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function validDate(value) {
  return Boolean(value && !Number.isNaN(new Date(value).getTime()));
}

function safeStatus(value) {
  return ["untested", "testing", "valid", "missing", "multiple", "invalid"].includes(value) ? value : "untested";
}

function safeString(value, maximum) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `pp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response) throw new Error("PrismPath did not receive a response from the extension service.");
  if (response.ok === false && !response.status) throw new Error(response.error || "The extension action failed.");
  return response;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch (_) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function showToast(message, type) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast${type ? ` ${type}` : ""}`;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, type === "error" ? 5200 : 3400);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
