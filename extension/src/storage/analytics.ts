import type { ApplicationRecord, ATSPlatform } from "@/shared/types";

export interface AnalyticsSummary {
  totalApplications: number;
  totalFieldsFilled: number;
  totalFields: number;
  /** Overall structured fill rate in [0,1]. */
  fillRate: number;
  /** Share of fields that were AI free-text assists, in [0,1]. */
  aiAssistRate: number;
  byPlatform: Array<{ platform: ATSPlatform; count: number }>;
  last7Days: number;
  last30Days: number;
}

/** Compute dashboard analytics from local application history. Pure + testable. */
export function computeAnalytics(
  records: ApplicationRecord[],
  now: number = Date.now(),
): AnalyticsSummary {
  const totalApplications = records.length;
  const totalFieldsFilled = sum(records, (r) => r.fieldsFilled);
  const totalFields = sum(records, (r) => r.fieldsTotal);
  const totalAi = sum(records, (r) => r.aiAssisted ?? 0);

  const platformCounts = new Map<ATSPlatform, number>();
  for (const r of records) {
    platformCounts.set(r.platform, (platformCounts.get(r.platform) ?? 0) + 1);
  }
  const byPlatform = Array.from(platformCounts, ([platform, count]) => ({ platform, count })).sort(
    (a, b) => b.count - a.count,
  );

  const day = 24 * 60 * 60 * 1000;
  const last7Days = records.filter((r) => now - r.date <= 7 * day).length;
  const last30Days = records.filter((r) => now - r.date <= 30 * day).length;

  return {
    totalApplications,
    totalFieldsFilled,
    totalFields,
    fillRate: totalFields === 0 ? 0 : totalFieldsFilled / totalFields,
    aiAssistRate: totalFields === 0 ? 0 : totalAi / totalFields,
    byPlatform,
    last7Days,
    last30Days,
  };
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}
