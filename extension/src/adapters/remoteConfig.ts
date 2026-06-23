/**
 * Remote adapter config (Phase 2 — "ATS adapter config via remote JSON").
 *
 * Adapter detection hints and field overrides can be hot-updated without
 * shipping a new extension build. In production this fetches a versioned JSON
 * from the Form Registry service and caches it in chrome.storage.local; if the
 * fetch fails or is stale, we fall back to the bundled defaults below.
 *
 * The bundled defaults are intentionally conservative — the compiled adapters
 * remain the source of truth; remote config only augments/overrides.
 */

export interface AdapterConfigEntry {
  platform: string;
  /** Extra CSS selectors that count toward the DOM fingerprint signal. */
  extraFingerprints?: string[];
  /** Label-pattern → rule-id overrides for site-specific quirks. */
  fieldOverrides?: Record<string, string>;
}

export interface RemoteAdapterConfig {
  version: number;
  updatedAt: string;
  adapters: AdapterConfigEntry[];
}

const STORAGE_KEY = "adapterConfig";

/** Bundled fallback — kept in sync with the compiled adapters. */
export const BUNDLED_CONFIG: RemoteAdapterConfig = {
  version: 1,
  updatedAt: "2026-06-22",
  adapters: [
    { platform: "greenhouse" },
    { platform: "lever" },
    { platform: "ashby" },
    { platform: "workday" },
    { platform: "icims" },
    { platform: "smartrecruiters" },
    { platform: "bamboohr" },
  ],
};

/** Load config: cached → bundled. (Network refresh handled by refreshConfig.) */
export async function loadAdapterConfig(): Promise<RemoteAdapterConfig> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const cached = stored[STORAGE_KEY] as RemoteAdapterConfig | undefined;
    if (cached && cached.version >= BUNDLED_CONFIG.version) return cached;
  } catch {
    // storage unavailable (e.g. tests) — fall through to bundled
  }
  return BUNDLED_CONFIG;
}

/**
 * Fetch the latest config from the registry and cache it if newer.
 * Returns the config now in effect. Safe to call best-effort on startup.
 */
export async function refreshConfig(registryUrl: string): Promise<RemoteAdapterConfig> {
  try {
    const res = await fetch(registryUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`registry ${res.status}`);
    const remote = (await res.json()) as RemoteAdapterConfig;
    if (remote.version > BUNDLED_CONFIG.version) {
      await chrome.storage.local.set({ [STORAGE_KEY]: remote });
      return remote;
    }
  } catch {
    // Offline or bad payload — keep whatever we have.
  }
  return loadAdapterConfig();
}
