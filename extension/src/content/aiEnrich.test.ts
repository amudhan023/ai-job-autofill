import { describe, it, expect, vi, beforeEach } from "vitest";
import { installChromeMock } from "@/test/chromeMock";
import { applyCategories, enrichWithAI, selectUnmatched } from "./aiEnrich";
import type { FieldMatch } from "@/shared/types";

function match(partial: Partial<FieldMatch>): FieldMatch {
  return {
    fieldId: "f1",
    label: "",
    type: "text",
    ruleId: null,
    profilePath: null,
    value: null,
    confidence: 0,
    tier: "low",
    flags: [],
    reason: "No matching rule — needs attention.",
    ...partial,
  };
}

describe("selectUnmatched", () => {
  it("picks only unmatched, labeled, non-blocked fields", () => {
    const matches = [
      match({ fieldId: "a", label: "What is your favorite framework?" }),
      match({ fieldId: "b", label: "Email", ruleId: "email" }), // matched
      match({ fieldId: "c", label: "Gender", flags: ["blocklist"] }), // blocked
      match({ fieldId: "d", label: "Hm" }), // too short
    ];
    expect(selectUnmatched(matches).map((m) => m.fieldId)).toEqual(["a"]);
  });

  it("caps at 15 questions per page", () => {
    const matches = Array.from({ length: 30 }, (_, i) =>
      match({ fieldId: `f${i}`, label: `Custom question number ${i}?` }),
    );
    expect(selectUnmatched(matches)).toHaveLength(15);
  });
});

describe("applyCategories", () => {
  it("annotates matches with advisory categories, never values", () => {
    const m = match({ label: "Do you hold an active clearance?" });
    applyCategories([m], ["VISA_WORK_AUTH"]);
    expect(m.aiCategory).toBe("VISA_WORK_AUTH");
    expect(m.reason).toMatch(/AI suggests: visa work auth/i);
    expect(m.value).toBeNull();
    expect(m.confidence).toBe(0);
  });
});

describe("enrichWithAI", () => {
  beforeEach(() => {
    installChromeMock();
  });

  it("batches all unmatched labels into one background request", async () => {
    const mock = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce({ ok: true, categories: ["MOTIVATION", "SALARY"] });

    const a = match({ fieldId: "a", label: "Why do you want this role?" });
    const b = match({ fieldId: "b", label: "Desired compensation range?" });
    await enrichWithAI([a, b]);

    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledWith({
      type: "REQUEST_CLASSIFY_BATCH",
      questions: ["Why do you want this role?", "Desired compensation range?"],
    });
    expect(a.aiCategory).toBe("MOTIVATION");
    expect(b.aiCategory).toBe("SALARY");
  });

  it("no-ops silently when the backend is unavailable", async () => {
    const mock = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    mock.mockRejectedValueOnce(new Error("no backend"));
    const a = match({ fieldId: "a", label: "Why do you want this role?" });
    await enrichWithAI([a]);
    expect(a.aiCategory).toBeUndefined();
  });

  it("sends nothing when every field matched deterministically", async () => {
    const mock = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    await enrichWithAI([match({ label: "Email", ruleId: "email" })]);
    expect(mock).not.toHaveBeenCalled();
  });
});
