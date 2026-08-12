(function initialisePrismPathEngine(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PrismPathEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPrismPathEngine() {
  "use strict";

  const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
  const CONTROL_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"]);
  const STABLE_ATTRIBUTE_PRIORITY = [
    "id",
    "data-testid",
    "data-test",
    "data-qa",
    "data-cy",
    "data-automation-id",
    "data-control-id",
    "name",
    "aria-label",
    "aria-labelledby",
    "placeholder",
    "title",
    "alt",
    "role",
    "type",
    "autocomplete",
    "href"
  ];

  const CATEGORY_LIMITS = {
    short: 4,
    compound: 3,
    anchored: 3,
    relationship: 3,
    text: 2,
    class: 1,
    absolute: 1,
    legacy: 1
  };

  function generate(element, options) {
    if (!isElement(element)) throw new TypeError("PrismPath requires a DOM element.");
    const documentNode = element.ownerDocument;
    const settings = { maxCandidates: 18, ...(options || {}) };
    const rootNode = element.getRootNode?.();
    if (rootNode && rootNode.nodeType !== 9) {
      return {
        candidates: [],
        diagnostics: { generated: 0, ambiguous: 0, mismatched: 0, invalid: 0, duplicates: 0 },
        warnings: [
          "This element is inside Shadow DOM. Standard XPath and Blue Prism Web Path/XPath cannot cross a shadow root reliably. No selector has been offered."
        ],
        unsupported: "shadow-dom",
        element: describeElement(element)
      };
    }

    const candidateMap = new Map();
    const diagnostics = { generated: 0, ambiguous: 0, mismatched: 0, invalid: 0, duplicates: 0 };
    const ignoredAttributes = findIgnoredAttributes(element);

    const add = (expression, details) => {
      const xpath = String(expression || "").trim();
      if (!xpath || xpath.length > 1200) return;
      diagnostics.generated += 1;

      let matches;
      try {
        matches = evaluate(xpath, documentNode);
      } catch (_) {
        diagnostics.invalid += 1;
        return;
      }
      if (matches.length !== 1) {
        diagnostics.ambiguous += 1;
        return;
      }
      if (matches[0] !== element) {
        diagnostics.mismatched += 1;
        return;
      }

      const candidate = makeCandidate(xpath, details);
      const existing = candidateMap.get(xpath);
      if (existing) {
        diagnostics.duplicates += 1;
        if (candidate.score > existing.score) candidateMap.set(xpath, candidate);
        return;
      }
      candidateMap.set(xpath, candidate);
    };

    addDirectAttributeCandidates(element, add);
    addCompoundAttributeCandidates(element, add);
    addClassCandidates(element, add);
    addTextCandidates(element, add);
    addLabelCandidates(element, add);
    addSiblingCandidates(element, add);
    addAnchoredCandidates(element, add);

    const absoluteXPath = getAbsoluteXPath(element);
    add(absoluteXPath, {
      title: "Full absolute XPath",
      category: "absolute",
      strategy: "absolute",
      baseScore: 43,
      explanation: "A complete DOM path. It is unique now, but any inserted wrapper or reordered sibling can break it.",
      compatibility: "Blue Prism 6.9+",
      risks: ["Depends on the full DOM structure", "Uses positional indexes"]
    });

    const absoluteCandidate = candidateMap.get(absoluteXPath);
    if (absoluteCandidate) {
      const legacyPath = getLegacyWebPath(element);
      candidateMap.set(`legacy:${legacyPath}`, {
        ...makeCandidate(legacyPath, {
          title: "Legacy structural Web Path",
          category: "legacy",
          strategy: "legacy-web-path",
          baseScore: 31,
          explanation:
            "Blue Prism 6.8-style structural Web Path. Browser validation uses the equivalent absolute XPath; confirm the legacy syntax in Application Modeller.",
          compatibility: "Blue Prism 6.8",
          risks: ["Legacy syntax", "Depends on the full DOM structure", "Verify in Blue Prism 6.8"]
        }),
        validationXPath: absoluteXPath,
        validationNote: "Validated through its equivalent absolute XPath.",
        matchCount: 1
      });
    }

    const sorted = Array.from(candidateMap.values()).sort(compareCandidates);
    const candidates = chooseDiverseCandidates(sorted, settings.maxCandidates).map((candidate, index) => ({
      ...candidate,
      rank: index + 1
    }));

    const warnings = [];
    if (ignoredAttributes.length) {
      warnings.push(`Ignored likely volatile attributes: ${ignoredAttributes.join(", ")}.`);
    }
    if (!candidates.some((candidate) => candidate.score >= 75)) {
      warnings.push("No high-confidence selector was found. Ask the web application team to add a stable test/automation attribute if possible.");
    }

    return {
      candidates,
      diagnostics,
      warnings,
      unsupported: "",
      element: describeElement(element)
    };
  }

  function addDirectAttributeCandidates(element, add) {
    const tag = xpathNodeTest(element);
    const attributes = getStableAttributes(element).slice(0, 10);
    for (const attribute of attributes) {
      const literal = toXPathLiteral(attribute.value);
      const expression = attribute.name === "id" ? `//*[@id=${literal}]` : `//${tag}[@${attribute.name}=${literal}]`;
      const details = attributeDetails(attribute.name);
      add(expression, {
        title: details.title,
        category: "short",
        strategy: `attribute:${attribute.name}`,
        baseScore: details.score,
        explanation: details.explanation,
        compatibility: "Blue Prism 6.9+",
        risks: details.risks
      });
    }
  }

  function addCompoundAttributeCandidates(element, add) {
    const tag = xpathNodeTest(element);
    const attributes = getStableAttributes(element)
      .filter((attribute) => attribute.name !== "id")
      .slice(0, 7);

    for (let first = 0; first < attributes.length; first += 1) {
      for (let second = first + 1; second < attributes.length; second += 1) {
        const pair = [attributes[first], attributes[second]];
        if (pair.every((attribute) => ["role", "type", "autocomplete"].includes(attribute.name))) continue;
        const predicates = pair.map(attributePredicate).join(" and ");
        add(`//${tag}[${predicates}]`, {
          title: "Combined stable attributes",
          category: "compound",
          strategy: "attribute-combination",
          baseScore: Math.min(94, 84 + pair.reduce((sum, attribute) => sum + attributeWeight(attribute.name), 0) / 20),
          explanation: `Combines @${pair[0].name} and @${pair[1].name}, reducing dependence on either attribute alone.`,
          compatibility: "Blue Prism 6.9+",
          risks: pair.some((attribute) => ["placeholder", "title", "alt"].includes(attribute.name))
            ? ["User-facing copy may change"]
            : []
        });
      }
    }

    if (attributes.length >= 3) {
      const triple = attributes.slice(0, 3);
      add(`//${tag}[${triple.map(attributePredicate).join(" and ")}]`, {
        title: "Three-attribute XPath",
        category: "compound",
        strategy: "attribute-combination",
        baseScore: 91,
        explanation: `Combines ${triple.map((attribute) => `@${attribute.name}`).join(", ")} for a deliberately strict match.`,
        compatibility: "Blue Prism 6.9+",
        risks: ["More attributes must remain unchanged"]
      });
    }
  }

  function addClassCandidates(element, add) {
    const tag = xpathNodeTest(element);
    const tokens = stableClassTokens(element).slice(0, 3);
    if (!tokens.length) return;

    for (const token of tokens) {
      add(`//${tag}[contains(concat(' ', normalize-space(@class), ' '), ${toXPathLiteral(` ${token} `)})]`, {
        title: "Stable class token",
        category: "class",
        strategy: "class-token",
        baseScore: 68,
        explanation: `Matches the complete CSS class token “${token}”, regardless of class ordering.`,
        compatibility: "Blue Prism 6.9+",
        risks: ["CSS classes are often changed during redesigns"]
      });
    }

    if (tokens.length >= 2) {
      const predicates = tokens
        .slice(0, 2)
        .map((token) => `contains(concat(' ', normalize-space(@class), ' '), ${toXPathLiteral(` ${token} `)})`)
        .join(" and ");
      add(`//${tag}[${predicates}]`, {
        title: "Combined class tokens",
        category: "class",
        strategy: "class-token-combination",
        baseScore: 73,
        explanation: "Uses two non-generated class tokens without depending on their order.",
        compatibility: "Blue Prism 6.9+",
        risks: ["CSS classes are implementation details"]
      });
    }
  }

  function addTextCandidates(element, add) {
    const text = getUsefulText(element);
    if (!text) return;
    const tag = xpathNodeTest(element);
    add(`//${tag}[normalize-space(.)=${toXPathLiteral(text)}]`, {
      title: "Exact visible text",
      category: "text",
      strategy: "exact-text",
      baseScore: isInteractive(element) ? 84 : 79,
      explanation: `Uses the element’s exact visible text: “${truncate(text, 54)}”.`,
      compatibility: "Blue Prism 6.9+",
      risks: ["Text can change through copy edits or localisation"]
    });

    if (text.length >= 12) {
      const distinctive = distinctiveTextFragment(text);
      if (distinctive && distinctive !== text) {
        add(`//${tag}[contains(normalize-space(.), ${toXPathLiteral(distinctive)})]`, {
          title: "Distinctive text fragment",
          category: "text",
          strategy: "partial-text",
          baseScore: 65,
          explanation: `Uses a shorter distinctive fragment: “${truncate(distinctive, 54)}”.`,
          compatibility: "Blue Prism 6.9+",
          risks: ["Partial text can become ambiguous", "Text can be localised"]
        });
      }
    }
  }

  function addLabelCandidates(element, add) {
    if (!CONTROL_TAGS.has(element.tagName)) return;
    const tag = xpathNodeTest(element);
    const labels = findLabels(element);
    for (const label of labels.slice(0, 3)) {
      const labelText = getLabelText(label, element);
      if (!labelText) continue;
      const labelExpression = `//LABEL[normalize-space(.)=${toXPathLiteral(labelText)}]`;

      if (label.contains(element)) {
        add(`${labelExpression}//${tag}`, {
          title: "Control inside its label",
          category: "relationship",
          strategy: "label-descendant",
          baseScore: 89,
          explanation: `Finds the control through the visible label “${truncate(labelText, 54)}”.`,
          compatibility: "Blue Prism 6.9+",
          risks: ["Label copy may change or be localised"]
        });
      }

      add(`${labelExpression}/following::${tag}[1]`, {
        title: "Label-to-control relationship",
        category: "relationship",
        strategy: "label-following-control",
        baseScore: 86,
        explanation: `Finds the first ${element.tagName.toLowerCase()} following the label “${truncate(labelText, 54)}”.`,
        compatibility: "Blue Prism 6.9+",
        risks: ["Depends on the label remaining before the control"]
      });

      if (label.nextElementSibling) {
        add(`${labelExpression}/following-sibling::${tag}[1]`, {
          title: "Label sibling relationship",
          category: "relationship",
          strategy: "label-sibling",
          baseScore: 88,
          explanation: `Uses “${truncate(labelText, 54)}” as a stable sibling anchor.`,
          compatibility: "Blue Prism 6.9+",
          risks: ["Depends on the local form layout"]
        });
      }
    }
  }

  function addSiblingCandidates(element, add) {
    const tag = xpathNodeTest(element);
    let sibling = element.previousElementSibling;
    let checked = 0;
    while (sibling && checked < 3) {
      const anchor = getUniqueAnchorExpression(sibling);
      if (anchor) {
        add(`${anchor}/following-sibling::${tag}[1]`, {
          title: "Previous-sibling anchor",
          category: "relationship",
          strategy: "sibling-anchor",
          baseScore: 81,
          explanation: `Locates the element relative to a unique ${sibling.tagName.toLowerCase()} immediately before it.`,
          compatibility: "Blue Prism 6.9+",
          risks: ["Depends on sibling order"]
        });
      }
      sibling = sibling.previousElementSibling;
      checked += 1;
    }
  }

  function addAnchoredCandidates(element, add) {
    const tag = xpathNodeTest(element);
    const targetAttributes = getStableAttributes(element).filter((attribute) => attribute.name !== "id").slice(0, 3);
    let ancestor = element.parentElement;
    let depth = 0;
    while (ancestor && ancestor !== element.ownerDocument.documentElement && depth < 7) {
      const anchor = getUniqueAnchorExpression(ancestor);
      if (anchor) {
        for (const attribute of targetAttributes.slice(0, 2)) {
          add(`${anchor}//${tag}[${attributePredicate(attribute)}]`, {
            title: "Stable ancestor + attribute",
            category: "anchored",
            strategy: "ancestor-descendant-attribute",
            baseScore: 88 - depth,
            explanation: `Scopes @${attribute.name} beneath a unique ${ancestor.tagName.toLowerCase()} ancestor.`,
            compatibility: "Blue Prism 6.9+",
            risks: ["Depends on the target remaining inside the same logical container"]
          });
        }

        const relativePath = getRelativeStructuralPath(ancestor, element);
        if (relativePath) {
          add(`${anchor}${relativePath}`, {
            title: "Stable ancestor + child path",
            category: "anchored",
            strategy: "ancestor-structural-path",
            baseScore: Math.max(61, 79 - depth * 2),
            explanation: `Starts from a unique ${ancestor.tagName.toLowerCase()} and follows only the local child structure.`,
            compatibility: "Blue Prism 6.9+",
            risks: ["Local wrapper or sibling changes can break the child path"]
          });
        }
      }
      ancestor = ancestor.parentElement;
      depth += 1;
    }
  }

  function getUniqueAnchorExpression(element) {
    const documentNode = element.ownerDocument;
    const tag = xpathNodeTest(element);
    const attributes = getStableAttributes(element).slice(0, 5);
    for (const attribute of attributes) {
      if (["type", "autocomplete"].includes(attribute.name)) continue;
      const expression = attribute.name === "id"
        ? `//*[@id=${toXPathLiteral(attribute.value)}]`
        : `//${tag}[${attributePredicate(attribute)}]`;
      if (isUniqueTo(expression, element, documentNode)) return expression;
    }

    for (let first = 0; first < attributes.length; first += 1) {
      for (let second = first + 1; second < attributes.length; second += 1) {
        const expression = `//${tag}[${attributePredicate(attributes[first])} and ${attributePredicate(attributes[second])}]`;
        if (isUniqueTo(expression, element, documentNode)) return expression;
      }
    }

    const text = getUsefulText(element);
    if (text) {
      const expression = `//${tag}[normalize-space(.)=${toXPathLiteral(text)}]`;
      if (isUniqueTo(expression, element, documentNode)) return expression;
    }
    return "";
  }

  function getStableAttributes(element) {
    const results = [];
    for (const name of STABLE_ATTRIBUTE_PRIORITY) {
      if (!element.hasAttribute(name)) continue;
      const value = normaliseWhitespace(element.getAttribute(name));
      if (!value || isLikelyVolatile(value, name)) continue;
      if (name === "href") {
        if (/^(javascript:|mailto:|tel:)/i.test(value) || value.length > 100) continue;
      }
      results.push({ name, value });
    }

    for (const attribute of Array.from(element.attributes || [])) {
      const name = attribute.name.toLowerCase();
      if (!name.startsWith("data-") || results.some((item) => item.name === name)) continue;
      if (!/(test|qa|automation|control|component|element|field|action)/i.test(name)) continue;
      const value = normaliseWhitespace(attribute.value);
      if (value && !isLikelyVolatile(value, name)) results.push({ name, value });
    }
    return results;
  }

  function findIgnoredAttributes(element) {
    const ignored = [];
    for (const name of STABLE_ATTRIBUTE_PRIORITY) {
      if (!element.hasAttribute(name)) continue;
      const value = normaliseWhitespace(element.getAttribute(name));
      if (value && isLikelyVolatile(value, name)) ignored.push(`@${name}`);
    }
    const classValue = element.getAttribute("class") || "";
    if (classValue && classValue.split(/\s+/).some(isVolatileClassToken)) ignored.push("generated class tokens");
    return Array.from(new Set(ignored));
  }

  function stableClassTokens(element) {
    return Array.from(new Set((element.getAttribute("class") || "").split(/\s+/)))
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && token.length <= 48 && !isVolatileClassToken(token));
  }

  function isLikelyVolatile(value, name) {
    const text = String(value || "").trim();
    if (!text || text.length > 160) return true;
    if (/^[0-9]{5,}$/.test(text)) return true;
    if (/[0-9]{8,}/.test(text)) return true;
    if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(text)) return true;
    if (/^[0-9a-f]{12,}$/i.test(text)) return true;
    if (/^[A-Za-z0-9_-]{20,}$/.test(text) && /[A-Z]/.test(text) && /[a-z]/.test(text) && /\d/.test(text)) return true;
    if (/^(ember|react-select|mui|mat|radix|headlessui|rc_select|downshift)-?\d+/i.test(text)) return true;
    if (/^:r[0-9a-z]+:$/i.test(text)) return true;
    if (/\b(?:19|20)\d{2}[-_]?\d{2}[-_]?\d{2}\b/.test(text)) return true;
    if (name === "id" && /(?:^|[-_:])\d{4,}(?:$|[-_:])/.test(text)) return true;
    if (name === "id" && /(?:^|[-_:])[0-9a-f]{8,}(?:$|[-_:])/i.test(text)) return true;
    return false;
  }

  function isVolatileClassToken(token) {
    const value = String(token || "");
    return (
      value.length < 3 ||
      value.length > 48 ||
      /(^|[-_])[a-f0-9]{6,}($|[-_])/i.test(value) ||
      /__[A-Za-z0-9_-]+__[A-Za-z0-9_-]{5,}$/.test(value) ||
      /^(css|sc|jss|jsx|emotion)-[a-z0-9]{5,}$/i.test(value) ||
      /\d{5,}/.test(value)
    );
  }

  function findLabels(element) {
    const labels = [];
    if (element.labels) labels.push(...Array.from(element.labels));
    const wrapping = element.closest?.("label");
    if (wrapping) labels.push(wrapping);
    if (element.id) {
      for (const label of Array.from(element.ownerDocument.querySelectorAll("label[for]"))) {
        if (label.htmlFor === element.id) labels.push(label);
      }
    }
    return Array.from(new Set(labels));
  }

  function getLabelText(label, control) {
    const clone = label.cloneNode(true);
    for (const nestedControl of Array.from(clone.querySelectorAll("input, textarea, select, button"))) nestedControl.remove();
    return sanitiseText(clone.textContent, 100) || sanitiseText(label.getAttribute("aria-label"), 100);
  }

  function getUsefulText(element) {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)) return "";
    const text = sanitiseText(element.textContent, 100);
    if (!text || text.length < 2) return "";
    if (element.children.length > 8) return "";
    return text;
  }

  function distinctiveTextFragment(text) {
    if (text.length <= 46) return text;
    const words = text.split(" ").filter(Boolean);
    let fragment = "";
    for (const word of words) {
      if ((`${fragment} ${word}`).trim().length > 46) break;
      fragment = `${fragment} ${word}`.trim();
    }
    return fragment.length >= 12 ? fragment : text.slice(0, 46).trim();
  }

  function describeElement(element) {
    const tag = element.tagName.toLowerCase();
    const type = element.getAttribute("type") || "";
    const role = element.getAttribute("role") || "";
    const label = getAccessibleName(element);
    const stableId = element.id && !isLikelyVolatile(element.id, "id") ? element.id : "";
    const pieces = [`<${tag}${type ? ` type=\"${type}\"` : ""}>`];
    if (label) pieces.push(label);
    return {
      tag,
      type,
      role,
      label,
      stableId,
      summary: pieces.join(" — ")
    };
  }

  function getAccessibleName(element) {
    const aria = sanitiseText(element.getAttribute("aria-label"), 80);
    if (aria) return aria;
    const labels = findLabels(element);
    if (labels.length) {
      const labelText = getLabelText(labels[0], element);
      if (labelText) return labelText;
    }
    const placeholder = sanitiseText(element.getAttribute("placeholder"), 80);
    if (placeholder) return placeholder;
    const alt = sanitiseText(element.getAttribute("alt"), 80);
    if (alt) return alt;
    const title = sanitiseText(element.getAttribute("title"), 80);
    if (title) return title;
    return getUsefulText(element) || "";
  }

  function getAbsoluteXPath(element) {
    const steps = [];
    let current = element;
    while (current && current.nodeType === 1) {
      steps.unshift(`${xpathNodeTest(current)}[${sameTypeIndex(current)}]`);
      current = current.parentElement;
    }
    return `/${steps.join("/")}`;
  }

  function getLegacyWebPath(element) {
    const steps = [];
    let current = element;
    while (current && current.nodeType === 1) {
      const name = current.localName.toUpperCase();
      steps.unshift(steps.length === 0 ? `${name}(${sameTypeIndex(current)})` : `${name}(${sameTypeIndex(current)})`);
      current = current.parentElement;
    }
    if (steps.length) steps[0] = steps[0].replace(/\(1\)$/, "");
    return steps.join("/");
  }

  function getRelativeStructuralPath(ancestor, element) {
    const steps = [];
    let current = element;
    while (current && current !== ancestor) {
      steps.unshift(`${xpathNodeTest(current)}[${sameTypeIndex(current)}]`);
      current = current.parentElement;
    }
    return current === ancestor ? `/${steps.join("/")}` : "";
  }

  function sameTypeIndex(element) {
    let index = 1;
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.localName === element.localName && sibling.namespaceURI === element.namespaceURI) index += 1;
      sibling = sibling.previousElementSibling;
    }
    return index;
  }

  function xpathNodeTest(element) {
    if (!element.namespaceURI || element.namespaceURI === HTML_NAMESPACE) return element.localName.toUpperCase();
    return `*[local-name()=${toXPathLiteral(element.localName)}]`;
  }

  function attributePredicate(attribute) {
    return `@${attribute.name}=${toXPathLiteral(attribute.value)}`;
  }

  function toXPathLiteral(value) {
    const text = String(value);
    if (!text.includes("'")) return `'${text}'`;
    if (!text.includes('"')) return `"${text}"`;
    const pieces = text.split("'");
    const args = [];
    pieces.forEach((piece, index) => {
      if (piece) args.push(`'${piece}'`);
      if (index < pieces.length - 1) args.push(`"'"`);
    });
    return `concat(${args.join(", ")})`;
  }

  function evaluate(xpath, documentNode) {
    const snapshot = documentNode.evaluate(xpath, documentNode, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const results = [];
    for (let index = 0; index < snapshot.snapshotLength; index += 1) results.push(snapshot.snapshotItem(index));
    return results;
  }

  function isUniqueTo(xpath, element, documentNode) {
    try {
      const results = evaluate(xpath, documentNode);
      return results.length === 1 && results[0] === element;
    } catch (_) {
      return false;
    }
  }

  function makeCandidate(xpath, details) {
    const indexCount = (xpath.match(/\[\d+\]/g) || []).length;
    const lengthPenalty = Math.min(10, Math.floor(xpath.length / 55));
    const indexPenalty = Math.min(20, indexCount * 3);
    const score = Math.max(1, Math.min(99, Math.round((details.baseScore || 50) - lengthPenalty - indexPenalty)));
    return {
      xpath,
      validationXPath: xpath,
      title: details.title || "XPath candidate",
      category: details.category || "other",
      strategy: details.strategy || "unknown",
      score,
      reliability: reliabilityLabel(score),
      explanation: details.explanation || "Validated against the selected element.",
      compatibility: details.compatibility || "Blue Prism 6.9+",
      risks: Array.from(new Set(details.risks || [])),
      matchCount: 1,
      length: xpath.length,
      indexCount
    };
  }

  function chooseDiverseCandidates(sorted, maximum) {
    const selected = [];
    const counts = {};
    for (const candidate of sorted) {
      const category = candidate.category || "other";
      const limit = CATEGORY_LIMITS[category] || 2;
      if ((counts[category] || 0) >= limit) continue;
      selected.push(candidate);
      counts[category] = (counts[category] || 0) + 1;
      if (selected.length >= maximum) break;
    }
    return selected.sort(compareCandidates);
  }

  function compareCandidates(first, second) {
    if (second.score !== first.score) return second.score - first.score;
    if (first.length !== second.length) return first.length - second.length;
    return first.xpath.localeCompare(second.xpath);
  }

  function attributeDetails(name) {
    const map = {
      id: ["Unique stable ID", 99, "Uses a non-generated HTML id, normally the strongest and fastest selector.", []],
      "data-testid": ["Automation test ID", 98, "Uses a purpose-built test identifier intended to remain stable across UI changes.", []],
      "data-test": ["Automation data attribute", 97, "Uses a purpose-built test attribute.", []],
      "data-qa": ["QA data attribute", 97, "Uses a purpose-built QA attribute.", []],
      "data-cy": ["Automation data attribute", 97, "Uses a purpose-built automation attribute.", []],
      "data-automation-id": ["Automation ID", 98, "Uses a purpose-built automation identifier.", []],
      name: ["Stable name attribute", 92, "Uses the control’s semantic name attribute.", []],
      "aria-label": ["Accessible name", 90, "Uses the element’s accessibility label.", ["Accessible copy can be localised"]],
      "aria-labelledby": ["Accessible label reference", 86, "Uses the element’s accessibility label reference.", ["Referenced IDs must remain stable"]],
      placeholder: ["Placeholder text", 82, "Uses the control’s placeholder text.", ["Placeholder copy can change or be localised"]],
      title: ["Title attribute", 82, "Uses the element’s title attribute.", ["Title copy can change"]],
      alt: ["Alternative text", 85, "Uses the element’s accessible alternative text.", ["Alternative text can be localised"]],
      role: ["ARIA role", 73, "Uses the element’s semantic ARIA role.", ["Roles are often shared by several elements"]],
      type: ["Input type", 69, "Uses the element’s input type.", ["Input types are usually not unique"]],
      autocomplete: ["Autocomplete purpose", 72, "Uses the control’s semantic autocomplete purpose.", []],
      href: ["Link destination", 78, "Uses the link’s declared destination.", ["Routes and query values can change"]]
    };
    const entry = map[name] || ["Stable data attribute", 92, `Uses the element’s @${name} attribute.`, []];
    return { title: entry[0], score: entry[1], explanation: entry[2], risks: entry[3] };
  }

  function attributeWeight(name) {
    return attributeDetails(name).score;
  }

  function reliabilityLabel(score) {
    if (score >= 90) return "Very high";
    if (score >= 78) return "High";
    if (score >= 62) return "Medium";
    return "Fragile";
  }

  function isInteractive(element) {
    return CONTROL_TAGS.has(element.tagName) || ["A", "OPTION"].includes(element.tagName) || element.hasAttribute("role");
  }

  function sanitiseText(value, maximumLength) {
    const text = normaliseWhitespace(value);
    if (!text || text.length > maximumLength || /[\r\n\t]/.test(String(value || ""))) return text.length <= maximumLength ? text : "";
    return text;
  }

  function normaliseWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function truncate(value, maximumLength) {
    const text = String(value || "");
    return text.length <= maximumLength ? text : `${text.slice(0, maximumLength - 1)}…`;
  }

  function isElement(value) {
    return Boolean(value && value.nodeType === 1 && value.ownerDocument);
  }

  return {
    generate,
    evaluate,
    toXPathLiteral,
    getAbsoluteXPath,
    getLegacyWebPath,
    isLikelyVolatile,
    stableClassTokens
  };
});
