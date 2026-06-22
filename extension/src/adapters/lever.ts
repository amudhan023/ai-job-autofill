import type { ATSAdapter, FieldHandle } from "./types";
import { scoreSignals } from "./types";
import { discoverWithin } from "./discover";

/**
 * Lever — jobs.lever.co/{company}. Form class `application-form`.
 * Quirk: the submit button sits OUTSIDE the form element — we never touch it
 * (zero-mutation guarantee), so this is informational only.
 */
export class LeverAdapter implements ATSAdapter {
  platform = "lever" as const;

  score(): number {
    const host = location.hostname;
    return scoreSignals({
      urlMatch: host.endsWith("lever.co"),
      domFingerprint:
        !!document.querySelector(".application-form, form.application-form") ||
        !!document.querySelector('[class^="LV-"]'),
      htmlStructure: !!document.querySelector('input[name="resume"], .application-question'),
      cssHints: !!document.querySelector('[class*="lever"]'),
    });
  }

  discoverFields(): FieldHandle[] {
    const form =
      document.querySelector(".application-form") ??
      document.querySelector("form") ??
      document;
    return discoverWithin(form);
  }
}
