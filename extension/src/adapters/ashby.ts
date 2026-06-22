import type { ATSAdapter, FieldHandle } from "./types";
import { scoreSignals } from "./types";
import { discoverWithin } from "./discover";

/**
 * Ashby — jobs.ashbyhq.com. Forms carry `[data-form-id]`; inputs are React-
 * controlled, so domFill's native-setter path is required. Submission is a JSON
 * XHR (`application_answers`); we do not intercept it in Phase 1.
 */
export class AshbyAdapter implements ATSAdapter {
  platform = "ashby" as const;

  score(): number {
    const host = location.hostname;
    return scoreSignals({
      urlMatch: host.endsWith("ashbyhq.com"),
      domFingerprint:
        !!document.querySelector("[data-form-id]") ||
        !!document.querySelector('[class*="ashby"]'),
      htmlStructure: !!document.querySelector("form _ashby, form[data-form-id]"),
      cssHints: !!document.querySelector('[class*="_form_"]'),
    });
  }

  discoverFields(): FieldHandle[] {
    const form =
      document.querySelector("[data-form-id]") ??
      document.querySelector("form") ??
      document;
    return discoverWithin(form);
  }
}
