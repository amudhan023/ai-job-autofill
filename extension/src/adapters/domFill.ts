/**
 * Low-level DOM writing utilities shared by all adapters.
 *
 * React-controlled inputs ignore `el.value = x`; they only react to the native
 * value setter followed by a dispatched InputEvent. These helpers do that so
 * fills register correctly on React/Vue ATS forms (Workday, Ashby, Greenhouse).
 */

const nativeInputSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)?.set;

const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype,
  "value",
)?.set;

const nativeSelectSetter = Object.getOwnPropertyDescriptor(
  window.HTMLSelectElement.prototype,
  "value",
)?.set;

export function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = el instanceof HTMLTextAreaElement ? nativeTextareaSetter : nativeInputSetter;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function setSelectValue(el: HTMLSelectElement, value: string): boolean {
  // Try exact value, then case-insensitive label match.
  const options = Array.from(el.options);
  const match =
    options.find((o) => o.value === value) ??
    options.find((o) => o.text.trim().toLowerCase() === value.trim().toLowerCase()) ??
    options.find((o) => o.text.trim().toLowerCase().includes(value.trim().toLowerCase()));
  if (!match) return false;
  if (nativeSelectSetter) {
    nativeSelectSetter.call(el, match.value);
  } else {
    el.value = match.value;
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export function setRadioOrCheckbox(
  group: HTMLInputElement[],
  desiredLabel: string,
): boolean {
  const target = group.find((input) => {
    const label = labelForControl(input).toLowerCase();
    return label.includes(desiredLabel.trim().toLowerCase());
  });
  if (!target) return false;
  target.checked = true;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/** Best-effort label text for a control (associated <label>, aria, placeholder). */
export function labelForControl(el: HTMLElement): string {
  const id = el.getAttribute("id");
  if (id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (lbl?.textContent) return lbl.textContent.trim();
  }
  const wrapping = el.closest("label");
  if (wrapping?.textContent) return wrapping.textContent.trim();
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const ref = document.getElementById(labelledby);
    if (ref?.textContent) return ref.textContent.trim();
  }
  return el.getAttribute("placeholder")?.trim() ?? "";
}
