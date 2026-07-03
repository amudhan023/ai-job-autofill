import { useEffect, useState } from "react";
import type {
  ATSPlatform,
  ExtensionResponse,
  FieldMatch,
  FillResult,
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
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    void sendToActiveTab({ type: "GET_PAGE_STATUS" }).then((res) => {
      if (res && res.ok && "platform" in res) setPlatform(res.platform);
      else setPlatform("unscanned");
    });
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
  return (
    <div className="mt-4 border-t pt-3">
      <p className="mb-2 font-medium">
        Filled {result.filledCount} of {result.totalFields} fields
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {result.matches.map((m: FieldMatch) => (
          <li key={m.fieldId} className="flex items-center justify-between gap-2">
            <span className="truncate" title={m.reason}>
              {m.label || "(unlabeled)"}
            </span>
            <ConfidenceBadge match={m} />
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
