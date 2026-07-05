/**
 * Low-level DOM writing utilities shared by all adapters.
 *
 * React-controlled inputs ignore `el.value = x`; they only react to the native
 * value setter followed by a dispatched InputEvent. These helpers do that so
 * fills register correctly on React/Vue ATS forms (Workday, Ashby, Greenhouse).
 *
 * M2: setters are resolved against the element's own realm (window), so
 * writes work on controls inside same-origin iframes, and label lookups are
 * scoped to the element's root node, so they work inside open shadow roots.
 */

/**
 * Native `value` setter from the element's own realm. Prototype descriptors
 * are per-window: an element owned by an iframe document needs that window's
 * setter, not the top frame's.
 */
function nativeValueSetter(el: HTMLElement): ((v: string) => void) | undefined {
  const win = (el.ownerDocument?.defaultView ?? window) as unknown as Record<
    string,
    { prototype: object } | undefined
  >;
  const ctor =
    el.tagName === "TEXTAREA"
      ? win.HTMLTextAreaElement
      : el.tagName === "SELECT"
        ? win.HTMLSelectElement
        : win.HTMLInputElement;
  const set = ctor && Object.getOwnPropertyDescriptor(ctor.prototype, "value")?.set;
  return set ? (v: string) => set.call(el, v) : undefined;
}

function dispatchInputAndChange(el: HTMLElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = nativeValueSetter(el);
  if (setter) {
    setter(value);
  } else {
    el.value = value;
  }
  dispatchInputAndChange(el);
}

export function setSelectValue(el: HTMLSelectElement, value: string): boolean {
  // Try exact value, then case-insensitive label match.
  const options = Array.from(el.options);
  const match =
    options.find((o) => o.value === value) ??
    options.find((o) => o.text.trim().toLowerCase() === value.trim().toLowerCase()) ??
    options.find((o) => o.text.trim().toLowerCase().includes(value.trim().toLowerCase()));
  if (!match) return false;
  const setter = nativeValueSetter(el);
  if (setter) {
    setter(match.value);
  } else {
    el.value = match.value;
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * Contenteditable / ARIA-textbox writer. Replaces the editor's text content
 * and dispatches an InputEvent so framework editors (Draft.js-lite, simple
 * rich-text wrappers) register the change. Never touches surrounding markup.
 */
export function setContentEditableValue(el: HTMLElement, value: string): void {
  el.focus?.();
  el.textContent = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Full pointer sequence — custom listboxes often listen on pointer/mousedown. */
function clickSequence(el: Element): void {
  for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  }
}

/**
 * Popup-listbox composite (M6.1): a non-input trigger (button / div) whose
 * aria-controls panel contains pre-rendered [role=option] items. This is how
 * intl-tel-input renders the phone country-code picker ("Change country,
 * selected United States (+1)") and how many design systems build select-only
 * comboboxes. Returns the options panel, or null when `el` isn't one.
 */
export function popupOptionsPanel(el: HTMLElement): Element | null {
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return null;
  if (tag !== "BUTTON" && el.getAttribute("role") !== "combobox") return null;
  const controlsId = el.getAttribute("aria-controls");
  if (!controlsId) return null;
  const scope = queryScopeFor(el);
  const panel = scope.querySelector(`[id="${CSS.escape(controlsId)}"]`);
  if (panel?.querySelector('[role="option"]')) return panel;
  return null;
}

/**
 * Drive a popup listbox: open the trigger, pick the option matching `value`
 * (exact → prefix → substring, so "United States" beats "United States Minor
 * Outlying Islands"), and click it. Selecting an option is a value choice;
 * the zero-mutation guarantee (never submit) is unaffected. If nothing
 * matches, the trigger is clicked again to close the panel.
 */
export async function setPopupListboxValue(
  trigger: HTMLElement,
  value: string,
  openWaitMs = 200,
): Promise<boolean> {
  const panel = popupOptionsPanel(trigger);
  if (!panel) return false;

  clickSequence(trigger); // open (also binds the widget's option listeners)
  await delay(openWaitMs);

  const wanted = value.trim().toLowerCase();
  const options = Array.from(panel.querySelectorAll<HTMLElement>('[role="option"]'));
  const text = (o: HTMLElement) => (o.textContent ?? "").trim().toLowerCase();
  const match =
    options.find((o) => text(o) === wanted) ??
    options.find((o) => text(o).startsWith(wanted)) ??
    options.find((o) => text(o).includes(wanted));

  if (!match) {
    clickSequence(trigger); // close — never leave a panel dangling open
    return false;
  }
  clickSequence(match);
  return true;
}

/** True when an input is the text entry of an ARIA combobox (react-select & co). */
export function isComboboxInput(el: HTMLElement): boolean {
  if (el.tagName !== "INPUT") return false;
  if (el.getAttribute("role") === "combobox") return true;
  if (el.getAttribute("aria-autocomplete") === "list") return true;
  return el.closest("[role='combobox']") !== null;
}

/**
 * ARIA combobox writer, verified against real react-select on
 * job-boards.greenhouse.io (2026-07-04). The real widget behaves differently
 * from naive expectations in two load-bearing ways:
 *
 *  1. Typing alone does NOT open the menu — programmatic input events set
 *     the filter text but `menuIsOpen` stays false. The menu opens on a
 *     mouse-down reaching the select CONTROL (our events bubble up from the
 *     input), after which options render.
 *  2. `aria-controls` (→ the listbox id) exists on the input ONLY WHILE the
 *     menu is open — it must be read after opening, never cached from
 *     discovery time.
 *
 * Option matching is strictly scoped to the combobox's own listbox
 * (aria-controls / aria-owns, else the nearest ancestor that contains
 * options). There is deliberately NO document-wide fallback: with multiple
 * widgets on a page it grabs a foreign list — e.g. "No" matching "Norway"
 * in the phone-country picker.
 *
 * Selecting an option is a value choice, not a form mutation — the
 * zero-mutation guarantee (never submit) is unaffected.
 */
export async function setComboboxValue(
  el: HTMLInputElement,
  value: string,
  optionWaitMs = 250,
): Promise<boolean> {
  el.focus?.();
  // Type first: filters the option list on searchable widgets, harmless on
  // non-searchable ones.
  setInputValue(el, value);

  // Open the menu unless something already did (never toggle it closed).
  if (el.getAttribute("aria-expanded") !== "true") {
    clickSequence(el);
  }
  await delay(optionWaitMs);

  const option = findComboboxOption(el, value);
  if (!option) {
    // Close what we opened so no menu is left dangling over the form.
    if (el.getAttribute("aria-expanded") === "true") {
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    }
    return false;
  }
  clickSequence(option);
  return true;
}

function findComboboxOption(input: HTMLInputElement, value: string): HTMLElement | null {
  const doc = input.ownerDocument ?? document;
  const scopes: ParentNode[] = [];

  // aria-controls / aria-owns points at the listbox (per the ARIA pattern) —
  // read fresh, post-open (react-select only sets it while the menu is open).
  const controlsId =
    input.getAttribute("aria-controls") ??
    input.getAttribute("aria-owns") ??
    input.closest("[role='combobox']")?.getAttribute("aria-controls");
  if (controlsId) {
    const listbox = doc.getElementById(controlsId);
    if (listbox) scopes.push(listbox);
  }

  // Fallback for widgets without aria-controls: nearest ancestor subtree that
  // contains options. Bounded walk — never the whole document, which would
  // cross into other widgets' option lists.
  if (scopes.length === 0) {
    let node: HTMLElement | null = input.parentElement;
    for (let depth = 0; depth < 5 && node; depth++) {
      if (node.querySelector("[role='option']")) {
        scopes.push(node);
        break;
      }
      node = node.parentElement;
    }
  }

  const wanted = value.trim().toLowerCase();
  const text = (o: HTMLElement) => (o.textContent ?? "").trim().toLowerCase();
  for (const scope of scopes) {
    const options = Array.from(scope.querySelectorAll<HTMLElement>("[role='option']"));
    const match =
      options.find((o) => text(o) === wanted) ??
      options.find((o) => text(o).startsWith(wanted)) ??
      options.find((o) => text(o).includes(wanted));
    if (match) return match;
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * File-input writer (M6): attach a File via DataTransfer (the only way to
 * set `input.files` programmatically) and fire the events dropzone wrappers
 * (react-dropzone, FilePond) listen for. Attaching a file is a value write;
 * the zero-mutation guarantee (never submit) is unaffected.
 */
export function setFileValue(input: HTMLInputElement, file: File): boolean {
  try {
    const win = (input.ownerDocument?.defaultView ?? window) as typeof window;
    const dt = new win.DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch {
    return false; // environment without DataTransfer — report unfilled
  }
  dispatchInputAndChange(input);
  return true;
}

export function setRadioOrCheckbox(group: HTMLInputElement[], desiredLabel: string): boolean {
  // Standard path: find the option whose label text includes the desired value.
  const target = group.find((input) => {
    const label = labelForControl(input).toLowerCase();
    return label.includes(desiredLabel.trim().toLowerCase());
  });
  if (target) {
    target.checked = true;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  // Consent/standalone checkbox: when all inputs are checkboxes and the desired
  // value is affirmative (yes/true/1), check all of them regardless of label text.
  // This covers cases like "Do you agree to be contacted?" where the checkbox
  // label IS the question rather than a short "Yes"/"No" option label.
  const isAffirmative = /^(yes|true|1)$/i.test(desiredLabel.trim());
  const allCheckboxes = group.every((el) => el.type === "checkbox");
  if (allCheckboxes && isAffirmative) {
    for (const cb of group) {
      cb.checked = true;
      cb.dispatchEvent(new Event("input", { bubbles: true }));
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }

  return false;
}

/**
 * The element's root as a queryable scope (document, shadow root, or detached
 * subtree). Duck-typed rather than instanceof — root nodes of iframe-owned
 * elements belong to a different realm where instanceof always fails.
 */
function queryScopeFor(el: HTMLElement): ParentNode {
  const rootNode = el.getRootNode() as ParentNode;
  if (typeof rootNode.querySelector === "function") return rootNode;
  return el.ownerDocument ?? document;
}

/** Best-effort label text for a control (associated <label>, aria, placeholder). */
export function labelForControl(el: HTMLElement): string {
  // Scope lookups to the element's root node (shadow root or document) so
  // label[for] and aria-labelledby resolve inside shadow DOM and iframes.
  const scope = queryScopeFor(el);

  const id = el.getAttribute("id");
  if (id) {
    const lbl = scope.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (lbl?.textContent) return lbl.textContent.trim();
  }
  const wrapping = el.closest("label");
  if (wrapping?.textContent) return wrapping.textContent.trim();
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const ref = scope.querySelector(`[id="${CSS.escape(labelledby)}"]`);
    if (ref?.textContent) return ref.textContent.trim();
  }
  return el.getAttribute("placeholder")?.trim() ?? "";
}
