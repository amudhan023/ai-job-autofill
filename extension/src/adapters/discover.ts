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
    const discovered: DiscoveredField = {
      fieldId: nextId(),
      label: groupLabel(group) || labelForControl(representative),
      placeholder: "",
      ariaLabel: representative.getAttribute("aria-label") ?? "",
      type: "radio",
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

/** Find a shared label for a radio group, e.g. the enclosing fieldset legend. */
function groupLabel(group: HTMLInputElement[]): string {
  const first = group[0];
  const fieldset = first.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  if (legend?.textContent) return legend.textContent.trim();
  const groupAria = first.closest("[role='radiogroup'],[role='group']");
  const aria = groupAria?.getAttribute("aria-label");
  if (aria) return aria.trim();
  return "";
}

export function resetIdCounter(): void {
  idCounter = 0;
}
