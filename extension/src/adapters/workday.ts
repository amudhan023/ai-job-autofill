import type { ATSAdapter, FieldHandle } from "./types";
import { scoreSignals } from "./types";
import { discoverWithin } from "./discover";

/**
 * Workday — *.myworkdayjobs.com. The hardest adapter:
 *  - Multi-page wizard with session state; each step is a separate form render.
 *    We track the current step via the `data-automation-id` of the active panel
 *    so the popup can show progress, but we only ever fill the visible step.
 *  - React-controlled inputs: handled by domFill's native-setter path.
 *
 * Workday exposes stable `data-automation-id` attributes, which we prefer over
 * brittle class names for discovery.
 */
export class WorkdayAdapter implements ATSAdapter {
  platform = "workday" as const;

  score(): number {
    const host = location.hostname;
    return scoreSignals({
      urlMatch: host.endsWith("myworkdayjobs.com") || host.includes("workday"),
      domFingerprint:
        !!document.querySelector("[data-automation-id]") ||
        !!document.querySelector('[class^="wdayApply"], [class*="WD-"]'),
      htmlStructure: !!document.querySelector(
        '[data-automation-id="applicationPage"], [data-automation-id="formField"]',
      ),
      cssHints: !!document.querySelector('[class*="wd-"], [class*="workday"]'),
    });
  }

  /** Best-effort current step label for multi-page progress display. */
  currentStep(): string {
    const active =
      document.querySelector('[data-automation-id="progressBarActiveStep"]') ??
      document.querySelector('[aria-current="step"]');
    return active?.textContent?.trim() ?? "";
  }

  discoverFields(): FieldHandle[] {
    const panel =
      document.querySelector('[data-automation-id="applicationPage"]') ??
      document.querySelector("form") ??
      document;
    return discoverWithin(panel);
  }
}
