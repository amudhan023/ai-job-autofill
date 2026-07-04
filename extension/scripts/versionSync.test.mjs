import { describe, expect, it } from "vitest";
import { assertVersionSync } from "./versionSync.mjs";

describe("assertVersionSync", () => {
  it("does not throw when versions match", () => {
    expect(() => assertVersionSync("0.1.0", "0.1.0")).not.toThrow();
  });

  it("throws with both versions named when they differ", () => {
    expect(() => assertVersionSync("0.1.0", "9.9.9")).toThrow(/0\.1\.0.*9\.9\.9/s);
  });
});
