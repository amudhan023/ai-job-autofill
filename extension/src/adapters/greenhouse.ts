import type { ATSAdapter, FieldHandle } from "./types";
import { scoreSignals } from "./types";
import { discoverWithin } from "./discover";

/**
 * Greenhouse — boards.greenhouse.io / job-boards.greenhouse.io.
 * Custom question ids are numeric (`field_order_*`); we map via label text.
 * NOTE: file upload (resume) needs a simulated drag-and-drop event — handled
 * separately in Phase 1.5; not part of the text-fill path here.
 */
export class GreenhouseAdapter implements ATSAdapter {
  platform = "greenhouse" as const;

  score(): number {
    const host = location.hostname;
    return scoreSignals({
      urlMatch: /greenhouse\.io$/.test(host) || host.includes("greenhouse"),
      domFingerprint:
        !!document.querySelector('[id^="field_order_"]') ||
        !!document.querySelector('#application_form, [data-qa="greenhouse-form"]'),
      htmlStructure: !!document.querySelector('input[id^="job_application_"]'),
      cssHints: !!document.querySelector('[class*="greenhouse"]'),
    });
  }

  discoverFields(): FieldHandle[] {
    const form =
      document.querySelector("#application_form") ??
      document.querySelector("form") ??
      document;
    return discoverWithin(form);
  }
}
