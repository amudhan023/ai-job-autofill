import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceBadge } from "./ConfidenceBadge";
import type { FieldMatch } from "@/shared/types";

function match(overrides: Partial<FieldMatch>): FieldMatch {
  return {
    fieldId: "f1",
    label: "First Name",
    type: "text",
    ruleId: "firstName",
    profilePath: "personal.firstName",
    value: "Sam",
    confidence: 0.97,
    tier: "high",
    flags: [],
    reason: "Exact label match.",
    ...overrides,
  };
}

describe("ConfidenceBadge", () => {
  it("renders a high-confidence check with reason + percentage in title", () => {
    render(<ConfidenceBadge match={match({ tier: "high", confidence: 0.97 })} />);
    const badge = screen.getByText("✓");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", expect.stringContaining("Exact label match."));
    expect(badge).toHaveAttribute("title", expect.stringContaining("97%"));
  });

  it("renders medium tier as a warning marker", () => {
    render(<ConfidenceBadge match={match({ tier: "medium", confidence: 0.85 })} />);
    expect(screen.getByText("!")).toBeInTheDocument();
  });

  it("renders low tier as a question marker", () => {
    render(<ConfidenceBadge match={match({ tier: "low", confidence: 0.4 })} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("forces low styling for blocklisted fields regardless of tier", () => {
    render(
      <ConfidenceBadge
        match={match({ tier: "high", flags: ["blocklist"], reason: "Sensitive field — never auto-filled." })}
      />,
    );
    // blocklist coerces to the low marker
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
