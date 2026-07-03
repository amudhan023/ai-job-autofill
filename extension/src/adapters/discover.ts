import type { FieldHandle } from "./types";
import { inferType } from "./types";
import { labelForControl, popupOptionsPanel } from "./domFill";
import type { DiscoveredField } from "@/rules/engine";

let idCounter = 0;
function nextId(): string {
  return `field_${idCounter++}`;
}

/**
 * Native form controls plus custom text widgets (contenteditable rich-text
 * fields, ARIA textboxes). Comboboxes built on <input> are already covered by
 * the "input" selector; their special write path lives in domFill.
 */
const CONTROL_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]:not(input):not(textarea)',
  // Popup-listbox triggers (intl-tel-input country picker, select-only
  // comboboxes); kept only when their panel has pre-rendered options.
  "button[aria-controls]",
  '[role="combobox"]:not(input):not(select)',
].join(", ");

/**
 * Deep scan (M2): collect all query roots reachable from `root` — the root
 * itself, every open shadow root, and every same-origin iframe document.
 * Closed shadow roots and cross-origin frames are unreachable by design
 * (cross-origin frames are covered by the content script's own instance
 * running there via `all_frames`).
 */
function collectRoots(root: ParentNode): ParentNode[] {
  const roots: ParentNode[] = [root];
  const queue: ParentNode[] = [root];
  while (queue.length > 0) {
    const scope = queue.shift()!;
    for (const el of Array.from(scope.querySelectorAll<HTMLElement>("*"))) {
      // instanceof is realm-specific (fails for iframe-owned elements), so
      // detect by tag/property instead.
      if (el.shadowRoot) {
        roots.push(el.shadowRoot);
        queue.push(el.shadowRoot);
      }
      if (el.tagName === "IFRAME" || el.tagName === "FRAME") {
        try {
          const doc = (el as HTMLIFrameElement).contentDocument;
          if (doc?.body) {
            roots.push(doc);
            queue.push(doc);
          }
        } catch {
          // Cross-origin — handled by the frame's own content script.
        }
      }
    }
  }
  return roots;
}

function isTag(el: Element, tag: string): boolean {
  return el.tagName === tag;
}

function isRadioOrCheckbox(el: HTMLElement): el is HTMLInputElement {
  const type = (el as HTMLInputElement).type;
  return isTag(el, "INPUT") && (type === "radio" || type === "checkbox");
}

/**
 * Generic field discovery within a root element. Walks open shadow roots and
 * same-origin iframes (M2 deep scan). Adapters call this and may tag results
 * with `atsKnownField`/`adapterRuleId` for fields they recognize.
 *
 * Radio/checkbox controls are grouped by `name` (per root, so identical names
 * in different frames/shadow roots don't collide) so the engine can pick the
 * right option (Yes/No) rather than treating each input separately.
 */
export function discoverWithin(root: ParentNode = document): FieldHandle[] {
  const handles: FieldHandle[] = [];
  const radioGroups = new Map<string, HTMLInputElement[]>();

  collectRoots(root).forEach((scope, rootIndex) => {
    const controls = Array.from(
      scope.querySelectorAll<HTMLElement>(CONTROL_SELECTOR),
    ).filter(isFillable);

    for (const el of controls) {
      // Non-input triggers must prove they're a fillable listbox composite —
      // otherwise every menu button on the page would become a "field".
      if (
        (el.tagName === "BUTTON" || (el.tagName !== "INPUT" && el.getAttribute("role") === "combobox")) &&
        !popupOptionsPanel(el)
      ) {
        continue;
      }
      if (isRadioOrCheckbox(el)) {
        const key = `${rootIndex}::${el.name || labelForControl(el)}`;
        const list = radioGroups.get(key) ?? [];
        list.push(el);
        radioGroups.set(key, list);
        continue;
      }
      handles.push(toHandle(el));
    }
  });

  // One handle per radio/checkbox group (keyed on the group's shared label).
  for (const [, group] of radioGroups) {
    const representative = group[0];
    const label = groupLabel(group) || labelForControl(representative);
    const discovered: DiscoveredField = {
      fieldId: nextId(),
      label,
      placeholder: "",
      ariaLabel: representative.getAttribute("aria-label") ?? "",
      type: group.every((el) => el.type === "checkbox") ? "checkbox" : "radio",
      autocomplete: representative.getAttribute("autocomplete") ?? "",
      nameAttr: representative.name ?? "",
      idAttr: representative.id ?? "",
    };
    handles.push({ discovered, element: representative, group });
  }

  return handles;
}

function toHandle(el: HTMLElement): FieldHandle {
  const label = labelForControl(el);
  const discovered: DiscoveredField = {
    fieldId: nextId(),
    label,
    placeholder: el.getAttribute("placeholder") ?? "",
    ariaLabel: el.getAttribute("aria-label") ?? "",
    type: inferType(el),
    autocomplete: el.getAttribute("autocomplete") ?? "",
    nameAttr: el.getAttribute("name") ?? "",
    idAttr: el.getAttribute("id") ?? "",
    // Nearby text is a weak signal — only worth collecting when the field has
    // no label of its own (keeps discovery cheap and avoids noisy matches).
    nearbyText: label ? "" : nearbyText(el),
  };
  return { discovered, element: el };
}

/**
 * Weak-context signal: the closest preceding text block (question text,
 * section heading) for controls that have no associated label. Walks up to
 * four ancestors, scanning a few preceding siblings at each level for a
 * short text-bearing element that doesn't itself contain form controls.
 */
function nearbyText(el: HTMLElement): string {
  let node: HTMLElement | null = el;
  for (let depth = 0; depth < 4 && node; depth++) {
    let sib = node.previousElementSibling;
    let hops = 0;
    while (sib && hops < 3) {
      if (!sib.querySelector("input, textarea, select")) {
        const text = sib.textContent?.trim() ?? "";
        if (text.length >= 3 && text.length <= 160) return text;
      }
      sib = sib.previousElementSibling;
      hops++;
    }
    node = node.parentElement;
  }
  return "";
}

function isFillable(el: HTMLElement): boolean {
  if (isTag(el, "INPUT")) {
    // File inputs are discoverable since M6 (resume attachment).
    const hidden = ["hidden", "submit", "button", "reset", "image"];
    if (hidden.includes((el as HTMLInputElement).type)) return false;
  }
  if ((el as HTMLInputElement).disabled) return false;
  // Contenteditable variants: skip explicitly disabled editors.
  if (el.getAttribute("contenteditable") === "false") return false;
  if (el.getAttribute("aria-readonly") === "true") return false;
  // Use the element's own window — computed styles are per-document (iframes).
  const win = el.ownerDocument?.defaultView ?? window;
  const style = win.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") {
    // Exception: file inputs are routinely visually hidden behind styled
    // dropzones/buttons but still writable — keep them.
    return isTag(el, "INPUT") && (el as HTMLInputElement).type === "file";
  }
  return true;
}

/**
 * Find the question label for a radio/checkbox group.
 *
 * Priority:
 *  1. fieldset > legend  (most semantic)
 *  2. [role=radiogroup] aria-labelledby — common in React ATS forms (Ashby,
 *     Greenhouse). Resolves the referenced element's text.
 *  3. [role=radiogroup] aria-label
 *  4. Preceding sibling label/p/h* within the radiogroup's parent container
 *  5. Walk up to the grand-parent container and try step 4 again
 *  6. Fall back to labelForControl on the first input
 */
function groupLabel(group: HTMLInputElement[]): string {
  const first = group[0];

  // 1. fieldset > legend
  const fieldset = first.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  if (legend?.textContent) return legend.textContent.trim();

  // 2 & 3. [role=radiogroup] aria attributes
  const groupEl = first.closest("[role='radiogroup'],[role='group']");
  if (groupEl) {
    const labelledby = groupEl.getAttribute("aria-labelledby");
    if (labelledby) {
      const doc = first.ownerDocument ?? document;
      for (const id of labelledby.trim().split(/\s+/)) {
        const ref = doc.getElementById(id);
        if (ref?.textContent?.trim()) return ref.textContent.trim();
      }
    }
    const ariaLabel = groupEl.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();

    // 4. Preceding sibling within the radiogroup's parent
    const text = precedingTextSibling(groupEl, group);
    if (text) return text;
  }

  // 5. Walk up parent/grandparent of the first radio for a preceding label
  for (const ancestor of [first.parentElement, first.parentElement?.parentElement]) {
    if (!ancestor) continue;
    const text = precedingTextSibling(ancestor, group);
    if (text) return text;
  }

  return labelForControl(first);
}

/**
 * Look backwards through `el`'s siblings for text-bearing elements that are
 * NOT part of the radio group itself (i.e. they don't contain any group input).
 */
function precedingTextSibling(el: Element, group: HTMLInputElement[]): string {
  const parent = el.parentElement;
  if (!parent) return "";
  const kids = Array.from(parent.children);
  const idx = kids.indexOf(el);
  for (let i = idx - 1; i >= 0; i--) {
    const sib = kids[i];
    if (group.some((r) => sib.contains(r))) continue; // skip radio-option containers
    const text = sib.textContent?.trim() ?? "";
    if (text.length > 3) return text;
  }
  return "";
}

export function resetIdCounter(): void {
  idCounter = 0;
}
