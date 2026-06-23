import { describe, it, expect, vi } from "vitest";
import {
  setInputValue,
  setSelectValue,
  setRadioOrCheckbox,
  labelForControl,
} from "./domFill";

describe("setInputValue", () => {
  it("sets value and dispatches input + change events", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const onInput = vi.fn();
    const onChange = vi.fn();
    input.addEventListener("input", onInput);
    input.addEventListener("change", onChange);

    setInputValue(input, "hello@example.com");

    expect(input.value).toBe("hello@example.com");
    expect(onInput).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("works on textareas", () => {
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    setInputValue(ta, "a long answer");
    expect(ta.value).toBe("a long answer");
  });
});

describe("setSelectValue", () => {
  function buildSelect(opts: Array<[string, string]>): HTMLSelectElement {
    const sel = document.createElement("select");
    for (const [value, text] of opts) {
      const o = document.createElement("option");
      o.value = value;
      o.text = text;
      sel.appendChild(o);
    }
    document.body.appendChild(sel);
    return sel;
  }

  it("matches by exact option value", () => {
    const sel = buildSelect([["bs", "Bachelors"], ["ms", "Masters"]]);
    expect(setSelectValue(sel, "ms")).toBe(true);
    expect(sel.value).toBe("ms");
  });

  it("matches by case-insensitive label", () => {
    const sel = buildSelect([["bs", "Bachelor's Degree"], ["ms", "Master's Degree"]]);
    expect(setSelectValue(sel, "master's degree")).toBe(true);
    expect(sel.value).toBe("ms");
  });

  it("falls back to partial label inclusion", () => {
    const sel = buildSelect([["bs", "Bachelor of Science"], ["ms", "Master of Science"]]);
    expect(setSelectValue(sel, "Master")).toBe(true);
    expect(sel.value).toBe("ms");
  });

  it("returns false when nothing matches", () => {
    const sel = buildSelect([["bs", "Bachelors"]]);
    expect(setSelectValue(sel, "PhD")).toBe(false);
  });
});

describe("setRadioOrCheckbox", () => {
  it("checks the option whose label matches the desired value", () => {
    document.body.innerHTML = `
      <label><input type="radio" name="auth" value="yes"> Yes</label>
      <label><input type="radio" name="auth" value="no"> No</label>`;
    const group = Array.from(document.querySelectorAll<HTMLInputElement>("input[name='auth']"));
    expect(setRadioOrCheckbox(group, "Yes")).toBe(true);
    expect(group[0].checked).toBe(true);
    expect(group[1].checked).toBe(false);
  });

  it("selects No option correctly", () => {
    document.body.innerHTML = `
      <label><input type="radio" name="prev" value="yes"> Yes</label>
      <label><input type="radio" name="prev" value="no"> No</label>`;
    const group = Array.from(document.querySelectorAll<HTMLInputElement>("input[name='prev']"));
    expect(setRadioOrCheckbox(group, "No")).toBe(true);
    expect(group[0].checked).toBe(false);
    expect(group[1].checked).toBe(true);
  });

  it("returns false when no label matches a radio group", () => {
    document.body.innerHTML = `<label><input type="radio" name="x"> Maybe</label>`;
    const group = Array.from(document.querySelectorAll<HTMLInputElement>("input[name='x']"));
    expect(setRadioOrCheckbox(group, "Yes")).toBe(false);
  });

  it("checks a standalone consent checkbox when value is Yes", () => {
    document.body.innerHTML = `
      <label>
        <input type="checkbox" name="consent" value="agree">
        Do you agree to allow us to contact you about job opportunities?
      </label>`;
    const group = Array.from(document.querySelectorAll<HTMLInputElement>("input[name='consent']"));
    expect(setRadioOrCheckbox(group, "Yes")).toBe(true);
    expect(group[0].checked).toBe(true);
  });

  it("checks a standalone consent checkbox with 'true' string", () => {
    document.body.innerHTML = `<label><input type="checkbox" name="c2"> I agree</label>`;
    const group = Array.from(document.querySelectorAll<HTMLInputElement>("input[name='c2']"));
    expect(setRadioOrCheckbox(group, "true")).toBe(true);
    expect(group[0].checked).toBe(true);
  });

  it("does NOT check a standalone checkbox when value is No", () => {
    document.body.innerHTML = `<label><input type="checkbox" name="c3"> I agree</label>`;
    const group = Array.from(document.querySelectorAll<HTMLInputElement>("input[name='c3']"));
    expect(setRadioOrCheckbox(group, "No")).toBe(false);
    expect(group[0].checked).toBe(false);
  });

  it("dispatches change events after checking", () => {
    document.body.innerHTML = `
      <label><input type="radio" name="ev" value="yes"> Yes</label>
      <label><input type="radio" name="ev" value="no"> No</label>`;
    const group = Array.from(document.querySelectorAll<HTMLInputElement>("input[name='ev']"));
    let changed = false;
    group[0].addEventListener("change", () => { changed = true; });
    setRadioOrCheckbox(group, "Yes");
    expect(changed).toBe(true);
  });
});

describe("labelForControl", () => {
  it("resolves an associated <label for>", () => {
    document.body.innerHTML = `<label for="fn">First Name</label><input id="fn">`;
    const input = document.getElementById("fn") as HTMLInputElement;
    expect(labelForControl(input)).toBe("First Name");
  });

  it("resolves a wrapping label", () => {
    document.body.innerHTML = `<label>Email <input type="email"></label>`;
    const input = document.querySelector("input") as HTMLInputElement;
    expect(labelForControl(input)).toContain("Email");
  });

  it("falls back to aria-label then placeholder", () => {
    const a = document.createElement("input");
    a.setAttribute("aria-label", "Phone");
    expect(labelForControl(a)).toBe("Phone");

    const b = document.createElement("input");
    b.setAttribute("placeholder", "you@co.com");
    expect(labelForControl(b)).toBe("you@co.com");
  });
});
