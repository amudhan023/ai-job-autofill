import type { ATSAdapter } from "./types";
import type { ATSPlatform } from "@/shared/types";
import { HintedAdapter, PLATFORM_HINTS } from "./platforms";
import { GenericAdapter } from "./generic";

/** Detection threshold per the plan: 70+ triggers adapter load. */
export const DETECTION_THRESHOLD = 70;

const ADAPTERS: ATSAdapter[] = PLATFORM_HINTS.map((hint) => new HintedAdapter(hint));

export interface DetectionOutcome {
  platform: ATSPlatform;
  adapter: ATSAdapter | null;
  score: number;
}

const GENERIC = new GenericAdapter();

/**
 * Pick the highest-scoring ATS adapter above threshold. When none matches,
 * fall back to the universal generic adapter if the page has any fillable
 * fields — unrecognized career portals still get the full engine. "unknown"
 * now strictly means "nothing fillable on this page".
 */
export function detectATS(): DetectionOutcome {
  let best: { adapter: ATSAdapter; score: number } | null = null;
  for (const adapter of ADAPTERS) {
    const score = adapter.score();
    if (score >= DETECTION_THRESHOLD && (!best || score > best.score)) {
      best = { adapter, score };
    }
  }
  if (best) {
    return { platform: best.adapter.platform, adapter: best.adapter, score: best.score };
  }
  const genericScore = GENERIC.score();
  if (genericScore > 0) {
    return { platform: "generic", adapter: GENERIC, score: genericScore };
  }
  return { platform: "unknown", adapter: null, score: 0 };
}
