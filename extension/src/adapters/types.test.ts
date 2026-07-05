import { describe, it, expect } from "vitest";
import { scoreSignals, inferType } from "./types";

describe("scoreSignals", () => {
  it("weights signals URL30 / DOM40 / HTML20 / CSS10", () => {
    expect(
      scoreSignals({
        urlMatch: true,
        domFingerprint: false,
        htmlStructure: false,
        cssHints: false,
      }),
    ).toBe(30);
    expect(
      scoreSignals({
        urlMatch: false,
        domFingerprint: true,
        htmlStructure: false,
        cssHints: false,
      }),
    ).toBe(40);
    expect(
      scoreSignals({
        urlMatch: false,
        domFingerprint: false,
        htmlStructure: true,
        cssHints: false,
      }),
    ).toBe(20);
    expect(
      scoreSignals({
        urlMatch: false,
        domFingerprint: false,
        htmlStructure: false,
        cssHints: true,
      }),
    ).toBe(10);
    expect(
      scoreSignals({ urlMatch: true, domFingerprint: true, htmlStructure: true, cssHints: true }),
    ).toBe(100);
  });
});

describe("inferType", () => {
  it("infers control types from elements", () => {
    const text = document.createElement("input");
    expect(inferType(text)).toBe("text");

    const email = document.createElement("input");
    email.type = "email";
    expect(inferType(email)).toBe("email");

    const tel = document.createElement("input");
    tel.type = "tel";
    expect(inferType(tel)).toBe("tel");

    const radio = document.createElement("input");
    radio.type = "radio";
    expect(inferType(radio)).toBe("radio");

    expect(inferType(document.createElement("textarea"))).toBe("textarea");
    expect(inferType(document.createElement("select"))).toBe("select");
  });
});
