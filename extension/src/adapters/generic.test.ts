import { describe, it, expect, beforeEach } from "vitest";
import { GenericAdapter } from "./generic";
import { resetIdCounter } from "./discover";

beforeEach(() => resetIdCounter());

describe("GenericAdapter", () => {
  it("scores 0 on pages with nothing fillable", () => {
    document.body.innerHTML = `<article><p>Blog post</p></article>`;
    expect(new GenericAdapter().score()).toBe(0);
  });

  it("scopes discovery to the densest form on the page", () => {
    document.body.innerHTML = `
      <form id="search"><input aria-label="Search" /></form>
      <form id="apply">
        <label for="fn">First Name</label><input id="fn" />
        <label for="ln">Last Name</label><input id="ln" />
        <label for="em">Email</label><input id="em" type="email" />
        <label for="ph">Phone</label><input id="ph" type="tel" />
      </form>`;
    const handles = new GenericAdapter().discoverFields();
    const labels = handles.map((h) => h.discovered.label);
    expect(labels).toContain("First Name");
    expect(labels).toContain("Email");
    expect(labels).not.toContain("Search");
  });

  it("falls back to whole-document discovery for form-less React apps", () => {
    document.body.innerHTML = `
      <div id="root">
        <label for="fn">First Name</label><input id="fn" />
        <label for="em">Email</label><input id="em" type="email" />
      </div>`;
    const handles = new GenericAdapter().discoverFields();
    expect(handles).toHaveLength(2);
  });
});
