/**
 * Local resume file storage (M6 — file-upload intelligence).
 *
 * The options page stores the uploaded resume's bytes (base64) in
 * chrome.storage.local so the content script can attach it to "Resume/CV"
 * file inputs on application forms. Local-first like the profile: the file
 * never leaves the machine except through the user's own form submission.
 */

export interface StoredResumeFile {
  name: string;
  mimeType: string;
  /** Base64-encoded file bytes. */
  data: string;
  savedAt: number;
}

const RESUME_FILE_KEY = "resumeFile";
/** Raw-size cap; base64 inflates ~4/3 and storage.local allows 10MB total. */
const MAX_BYTES = 5 * 1024 * 1024;

export async function saveResumeFile(file: File): Promise<boolean> {
  if (file.size > MAX_BYTES) return false;
  const data = arrayBufferToBase64(await readAsArrayBuffer(file));
  const stored: StoredResumeFile = {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    data,
    savedAt: Date.now(),
  };
  try {
    await chrome.storage.local.set({ [RESUME_FILE_KEY]: stored });
    return true;
  } catch {
    return false;
  }
}

export async function loadResumeFile(): Promise<File | null> {
  try {
    const stored = await chrome.storage.local.get(RESUME_FILE_KEY);
    const entry = stored[RESUME_FILE_KEY] as StoredResumeFile | undefined;
    if (!entry?.data) return null;
    return new File([base64ToBytes(entry.data)], entry.name, { type: entry.mimeType });
  } catch {
    return null;
  }
}

export async function hasResumeFile(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(RESUME_FILE_KEY);
    return !!(stored[RESUME_FILE_KEY] as StoredResumeFile | undefined)?.data;
  } catch {
    return false;
  }
}

/** Blob.arrayBuffer with a FileReader fallback (jsdom, older engines). */
function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(data: string): ArrayBuffer {
  const binary = atob(data);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}
