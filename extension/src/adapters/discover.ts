import type { FieldHandle } from "./types";
import { inferType } from "./types";
import { labelForControl } from "./domFill";
import type { DiscoveredField } from "@/rules/engine";

let idCounter = 0;
function nextId(): string {
  return `field_${idCounter++}`;
}

/**
 * Generic field discovery within a root element. Adapters call this and may
 * tag results with `atsKnownField`/`adapterRuleId` for fields they recognize.
 *
 * Radio/checkbox controls are grouped by `name` so the engine can pick the
 * right option (Yes/No) rather than treating each input separately.
 */
export function discoverWithin(root: ParentNode = document): FieldHandle[] {
  const controls = Array.from(
    root.querySelectorAll<HTMLElement>("input, textarea, select"),
  ).filter(isFillable);

  const handles: FieldHandle[] = [];
  const radioGroups = new Map<string, HTMLInputElement[]>();

  for (const el of controls) {
    if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
      const name = el.name || labelForControl(el);
      const list = radioGroups.get(name) ?? [];
      list.push(el);
      radioGroups.set(name, list);
      continue;
    }
    handles.push(toHandle(el));
  }

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
  if (el instanceof HTMLInputElement) {
    const hidden = ["hidden", "submit", "button", "reset", "image", "file"];
    if (hidden.includes(el.type)) return false;
  }
  if ((el as HTMLInputElement).disabled) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
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
