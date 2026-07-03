/**
 * Data-driven platform hints (M6) — replaces the seven near-identical adapter
 * classes. A platform is described by detection selectors and preferred
 * discovery roots; one HintedAdapter interprets them. Adding an ATS is now a
 * data entry (and remote config can extend fingerprints without a release —
 * see applyRemoteHints).
 *
 * Detection scoring is unchanged from the class era: URL 30 / DOM 40 /
 * HTML 20 / CSS 10 with the 70 threshold in the registry.
 */
import type { ATSPlatform } from "@/shared/types";
import type { ATSAdapter, FieldHandle } from "./types";
import { scoreSignals } from "./types";
import { discoverWithin } from "./discover";
import type { RemoteAdapterConfig } from "./remoteConfig";

export interface PlatformHint {
  platform: Exclude<ATSPlatform, "unknown" | "generic">;
  /** Matched against location.hostname. */
  url: RegExp;
  /** DOM fingerprint selectors (strongest signal, 40 pts). */
  fingerprints: string[];
  /** HTML structure selectors (20 pts). */
  structure: string[];
  /** CSS-class hints (10 pts). */
  css: string[];
  /** Preferred discovery roots, most specific first. */
  roots: string[];
}

export const PLATFORM_HINTS: PlatformHint[] = [
  {
    platform: "greenhouse",
    url: /greenhouse/,
    fingerprints: ['[id^="field_order_"]', "#application_form", '[data-qa="greenhouse-form"]'],
    structure: ['input[id^="job_application_"]'],
    css: ['[class*="greenhouse"]'],
    roots: ["#application_form"],
  },
  {
    platform: "lever",
    url: /lever\.co$/,
    fingerprints: [".application-form", "form.application-form", '[class^="LV-"]'],
    structure: ['input[name="resume"]', ".application-question"],
    css: ['[class*="lever"]'],
    roots: [".application-form"],
  },
  {
    platform: "ashby",
    url: /ashbyhq\.com$/,
    fingerprints: ["[data-form-id]", '[class*="ashby"]'],
    structure: ["form[data-form-id]"],
    css: ['[class*="_form_"]'],
    roots: ["[data-form-id]"],
  },
  {
    platform: "workday",
    url: /myworkdayjobs\.com$|workday/,
    fingerprints: ["[data-automation-id]", '[class^="wdayApply"]', '[class*="WD-"]'],
    structure: ['[data-automation-id="applicationPage"]', '[data-automation-id="formField"]'],
    css: ['[class*="wd-"]', '[class*="workday"]'],
    roots: ['[data-automation-id="applicationPage"]'],
  },
  {
    platform: "icims",
    url: /icims/,
    // The iCIMS iframe itself is reached by the M2 deep scan (same-origin
    // frames) or by the frame's own content-script instance (all_frames).
    fingerprints: [".icims_content", "#icims_content", 'iframe[src*="icims"]'],
    structure: ['[id^="icims_"]', '[name^="icims_"]'],
    css: ['[class*="icims"]'],
    roots: [".icims_content", "#icims_content"],
  },
  {
    platform: "smartrecruiters",
    url: /smartrecruiters/,
    fingerprints: ["[data-test='application-form']", "[class*='smart-recruiters']", "[class*='sc-']"],
    structure: ["[data-field]", "form[name='applicationForm']"],
    css: ["[class*='smartrecruiters']"],
    roots: ["[data-test='application-form']"],
  },
  {
    platform: "bamboohr",
    url: /bamboohr/,
    fingerprints: ["[class*='BambooHR-ATS']", "[class*='bamboohr']"],
    structure: ["form#applicationForm", "[id^='field']"],
    css: ["[class*='fab-']", "[class*='bamboo']"],
    roots: ["form#applicationForm", "[class*='BambooHR-ATS']"],
  },
];

function anyMatch(selectors: string[]): boolean {
  return selectors.some((sel) => {
    try {
      return !!document.querySelector(sel);
    } catch {
      return false; // bad selector from remote config must never break detection
    }
  });
}

/** One adapter implementation interprets every platform's hint data. */
export class HintedAdapter implements ATSAdapter {
  readonly platform: ATSPlatform;

  constructor(private hint: PlatformHint) {
    this.platform = hint.platform;
  }

  score(): number {
    return scoreSignals({
      urlMatch: this.hint.url.test(location.hostname),
      domFingerprint: anyMatch(this.hint.fingerprints),
      htmlStructure: anyMatch(this.hint.structure),
      cssHints: anyMatch(this.hint.css),
    });
  }

  discoverFields(): FieldHandle[] {
    for (const sel of this.hint.roots) {
      const root = document.querySelector(sel);
      if (root) return discoverWithin(root);
    }
    const form = document.querySelector("form");
    return discoverWithin(form ?? document);
  }
}

/**
 * Merge remote-config additions into the bundled hints (hot updates without
 * an extension release). Only additive: extra fingerprints strengthen
 * detection; nothing can be removed remotely.
 */
export function applyRemoteHints(config: RemoteAdapterConfig): void {
  for (const entry of config.adapters) {
    const hint = PLATFORM_HINTS.find((h) => h.platform === entry.platform);
    if (!hint || !entry.extraFingerprints) continue;
    for (const sel of entry.extraFingerprints) {
      if (!hint.fingerprints.includes(sel)) hint.fingerprints.push(sel);
    }
  }
}
