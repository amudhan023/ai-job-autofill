import { test, expect, type BrowserContext, type Worker } from "@playwright/test";
import { BASE, fillViaExtension, launchExtension, seedLocalStorage } from "./helpers";

/**
 * Resume auto-attach to a file input (M6): a resume stored via
 * storage/resumeFile.ts should be attached to a "Resume/CV" file input on
 * fill, via a real DataTransfer in an actual browser (unlike the jsdom unit
 * test, which has to special-case DataTransfer's absence).
 *
 * Requires `npm run build` first, same as autofill.spec.ts.
 */

const FAKE_PDF_BASE64 = Buffer.from("%PDF-1.4 fake resume bytes for E2E").toString("base64");

let context: BrowserContext;
let worker: Worker;

test.beforeAll(async () => {
  ({ context, worker } = await launchExtension());
});

test.afterAll(async () => {
  await context?.close();
});

test.beforeEach(async () => {
  await seedLocalStorage(worker, {
    userProfile: {
      personal: {},
      links: {},
      workAuth: {},
      experience: [],
      education: [],
      skills: {},
      preferences: {},
      meta: {},
    },
    resumeFile: {
      name: "resume.pdf",
      mimeType: "application/pdf",
      data: FAKE_PDF_BASE64,
      savedAt: Date.now(),
    },
  });
});

test("attaches the stored resume to a Resume/CV file input", async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/resume-upload.html`);
  await page.waitForTimeout(300);

  const { result } = await fillViaExtension(worker);
  expect(result.filledCount).toBeGreaterThanOrEqual(1);

  const attached = await page.evaluate(() => {
    const input = document.getElementById("res") as HTMLInputElement;
    return { name: input.files?.[0]?.name, count: input.files?.length };
  });
  expect(attached.name).toBe("resume.pdf");
  expect(attached.count).toBe(1);

  await page.close();
});

test("never-clobber: does not replace a file the user already attached", async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/resume-upload.html`);
  await page.waitForTimeout(300);

  // Simulate the user having already picked a different file by hand.
  await page.evaluate(() => {
    const input = document.getElementById("res") as HTMLInputElement;
    const dt = new DataTransfer();
    dt.items.add(new File(["already chosen"], "my-own-resume.pdf", { type: "application/pdf" }));
    input.files = dt.files;
  });

  await fillViaExtension(worker);

  const name = await page.evaluate(
    () => (document.getElementById("res") as HTMLInputElement).files?.[0]?.name,
  );
  expect(name).toBe("my-own-resume.pdf");

  await page.close();
});
