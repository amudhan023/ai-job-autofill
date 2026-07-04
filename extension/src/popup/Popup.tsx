import { useEffect, useState } from "react";
import type {
  ATSPlatform,
  ExtensionResponse,
  FieldMatch,
  FillResult,
  SessionSummary,
} from "@/shared/types";
import { ConfidenceBadge } from "./ConfidenceBadge";

async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function sendToActiveTab(message: object): Promise<ExtensionResponse | null> {
  const tabId = await activeTabId();
  if (tabId === null) return null;
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as ExtensionResponse;
  } catch {
    // Content script not present on this page.
    return null;
  }
}

/**
 * On sites outside the manifest's declared hosts the content script isn't
 * loaded. The popup click is a user gesture, so `activeTab` grants temporary
 * host access and we can inject it on demand — universal reach without
 * requesting `<all_urls>` at install time.
 */
async function injectContentScript(): Promise<boolean> {
  const tabId = await activeTabId();
  if (tabId === null) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["src/content/index.js"],
    });
    return true;
  } catch {
    // Restricted page (chrome://, Web Store, …) — cannot inject.
    return false;
  }
}

/** Page status: a detected platform, or not-yet-scanned (no content script). */
type PageState = ATSPlatform | "loading" | "unscanned";

export function Popup() {
  const [platform, setPlatform] = useState<PageState>("loading");
  const [result, setResult] = useState<FillResult | null>(null);
  const [session, setSession] = useState<SessionSummary | undefined>(undefined);
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      // A previous tab's fill summary is meaningless once we're looking at a
      // different tab/page — clear it while the new status loads.
      setPlatform("loading");
      setResult(null);
      void sendToActiveTab({ type: "GET_PAGE_STATUS" }).then((res) => {
        if (cancelled) return;
        if (res && res.ok && "platform" in res) {
          setPlatform(res.platform);
          setSession(res.session);
        } else setPlatform("unscanned");
      });
    };

    refresh();

    // Rendered in a side panel (M7), this component stays mounted across tab
    // switches and page navigations instead of remounting per-open like the
    // old popup did — so it has to re-detect on those events itself. Harmless
    // no-ops in a classic popup, which unmounts before either would fire.
    const onActivated = () => refresh();
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === "complete") refresh();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      cancelled = true;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  const onFill = async () => {
    setFilling(true);
    let res = await sendToActiveTab({ type: "FILL_FORM" });
    if (res === null && (await injectContentScript())) {
      res = await sendToActiveTab({ type: "FILL_FORM" });
    }
    if (res && res.ok && "result" in res) {
      setResult(res.result);
      setPlatform(res.result.platform);
      setSession(res.session);
    }
    setFilling(false);
  };

  const supported = platform !== "unknown" && platform !== "loading";

  return (
    <div className="p-4 font-sans text-sm text-gray-800">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-semibold">AI Job Autofill</h1>
        <button
          className="text-xs text-blue-600 hover:underline"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          Edit profile
        </button>
      </header>

      <PlatformStatus platform={platform} />

      <button
        disabled={!supported || filling}
        onClick={onFill}
        className="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {filling ? "Filling…" : "Autofill this application"}
      </button>

      <p className="mt-2 text-[11px] text-gray-500">
        We only fill fields — never submit. Review everything before you apply.
      </p>

      {session && session.pages > 0 && (
        <p className="mt-2 rounded bg-blue-50 px-2 py-1 text-[11px] text-blue-700">
          This application: {session.fieldsFilled} field(s) across {session.pages} page(s).
          Continues automatically as you advance.
        </p>
      )}

      {result && <FillSummary result={result} />}
    </div>
  );
}

function PlatformStatus({ platform }: { platform: PageState }) {
  if (platform === "loading") return <p className="text-gray-500">Detecting…</p>;
  if (platform === "unknown")
    return (
      <p className="rounded bg-gray-100 px-2 py-1 text-gray-600">
        No supported ATS detected on this page.
      </p>
    );
  if (platform === "unscanned")
    return (
      <p className="rounded bg-blue-50 px-2 py-1 text-blue-700">
        Page not scanned yet — Autofill will scan this page for a form.
      </p>
    );
  if (platform === "generic")
    return (
      <p className="rounded bg-green-50 px-2 py-1 text-green-700">
        Form detected <span className="font-semibold">(universal engine)</span>
      </p>
    );
  return (
    <p className="rounded bg-green-50 px-2 py-1 text-green-700">
      Detected: <span className="font-semibold capitalize">{platform}</span>
    </p>
  );
}

function FillSummary({ result }: { result: FillResult }) {
  const attention = result.matches.filter((m) => m.value === null || m.tier === "low");
  const alreadyFilled = result.matches.filter((m) => m.alreadyHadValue).length;
  return (
    <div className="mt-4 border-t pt-3">
      <p className="mb-2 font-medium">
        Filled {result.filledCount} of {result.totalFields} fields
        {alreadyFilled > 0 && (
          <span className="font-normal text-gray-500">
            {" "}
            ({alreadyFilled} already had a value — left untouched)
          </span>
        )}
      </p>
      {/* vh-based cap (not a fixed px height): scales with whatever surface
          renders this — a short popup or a much taller docked side panel. */}
      <ul className="max-h-[45vh] space-y-1 overflow-y-auto">
        {result.matches.map((m: FieldMatch) => (
          <li key={m.fieldId} className="flex items-center justify-between gap-2">
            <span className="truncate" title={m.reason}>
              {m.label || "(unlabeled)"}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {/* No AI drafts into file inputs (e.g. a cover-letter UPLOAD
                  matched by the coverLetter rule) — text can't go there. */}
              {m.flags.includes("ai_generate") && m.type !== "file" && (
                <AiDraftButton fieldId={m.fieldId} />
              )}
              <ConfidenceBadge match={m} />
            </span>
          </li>
        ))}
      </ul>
      {attention.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-700">
          {attention.length} field(s) need your attention.
        </p>
      )}
    </div>
  );
}

/**
 * "AI draft" for free-text questions (M5): asks the content script to
 * generate an answer (cache-first) and write it into the field. The value is
 * only ever written into the form for review — never submitted.
 */
function AiDraftButton({ fieldId }: { fieldId: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  const onDraft = async () => {
    setState("working");
    const res = await sendToActiveTab({ type: "AI_DRAFT_FIELD", fieldId });
    setState(res && res.ok ? "done" : "error");
  };

  if (state === "done") return <span className="text-[11px] text-green-600">Drafted ✓</span>;
  return (
    <button
      onClick={onDraft}
      disabled={state === "working"}
      title={state === "error" ? "Draft failed — is the AI backend configured in Options → Settings?" : "Generate a draft answer with AI"}
      className={`rounded border px-1.5 py-0.5 text-[11px] ${
        state === "error"
          ? "border-red-300 text-red-600"
          : "border-blue-300 text-blue-700 hover:bg-blue-50"
      } disabled:opacity-50`}
    >
      {state === "working" ? "Drafting…" : state === "error" ? "Retry AI draft" : "AI draft"}
    </button>
  );
}
