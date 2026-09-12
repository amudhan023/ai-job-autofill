/**
 * Custom answers: user-written answers for screening questions no built-in
 * rule covers. Fixture questions are the real ones from the live Omada Health
 * Greenhouse posting (job-boards.greenhouse.io/omadahealth/jobs/7964775).
 */
import { describe, it, expect } from "vitest";
import { emptyProfile } from "@/shared/profile";
import { evaluateField, type DiscoveredField } from "./engine";

function field(partial: Partial<DiscoveredField>): DiscoveredField {
  return {
    fieldId: "f1",
    label: "",
    placeholder: "",
    ariaLabel: "",
    type: "select",
    ...partial,
  };
}

function profileWith(...pairs: Array<[string, string]>) {
  const p = emptyProfile();
  p.customAnswers = pairs.map(([match, answer]) => ({ match, answer }));
  return p;
}

describe("custom answers", () => {
  it("fills a screening question no rule covers", () => {
    const p = profileWith(["8+ years of professional software engineering", "Yes"]);
    const m = evaluateField(
      field({ label: "Do you have 8+ years of professional software engineering experience? *" }),
      p,
    );
    expect(m.ruleId).toBe("customAnswer");
    expect(m.value).toBe("Yes");
    expect(m.tier).toBe("high");
    expect(m.flags).toHaveLength(0);
  });

  it("matches case-insensitively", () => {
    const p = profileWith(["AWS in a production environment", "Yes"]);
    const m = evaluateField(
      field({ label: "Do you have experience working with aws in a PRODUCTION environment? *" }),
      p,
    );
    expect(m.value).toBe("Yes");
  });

  it("uses the first matching entry, so list order is priority order", () => {
    const p = profileWith(["LLM platform or orchestration framework", "Yes"], ["LLM", "No"]);
    const m = evaluateField(
      field({
        label:
          "Do you have hands-on experience with at least one LLM platform or orchestration framework (e.g., OpenAI, Anthropic, Bedrock, LangChain)? *",
      }),
      p,
    );
    expect(m.value).toBe("Yes");
  });

  it("leaves unrelated questions to the normal rules", () => {
    const p = profileWith(["8+ years", "Yes"]);
    p.personal.firstName = "Amudhan";
    const m = evaluateField(field({ label: "First Name", type: "text" }), p);
    expect(m.ruleId).toBe("firstName");
    expect(m.value).toBe("Amudhan");
  });

  it("wins over the blocklist — the user wrote this answer deliberately", () => {
    const p = profileWith(["Veteran Status", "I don't wish to answer"]);
    const m = evaluateField(field({ label: "Veteran Status:" }), p);
    expect(m.value).toBe("I don't wish to answer");
    expect(m.flags).not.toContain("blocklist");
  });

  it("wins over a confirm-flagged EEO rule", () => {
    const p = profileWith(["I identify my gender as", "I don't wish to answer"]);
    const m = evaluateField(field({ label: "I identify my gender as:" }), p);
    expect(m.value).toBe("I don't wish to answer");
    expect(m.flags).not.toContain("confirm");
  });

  it("ignores entries with a blank match or answer", () => {
    const p = profileWith(["", "Yes"], ["Veteran", ""]);
    const m = evaluateField(field({ label: "Veteran Status:" }), p);
    expect(m.ruleId).not.toBe("customAnswer");
  });

  it("matches on nearby text when the control has no label", () => {
    const p = profileWith(["worked on infrastructure, developer tools", "Yes"]);
    const m = evaluateField(
      field({
        label: "",
        nearbyText:
          "Have you worked on infrastructure, developer tools, or internal platform systems? *",
      }),
      p,
    );
    expect(m.value).toBe("Yes");
  });

  it("does not match a question the user never wrote an answer for", () => {
    const p = profileWith(["8+ years of professional software engineering", "Yes"]);
    const m = evaluateField(field({ label: "Do you speak Portuguese?" }), p);
    expect(m.ruleId).not.toBe("customAnswer");
  });
  // The live Greenhouse label is "…experience?\n\n*" — question text and the
  // user's pasted fragment never agree on whitespace, hence the normalization.
  it("matches the real live label despite its embedded newlines and * marker", () => {
    const p = profileWith(["8+ years of professional software engineering experience?", "Yes"]);
    const m = evaluateField(
      field({
        label: "Do you have 8+ years of professional software engineering experience?\n\n*",
      }),
      p,
    );
    expect(m.value).toBe("Yes");
  });
});
