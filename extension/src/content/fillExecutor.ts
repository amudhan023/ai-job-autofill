import type { UserProfile } from "@/shared/profile";
import type { FieldMatch, FillResult } from "@/shared/types";
import { evaluateField } from "@/rules/engine";
import { detectATS } from "@/adapters/registry";
import type { FieldHandle } from "@/adapters/types";
import {
  setInputValue,
  setRadioOrCheckbox,
  setSelectValue,
} from "@/adapters/domFill";

/** Confidence floor below which we never auto-write (just badge it). */
const AUTOFILL_FLOOR = 0.7;

/**
 * Detect the ATS, evaluate every field, and fill the ones we're confident about.
 * ZERO-MUTATION GUARANTEE: this function only writes input values; it has no
 * path that clicks submit or mutates the form's submission.
 */
export function detectAndFill(profile: UserProfile): FillResult {
  const { platform, adapter } = detectATS();
  const handles: FieldHandle[] = adapter ? adapter.discoverFields() : [];

  const matches: FieldMatch[] = [];
  let filled = 0;

  for (const handle of handles) {
    const match = evaluateField(handle.discovered, profile);
    matches.push(match);

    if (match.value !== null && match.confidence >= AUTOFILL_FLOOR && !match.flags.includes("confirm")) {
      if (writeField(handle, match)) filled++;
    }
  }

  return {
    platform,
    url: location.href,
    filledCount: filled,
    totalFields: handles.length,
    matches,
    timestamp: Date.now(),
  };
}

/** Write a single resolved value to its control using type-appropriate logic. */
function writeField(handle: FieldHandle, match: FieldMatch): boolean {
  const { element, group } = handle;
  const value = match.value;
  if (value === null) return false;

  if (element instanceof HTMLInputElement && (element.type === "radio" || element.type === "checkbox")) {
    return group ? setRadioOrCheckbox(group, value) : false;
  }
  if (element instanceof HTMLSelectElement) {
    return setSelectValue(element, value);
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    setInputValue(element, value);
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
