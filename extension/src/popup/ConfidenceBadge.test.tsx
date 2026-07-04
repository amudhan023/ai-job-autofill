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

describe("ConfidenceBadge (write-status driven)", () => {
  it("shows a green check ONLY for fields actually written this pass", () => {
    render(<ConfidenceBadge match={match({ filled: true, confidence: 0.97 })} />);
    const badge = screen.getByText("✓");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", expect.stringContaining("Exact label match."));
    expect(badge).toHaveAttribute("title", expect.stringContaining("97%"));
    expect(badge.className).toContain("green");
  });

  it("high-confidence match that was NOT written is a review marker, not a check", () => {
    // e.g. confirm-gated salary, or the widget rejected the write
    render(<ConfidenceBadge match={match({ tier: "high", filled: undefined })} />);
    const badge = screen.getByText("!");
    expect(badge.className).toContain("yellow");
  });

  it("skipped-for-existing-value shows a muted check", () => {
    render(<ConfidenceBadge match={match({ alreadyHadValue: true, value: null })} />);
    const badge = screen.getByText("✓");
    expect(badge.className).toContain("gray");
  });

  it("unmatched / no-value fields show a question marker", () => {
    render(<ConfidenceBadge match={match({ value: null, ruleId: null, tier: "low", confidence: 0 })} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("blocklisted fields show a never-fill cross regardless of tier", () => {
    render(
      <ConfidenceBadge
        match={match({ tier: "high", value: null, flags: ["blocklist"], reason: "Sensitive field — never auto-filled." })}
      />,
    );
    expect(screen.getByText("✕")).toBeInTheDocument();
  });
});
