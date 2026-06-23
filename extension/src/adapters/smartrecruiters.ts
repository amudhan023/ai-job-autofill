import type { ATSAdapter, FieldHandle } from "./types";
import { scoreSignals } from "./types";
import { discoverWithin } from "./discover";

/**
 * SmartRecruiters — jobs.smartrecruiters.com / careers.smartrecruiters.com.
 * Standard React form; fields carry `data-test` / `data-field` hooks.
 */
export class SmartRecruitersAdapter implements ATSAdapter {
  platform = "smartrecruiters" as const;

  score(): number {
    const host = location.hostname;
    return scoreSignals({
      urlMatch: host.endsWith("smartrecruiters.com") || host.includes("smartrecruiters"),
      domFingerprint:
        !!document.querySelector("[data-test='application-form'], [class*='smart-recruiters']") ||
        !!document.querySelector("[class*='sc-']"),
      htmlStructure: !!document.querySelector("[data-field], form[name='applicationForm']"),
      cssHints: !!document.querySelector("[class*='smartrecruiters']"),
    });
  }

  discoverFields(): FieldHandle[] {
    const form =
      document.querySelector("[data-test='application-form']") ??
      document.querySelector("form") ??
      document;
    return discoverWithin(form);
  }
}
