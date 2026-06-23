import { describe, it, expect } from "vitest";
import { companyFromUrl } from "./history";

describe("companyFromUrl", () => {
  it("extracts the company slug from Lever URLs", () => {
    expect(companyFromUrl("https://jobs.lever.co/acme/123-456")).toBe("acme");
  });

  it("extracts the company slug from Greenhouse URLs", () => {
    expect(companyFromUrl("https://boards.greenhouse.io/stripe/jobs/789")).toBe("stripe");
  });

  it("falls back to hostname when there is no path segment", () => {
    expect(companyFromUrl("https://jobs.ashbyhq.com/")).toBe("jobs.ashbyhq.com");
  });

  it("returns 'unknown' for malformed input", () => {
    expect(companyFromUrl("not a url")).toBe("unknown");
  });
});
