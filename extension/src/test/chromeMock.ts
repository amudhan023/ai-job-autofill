import { vi } from "vitest";

/**
 * Minimal in-memory mock of the chrome.* APIs the extension touches.
 * Install with installChromeMock() in a test's beforeEach; reset with reset().
 */
export interface ChromeMock {
  _store: Record<string, unknown>;
  _messageHandlers: Array<(msg: unknown, sender: unknown, send: (r: unknown) => void) => boolean | void>;
  _changeHandlers: Array<(changes: Record<string, { newValue?: unknown }>, area: string) => void>;
  storage: {
    local: {
      get: (key: string) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
    onChanged: { addListener: (cb: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => void };
  };
  runtime: {
    sendMessage: ReturnType<typeof vi.fn>;
    onMessage: { addListener: (cb: (msg: unknown, sender: unknown, send: (r: unknown) => void) => boolean | void) => void };
    onInstalled: { addListener: (cb: () => void) => void };
    openOptionsPage: ReturnType<typeof vi.fn>;
  };
  tabs: {
    query: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    onActivated: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
    onUpdated: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
  };
  sidePanel: {
    setPanelBehavior: ReturnType<typeof vi.fn>;
    setOptions: ReturnType<typeof vi.fn>;
  };
}

export function createChromeMock(): ChromeMock {
  const store: Record<string, unknown> = {};
  const messageHandlers: ChromeMock["_messageHandlers"] = [];
  const changeHandlers: ChromeMock["_changeHandlers"] = [];

  return {
    _store: store,
    _messageHandlers: messageHandlers,
    _changeHandlers: changeHandlers,
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          const changes: Record<string, { newValue?: unknown }> = {};
          for (const [k, v] of Object.entries(items)) {
            store[k] = v;
            changes[k] = { newValue: v };
          }
          changeHandlers.forEach((h) => h(changes, "local"));
        },
      },
      onChanged: {
        addListener: (cb) => changeHandlers.push(cb),
      },
    },
    runtime: {
      sendMessage: vi.fn(async () => ({ ok: true })),
      onMessage: { addListener: (cb) => messageHandlers.push(cb) },
      onInstalled: { addListener: () => {} },
      openOptionsPage: vi.fn(),
    },
    tabs: {
      query: vi.fn(async () => [{ id: 1 }]),
      sendMessage: vi.fn(async () => ({ ok: true })),
      onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    sidePanel: {
      setPanelBehavior: vi.fn(async () => undefined),
      setOptions: vi.fn(async () => undefined),
    },
  };
}

export function installChromeMock(): ChromeMock {
  const mock = createChromeMock();
  (globalThis as unknown as { chrome: unknown }).chrome = mock;
  return mock;
}
