/**
 * Background service worker (MV3). Kept intentionally thin per the plan:
 * orchestration + history persistence only. Heavy AI work is offloaded to the
 * backend in later phases, not run here (MV3 workers have tight memory limits).
 */
import type { FillResult } from "@/shared/types";
import { recordApplication } from "@/storage/history";

interface InternalMessage {
  type: "FILL_DONE" | "CONTENT_READY";
  result?: FillResult;
  url?: string;
}

chrome.runtime.onInstalled.addListener(() => {
  console.info("[AI Job Autofill] installed");
});

chrome.runtime.onMessage.addListener((message: InternalMessage, _sender, sendResponse) => {
  if (message.type === "FILL_DONE" && message.result) {
    recordApplication(message.result)
      .then((record) => sendResponse({ ok: true, record }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }
  // CONTENT_READY and others: no-op ack.
  sendResponse({ ok: true });
  return false;
});
