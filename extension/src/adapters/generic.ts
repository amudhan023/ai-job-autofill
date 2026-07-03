import type { ATSAdapter, FieldHandle } from "./types";
import { discoverWithin } from "./discover";

/**
 * Generic adapter — the universal fallback (docs/ARCHITECTURE_REVIEW.md §2.1).
 *
 * When no ATS-specific adapter recognizes the page, this adapter makes the
 * engine work anyway: it scopes discovery to the densest <form> on the page
 * (cutting noise from search bars / newsletter signups) and falls back to the
 * whole document for form-less React/Vue apps.
 *
 * Safety is unchanged: the rule engine still only fills fields it can match
 * to a profile value above the confidence floor, so unmatched noise fields
 * are badged, never written.
 */
export class GenericAdapter implements ATSAdapter {
  platform = "generic" as const;

  /** Minimum fillable controls in a form before we scope discovery to it. */
  private static FORM_SCOPE_MIN = 3;

  /**
   * Generic detection never competes with real ATS adapters (their threshold
   * is 70); it reports a nominal score when the page has anything fillable so
   * the registry can use it as a fallback.
   */
  score(): number {
    return this.hasFillableFields() ? 10 : 0;
  }

  hasFillableFields(): boolean {
    return discoverWithin(document).length > 0;
  }

  discoverFields(): FieldHandle[] {
    let best: HTMLFormElement | null = null;
    let bestCount = 0;
    for (const form of Array.from(document.querySelectorAll("form"))) {
      const count = discoverWithin(form).length;
      if (count > bestCount) {
        best = form;
        bestCount = count;
      }
    }
    if (best && bestCount >= GenericAdapter.FORM_SCOPE_MIN) {
      return discoverWithin(best);
    }
    return discoverWithin(document);
  }
}
