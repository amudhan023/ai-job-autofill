import { describe, it, expect } from "vitest";
import { scrapeJobDescription } from "./jdScraper";

describe("scrapeJobDescription", () => {
  it("prefers a known job-description container", () => {
    const long = "We are hiring a Staff Engineer. ".repeat(20);
    document.body.innerHTML = `
      <div class="job-description">${long}</div>
      <div>unrelated short text</div>`;
    const jd = scrapeJobDescription();
    expect(jd).toContain("Staff Engineer");
    expect(jd.length).toBeGreaterThan(200);
  });

  it("collapses whitespace and clamps very long text", () => {
    const huge = "word ".repeat(5000);
    document.body.innerHTML = `<main>${huge}</main>`;
    const jd = scrapeJobDescription();
    expect(jd.length).toBeLessThanOrEqual(8000);
    expect(jd).not.toMatch(/\s{2,}/);
  });

  it("falls back to the densest block when no known container exists", () => {
    document.body.innerHTML = `
      <section>tiny</section>
      <article>${"Responsibilities include building systems. ".repeat(15)}</article>`;
    expect(scrapeJobDescription()).toContain("Responsibilities");
  });
});
