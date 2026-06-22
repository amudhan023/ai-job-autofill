import type { ATSAdapter } from "./types";
import type { ATSPlatform } from "@/shared/types";
import { GreenhouseAdapter } from "./greenhouse";
import { LeverAdapter } from "./lever";
import { AshbyAdapter } from "./ashby";

/** Detection threshold per the plan: 70+ triggers adapter load. */
export const DETECTION_THRESHOLD = 70;

const ADAPTERS: ATSAdapter[] = [
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new AshbyAdapter(),
];

export interface DetectionOutcome {
  platform: ATSPlatform;
  adapter: ATSAdapter | null;
  score: number;
}

/** Pick the highest-scoring adapter above threshold. */
export function detectATS(): DetectionOutcome {
  let best: { adapter: ATSAdapter; score: number } | null = null;
  for (const adapter of ADAPTERS) {
    const score = adapter.score();
    if (score >= DETECTION_THRESHOLD && (!best || score > best.score)) {
      best = { adapter, score };
    }
  }
  if (!best) return { platform: "unknown", adapter: null, score: 0 };
  return { platform: best.adapter.platform, adapter: best.adapter, score: best.score };
}
