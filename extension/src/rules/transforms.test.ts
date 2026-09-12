import { describe, it, expect } from "vitest";
import { boolToYesNo, toFullName, toCityState, skillsMatchLabel } from "./transforms";

describe("boolToYesNo", () => {
  it("returns Yes for truthy values", () => {
    expect(boolToYesNo(true)).toBe("Yes");
    expect(boolToYesNo(1)).toBe("Yes");
    expect(boolToYesNo("x")).toBe("Yes");
  });
  it("returns No for falsy values", () => {
    expect(boolToYesNo(false)).toBe("No");
    expect(boolToYesNo(0)).toBe("No");
    expect(boolToYesNo(null)).toBe("No");
    expect(boolToYesNo(undefined)).toBe("No");
  });
});

describe("toFullName", () => {
  it("concatenates firstName and lastName", () => {
    expect(toFullName({ firstName: "Amudhan", lastName: "Smith" })).toBe("Amudhan Smith");
  });
  it("handles missing lastName gracefully", () => {
    expect(toFullName({ firstName: "Amudhan", lastName: "" })).toBe("Amudhan");
  });
  it("handles missing firstName gracefully", () => {
    expect(toFullName({ firstName: "", lastName: "Smith" })).toBe("Smith");
  });
  it("returns empty string when both are missing", () => {
    expect(toFullName({ firstName: "", lastName: "" })).toBe("");
  });
  it("returns empty string for non-object input", () => {
    expect(toFullName(null)).toBe("");
    expect(toFullName(undefined)).toBe("");
    expect(toFullName("Amudhan")).toBe("");
  });
  it("trims extra whitespace", () => {
    expect(toFullName({ firstName: " Amudhan ", lastName: "Smith" })).toBe("Amudhan Smith");
  });
});

describe("toCityState", () => {
  it("concatenates city and state with a comma", () => {
    expect(toCityState({ city: "Austin", state: "TX" })).toBe("Austin, TX");
  });
  it("returns just city when state is empty", () => {
    expect(toCityState({ city: "Austin", state: "" })).toBe("Austin");
  });
  it("returns just state when city is empty", () => {
    expect(toCityState({ city: "", state: "TX" })).toBe("TX");
  });
  it("returns empty string when both are empty", () => {
    expect(toCityState({ city: "", state: "" })).toBe("");
  });
  it("returns empty string for non-object input", () => {
    expect(toCityState(null)).toBe("");
    expect(toCityState(undefined)).toBe("");
    expect(toCityState("Austin")).toBe("");
  });
});

describe("dialCodeToCountry", () => {
  it("maps common dial codes to country names", async () => {
    const { dialCodeToCountry } = await import("./transforms");
    expect(dialCodeToCountry("+1")).toBe("United States");
    expect(dialCodeToCountry("+44")).toBe("United Kingdom");
    expect(dialCodeToCountry("+91")).toBe("India");
  });

  it("passes unknown codes through and blanks empty input", async () => {
    const { dialCodeToCountry } = await import("./transforms");
    expect(dialCodeToCountry("+999")).toBe("+999");
    expect(dialCodeToCountry("")).toBe("");
    expect(dialCodeToCountry(null)).toBe("");
  });
});

describe("skillsMatchLabel", () => {
  const iac =
    "Do you have hands-on experience with infrastructure-as-code tools, such as Terraform, Pulumi, CloudFormation, or CDK?";

  it("says Yes on a single named-technology overlap", () => {
    expect(skillsMatchLabel(["Python", "Terraform"], iac)).toBe("Yes");
  });

  it("returns unknown rather than No when nothing overlaps", () => {
    expect(skillsMatchLabel(["Figma", "Photoshop"], iac)).toBe("");
    expect(skillsMatchLabel([], iac)).toBe("");
    expect(skillsMatchLabel(["Terraform"], "")).toBe("");
    expect(skillsMatchLabel("Terraform", iac)).toBe("");
  });

  it("respects word boundaries", () => {
    // "Go" must not match "good"/"going".
    expect(skillsMatchLabel(["Go"], "Have you used good tooling for going fast?")).toBe("");
    expect(skillsMatchLabel(["Go"], "Have you written Go in production?")).toBe("Yes");
    // Single letters are dropped before matching.
    expect(skillsMatchLabel(["R"], iac)).toBe("");
  });

  it("matches skills whose names contain regex metacharacters", () => {
    expect(skillsMatchLabel(["C++"], "Do you have experience with C++ or Rust?")).toBe("Yes");
    expect(skillsMatchLabel([".NET"], "Have you built with .NET before?")).toBe("Yes");
    expect(skillsMatchLabel(["Node.js"], "Do you have experience with Nodexjs?")).toBe("");
  });
});
