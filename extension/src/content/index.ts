/**
 * Content script — runs in the page context on supported ATS pages (or is
 * injected on demand via the popup on any other site).
 * Responsibilities: detect the ATS, respond to fill/status requests from the
 * popup (via the background worker), write values to the DOM, and continue a
 * user-started fill session across wizard steps / SPA navigations (M4).
 *
 * It NEVER submits the form. The only DOM writes happen through fillExecutor,
 * which only sets input values.
 */
import type { ExtensionMessage, ExtensionResponse } from "@/shared/types";
import { loadProfile } from "@/storage/profile";
import { loadAutofillOnNavigation } from "@/storage/settings";
import { detectAndFill, detectOnly, getLastHandle, writeValueToField } from "./fillExecutor";
import { canAutoFill, loadSession, recordFill, summarize } from "./fillSession";
import { enrichWithAI } from "./aiEnrich";
import { scrapeJobDescription } from "./jdScraper";
import { applyRemoteHints } from "@/adapters/platforms";
import { loadAdapterConfig } from "@/adapters/remoteConfig";

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (r: ExtensionResponse) => void) => {
    handle(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
    return true; // async response
  },
);

async function handle(message: ExtensionMessage): Promise<ExtensionResponse> {
  switch (message.type) {
    case "DETECT_ATS": {
      const { platform } = detectOnly();
      return { ok: true, platform };
    }
    case "GET_PAGE_STATUS": {
      const { platform } = detectOnly();
      const session = summarize(await loadSession());
      return { ok: true, platform, session };
    }
    case "FILL_FORM": {
      const result = await runFill({ auto: false });
      const session = summarize(await loadSession());
      return { ok: true, result, session };
    }
    case "AI_DRAFT_FIELD": {
      return draftField(message.fieldId);
    }
    default:
      return { ok: false, error: `Unhandled message: ${(message as { type: string }).type}` };
  }
}

async function runFill(opts: { auto: boolean }) {
  const profile = await loadProfile();
  const result = await detectAndFill(profile);
  // Classify leftover unknowns in one batched AI call (advisory badges only).
  await enrichWithAI(result.matches);
  await recordFill(result.filledCount, { auto: opts.auto });
  // Report back to the background worker for history persistence.
  void chrome.runtime.sendMessage({ type: "FILL_DONE", result }).catch(() => {});
  return result;
}

/**
 * AI draft for a free-text field (M5): the popup's "AI draft" button lands
 * here. The question is the field's own label; the visible job description is
 * scraped for context; the answer (cache-first, via the background worker) is
 * written into the field for the user to review — never submitted.
 */
async function draftField(fieldId: string): Promise<ExtensionResponse> {
  const handle = getLastHandle(fieldId);
  if (!handle) return { ok: false, error: "Field not found — run Autofill first." };

  const question = handle.discovered.label || handle.discovered.nearbyText || "";
  if (!question.trim()) return { ok: false, error: "Field has no readable question text." };

  const jdSummary = scrapeJobDescription();
  const response = (await chrome.runtime.sendMessage({
    type: "REQUEST_AI_ANSWER",
    question,
    jdSummary,
  })) as { ok: boolean; answer?: { answer: string }; cached?: boolean; error?: string };

  const text = response?.answer?.answer ?? "";
  if (!response?.ok || !text.trim()) {
    return { ok: false, error: response?.error ?? "No answer generated." };
  }
  const written = await writeValueToField(fieldId, text);
  if (!written) return { ok: false, error: "Could not write to the field." };
  return { ok: true, value: text, cached: response.cached };
}

// ---------------------------------------------------------------------------
// M4 — multi-page continuation.
//
// SPA route changes are detected by polling location.href (content scripts run
// in an isolated world, so page-script pushState calls can't be hooked) plus
// popstate/hashchange events. Polling only runs while a fresh session exists.
// Full page loads re-run this script, so resumeSessionOnLoad covers those.
// ---------------------------------------------------------------------------

const NAV_POLL_MS = 800;
const NAV_DEBOUNCE_MS = 700;

let lastHref = location.href;
let navTimer: ReturnType<typeof setTimeout> | undefined;

async function maybeAutoFill(): Promise<void> {
  if (!(await loadAutofillOnNavigation())) return;
  const session = await loadSession();
  if (!canAutoFill(session)) return;
  const result = await runFill({ auto: true });
  if (result.filledCount > 0) {
    console.info(`[AI Job Autofill] continued session: filled ${result.filledCount} field(s)`);
  }
}

function onPossibleNavigation(): void {
  if (location.href === lastHref) return;
  lastHref = location.href;
  if (navTimer) clearTimeout(navTimer);
  // Let the SPA render the new step before scanning.
  navTimer = setTimeout(() => void maybeAutoFill(), NAV_DEBOUNCE_MS);
}

function installNavigationWatcher(): void {
  window.addEventListener("popstate", onPossibleNavigation);
  window.addEventListener("hashchange", onPossibleNavigation);
  setInterval(onPossibleNavigation, NAV_POLL_MS);
}

/** Full page load with a fresh session (wizard step, refresh): continue it. */
async function resumeSessionOnLoad(): Promise<void> {
  const session = await loadSession();
  if (!canAutoFill(session)) return;
  // Give client-side rendering a moment; retry once for slow steps.
  setTimeout(() => {
    void maybeAutoFill().then(async () => {
      const { fieldCount } = detectOnly();
      if (fieldCount === 0) setTimeout(() => void maybeAutoFill(), 2500);
    });
  }, 1000);
}

installNavigationWatcher();
void resumeSessionOnLoad();
// Extra detection fingerprints from remote config (hot-updatable, additive).
void loadAdapterConfig().then(applyRemoteHints).catch(() => {});

// Announce presence on load (helps the popup know the content script is live).
void chrome.runtime.sendMessage({ type: "CONTENT_READY", url: location.href }).catch(() => {});
