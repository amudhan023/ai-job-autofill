import { describe, it, expect, vi, afterEach } from "vitest";
import { BackendClient, checkBackendHealth, getBackendClient } from "./client";

function mockFetch(payload: unknown, ok = true, status = 200) {
  return vi.fn(
    async () =>
      ({
        ok,
        status,
        json: async () => payload,
      }) as unknown as Response,
  );
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
    const fetchMock = mockFetch({
      answer: "STAR",
      confidence: 0.85,
      model: "m",
      category: "BEHAVIORAL",
      retrieved: ["x"],
      stubbed: false,
    });
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

  it("passes an abort signal and surfaces a timeout error", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      // Simulate an aborted request.
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new BackendClient("https://api.example", 10);
    await expect(client.classify("q")).rejects.toThrow(/timed out/);
  });

  it("does NOT retry a timeout — retrying a slow backend only doubles the wait", async () => {
    const fetchMock = vi.fn(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new BackendClient("https://api.example", 10);
    await expect(client.classify("q")).rejects.toThrow(/timed out/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on a raw network error, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ category: "EDUCATION" }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const client = new BackendClient("https://api.example", 20_000, 1, 1);
    const res = await client.classify("q");
    expect(res.category).toBe("EDUCATION");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a 5xx response, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ category: "SALARY" }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const client = new BackendClient("https://api.example", 20_000, 1, 1);
    const res = await client.classify("q");
    expect(res.category).toBe("SALARY");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx response — retrying a client error can't help", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 422, json: async () => ({}) } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const client = new BackendClient("https://api.example", 20_000, 1, 1);
    await expect(client.classify("q")).rejects.toThrow(/422/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries on a persistent network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const client = new BackendClient("https://api.example", 20_000, 1, 1);
    await expect(client.classify("q")).rejects.toThrow(/Failed to fetch/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("checkBackendHealth", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports ok + aiEnabled from a reachable backend", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: "ok", ai_enabled: true }));
    const res = await checkBackendHealth("https://api.example");
    expect(res).toEqual({ ok: true, aiEnabled: true });
  });

  it("reports an error for an unreachable backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const res = await checkBackendHealth("https://api.example");
    expect(res).toEqual({ ok: false, error: "Failed to fetch" });
  });

  it("reports a timeout distinctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }),
    );
    const res = await checkBackendHealth("https://api.example", 10);
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/timed out/);
  });
});

describe("getBackendClient", () => {
  it("defaults to localhost:8000 when no backend URL is configured (matches loadBackendUrl's default)", async () => {
    const client = await getBackendClient();
    expect(client).toBeInstanceOf(BackendClient);
    expect((client as unknown as { baseUrl: string }).baseUrl).toBe("http://localhost:8000");
  });

  it("returns a client when a backend URL is stored", async () => {
    const chrome = globalThis.chrome as unknown as {
      storage: { local: { set: (i: Record<string, unknown>) => Promise<void> } };
    };
    await chrome.storage.local.set({ backendUrl: "https://api.example/" });
    const client = await getBackendClient();
    expect(client).toBeInstanceOf(BackendClient);
    expect((client as unknown as { baseUrl: string }).baseUrl).toBe("https://api.example");
  });
});
