import { describe, it, expect } from "vitest";
import { detectATS, DETECTION_THRESHOLD } from "./registry";

/**
 * Detection is exercised purely via DOM fingerprints so it does not depend on
 * jsdom's (fixed) location. Each fixture is built to clear the 70 threshold.
 */
describe("detectATS", () => {
  it("detects Greenhouse from DOM fingerprints", () => {
    document.body.innerHTML = `
      <form id="application_form" class="greenhouse-application">
        <div id="field_order_1"></div>
        <input id="job_application_first_name" />
      </form>`;
    const r = detectATS();
    expect(r.platform).toBe("greenhouse");
    expect(r.score).toBeGreaterThanOrEqual(DETECTION_THRESHOLD);
  });

  it("detects Lever from DOM fingerprints", () => {
    document.body.innerHTML = `
      <form class="application-form lever-form">
        <input name="resume" />
        <div class="application-question"></div>
      </form>`;
    const r = detectATS();
    expect(r.platform).toBe("lever");
    expect(r.score).toBeGreaterThanOrEqual(DETECTION_THRESHOLD);
  });

  it("detects Ashby from DOM fingerprints", () => {
    document.body.innerHTML = `
      <form data-form-id="abc" class="ashby-application">
        <div class="_form_field_xyz"></div>
        <input />
      </form>`;
    const r = detectATS();
    expect(r.platform).toBe("ashby");
    expect(r.score).toBeGreaterThanOrEqual(DETECTION_THRESHOLD);
  });

  it("falls back to the generic adapter when no ATS matches but a form exists", () => {
    document.body.innerHTML = `<form><label for="a">First Name</label><input id="a" /></form>`;
    const r = detectATS();
    expect(r.platform).toBe("generic");
    expect(r.adapter).not.toBeNull();
    expect(r.adapter!.discoverFields().length).toBeGreaterThan(0);
  });

  it("returns 'unknown' only when the page has nothing fillable", () => {
    document.body.innerHTML = `<p>Just an article, no form.</p>`;
    const r = detectATS();
    expect(r.platform).toBe("unknown");
    expect(r.adapter).toBeNull();
    expect(r.score).toBe(0);
  });
});
