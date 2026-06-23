import { test, expect, chromium, type BrowserContext, type Worker } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Full end-to-end: loads the BUILT extension (dist/) into a real Chromium
 * persistent context, navigates to a fixture ATS page (served on localhost so
 * the manifest content-script match fires), seeds a profile, and triggers a
 * fill via the extension's service worker — exactly the production path:
 *   manifest match → content script → detection → rule engine → DOM fill.
 *
 * Requires `npm run build` first (the spec asserts dist/ exists indirectly by
 * loading it). Skips cleanly if Chromium isn't installed.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_PATH = join(__dirname, "..", "dist");
const PORT = Number(process.env.E2E_PORT ?? 5566);
const BASE = `http://localhost:${PORT}`;

const SEED_PROFILE = {
  personal: {
    firstName: "Amudhan",
    lastName: "Shanmugam",
    email: "amudhanfz@example.com",
    phone: "+1-555-0100",
    location: { city: "Austin", state: "TX", country: "USA", postalCode: "78701" },
  },
  links: { linkedin: "https://linkedin.com/in/amudhan", github: "https://github.com/amudhan023", portfolio: "", website: "" },
  workAuth: { usAuthorized: true, sponsorshipNeeded: false, visaType: "USC" },
  experience: [{ company: "Confluent", title: "Staff Engineer", startDate: "2021-01", endDate: "", current: true, bullets: [] }],
  education: [],
  skills: { technical: [], languages: [], certifications: [] },
  preferences: { salaryExpected: "250000", noticePeriod: "", remotePreference: "", willingToRelocate: false },
  meta: { totalYearsExp: 18 },
};

let context: BrowserContext;
let worker: Worker;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext("", {
    headless: true,
    channel: "chromium", // new headless supports MV3 extensions
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
});

test.afterAll(async () => {
  await context?.close();
});

test.beforeEach(async () => {
  // Seed the profile into chrome.storage.local via the service worker.
  await worker.evaluate(async (profile) => {
    await chrome.storage.local.set({ userProfile: profile });
  }, SEED_PROFILE);
});

async function fillViaExtension(): Promise<{ filledCount: number; totalFields: number }> {
  // Target the active tab by id (no host permission needed for localhost URLs).
  return worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const res = (await chrome.tabs.sendMessage(tab.id!, { type: "FILL_FORM" })) as {
      ok: boolean;
      result: { filledCount: number; totalFields: number };
    };
    return res.result;
  });
}

test("autofills a Greenhouse fixture end-to-end", async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/greenhouse.html`);
  await page.waitForLoadState("domcontentloaded");
  // give the content script a beat to register its listener
  await page.waitForTimeout(300);

  const summary = await fillViaExtension();
  expect(summary.filledCount).toBeGreaterThanOrEqual(6);

  // Deterministic structured fields are filled correctly.
  expect(await page.inputValue("#fn")).toBe("Amudhan");
  expect(await page.inputValue("#ln")).toBe("Shanmugam");
  expect(await page.inputValue("#em")).toBe("amudhanfz@example.com");
  expect(await page.inputValue("#ph")).toBe("+1-555-0100");
  expect(await page.inputValue("#li")).toBe("https://linkedin.com/in/amudhan");
  expect(await page.inputValue("#gh")).toBe("https://github.com/amudhan023");

  // Work-auth radio (Yes) is selected via boolean transform.
  expect(await page.isChecked('input[name="auth"][value="yes"]')).toBe(true);

  await page.close();
});

test("never auto-fills sensitive or confirm-gated fields", async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/greenhouse.html`);
  await page.waitForTimeout(300);

  await fillViaExtension();

  // SSN is blocklisted; salary is confirm-gated; cover letter is AI free-text.
  expect(await page.inputValue("#ssn")).toBe("");
  expect(await page.inputValue("#sal")).toBe("");
  expect(await page.inputValue("#cl")).toBe("");

  await page.close();
});

test("zero-mutation: the form is never submitted by the extension", async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/greenhouse.html`);
  await page.waitForTimeout(300);

  let submitted = false;
  await page.exposeFunction("__markSubmitted", () => (submitted = true));
  await page.evaluate(() => {
    document.getElementById("application_form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      // @ts-expect-error injected
      window.__markSubmitted();
    });
  });

  await fillViaExtension();
  await page.waitForTimeout(200);

  expect(submitted).toBe(false);
  await page.close();
});
