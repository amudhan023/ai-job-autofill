import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock } from "@/test/chromeMock";
import {
  canAutoFill,
  currentScope,
  isFresh,
  loadSession,
  recordFill,
  summarize,
  type FillSessionState,
} from "./fillSession";

beforeEach(() => {
  installChromeMock();
});

function state(partial: Partial<FillSessionState> = {}): FillSessionState {
  const now = Date.now();
  return {
    scope: "https://example.com/careers",
    startedAt: now,
    updatedAt: now,
    pages: ["/careers/apply"],
    fieldsFilled: 5,
    autoFills: 0,
    ...partial,
  };
}

describe("currentScope", () => {
  it("binds sessions to origin + first path segment (multi-tenant ATS hosts)", () => {
    expect(
      currentScope({ origin: "https://boards.greenhouse.io", pathname: "/acme/jobs/123" }),
    ).toBe("https://boards.greenhouse.io/acme");
    expect(
      currentScope({ origin: "https://boards.greenhouse.io", pathname: "/other/jobs/9" }),
    ).not.toBe(
      currentScope({ origin: "https://boards.greenhouse.io", pathname: "/acme/jobs/123" }),
    );
  });
});

describe("session freshness and auto-fill bounds", () => {
  it("expires after 30 minutes of inactivity", () => {
    const now = Date.now();
    expect(isFresh(state({ updatedAt: now - 29 * 60_000 }), now)).toBe(true);
    expect(isFresh(state({ updatedAt: now - 31 * 60_000 }), now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
  });

  it("caps automatic fills at 10 per session", () => {
    expect(canAutoFill(state({ autoFills: 9 }))).toBe(true);
    expect(canAutoFill(state({ autoFills: 10 }))).toBe(false);
    expect(canAutoFill(null)).toBe(false);
  });
});

describe("recordFill / loadSession round-trip", () => {
  it("accumulates fields and distinct pages across passes", async () => {
    const scope = "https://jobs.example.com/apply";
    await recordFill(4, { auto: false, scope, page: "/apply/step1" });
    await recordFill(3, { auto: true, scope, page: "/apply/step2" });
    await recordFill(0, { auto: true, scope, page: "/apply/step2" }); // same page again

    const session = await loadSession(scope);
    expect(session).not.toBeNull();
    expect(session!.fieldsFilled).toBe(7);
    expect(session!.pages).toEqual(["/apply/step1", "/apply/step2"]);
    expect(session!.autoFills).toBe(2);
    expect(summarize(session)).toEqual({ pages: 2, fieldsFilled: 7 });
  });

  it("summarize of no session is undefined", () => {
    expect(summarize(null)).toBeUndefined();
  });
});
