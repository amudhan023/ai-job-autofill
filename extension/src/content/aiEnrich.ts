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

/** Cap per page — one bounded request, no runaway token spend. */
const MAX_QUESTIONS = 15;
/** Budget for the whole enrichment; fills must not feel slower because of AI. */
const ENRICH_TIMEOUT_MS = 2500;

/** Fields worth asking about: unmatched, labeled, and not safety-blocked. */
export function selectUnmatched(matches: FieldMatch[]): FieldMatch[] {
  return matches
    .filter(
      (m) =>
        m.ruleId === null &&
        !m.flags.includes("blocklist") &&
        m.label.trim().length >= 5,
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
