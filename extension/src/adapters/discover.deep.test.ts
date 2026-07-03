import { describe, it, expect, beforeEach } from "vitest";
import { discoverWithin, resetIdCounter } from "./discover";

beforeEach(() => resetIdCounter());

describe("deep scan — shadow DOM", () => {
  it("discovers controls inside open shadow roots", () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const shadow = document.getElementById("host")!.attachShadow({ mode: "open" });
    shadow.innerHTML = `<label for="fn">First Name</label><input id="fn" />`;

    const handles = discoverWithin(document);
    expect(handles.map((h) => h.discovered.label)).toContain("First Name");
  });

  it("resolves label[for] scoped to the shadow root, not the document", () => {
    document.body.innerHTML = `<label for="fn">WRONG (document-level)</label><div id="host"></div>`;
    const shadow = document.getElementById("host")!.attachShadow({ mode: "open" });
    shadow.innerHTML = `<label for="fn">First Name</label><input id="fn" />`;

    const handles = discoverWithin(document);
    const labels = handles.map((h) => h.discovered.label);
    expect(labels).toContain("First Name");
    expect(labels).not.toContain("WRONG (document-level)");
  });

  it("discovers nested shadow roots", () => {
    document.body.innerHTML = `<div id="outer"></div>`;
    const outer = document.getElementById("outer")!.attachShadow({ mode: "open" });
    outer.innerHTML = `<div id="inner"></div>`;
    const inner = outer.getElementById("inner")!.attachShadow({ mode: "open" });
    inner.innerHTML = `<input aria-label="Email" type="email" />`;

    const handles = discoverWithin(document);
    expect(handles.map((h) => h.discovered.ariaLabel)).toContain("Email");
  });
});

describe("deep scan — same-origin iframes", () => {
  it("discovers controls inside a same-origin iframe document", () => {
    document.body.innerHTML = `<iframe id="frame"></iframe>`;
    const frame = document.getElementById("frame") as HTMLIFrameElement;
    frame.contentDocument!.body.innerHTML = `<label for="em">Email</label><input id="em" type="email" />`;

    const handles = discoverWithin(document);
    expect(handles.map((h) => h.discovered.label)).toContain("Email");
    // Type inference must survive the cross-realm boundary (no instanceof).
    const email = handles.find((h) => h.discovered.label === "Email")!;
    expect(email.discovered.type).toBe("email");
  });
});

describe("custom text widgets", () => {
  it("discovers contenteditable widgets and types multiline ones as textarea", () => {
    document.body.innerHTML = `
      <span id="l1">Cover Letter</span>
      <div contenteditable="true" aria-labelledby="l1"></div>
      <span id="l2">LinkedIn</span>
      <div role="textbox" aria-multiline="false" aria-labelledby="l2"></div>`;
    const handles = discoverWithin(document);
    const byLabel = new Map(handles.map((h) => [h.discovered.label, h.discovered.type]));
    expect(byLabel.get("Cover Letter")).toBe("textarea");
    expect(byLabel.get("LinkedIn")).toBe("text");
  });

  it("skips contenteditable=false and aria-readonly editors", () => {
    document.body.innerHTML = `
      <div contenteditable="false" aria-label="Frozen"></div>
      <div role="textbox" aria-readonly="true" aria-label="ReadOnly"></div>`;
    expect(discoverWithin(document)).toHaveLength(0);
  });
});
