import { describe, it, expect, beforeEach, vi } from "vitest";

/** Access the chrome mock installed by the global setup. */
function chromeMock() {
  return globalThis.chrome as unknown as {
    _messageHandlers: Array<
      (msg: unknown, sender: unknown, send: (r: unknown) => void) => boolean | void
    >;
    sidePanel: {
      setPanelBehavior: (opts: unknown) => Promise<void>;
      setOptions: ReturnType<typeof import("vitest").vi.fn>;
    };
  };
}

async function dispatch(message: unknown, sender: unknown = {}): Promise<unknown> {
  return new Promise((resolve) => {
    const handler = chromeMock()._messageHandlers[0];
    handler(message, sender, resolve);
  });
}

describe("background service worker — side panel wiring", () => {
  beforeEach(async () => {
    // The worker's listeners are installed as import-time side effects
    // against whatever chrome mock exists when the module first runs — a
    // dynamic import is cached, so without resetting the module registry a
    // later test would register against a chrome mock a previous test already
    // discarded. Force a fresh evaluation (and thus fresh listener
    // registration against THIS test's mock) every time.
    vi.resetModules();
    await import("./index");
  });

  it("enables the side panel for a tab that reports a fillable form", async () => {
    await dispatch({ type: "REPORT_PAGE_STATUS", hasForm: true }, { tab: { id: 42 } });
    expect(chromeMock().sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 42,
      path: "src/sidepanel/index.html",
      enabled: true,
    });
  });

  it("disables the side panel for a tab with no fillable form", async () => {
    await dispatch({ type: "REPORT_PAGE_STATUS", hasForm: false }, { tab: { id: 7 } });
    expect(chromeMock().sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 7, enabled: false });
  });

  it("does nothing when the sender has no tab (e.g. message from another extension page)", async () => {
    await dispatch({ type: "REPORT_PAGE_STATUS", hasForm: true }, {});
    expect(chromeMock().sidePanel.setOptions).not.toHaveBeenCalled();
  });
});

describe("background service worker — backend-unreachable UX (T6)", () => {
  beforeEach(async () => {
    vi.resetModules();
    await import("./index");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("REQUEST_AI_ANSWER surfaces a clear error when the backend is unreachable, without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const res = (await dispatch({
      type: "REQUEST_AI_ANSWER",
      question: "Describe a time...",
      jdSummary: "",
    })) as { ok: boolean; error?: string };
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Failed to fetch/);
  });

  it("REQUEST_AI_ANSWER succeeds against the zero-config localhost:8000 default (no backendUrl saved)", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        answer: "Drafted answer",
        confidence: 0.9,
        model: "m",
        category: "BEHAVIORAL",
        retrieved: [],
        stubbed: false,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const res = (await dispatch({
      type: "REQUEST_AI_ANSWER",
      question: "Describe a time...",
      jdSummary: "",
    })) as { ok: boolean; answer?: { answer: string } };
    expect(res.ok).toBe(true);
    expect(res.answer?.answer).toBe("Drafted answer");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/ai/answer",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("REQUEST_CLASSIFY_BATCH surfaces a clear error when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const res = (await dispatch({
      type: "REQUEST_CLASSIFY_BATCH",
      questions: ["Why do you want this role?"],
    })) as { ok: boolean; error?: string };
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Failed to fetch/);
  });
});
