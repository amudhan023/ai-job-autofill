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

  it("excludes hidden, submit, and file inputs", () => {
    document.body.innerHTML = `
      <form>
        <input type="hidden" name="csrf" />
        <input type="submit" value="Apply" />
        <input type="file" name="resume" />
        <input type="text" aria-label="Visible" />
      </form>`;
    const handles = discoverWithin(document.querySelector("form")!);
    expect(handles).toHaveLength(1);
    expect(handles[0].discovered.ariaLabel).toBe("Visible");
  });

  it("excludes disabled controls", () => {
    document.body.innerHTML = `<form><input aria-label="Off" disabled /></form>`;
    expect(discoverWithin(document.querySelector("form")!)).toHaveLength(0);
  });

  it("collapses a radio group into a single handle with the group label", () => {
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
});
