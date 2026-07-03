import { describe, it, expect, beforeEach } from "vitest";
import { discoverWithin, resetIdCounter } from "./discover";

beforeEach(() => resetIdCounter());

describe("discoverWithin", () => {
  it("discovers text, email, textarea and select controls", () => {
    document.body.innerHTML = `
      <form>
        <label for="a">First Name</label><input id="a" />
        <label for="b">Email</label><input id="b" type="email" />
        <label for="c">Cover Letter</label><textarea id="c"></textarea>
        <label for="d">Degree</label><select id="d"><option>BS</option></select>
      </form>`;
    const handles = discoverWithin(document.querySelector("form")!);
    const labels = handles.map((h) => h.discovered.label);
    expect(labels).toContain("First Name");
    expect(labels).toContain("Email");
    expect(labels).toContain("Cover Letter");
    expect(labels).toContain("Degree");
    expect(handles).toHaveLength(4);
  });

  it("excludes hidden and submit inputs; includes file inputs (M6)", () => {
    document.body.innerHTML = `
      <form>
        <input type="hidden" name="csrf" />
        <input type="submit" value="Apply" />
        <input type="file" name="resume" />
        <input type="text" aria-label="Visible" />
      </form>`;
    const handles = discoverWithin(document.querySelector("form")!);
    expect(handles).toHaveLength(2);
    const types = handles.map((h) => h.discovered.type);
    expect(types).toContain("file"); // file inputs discoverable since M6
    expect(types).toContain("text");
  });

  it("excludes disabled controls", () => {
    document.body.innerHTML = `<form><input aria-label="Off" disabled /></form>`;
    expect(discoverWithin(document.querySelector("form")!)).toHaveLength(0);
  });

  it("collapses a radio group into a single handle with the fieldset legend label", () => {
    document.body.innerHTML = `
      <form>
        <fieldset>
          <legend>Are you authorized to work in the US?</legend>
          <label><input type="radio" name="auth" value="yes" /> Yes</label>
          <label><input type="radio" name="auth" value="no" /> No</label>
        </fieldset>
      </form>`;
    const handles = discoverWithin(document.querySelector("form")!);
    expect(handles).toHaveLength(1);
    expect(handles[0].discovered.type).toBe("radio");
    expect(handles[0].discovered.label).toContain("authorized to work");
    expect(handles[0].group).toHaveLength(2);
  });

  it("reads group label via aria-labelledby (Ashby/React ATS pattern)", () => {
    document.body.innerHTML = `
      <form>
        <div>
          <p id="q1-label">Are you legally authorized to work in the United States?</p>
          <div role="radiogroup" aria-labelledby="q1-label">
            <label><input type="radio" name="workAuth" value="Yes" /> Yes</label>
            <label><input type="radio" name="workAuth" value="No" /> No</label>
          </div>
        </div>
      </form>`;
    const handles = discoverWithin(document.querySelector("form")!);
    expect(handles).toHaveLength(1);
    expect(handles[0].discovered.label).toContain("legally authorized to work");
  });

  it("reads group label via preceding sibling when no aria attributes are present", () => {
    document.body.innerHTML = `
      <form>
        <div>
          <label>Do you require sponsorship?</label>
          <div>
            <label><input type="radio" name="sponsor" value="Yes" /> Yes</label>
            <label><input type="radio" name="sponsor" value="No" /> No</label>
          </div>
        </div>
      </form>`;
    const handles = discoverWithin(document.querySelector("form")!);
    expect(handles).toHaveLength(1);
    expect(handles[0].discovered.label).toContain("require sponsorship");
  });

  it("marks checkbox group with type 'checkbox'", () => {
    document.body.innerHTML = `
      <form>
        <label for="consent-cb">
          Do you agree to allow us to contact you about job opportunities?
        </label>
        <input id="consent-cb" type="checkbox" name="consent" />
      </form>`;
    const handles = discoverWithin(document.querySelector("form")!);
    expect(handles).toHaveLength(1);
    expect(handles[0].discovered.type).toBe("checkbox");
    expect(handles[0].discovered.label).toContain("contact you");
  });

  it("handles multiple radio groups on the same form independently", () => {
    document.body.innerHTML = `
      <form>
        <fieldset>
          <legend>Authorized to work in US?</legend>
          <label><input type="radio" name="auth" value="yes" /> Yes</label>
          <label><input type="radio" name="auth" value="no" /> No</label>
        </fieldset>
        <fieldset>
          <legend>Require sponsorship?</legend>
          <label><input type="radio" name="sponsor" value="yes" /> Yes</label>
          <label><input type="radio" name="sponsor" value="no" /> No</label>
        </fieldset>
      </form>`;
    const handles = discoverWithin(document.querySelector("form")!);
    expect(handles).toHaveLength(2);
    const labels = handles.map((h) => h.discovered.label);
    expect(labels.some((l) => l.includes("Authorized"))).toBe(true);
    expect(labels.some((l) => l.includes("sponsorship"))).toBe(true);
  });
});
