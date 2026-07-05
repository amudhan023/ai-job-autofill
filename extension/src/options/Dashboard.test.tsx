import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dashboard } from "./Dashboard";
import type { ApplicationRecord } from "@/shared/types";

const records: ApplicationRecord[] = [
  {
    id: "1",
    url: "u",
    company: "stripe",
    platform: "greenhouse",
    date: Date.now(),
    fieldsFilled: 8,
    fieldsTotal: 10,
    aiAssisted: 2,
  },
  {
    id: "2",
    url: "u",
    company: "acme",
    platform: "lever",
    date: Date.now(),
    fieldsFilled: 5,
    fieldsTotal: 10,
    aiAssisted: 0,
  },
];

describe("Dashboard", () => {
  it("shows an empty state when there are no applications", () => {
    render(<Dashboard records={[]} />);
    expect(screen.getByText(/no applications yet/i)).toBeInTheDocument();
  });

  it("renders headline stats from injected records", () => {
    render(<Dashboard records={records} />);
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1); // total applications
    expect(screen.getByText("65%")).toBeInTheDocument(); // fill rate (13/20)
    expect(screen.getByText("10%")).toBeInTheDocument(); // AI assist rate (2/20)
  });

  it("lists platform breakdown and recent applications", () => {
    render(<Dashboard records={records} />);
    expect(screen.getByText("By platform")).toBeInTheDocument();
    expect(screen.getByText(/stripe/i)).toBeInTheDocument();
    expect(screen.getByText(/acme/i)).toBeInTheDocument();
  });
});
