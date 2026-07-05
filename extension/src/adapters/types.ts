import type { ATSPlatform, FieldType } from "@/shared/types";
import type { DiscoveredField } from "@/rules/engine";

/** A live handle to a control on the page, paired with how to write it. */
export interface FieldHandle {
  discovered: DiscoveredField;
  element: HTMLElement;
  /** For radio/checkbox groups, all members. */
  group?: HTMLInputElement[];
}

export interface DetectionSignals {
  urlMatch: boolean;
  domFingerprint: boolean;
  htmlStructure: boolean;
  cssHints: boolean;
}

/**
 * An ATS adapter knows how to recognize its platform and enumerate the form
 * fields on the page. It never submits — only discovers and (via domFill) writes.
 */
export interface ATSAdapter {
  platform: ATSPlatform;
  /** Returns a 0–100 detection score for the current page. */
  score(): number;
  /** Enumerate fillable fields once detection passes threshold. */
  discoverFields(): FieldHandle[];
}

/** Weighted detection scoring per the plan: URL 30 / DOM 40 / HTML 20 / CSS 10. */
export function scoreSignals(s: DetectionSignals): number {
  return (
    (s.urlMatch ? 30 : 0) +
    (s.domFingerprint ? 40 : 0) +
    (s.htmlStructure ? 20 : 0) +
    (s.cssHints ? 10 : 0)
  );
}

export function inferType(el: HTMLElement): FieldType {
  // tagName checks instead of instanceof: elements owned by same-origin
  // iframes belong to a different realm, where instanceof always fails.
  if (el.tagName === "TEXTAREA") return "textarea";
  if (el.tagName === "SELECT") return "select";
  // Popup-listbox triggers (button/div + aria-controls options panel) behave
  // like selects; only validated composites reach here (see discoverWithin).
  if (
    el.tagName === "BUTTON" ||
    (el.getAttribute("role") === "combobox" && el.tagName !== "INPUT")
  ) {
    return "select";
  }
  // Custom text widgets (contenteditable rich text, ARIA textbox): treat
  // multiline editors as textarea, single-line ones as text.
  const editable = el.getAttribute("contenteditable");
  if ((editable !== null && editable !== "false") || el.getAttribute("role") === "textbox") {
    return el.getAttribute("aria-multiline") === "false" ? "text" : "textarea";
  }
  if (el.tagName === "INPUT") {
    // ARIA combobox inputs (react-select & co) pick from options — they are
    // selects semantically, not free text. Typing them "select" lets rules
    // that expect select/radio (work auth, "how did you hear") clear the
    // confidence floor on Greenhouse-style dropdown questions.
    if (
      el.getAttribute("role") === "combobox" ||
      el.getAttribute("aria-autocomplete") === "list" ||
      el.closest("[role='combobox']") !== null
    ) {
      return "select";
    }
    switch ((el as HTMLInputElement).type) {
      case "file":
        return "file";
      case "email":
        return "email";
      case "tel":
        return "tel";
      case "url":
        return "url";
      case "number":
        return "number";
      case "radio":
        return "radio";
      case "checkbox":
        return "checkbox";
      default:
        return "text";
    }
  }
  return "text";
}
