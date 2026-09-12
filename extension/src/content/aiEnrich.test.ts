import { describe, it, expect, vi, beforeEach } from "vitest";
import { installChromeMock } from "@/test/chromeMock";
import { aiFillUnmatched, applyCategories, enrichWithAI, selectUnmatched } from "./aiEnrich";
import { detectAndFill } from "./fillExecutor";
import { emptyProfile } from "@/shared/profile";
import type { FillFieldSpec } from "@/api/client";
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

describe("aiFillUnmatched", () => {
  beforeEach(() => {
    installChromeMock();
  });

  /** A form whose two questions no deterministic rule can answer. */
  async function unmatchedForm(): Promise<FieldMatch[]> {
    document.body.innerHTML = `
      <form id="application_form" class="greenhouse-application">
        <label for="q1">Which shift pattern would you prefer to work?</label>
        <select id="q1">
          <option>Select an option</option>
          <option>Mornings</option>
          <option>Evenings</option>
        </select>
        <label for="q2">What interests you most about this team?</label>
        <textarea id="q2" maxlength="500"></textarea>
      </form>`;
    const result = await detectAndFill(emptyProfile(), { settleMs: 0 });
    return result.matches;
  }

  it("sends the page's own option list and writes the answers back", async () => {
    const matches = await unmatchedForm();
    const mock = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    let sent: { fields: FillFieldSpec[] } | undefined;
    mock.mockImplementation(async (msg: { fields: FillFieldSpec[] }) => {
      sent = msg;
      return {
        ok: true,
        suggestions: msg.fields.map((f) => ({
          field_id: f.field_id,
          value: f.options ? f.options[1] : "Because the team ships fast.",
          confidence: 0.9,
          category: "BEHAVIORAL",
        })),
      };
    });

    const written = await aiFillUnmatched(matches, "Backend engineer");

    const select = sent?.fields.find((f) => f.type === "select");
    expect(select?.options).toEqual(["Mornings", "Evenings"]); // placeholder dropped
    const essay = sent?.fields.find((f) => f.type === "textarea");
    expect(essay?.max_length).toBe(500);

    expect(written).toBe(2);
    expect((document.getElementById("q1") as HTMLSelectElement).value).toBe("Evenings");
    expect((document.getElementById("q2") as HTMLTextAreaElement).value).toBe(
      "Because the team ships fast.",
    );
    expect(matches.find((m) => m.fieldId === essay?.field_id)?.filled).toBe(true);
  });

  it("ignores suggestions below the auto-fill floor", async () => {
    const matches = await unmatchedForm();
    const mock = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    mock.mockImplementation(async (msg: { fields: FillFieldSpec[] }) => ({
      ok: true,
      suggestions: msg.fields.map((f) => ({
        field_id: f.field_id,
        value: "Mornings",
        confidence: 0.4,
        category: "BEHAVIORAL",
      })),
    }));

    expect(await aiFillUnmatched(matches)).toBe(0);
    expect((document.getElementById("q2") as HTMLTextAreaElement).value).toBe("");
  });

  it("leaves the page untouched when the backend is unreachable", async () => {
    const matches = await unmatchedForm();
    const mock = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    mock.mockRejectedValueOnce(new Error("no backend"));
    expect(await aiFillUnmatched(matches)).toBe(0);
  });
});
