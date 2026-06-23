import { describe, it, expect } from "vitest";
import { detectATS, DETECTION_THRESHOLD } from "./registry";

/** Phase 2 adapters — detection via DOM fingerprints (location-independent). */
describe("Phase 2 ATS detection", () => {
  it("detects Workday from data-automation-id fingerprints", () => {
    document.body.innerHTML = `
      <div data-automation-id="applicationPage" class="wdayApply WD-root">
        <div data-automation-id="formField"></div>
        <div class="wd-Field"></div>
        <input data-automation-id="firstName" />
      </div>`;
    const r = detectATS();
    expect(r.platform).toBe("workday");
    expect(r.score).toBeGreaterThanOrEqual(DETECTION_THRESHOLD);
  });

  it("detects iCIMS from icims_content + field hooks", () => {
    document.body.innerHTML = `
      <div class="icims_content">
        <input id="icims_firstName" class="icims-input" />
      </div>`;
    const r = detectATS();
    expect(r.platform).toBe("icims");
    expect(r.score).toBeGreaterThanOrEqual(DETECTION_THRESHOLD);
  });

  it("detects SmartRecruiters from data-test + data-field hooks", () => {
    document.body.innerHTML = `
      <form data-test="application-form" name="applicationForm" class="sc-root smartrecruiters-app">
        <input data-field="firstName" />
      </form>`;
    const r = detectATS();
    expect(r.platform).toBe("smartrecruiters");
    expect(r.score).toBeGreaterThanOrEqual(DETECTION_THRESHOLD);
  });

  it("detects BambooHR from class hooks + form id", () => {
    document.body.innerHTML = `
      <form id="applicationForm" class="BambooHR-ATS-Application fab-input bamboohr-app">
        <input id="field1" />
      </form>`;
    const r = detectATS();
    expect(r.platform).toBe("bamboohr");
    expect(r.score).toBeGreaterThanOrEqual(DETECTION_THRESHOLD);
  });

  it("discovers fields inside a Workday application panel", () => {
    document.body.innerHTML = `
      <div data-automation-id="applicationPage" class="wdayApply WD-root">
        <div data-automation-id="formField"></div>
        <div class="wd-Field"></div>
        <label for="fn">First Name</label><input id="fn" data-automation-id="x" />
        <label for="em">Email</label><input id="em" type="email" />
      </div>`;
    const { adapter } = detectATS();
    expect(adapter).not.toBeNull();
    const handles = adapter!.discoverFields();
    const labels = handles.map((h) => h.discovered.label);
    expect(labels).toContain("First Name");
    expect(labels).toContain("Email");
  });
});
