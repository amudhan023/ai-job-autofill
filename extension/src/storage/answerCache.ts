/**
 * Local AI answer cache (M5). Free-text questions repeat almost verbatim
 * across applications ("Why do you want to work here?" modulo the company
 * name), so answers are cached in chrome.storage.local keyed on normalized
 * question text — repeat questions cost nothing and work offline.
 */

export interface CachedAnswer {
  answer: string;
  category: string;
  model: string;
  createdAt: number;
}

const CACHE_KEY = "answerCache";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ENTRIES = 100;

/** Normalize a question for cache lookup: casing, whitespace, punctuation. */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

type CacheMap = Record<string, CachedAnswer>;

async function readCache(): Promise<CacheMap> {
  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    return (stored[CACHE_KEY] as CacheMap | undefined) ?? {};
  } catch {
    return {};
  }
}

export async function getCachedAnswer(question: string): Promise<CachedAnswer | null> {
  const cache = await readCache();
  const hit = cache[normalizeQuestion(question)];
  if (!hit) return null;
  if (Date.now() - hit.createdAt > TTL_MS) return null;
  return hit;
}

export async function putCachedAnswer(
  question: string,
  entry: Omit<CachedAnswer, "createdAt">,
): Promise<void> {
  if (!entry.answer.trim()) return; // never cache empty/stub responses
  const cache = await readCache();
  cache[normalizeQuestion(question)] = { ...entry, createdAt: Date.now() };

  // Evict expired entries, then the oldest beyond the cap.
  const now = Date.now();
  const entries = Object.entries(cache).filter(([, v]) => now - v.createdAt <= TTL_MS);
  entries.sort((a, b) => b[1].createdAt - a[1].createdAt);
  const trimmed = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: trimmed });
  } catch {
    // Cache is best-effort.
  }
}
