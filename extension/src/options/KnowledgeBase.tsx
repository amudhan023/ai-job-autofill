import { useEffect, useState } from "react";
import { BackendClient } from "@/api/client";
import { loadBackendUrl } from "@/storage/settings";

function connectionErrorMessage(e: unknown, action: string): string {
  const msg = e instanceof Error ? e.message : action + " failed";
  const isConnectionError =
    msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("timed out");
  return isConnectionError
    ? `${action} the knowledge base needs the backend: cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
    : msg;
}

/**
 * Freeform corpus (paste/edit, no file upload) backing the persisted RAG
 * knowledge base — retrieved alongside resume experience when the AI drafts
 * an answer for a free-text question with no matching rule. Mirrors
 * ResumeUploadSection's backend-URL + BackendClient pattern.
 */
export function KnowledgeBase() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "done" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    void (async () => {
      const url = await loadBackendUrl();
      try {
        const client = new BackendClient(url.replace(/\/$/, ""));
        const { chunks } = await client.getDocuments();
        setText(chunks.join("\n\n"));
        setStatus("idle");
      } catch (e) {
        setErrorMsg(connectionErrorMessage(e, "Loading"));
        setStatus("error");
      }
    })();
  }, []);

  const onSave = async () => {
    setStatus("saving");
    setErrorMsg("");
    const url = await loadBackendUrl();
    try {
      const client = new BackendClient(url.replace(/\/$/, ""));
      const { chunks } = await client.saveDocuments(text);
      setText(chunks.join("\n\n"));
      setStatus("done");
    } catch (e) {
      setErrorMsg(connectionErrorMessage(e, "Saving"));
      setStatus("error");
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
      <span className="text-sm font-medium text-gray-700">Knowledge base</span>
      <p className="mb-3 mt-1 text-xs text-gray-500">
        Paste background info, anecdotes, or project details — separated by blank lines. Used to
        draft answers for free-text questions that don't match a rule (e.g. "Tell me about a time
        you...").
      </p>
      <textarea
        aria-label="Knowledge base"
        className="mb-2 h-32 w-full rounded-md border border-gray-300 p-2 text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={status === "loading"}
      />
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={status === "loading" || status === "saving"}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        {status === "saving" ? "Saving…" : "Save"}
      </button>
      {status === "done" && <span className="ml-3 text-sm text-green-600">Saved ✓</span>}
      {status === "error" && <p className="mt-2 text-sm text-red-600">{errorMsg}</p>}
    </div>
  );
}
