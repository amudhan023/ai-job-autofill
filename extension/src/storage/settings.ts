/** Extension settings persisted in chrome.storage.local. */

const BACKEND_URL_KEY = "backendUrl";

/** Default backend URL — the local dev server started by `uvicorn app.main:app`. */
const DEFAULT_BACKEND_URL = "http://localhost:8000";

/**
 * Load the configured backend URL.
 * Falls back to http://localhost:8000 so the extension works out of the box
 * when running the backend locally without any manual settings step.
 */
export async function loadBackendUrl(): Promise<string> {
  const stored = await chrome.storage.local.get(BACKEND_URL_KEY);
  const url = stored[BACKEND_URL_KEY] as string | undefined;
  return url && url.trim() ? url.trim() : DEFAULT_BACKEND_URL;
}

export async function saveBackendUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [BACKEND_URL_KEY]: url });
}
