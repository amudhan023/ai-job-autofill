import { chromium, type BrowserContext, type Worker } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Shared helpers for the T5 E2E specs (multi-page session, resume attach, AI
 * draft) — factored out so those specs don't each re-derive the extension
 * launch/seed/message-passing boilerplate that autofill.spec.ts inlines.
 * autofill.spec.ts is intentionally left as-is (pre-existing, passing).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
export const EXT_PATH = join(__dirname, "..", "dist");
export const PORT = Number(process.env.E2E_PORT ?? 5566);
export const BASE = `http://localhost:${PORT}`;

export async function launchExtension(): Promise<{ context: BrowserContext; worker: Worker }> {
  const context = await chromium.launchPersistentContext("", {
    headless: true,
    channel: "chromium", // new headless supports MV3 extensions
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  return { context, worker };
}

export async function seedLocalStorage(
  worker: Worker,
  items: Record<string, unknown>,
): Promise<void> {
  await worker.evaluate(async (kv) => {
    await chrome.storage.local.set(kv);
  }, items);
}

export interface FillViaExtensionResult {
  ok: boolean;
  result: {
    filledCount: number;
    totalFields: number;
    matches: { fieldId: string; label: string; value: string | null }[];
  };
  session?: { pages: number; fieldsFilled: number };
}

/** Sends FILL_FORM to the active tab and returns the full response (matches, session). */
export async function fillViaExtension(worker: Worker): Promise<FillViaExtensionResult> {
  return worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return (await chrome.tabs.sendMessage(tab.id!, { type: "FILL_FORM" })) as FillViaExtensionResult;
  });
}

export interface DraftFieldResult {
  ok: boolean;
  value?: string;
  error?: string;
}

/** Sends AI_DRAFT_FIELD to the active tab for a fieldId from a prior fillViaExtension() call. */
export async function draftFieldViaExtension(
  worker: Worker,
  fieldId: string,
): Promise<DraftFieldResult> {
  return worker.evaluate(async (id) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return (await chrome.tabs.sendMessage(tab.id!, {
      type: "AI_DRAFT_FIELD",
      fieldId: id,
    })) as DraftFieldResult;
  }, fieldId);
}

/**
 * Sends AI_DRAFT_COVER_LETTER (T7) to the active tab for a fieldId from a
 * prior fillViaExtension() call — the dedicated cover-letter flow, distinct
 * from the generic draftFieldViaExtension above.
 */
export async function draftCoverLetterViaExtension(
  worker: Worker,
  fieldId: string,
  company: string,
  style: "formal" | "startup" | "creative" = "formal",
): Promise<DraftFieldResult> {
  return worker.evaluate(
    async ({ id, company, style }) => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return (await chrome.tabs.sendMessage(tab.id!, {
        type: "AI_DRAFT_COVER_LETTER",
        fieldId: id,
        company,
        style,
      })) as DraftFieldResult;
    },
    { id: fieldId, company, style },
  );
}
