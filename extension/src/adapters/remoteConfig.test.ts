import { describe, it, expect, vi, afterEach } from "vitest";
import { loadAdapterConfig, refreshConfig, BUNDLED_CONFIG } from "./remoteConfig";

describe("remote adapter config", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to bundled config when nothing is cached", async () => {
    const cfg = await loadAdapterConfig();
    expect(cfg.version).toBe(BUNDLED_CONFIG.version);
    expect(cfg.adapters.map((a) => a.platform)).toContain("workday");
  });

  it("returns cached config when it is newer than bundled", async () => {
    const chrome = globalThis.chrome as unknown as {
      storage: { local: { set: (i: Record<string, unknown>) => Promise<void> } };
    };
    await chrome.storage.local.set({
      adapterConfig: {
        version: 99,
        updatedAt: "2027-01-01",
        adapters: [{ platform: "greenhouse" }],
      },
    });
    const cfg = await loadAdapterConfig();
    expect(cfg.version).toBe(99);
  });

  it("caches a newer remote config on refresh", async () => {
    const remote = { version: 2, updatedAt: "2026-07-01", adapters: [{ platform: "lever" }] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => remote }) as unknown as Response),
    );
    const cfg = await refreshConfig("https://registry.example/adapters.json");
    expect(cfg.version).toBe(2);
    // and it should now be cached
    const cached = await loadAdapterConfig();
    expect(cached.version).toBe(2);
  });

  it("keeps current config when the registry fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response),
    );
    const cfg = await refreshConfig("https://registry.example/adapters.json");
    expect(cfg.version).toBe(BUNDLED_CONFIG.version);
  });
});
