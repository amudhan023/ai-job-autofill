/**
 * AI-assisted field understanding (M5).
 *
 * After a fill pass, fields no deterministic rule matched are classified in
 * ONE batched backend call ("what does this field represent?"). The result is
 * advisory: it annotates the match for the popup (`aiCategory`) and never
 * triggers a write — AI classification stays below the auto-fill floor by
 * construction because it assigns no value at all.
 */
import type { FieldMatch } from "@/shared/types";
import type { FillFieldSpec, FillSuggestion } from "@/api/client";
import { labelForControl } from "@/adapters/domFill";
import { getLastHandle, writeValueToField } from "./fillExecutor";

/** Cap per page — one bounded request, no runaway token spend. */
const MAX_QUESTIONS = 15;
/** Budget for the whole enrichment; fills must not feel slower because of AI. */
const ENRICH_TIMEOUT_MS = 2500;

/** Fields worth asking about: unmatched, labeled, and not safety-blocked. */
export function selectUnmatched(matches: FieldMatch[]): FieldMatch[] {
  return matches
    .filter(
      (m) => m.ruleId === null && !m.flags.includes("blocklist") && m.label.trim().length >= 5,
    )
    .slice(0, MAX_QUESTIONS);
}

/** Attach categories to the matches they were requested for (index-aligned). */
export function applyCategories(selected: FieldMatch[], categories: string[]): void {
  selected.forEach((match, i) => {
    const category = categories[i];
    if (!category) return;
    match.aiCategory = category;
    match.reason = `Unmatched — AI suggests: ${humanize(category)}. Review manually.`;
  });
}

function humanize(category: string): string {
  return category.toLowerCase().replace(/_/g, " ");
}

/**
 * Best-effort enrichment via the background worker. Silently no-ops when the
 * backend is unconfigured, slow, or failing — filling never depends on AI.
 */
export async function enrichWithAI(matches: FieldMatch[]): Promise<void> {
  const selected = selectUnmatched(matches);
  if (selected.length === 0) return;

  try {
    const response = (await Promise.race([
      chrome.runtime.sendMessage({
        type: "REQUEST_CLASSIFY_BATCH",
        questions: selected.map((m) => m.label.trim()),
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), ENRICH_TIMEOUT_MS)),
    ])) as { ok: boolean; categories?: string[] } | null;

    if (response?.ok && Array.isArray(response.categories)) {
      applyCategories(selected, response.categories);
    }
  } catch {
    // Backend unreachable — deterministic result stands on its own.
  }
}

// ---------------------------------------------------------------------------
// AI fill (Claude tool use) — the step beyond advisory badges.
//
// `enrichWithAI` above only names what a leftover field is. This asks the
// backend's /ai/fill endpoint for an actual VALUE, produced by Claude through
// a forced tool call so the reply is schema-checked rather than prose.
// Identity / work-auth / demographic / salary questions are dropped
// server-side before the model sees them, so this can never contradict
// "no LLM on structured fields".
// ---------------------------------------------------------------------------

/** Same bar the rule engine uses to auto-write (AUTOFILL_FLOOR). */
const AI_FILL_FLOOR = 0.7;
/** One request answers a whole page, so it gets a longer budget than badges. */
const FILL_TIMEOUT_MS = 20000;

/**
 * Describe one unanswered control for the backend, reading its option list off
 * the live DOM. `DiscoveredField` carries no options, so a select's choices and
 * a radio group's labels only exist on the page itself — and without them the
 * model would invent a choice the form cannot accept.
 */
export function toFillSpec(match: FieldMatch): FillFieldSpec {
  const spec: FillFieldSpec = {
    field_id: match.fieldId,
    label: match.label.trim(),
    type: match.type,
  };
  const handle = getLastHandle(match.fieldId);
  if (!handle) return spec;

  if (handle.group?.length) {
    spec.options = handle.group.map((input) => labelForControl(input)).filter(Boolean);
  } else if (handle.element.tagName === "SELECT") {
    spec.options = Array.from((handle.element as HTMLSelectElement).options)
      .map((o) => o.text.trim())
      .filter((t) => t.length > 0)
      .slice(1); // index 0 is the "Select…" placeholder
  }
  const maxLength = (handle.element as HTMLInputElement).maxLength;
  if (typeof maxLength === "number" && maxLength > 0) spec.max_length = maxLength;
  return spec;
}

/**
 * Ask Claude for values for the fields no rule matched, and write the ones it
 * is confident about. Best-effort: a missing backend, a timeout, or an empty
 * answer leaves the deterministic result exactly as it was.
 *
 * Returns how many fields were actually written.
 */
export async function aiFillUnmatched(matches: FieldMatch[], jdSummary = ""): Promise<number> {
  const selected = selectUnmatched(matches).filter((m) => !m.alreadyHadValue);
  if (selected.length === 0) return 0;

  type FillReply = { ok: boolean; suggestions?: FillSuggestion[] } | null;
  let response: FillReply = null;
  try {
    response = (await Promise.race([
      chrome.runtime.sendMessage({
        type: "REQUEST_AI_FILL",
        fields: selected.map(toFillSpec),
        jdSummary,
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), FILL_TIMEOUT_MS)),
    ])) as FillReply;
  } catch {
    return 0; // backend unreachable — deterministic result stands on its own.
  }
  if (!response?.ok || !Array.isArray(response.suggestions)) return 0;

  const byId = new Map(selected.map((m) => [m.fieldId, m]));
  let written = 0;
  for (const suggestion of response.suggestions) {
    const match = byId.get(suggestion.field_id);
    if (!match || suggestion.confidence < AI_FILL_FLOOR) continue;
    // skipIfFilled: this pass was never requested field-by-field, so it keeps
    // the never-clobber guarantee even though the popup's draft button doesn't.
    const ok = await writeValueToField(suggestion.field_id, suggestion.value, {
      skipIfFilled: true,
    });
    if (!ok) continue;
    match.value = suggestion.value;
    match.confidence = suggestion.confidence;
    match.tier = suggestion.confidence >= 0.9 ? "high" : "medium";
    match.aiCategory = suggestion.category;
    match.filled = true;
    match.reason = `Filled by Claude from your profile (${humanize(suggestion.category)}). Review before submitting.`;
    written++;
  }
  return written;
}
