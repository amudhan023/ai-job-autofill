/**
 * Background service worker (MV3). Kept intentionally thin per the plan:
 * orchestration + history persistence + AI proxy. Heavy work stays on the
 * backend; this only routes.
 */
import type { FillResult } from "@/shared/types";
import { recordApplication } from "@/storage/history";
import { loadProfile } from "@/storage/profile";
import { getCachedAnswer, putCachedAnswer } from "@/storage/answerCache";
import {
  getBackendClient,
  type AnswerResponse,
  type CoverLetterResponse,
} from "@/api/client";

interface InternalMessage {
  type:
    | "FILL_DONE"
    | "CONTENT_READY"
    | "REPORT_PAGE_STATUS"
    | "REQUEST_AI_ANSWER"
    | "REQUEST_COVER_LETTER"
    | "REQUEST_CLASSIFY_BATCH"
    | "OPEN_DASHBOARD";
  result?: FillResult;
  url?: string;
  question?: string;
  questions?: string[];
  jdSummary?: string;
  company?: string;
  style?: "formal" | "startup" | "creative";
  /** REPORT_PAGE_STATUS: whether this tab has a supported ATS / fillable form. */
  hasForm?: boolean;
}

const SIDE_PANEL_PATH = "src/sidepanel/index.html";

/**
 * Side panel (M7 follow-up): only show it as available on tabs where the
 * content script actually found something fillable, so it doesn't clutter
 * every tab (Gmail, search, etc.) the user happens to have open alongside
 * their job applications — each tab's panel reflects that tab's own form.
 * Tabs we've never heard from (no content script has run there yet — outside
 * the declared ATS hosts, not yet loaded) are left at the manifest default
 * (enabled) so the on-demand "scan this page" flow in the panel still works.
 */
async function updateSidePanelForTab(tabId: number, hasForm: boolean): Promise<void> {
  try {
    if (hasForm) {
      await chrome.sidePanel?.setOptions?.({ tabId, path: SIDE_PANEL_PATH, enabled: true });
    } else {
      await chrome.sidePanel?.setOptions?.({ tabId, enabled: false });
    }
  } catch {
    // Side Panel API unavailable (<Chrome 114) — no-op.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.info("[AI Job Autofill] installed");
});

// Side panel (M7): clicking the toolbar icon opens the docked panel instead
// of a popup, so it stays open next to the job application as you work —
// no default_popup is set in the manifest, so this is the only way the icon
// click is handled. Older Chrome without the Side Panel API (<114) simply
// has no chrome.sidePanel — guarded like the storage.session call above.
try {
  void chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
} catch {
  // Side Panel API unavailable — action click becomes a no-op, same as if
  // no popup/panel were configured at all.
}

// Let content scripts read/write chrome.storage.session (fill-session state,
// M4). Session storage is trusted-contexts-only by default.
try {
  void chrome.storage.session?.setAccessLevel?.({
    accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
  });
} catch {
  // Older Chrome — fillSession falls back to storage.local.
}

// Keyboard shortcut → tell the active tab to fill.
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "autofill") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "FILL_FORM" });
    } catch {
      // no content script on this page — ignore
    }
  }
});

chrome.runtime.onMessage.addListener((message: InternalMessage, sender, sendResponse) => {
  handle(message, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
  return true; // async
});

async function handle(
  message: InternalMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case "FILL_DONE": {
      if (!message.result) return { ok: true };
      const record = await recordApplication(message.result);
      return { ok: true, record };
    }
    case "REPORT_PAGE_STATUS": {
      if (sender.tab?.id !== undefined) {
        await updateSidePanelForTab(sender.tab.id, message.hasForm ?? false);
      }
      return { ok: true };
    }
    case "REQUEST_AI_ANSWER": {
      const question = message.question ?? "";
      // Cache first (M5): repeat questions across applications are free.
      const cached = await getCachedAnswer(question);
      if (cached) {
        return { ok: true, answer: { answer: cached.answer, category: cached.category, model: cached.model }, cached: true };
      }
      const client = await getBackendClient();
      if (!client) return { ok: false, error: "Could not read backend settings" };
      const profile = await loadProfile();
      const res: AnswerResponse = await client.answer({
        question,
        jd_summary: message.jdSummary ?? "",
        experience: profile.experience,
      });
      if (res.answer && !res.stubbed) {
        await putCachedAnswer(question, {
          answer: res.answer,
          category: res.category,
          model: res.model,
        });
      }
      return { ok: true, answer: res, cached: false };
    }
    case "REQUEST_CLASSIFY_BATCH": {
      const client = await getBackendClient();
      if (!client) return { ok: false, error: "Could not read backend settings" };
      const res = await client.classifyBatch(message.questions ?? []);
      return { ok: true, categories: res.categories };
    }
    case "REQUEST_COVER_LETTER": {
      const client = await getBackendClient();
      if (!client) return { ok: false, error: "Could not read backend settings" };
      const profile = await loadProfile();
      const res: CoverLetterResponse = await client.coverLetter({
        profileSummary: summarizeProfile(profile),
        jdSummary: message.jdSummary ?? "",
        company: message.company ?? "",
        style: message.style ?? "formal",
      });
      return { ok: true, coverLetter: res };
    }
    default:
      return { ok: true };
  }
}

function summarizeProfile(profile: Awaited<ReturnType<typeof loadProfile>>): string {
  const p = profile.personal;
  const exp = profile.experience[0];
  const role = exp ? `${exp.title} at ${exp.company}` : "";
  return [
    `${p.firstName} ${p.lastName}`.trim(),
    role,
    `${profile.meta.totalYearsExp} years experience`,
    profile.skills.technical.slice(0, 8).join(", "),
  ]
    .filter(Boolean)
    .join("; ");
}
