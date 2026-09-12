/**
 * Local application-file storage (M6 — file-upload intelligence).
 *
 * The options page stores an uploaded document's bytes (base64) in
 * chrome.storage.local so the content script can attach it to the matching
 * file input on an application form. Local-first like the profile: the file
 * never leaves the machine except through the user's own form submission.
 *
 * Two documents are stored under two keys — the resume and the cover letter.
 * Everything below is key-parameterized; the exported pairs are thin wrappers.
 */

export interface StoredResumeFile {
  name: string;
  mimeType: string;
  /** Base64-encoded file bytes. */
  data: string;
  savedAt: number;
}

const RESUME_FILE_KEY = "resumeFile";
const COVER_LETTER_FILE_KEY = "coverLetterFile";
/** Raw-size cap; base64 inflates ~4/3 and storage.local allows 10MB total. */
const MAX_BYTES = 5 * 1024 * 1024;

async function saveFile(key: string, file: File): Promise<boolean> {
  if (file.size > MAX_BYTES) return false;
  const data = arrayBufferToBase64(await readAsArrayBuffer(file));
  const stored: StoredResumeFile = {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    data,
    savedAt: Date.now(),
  };
  try {
    await chrome.storage.local.set({ [key]: stored });
    return true;
  } catch {
    return false;
  }
}

async function loadFile(key: string): Promise<File | null> {
  try {
    const stored = await chrome.storage.local.get(key);
    const entry = stored[key] as StoredResumeFile | undefined;
    if (!entry?.data) return null;
    return new File([base64ToBytes(entry.data)], entry.name, { type: entry.mimeType });
  } catch {
    return null;
  }
}

async function hasFile(key: string): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(key);
    return !!(stored[key] as StoredResumeFile | undefined)?.data;
  } catch {
    return false;
  }
}

export const saveResumeFile = (file: File) => saveFile(RESUME_FILE_KEY, file);
export const loadResumeFile = () => loadFile(RESUME_FILE_KEY);
export const hasResumeFile = () => hasFile(RESUME_FILE_KEY);

export const saveCoverLetterFile = (file: File) => saveFile(COVER_LETTER_FILE_KEY, file);
export const loadCoverLetterFile = () => loadFile(COVER_LETTER_FILE_KEY);
export const hasCoverLetterFile = () => hasFile(COVER_LETTER_FILE_KEY);

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
