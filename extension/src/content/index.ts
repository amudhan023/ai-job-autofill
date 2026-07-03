/**
 * Content script — runs in the page context on supported ATS pages.
 * Responsibilities: detect the ATS, respond to fill/status requests from the
 * popup (via the background worker), and write values to the DOM.
 *
 * It NEVER submits the form. The only DOM writes happen through fillExecutor,
 * which only sets input values.
 */
import type { ExtensionMessage, ExtensionResponse } from "@/shared/types";
import { loadProfile } from "@/storage/profile";
import { detectAndFill, detectOnly } from "./fillExecutor";

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
      return { ok: true, platform };
    }
    case "FILL_FORM": {
      const profile = await loadProfile();
      const result = await detectAndFill(profile);
      // Report back to the background worker for history persistence.
      void chrome.runtime.sendMessage({ type: "FILL_DONE", result }).catch(() => {});
      return { ok: true, result };
    }
    default:
      return { ok: false, error: `Unhandled message: ${(message as { type: string }).type}` };
  }
}

// Announce presence on load (helps the popup know the content script is live).
void chrome.runtime.sendMessage({ type: "CONTENT_READY", url: location.href }).catch(() => {});
