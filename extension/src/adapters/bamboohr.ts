import type { ATSAdapter, FieldHandle } from "./types";
import { scoreSignals } from "./types";
import { discoverWithin } from "./discover";

/**
 * BambooHR — *.bamboohr.com/careers / *.bamboohr.com/jobs. Application forms
 * use `BambooHR-ATS-*` class hooks and predictable field ids.
 */
export class BambooHrAdapter implements ATSAdapter {
  platform = "bamboohr" as const;

  score(): number {
    const host = location.hostname;
    return scoreSignals({
      urlMatch: host.endsWith("bamboohr.com") || host.includes("bamboohr"),
      domFingerprint: !!document.querySelector("[class*='BambooHR-ATS'], [class*='bamboohr']"),
      htmlStructure: !!document.querySelector("form#applicationForm, [id^='field']"),
      cssHints: !!document.querySelector("[class*='fab-'], [class*='bamboo']"),
    });
  }

  discoverFields(): FieldHandle[] {
    const form =
      document.querySelector("form#applicationForm") ??
      document.querySelector("[class*='BambooHR-ATS']") ??
      document.querySelector("form") ??
      document;
    return discoverWithin(form);
  }
}
