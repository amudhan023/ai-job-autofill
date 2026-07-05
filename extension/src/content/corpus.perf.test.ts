/**
 * Perf regression guard (M6 follow-up / T8): runs the full detect → evaluate
 * → write pipeline repeatedly over the synthetic corpus fixtures (mirrors
 * corpus.test.ts's forms — kept in sync manually since these assert timing,
 * not per-field correctness) and asserts the total wall time stays under a
 * generous budget. This is not meant to catch minor variance; it exists so a
 * real algorithmic regression (e.g. an accidental O(n^2) DOM walk) surfaces
 * as a failing CI test instead of silently shipping.
 */
import { describe, it, expect } from "vitest";
import { emptyProfile, type UserProfile } from "@/shared/profile";
import { detectAndFill } from "./fillExecutor";

const NO_SETTLE = { settleMs: 0 };

function profile(): UserProfile {
  const p = emptyProfile();
  p.personal.firstName = "Amudhan";
  p.personal.lastName = "Kumar";
  p.personal.email = "a@example.com";
  p.personal.phone = "555-0100";
  p.personal.location.city = "Austin";
  p.links.linkedin = "https://linkedin.com/in/amudhan";
  return p;
}

/** One setup fn per synthetic corpus fixture from corpus.test.ts. */
const FIXTURE_SETUPS: Array<() => void> = [
  () => {
    document.body.innerHTML = `
      <div id="root"><form>
        <div class="MuiFormControl-root">
          <label class="MuiInputLabel-root" for="mui-1">First Name</label>
          <div class="MuiInputBase-root"><input id="mui-1" class="MuiInputBase-input" /></div>
        </div>
        <div class="MuiFormControl-root">
          <label class="MuiInputLabel-root" for="mui-2">Email Address</label>
          <div class="MuiInputBase-root"><input id="mui-2" type="email" class="MuiInputBase-input" /></div>
        </div>
      </form></div>`;
  },
  () => {
    document.body.innerHTML = `
      <app-root><form novalidate>
        <mat-form-field><input id="ng-1" formcontrolname="firstName" name="firstName" /></mat-form-field>
        <mat-form-field><input id="ng-2" formcontrolname="phoneNumber" name="phone_number" type="tel" /></mat-form-field>
      </form></app-root>`;
  },
  () => {
    document.body.innerHTML = `
      <form>
        <input id="ph-1" placeholder="First name" />
        <input id="ph-2" placeholder="LinkedIn profile URL" type="url" />
      </form>`;
  },
  () => {
    document.body.innerHTML = `
      <form>
        <input id="ac-1" autocomplete="given-name" />
        <input id="ac-2" autocomplete="email" type="email" />
        <input id="ac-3" autocomplete="address-level2" />
      </form>`;
  },
  () => {
    document.body.innerHTML = `<career-portal id="portal"></career-portal>`;
    const shadow = document.getElementById("portal")!.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <form>
        <label for="wc-1">First Name</label><input id="wc-1" />
        <label for="wc-2">Email</label><input id="wc-2" type="email" />
      </form>`;
  },
  () => {
    document.body.innerHTML = `
      <form>
        <div class="row"><div class="q">Email</div><div class="a"><input id="tbl-1" type="email" /></div></div>
      </form>`;
  },
];

describe("perf: scan/fill over the synthetic corpus", () => {
  it("stays within a generous time budget across repeated passes", async () => {
    const ITERATIONS = 25;
    const p = profile();

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      for (const setup of FIXTURE_SETUPS) {
        setup();
        await detectAndFill(p, NO_SETTLE);
      }
    }
    const elapsedMs = performance.now() - start;

    const totalPasses = ITERATIONS * FIXTURE_SETUPS.length;
    // Generous ceiling, not a tight tuning target: local runs land well
    // under 5ms/pass in jsdom. Budget 100ms/pass (~20x headroom) so this
    // only trips on a real regression (e.g. an accidental O(n^2) scan),
    // not on CI machine noise.
    const budgetMs = totalPasses * 100;
    expect(elapsedMs).toBeLessThan(budgetMs);
  });
});
