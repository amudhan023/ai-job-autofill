import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { installChromeMock } from "./chromeMock";

// Fresh chrome mock + clean DOM for every test.
beforeEach(() => {
  installChromeMock();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});
