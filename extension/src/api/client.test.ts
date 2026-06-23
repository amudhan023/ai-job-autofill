import { describe, it, expect, vi, afterEach } from "vitest";
import { BackendClient, getBackendClient } from "./client";

function mockFetch(payload: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
  }) as unknown as Response);
}

describe("BackendClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts classify and returns the category", async () => {
    const fetchMock = mockFetch({ category: "BEHAVIORAL" });
    vi.stubGlobal("fetch", fetchMock);
    const client = new BackendClient("https://api.example");
    const res = await client.classify("Describe a time...");
    expect(res.category).toBe("BEHAVIORAL");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/ai/classify",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts an answer request with experience context", async () => {
    const fetchMock = mockFetch({ answer: "STAR", confidence: 0.85, model: "m", category: "BEHAVIORAL", retrieved: ["x"], stubbed: false });
    vi.stubGlobal("fetch", fetchMock);
    const client = new BackendClient("https://api.example");
    const res = await client.answer({ question: "q", jd_summary: "jd", experience: [] });
    expect(res.answer).toBe("STAR");
    expect(res.confidence).toBe(0.85);
  });

  it("throws on non-ok responses", async () => {
    vi.stubGlobal("fetch", mockFetch({}, false, 500));
    const client = new BackendClient("https://api.example");
    await expect(client.extractJD("text")).rejects.toThrow(/500/);
  });
});

describe("getBackendClient", () => {
  it("returns null when no backend URL is configured", async () => {
    expect(await getBackendClient()).toBeNull();
  });

  it("returns a client when a backend URL is stored", async () => {
    const chrome = globalThis.chrome as unknown as {
      storage: { local: { set: (i: Record<string, unknown>) => Promise<void> } };
    };
    await chrome.storage.local.set({ backendUrl: "https://api.example/" });
    const client = await getBackendClient();
    expect(client).toBeInstanceOf(BackendClient);
  });
});
