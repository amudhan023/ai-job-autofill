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
    };
    handles.push({ discovered, element: representative, group });
  }

  return handles;
}

function toHandle(el: HTMLElement): FieldHandle {
  const discovered: DiscoveredField = {
    fieldId: nextId(),
    label: labelForControl(el),
    placeholder: el.getAttribute("placeholder") ?? "",
    ariaLabel: el.getAttribute("aria-label") ?? "",
    type: inferType(el),
  };
  return { discovered, element: el };
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
      for (const id of labelledby.trim().split(/\s+/)) {
        const ref = document.getElementById(id);
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
