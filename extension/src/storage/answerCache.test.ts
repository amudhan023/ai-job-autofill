import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock } from "@/test/chromeMock";
import { getCachedAnswer, normalizeQuestion, putCachedAnswer } from "./answerCache";

beforeEach(() => {
  installChromeMock();
});

describe("normalizeQuestion", () => {
  it("ignores case, punctuation, and whitespace differences", () => {
    expect(normalizeQuestion("Why do you want to work here?")).toBe(
      normalizeQuestion("  why do you want to WORK here  "),
    );
  });
});

describe("answer cache", () => {
  it("round-trips an answer keyed on the normalized question", async () => {
    await putCachedAnswer("Why do you want to work here?", {
      answer: "Because of the mission.",
      category: "MOTIVATION",
      model: "claude-sonnet-5",
    });
    const hit = await getCachedAnswer("why do you want to work HERE");
    expect(hit?.answer).toBe("Because of the mission.");
    expect(hit?.category).toBe("MOTIVATION");
  });

  it("misses for unknown questions", async () => {
    expect(await getCachedAnswer("Describe a conflict you resolved")).toBeNull();
  });

  it("never caches empty answers", async () => {
    await putCachedAnswer("Why us?", { answer: "   ", category: "MOTIVATION", model: "m" });
    expect(await getCachedAnswer("Why us?")).toBeNull();
  });
});
