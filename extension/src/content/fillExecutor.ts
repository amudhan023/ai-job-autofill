import type { UserProfile } from "@/shared/profile";
import type { FieldMatch, FillResult } from "@/shared/types";
import { evaluateField } from "@/rules/engine";
import { detectATS } from "@/adapters/registry";
import type { ATSAdapter, FieldHandle } from "@/adapters/types";
import {
  isComboboxInput,
  popupOptionsPanel,
  setComboboxValue,
  setContentEditableValue,
  setFileValue,
  setInputValue,
  setPopupListboxValue,
  setRadioOrCheckbox,
  setSelectValue,
} from "@/adapters/domFill";
import { loadResumeFile } from "@/storage/resumeFile";

/** Confidence floor below which we never auto-write (just badge it). */
const AUTOFILL_FLOOR = 0.7;

/** Default watch window for late/conditional fields after a fill pass (M2). */
const DEFAULT_SETTLE_MS = 1200;

/**
 * Handles from the most recent fill pass, keyed by fieldId, so follow-up
 * actions (AI drafts from the popup, M5) can target a specific control.
 * Reset on every detectAndFill.
 */
const lastHandles = new Map<string, FieldHandle>();

export function getLastHandle(fieldId: string): FieldHandle | undefined {
  return lastHandles.get(fieldId);
}

/**
 * Write a user-approved value (e.g. an AI draft) into a field from the last
 * fill pass. Same writers, same zero-mutation guarantee; bypasses the
 * never-clobber guard because the user explicitly asked for this write.
 */
export async function writeValueToField(fieldId: string, value: string): Promise<boolean> {
  const handle = lastHandles.get(fieldId);
  if (!handle || !value) return false;
  return writeField(handle, value);
}

export interface FillOptions {
  /**
   * After a successful fill pass, keep watching the DOM this long for
   * conditional fields rendered in reaction to the values we wrote
   * (e.g. "Yes" reveals a follow-up question). 0 disables the window.
   */
  settleMs?: number;
  /** Quiet period after a mutation burst before rescanning. */
  debounceMs?: number;
}

/**
 * Detect the ATS, evaluate every field, and fill the ones we're confident
 * about; then briefly watch for late-rendered fields and fill only those.
 * ZERO-MUTATION GUARANTEE: this function only writes input values (including
 * picking combobox options); it has no path that clicks submit or mutates the
 * form's submission.
 */
export async function detectAndFill(
  profile: UserProfile,
  opts: FillOptions = {},
): Promise<FillResult> {
  const { platform, adapter } = detectATS();
  const handles: FieldHandle[] = adapter ? adapter.discoverFields() : [];

  const matches: FieldMatch[] = [];
  const seen = new Set<HTMLElement>();
  let filled = 0;
  lastHandles.clear();

  for (const handle of handles) {
    seen.add(handle.element);
    lastHandles.set(handle.discovered.fieldId, handle);
    const match = evaluateField(handle.discovered, profile);
    matches.push(match);
    if (await writeMatch(handle, match)) filled++;
  }

  // Post-fill settle window: only worth watching when we actually wrote
  // something (conditional fields appear in reaction to our writes).
  const settleMs = opts.settleMs ?? DEFAULT_SETTLE_MS;
  if (adapter && filled > 0 && settleMs > 0) {
    filled += await fillLateFields(adapter, profile, seen, matches, settleMs, opts.debounceMs ?? 150);
  }

  return {
    platform,
    url: location.href,
    filledCount: filled,
    totalFields: matches.length,
    matches,
    timestamp: Date.now(),
  };
}

function shouldWrite(match: FieldMatch): boolean {
  return (
    match.value !== null &&
    match.confidence >= AUTOFILL_FLOOR &&
    !match.flags.includes("confirm")
  );
}

/**
 * Watch the DOM for fields that render after the fill pass (conditional
 * questions, async wizard steps) and fill only the not-yet-seen ones,
 * folding them into the same result. Resolves at the deadline; rescans are
 * debounced and incremental (per new element, never re-writing seen ones).
 */
function fillLateFields(
  adapter: ATSAdapter,
  profile: UserProfile,
  seen: Set<HTMLElement>,
  matches: FieldMatch[],
  settleMs: number,
  debounceMs: number,
): Promise<number> {
  return new Promise((resolve) => {
    let extra = 0;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let scanning = false;

    const run = async () => {
      if (scanning) return;
      scanning = true;
      for (const handle of adapter.discoverFields()) {
        if (seen.has(handle.element)) continue;
        seen.add(handle.element);
        lastHandles.set(handle.discovered.fieldId, handle);
        const match = evaluateField(handle.discovered, profile);
        matches.push(match);
        if (await writeMatch(handle, match)) extra++;
      }
      scanning = false;
    };

    const observer = new MutationObserver(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void run(), debounceMs);
    });
    observer.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      if (debounce) clearTimeout(debounce);
      resolve(extra);
    }, settleMs);
  });
}

/**
 * NEVER-CLOBBER GUARD (M4): a control that already holds a value — typed by
 * the user, restored by the browser, or filled on an earlier pass/page of a
 * multi-step application — is left untouched.
 */
function hasExistingValue(handle: FieldHandle): boolean {
  const { element, group } = handle;
  if (group) return group.some((input) => input.checked);
  const tag = element.tagName;
  if (tag === "SELECT") {
    // Index 0 is the default/placeholder option; anything beyond it is a choice.
    return (element as HTMLSelectElement).selectedIndex > 0;
  }
  if (tag === "INPUT" || tag === "TEXTAREA") {
    return (element as HTMLInputElement).value.trim().length > 0;
  }
  // Custom text widgets (contenteditable / role=textbox).
  return (element.textContent ?? "").trim().length > 0;
}

/** Top-level write decision for one evaluated field. */
async function writeMatch(handle: FieldHandle, match: FieldMatch): Promise<boolean> {
  // Resume attachment: gated on the stored file itself, not on the profile's
  // resumeFileName mirror — the bytes ARE the profile value for this field
  // (a missing upload still means no fill, preserving the no-blank-fill rule).
  if (match.ruleId === "resumeUpload" && handle.discovered.type === "file") {
    return attachResume(handle, match);
  }
  if (!shouldWrite(match)) return false;
  if (hasExistingValue(handle)) {
    match.reason = "Already has a value — left untouched.";
    match.alreadyHadValue = true;
    return false;
  }
  const ok = await writeField(handle, match.value as string);
  match.filled = ok;
  if (!ok) match.reason = "Matched with a value, but the control didn't accept the write.";
  return ok;
}

/** Attach the locally stored resume to a Resume/CV file input. */
async function attachResume(handle: FieldHandle, match: FieldMatch): Promise<boolean> {
  if (hasExistingValue(handle)) {
    match.reason = "Already has a file attached — left untouched.";
    match.alreadyHadValue = true;
    return false;
  }
  const file = await loadResumeFile();
  if (!file) {
    match.reason = "Resume field found — upload your resume in Options to auto-attach.";
    return false;
  }
  const ok = setFileValue(handle.element as HTMLInputElement, file);
  match.reason = ok ? `Attached ${file.name}.` : "Could not attach the resume file.";
  if (ok) {
    // Truthful popup summary: show the attached file with a green badge —
    // the engine-computed confidence was 0 whenever the profile mirror
    // (meta.resumeFileName) was empty, which no longer gates attachment.
    match.value = file.name;
    match.confidence = 0.95;
    match.tier = "high";
    match.filled = true;
  }
  return ok;
}

/** Write a single resolved value to its control using type-appropriate logic. */
async function writeField(handle: FieldHandle, value: string): Promise<boolean> {
  const { element, group } = handle;

  // tagName checks instead of instanceof: iframe-owned elements belong to a
  // different realm where instanceof against top-frame constructors fails.
  const tag = element.tagName;
  const inputType = (element as HTMLInputElement).type;

  if (tag === "INPUT" && inputType === "file") {
    return false; // file inputs only accept File objects (see tryWrite)
  }
  if (tag === "INPUT" && (inputType === "radio" || inputType === "checkbox")) {
    return group ? setRadioOrCheckbox(group, value) : false;
  }
  if (tag === "SELECT") {
    return setSelectValue(element as HTMLSelectElement, value);
  }
  if (popupOptionsPanel(element)) {
    return setPopupListboxValue(element, value);
  }
  if (tag === "INPUT" && isComboboxInput(element)) {
    return setComboboxValue(element as HTMLInputElement, value);
  }
  if (tag === "INPUT" || tag === "TEXTAREA") {
    setInputValue(element as HTMLInputElement | HTMLTextAreaElement, value);
    return true;
  }
  // Custom text widgets discovered in M2 (contenteditable / role=textbox).
  const editable = element.getAttribute("contenteditable");
  if ((editable !== null && editable !== "false") || element.getAttribute("role") === "textbox") {
    setContentEditableValue(element, value);
    return true;
  }
  return false;
}

/** Detection-only pass (no writes) for status display. */
export function detectOnly(): { platform: FillResult["platform"]; fieldCount: number } {
  const { platform, adapter } = detectATS();
  const count = adapter ? adapter.discoverFields().length : 0;
  return { platform, fieldCount: count };
}
