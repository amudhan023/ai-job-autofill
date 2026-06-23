import type { ApplicationRecord, FillResult } from "@/shared/types";

/**
 * Local application history in IndexedDB. Stays on-device (privacy-first);
 * nothing here is uploaded.
 */
const DB_NAME = "ai-job-autofill";
const STORE = "applications";
const VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("date", "date");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function recordApplication(result: FillResult): Promise<ApplicationRecord> {
  const record: ApplicationRecord = {
    id: `${result.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    url: result.url,
    company: companyFromUrl(result.url),
    platform: result.platform,
    date: result.timestamp,
    fieldsFilled: result.filledCount,
    fieldsTotal: result.totalFields,
    aiAssisted: result.matches.filter((m) => m.flags.includes("ai_generate")).length,
  };
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

export async function listApplications(): Promise<ApplicationRecord[]> {
  const db = await openDB();
  const records = await new Promise<ApplicationRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as ApplicationRecord[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return records.sort((a, b) => b.date - a.date);
}

export function companyFromUrl(url: string): string {
  try {
    const u = new URL(url);
    // jobs.lever.co/{company}/... or boards.greenhouse.io/{company}/...
    const seg = u.pathname.split("/").filter(Boolean)[0];
    return seg ?? u.hostname;
  } catch {
    return "unknown";
  }
}
