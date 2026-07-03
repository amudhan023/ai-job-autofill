import type { ATSAdapter } from "./types";
import type { ATSPlatform } from "@/shared/types";
import { GreenhouseAdapter } from "./greenhouse";
import { LeverAdapter } from "./lever";
import { AshbyAdapter } from "./ashby";
import { WorkdayAdapter } from "./workday";
import { IcimsAdapter } from "./icims";
import { SmartRecruitersAdapter } from "./smartrecruiters";
import { BambooHrAdapter } from "./bamboohr";
import { GenericAdapter } from "./generic";

/** Detection threshold per the plan: 70+ triggers adapter load. */
export const DETECTION_THRESHOLD = 70;

const ADAPTERS: ATSAdapter[] = [
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new AshbyAdapter(),
  new WorkdayAdapter(),
  new IcimsAdapter(),
  new SmartRecruitersAdapter(),
  new BambooHrAdapter(),
];

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
