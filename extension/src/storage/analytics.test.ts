import { describe, it, expect } from "vitest";
import { computeAnalytics } from "./analytics";
import type { ApplicationRecord } from "@/shared/types";

function rec(p: Partial<ApplicationRecord>): ApplicationRecord {
  return {
    id: Math.random().toString(),
    url: "https://x",
    company: "acme",
    platform: "greenhouse",
    date: Date.now(),
    fieldsFilled: 5,
    fieldsTotal: 10,
    aiAssisted: 1,
    ...p,
  };
}

describe("computeAnalytics", () => {
  it("returns zeros for an empty history", () => {
    const a = computeAnalytics([]);
    expect(a.totalApplications).toBe(0);
    expect(a.fillRate).toBe(0);
    expect(a.aiAssistRate).toBe(0);
  });

  it("computes fill and AI-assist rates across records", () => {
    const a = computeAnalytics([
      rec({ fieldsFilled: 8, fieldsTotal: 10, aiAssisted: 2 }),
      rec({ fieldsFilled: 6, fieldsTotal: 10, aiAssisted: 0 }),
    ]);
    expect(a.totalApplications).toBe(2);
    expect(a.totalFieldsFilled).toBe(14);
    expect(a.totalFields).toBe(20);
    expect(a.fillRate).toBeCloseTo(0.7, 5);
    expect(a.aiAssistRate).toBeCloseTo(0.1, 5);
  });

  it("aggregates and sorts by platform", () => {
    const a = computeAnalytics([
      rec({ platform: "greenhouse" }),
      rec({ platform: "greenhouse" }),
      rec({ platform: "lever" }),
    ]);
    expect(a.byPlatform[0]).toEqual({ platform: "greenhouse", count: 2 });
    expect(a.byPlatform[1]).toEqual({ platform: "lever", count: 1 });
  });

  it("counts recent windows relative to now", () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const a = computeAnalytics(
      [rec({ date: now - 2 * day }), rec({ date: now - 10 * day }), rec({ date: now - 40 * day })],
      now,
    );
    expect(a.last7Days).toBe(1);
    expect(a.last30Days).toBe(2);
  });
});
