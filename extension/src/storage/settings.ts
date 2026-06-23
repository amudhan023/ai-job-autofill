/** Extension settings persisted in chrome.storage.local. */

const BACKEND_URL_KEY = "backendUrl";

export async function loadBackendUrl(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(BACKEND_URL_KEY);
  return stored[BACKEND_URL_KEY] as string | undefined;
}

export async function saveBackendUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [BACKEND_URL_KEY]: url });
}
