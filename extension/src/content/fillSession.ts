/**
 * Fill-session state (M4 — multi-page applications).
 *
 * A "session" starts when the user triggers a fill on an origin and lets the
 * extension continue the same application across wizard steps, SPA route
 * changes, and full page loads. Stored in chrome.storage.session (evicted when
 * the browser closes; the background worker grants content scripts access),
 * falling back to storage.local where session storage is unavailable.
 *
 * Sessions are deliberately bounded: they expire after 30 minutes of
 * inactivity and allow at most 10 automatic (navigation-triggered) fill
 * passes — automation stays scoped to the application the user started.
 */

import type { SessionSummary } from "@/shared/types";

export interface FillSessionState {
  /** Scope the session is bound to (origin + first path segment). */
  scope: string;
  startedAt: number;
  updatedAt: number;
  /** Distinct page keys (pathname+search) that have been filled. */
  pages: string[];
  /** Cumulative fields written across the session. */
  fieldsFilled: number;
  /** Automatic (navigation-triggered) fill passes performed. */
  autoFills: number;
}

/**
 * Session scope: origin + first path segment, NOT just the origin. Multi-
 * tenant ATS hosts (boards.greenhouse.io/{company}) would otherwise leak a
 * session started on one company's application into another's.
 */
export function currentScope(loc: { origin: string; pathname: string } = location): string {
  const first = loc.pathname.split("/")[1] ?? "";
  return `${loc.origin}/${first}`;
}

const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_AUTO_FILLS = 10;

function key(scope: string): string {
  return `fillSession:${scope}`;
}

type StorageArea = {
  get: (k: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove?: (k: string) => Promise<void>;
};

function area(): StorageArea {
  const c = chrome as unknown as { storage: { session?: StorageArea; local: StorageArea } };
  return c.storage.session ?? c.storage.local;
}

export function isFresh(
  state: FillSessionState | null,
  now = Date.now(),
): state is FillSessionState {
  return !!state && now - state.updatedAt < MAX_AGE_MS;
}

/** Pure decision: may a navigation trigger another automatic fill pass? */
export function canAutoFill(state: FillSessionState | null, now = Date.now()): boolean {
  return isFresh(state, now) && state.autoFills < MAX_AUTO_FILLS;
}

export async function loadSession(scope = currentScope()): Promise<FillSessionState | null> {
  try {
    const stored = await area().get(key(scope));
    const state = stored[key(scope)] as FillSessionState | undefined;
    return isFresh(state ?? null) ? (state as FillSessionState) : null;
  } catch {
    return null;
  }
}

/** Record a completed fill pass (manual or automatic) against the session. */
export async function recordFill(
  filledCount: number,
  opts: { auto: boolean; scope?: string; page?: string },
): Promise<FillSessionState> {
  const scope = opts.scope ?? currentScope();
  const page = opts.page ?? location.pathname + location.search;
  const now = Date.now();
  const existing = await loadSession(scope);
  const state: FillSessionState = existing ?? {
    scope,
    startedAt: now,
    updatedAt: now,
    pages: [],
    fieldsFilled: 0,
    autoFills: 0,
  };
  state.updatedAt = now;
  state.fieldsFilled += filledCount;
  if (!state.pages.includes(page)) state.pages.push(page);
  if (opts.auto) state.autoFills += 1;
  try {
    await area().set({ [key(scope)]: state });
  } catch {
    // Storage unavailable — session degrades to per-page behavior.
  }
  return state;
}

export function summarize(state: FillSessionState | null): SessionSummary | undefined {
  if (!state) return undefined;
  return { pages: state.pages.length, fieldsFilled: state.fieldsFilled };
}
