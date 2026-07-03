import { describe, it, expect } from "vitest";
import { HintedAdapter, PLATFORM_HINTS, applyRemoteHints } from "./platforms";

describe("PLATFORM_HINTS data", () => {
  it("covers the seven supported ATS platforms", () => {
    expect(PLATFORM_HINTS.map((h) => h.platform).sort()).toEqual([
      "ashby",
      "bamboohr",
      "greenhouse",
      "icims",
      "lever",
      "smartrecruiters",
      "workday",
    ]);
  });
});

describe("HintedAdapter", () => {
  it("scopes discovery to the platform's preferred root", () => {
    document.body.innerHTML = `
      <form><input aria-label="Search" /></form>
      <div id="application_form">
        <div id="field_order_1"></div>
        <label for="fn">First Name</label><input id="fn" />
      </div>`;
    const greenhouse = new HintedAdapter(PLATFORM_HINTS.find((h) => h.platform === "greenhouse")!);
    const labels = greenhouse.discoverFields().map((h) => h.discovered.label);
    expect(labels).toContain("First Name");
    expect(labels).not.toContain("Search");
  });

  it("ignores invalid selectors from remote config instead of throwing", () => {
    document.body.innerHTML = `<div id="application_form"><div id="field_order_1"></div></div>`;
    const hint = { ...PLATFORM_HINTS.find((h) => h.platform === "greenhouse")! };
    hint.fingerprints = ["[[[not-a-selector", ...hint.fingerprints];
    expect(() => new HintedAdapter(hint).score()).not.toThrow();
    expect(new HintedAdapter(hint).score()).toBeGreaterThan(0);
  });
});

describe("applyRemoteHints", () => {
  it("adds extra fingerprints additively and idempotently", () => {
    const greenhouse = PLATFORM_HINTS.find((h) => h.platform === "greenhouse")!;
    const before = greenhouse.fingerprints.length;
    const config = {
      version: 2,
      updatedAt: "2026-07-03",
      adapters: [{ platform: "greenhouse", extraFingerprints: ["[data-new-gh-hook]"] }],
    };
    applyRemoteHints(config);
    applyRemoteHints(config); // second application must not duplicate
    expect(greenhouse.fingerprints).toContain("[data-new-gh-hook]");
    expect(greenhouse.fingerprints.length).toBe(before + 1);
  });

  it("ignores unknown platforms", () => {
    expect(() =>
      applyRemoteHints({
        version: 2,
        updatedAt: "2026-07-03",
        adapters: [{ platform: "totally-new-ats", extraFingerprints: ["[x]"] }],
      }),
    ).not.toThrow();
  });
});
