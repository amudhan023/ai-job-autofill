import { describe, it, expect } from "vitest";
import { evaluateField, type DiscoveredField } from "./engine";
import { emptyProfile } from "@/shared/profile";
import type { UserProfile } from "@/shared/profile";

/**
 * Real question set from a Greenhouse posting (Omada Health, job 8055515) —
 * the shapes this repo previously had no rule for: residency, a years-of-
 * experience gate that states its bar in the label, technology gates, and the
 * transgender self-ID question.
 */
const QUESTIONS = {
  residency: "Do you currently live in the United States?",
  yearsGate:
    "Do you have 5+ years of professional software engineering and/or data engineering experience?",
  pythonSql:
    "Do you have professional, hands-on experience using both Python and SQL to build production-grade data systems?",
  architectures:
    "Do you have hands-on experience with modern data architectures, such as data lakes, lakehouses, data warehouses, analytical datastores, and/or batch or real-time processing systems?",
  iac: "Do you have hands-on experience with infrastructure-as-code tools, such as Terraform, Pulumi, CloudFormation, or CDK?",
  genAI:
    "Have you applied Generative AI tools or technologies in a professional setting to improve engineering workflows, automation, analytics, or data-platform capabilities?",
  transgender: "I identify as transgender:",
  gender: "I identify my gender as:",
  orientation: "I identify my sexual orientation as:",
  race: "Which of the following best represents your racial or ethnic background: (Check more than one if that is how you identify)",
  veteran: "Veteran Status:",
  disability: "Do you identify as a person with a disability of any kind, visible or invisible?",
};

function field(label: string): DiscoveredField {
  return { fieldId: label, label, placeholder: "", ariaLabel: "", type: "select" };
}

function profile(overrides: (p: UserProfile) => void = () => {}): UserProfile {
  const p = emptyProfile();
  overrides(p);
  return p;
}

describe("Greenhouse/Omada screening questions", () => {
  it("maps each question to the expected rule", () => {
    const p = profile();
    expect(evaluateField(field(QUESTIONS.residency), p).ruleId).toBe("residesInUS");
    expect(evaluateField(field(QUESTIONS.yearsGate), p).ruleId).toBe("yearsExpThreshold");
    expect(evaluateField(field(QUESTIONS.pythonSql), p).ruleId).toBe("skillGate");
    expect(evaluateField(field(QUESTIONS.architectures), p).ruleId).toBe("skillGate");
    expect(evaluateField(field(QUESTIONS.iac), p).ruleId).toBe("skillGate");
    expect(evaluateField(field(QUESTIONS.genAI), p).ruleId).toBe("skillGate");
    expect(evaluateField(field(QUESTIONS.transgender), p).ruleId).toBe("transgender");
    expect(evaluateField(field(QUESTIONS.gender), p).ruleId).toBe("gender");
    expect(evaluateField(field(QUESTIONS.orientation), p).ruleId).toBe("lgbtqia");
    expect(evaluateField(field(QUESTIONS.race), p).ruleId).toBe("raceEthnicity");
  });

  it("keeps veteran and disability hard-blocked", () => {
    const p = profile();
    for (const label of [QUESTIONS.veteran, QUESTIONS.disability]) {
      const m = evaluateField(field(label), p);
      expect(m.flags).toContain("blocklist");
      expect(m.value).toBeNull();
    }
  });

  it("answers residency from the profile country", () => {
    const us = profile((p) => (p.personal.location.country = "United States"));
    expect(evaluateField(field(QUESTIONS.residency), us).value).toBe("Yes");
    const india = profile((p) => (p.personal.location.country = "India"));
    expect(evaluateField(field(QUESTIONS.residency), india).value).toBe("No");
    // Unset country must never guess a residency answer.
    expect(evaluateField(field(QUESTIONS.residency), profile()).value).toBeNull();
  });

  it("answers the years gate against the threshold in the label", () => {
    const senior = profile((p) => (p.meta.totalYearsExp = 8));
    expect(evaluateField(field(QUESTIONS.yearsGate), senior).value).toBe("Yes");
    const junior = profile((p) => (p.meta.totalYearsExp = 3));
    expect(evaluateField(field(QUESTIONS.yearsGate), junior).value).toBe("No");
    // totalYearsExp defaults to 0 — an unset profile must not answer "No".
    expect(evaluateField(field(QUESTIONS.yearsGate), profile()).value).toBeNull();
  });

  it("still writes the raw number for a plain years-of-experience field", () => {
    const p = profile((x) => (x.meta.totalYearsExp = 8));
    const m = evaluateField({ ...field("Years of experience"), type: "number" }, p);
    expect(m.ruleId).toBe("yearsExp");
    expect(m.value).toBe("8");
  });

  it("never auto-writes skill gates or self-ID answers", () => {
    const p = profile((x) => {
      x.skills.technical = ["Python", "SQL", "Terraform"];
      x.demographics.transgender = "No";
    });
    for (const label of [QUESTIONS.iac, QUESTIONS.pythonSql, QUESTIONS.transgender]) {
      expect(evaluateField(field(label), p).flags).toContain("confirm");
    }
  });

  it("answers skill gates from the technologies named in the question", () => {
    const p = profile((x) => (x.skills.technical = ["Python", "SQL", "Terraform", "dbt"]));
    expect(evaluateField(field(QUESTIONS.iac), p).value).toBe("Yes");
    expect(evaluateField(field(QUESTIONS.pythonSql), p).value).toBe("Yes");
    // No named technology overlaps the profile — must not volunteer a "No".
    const other = profile((x) => (x.skills.technical = ["Figma", "Photoshop"]));
    expect(evaluateField(field(QUESTIONS.iac), other).value).toBeNull();
    // No skills on file at all.
    expect(evaluateField(field(QUESTIONS.iac), profile()).value).toBeNull();
  });
});
