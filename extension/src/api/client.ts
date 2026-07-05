/**
 * Typed client for the backend AI services. Used by the background worker
 * (extension contexts proxy AI through the BG worker to keep one network
 * surface). The backend base URL is configurable in settings; AI features stay
 * dormant when no backend/keys are configured.
 */
import type { UserProfile } from "@/shared/profile";
import { loadBackendUrl } from "@/storage/settings";

export interface JDExtract {
  requiredSkills: string[];
  niceToHaveSkills: string[];
  yearsExp: number | null;
  domain: string;
  seniorityLevel: string;
  sponsorshipOffered: boolean | null;
  remotePolicy: string;
}

export interface AnswerResponse {
  answer: string;
  confidence: number;
  model: string;
  category: string;
  retrieved: string[];
  stubbed: boolean;
}

export interface AnswerRequest {
  question: string;
  jd_summary?: string;
  experience?: UserProfile["experience"];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BackendClient {
  constructor(
    private baseUrl: string,
    private timeoutMs = 20_000,
    /** Extra attempts beyond the first, for transient failures only. */
    private maxRetries = 1,
    private retryDelayMs = 300,
  ) {}

  /**
   * Shared request path for both JSON and FormData bodies. Bounds every
   * attempt so a hung/unreachable backend can't wedge the service worker
   * indefinitely, and retries transient failures — a network-level error
   * (backend not listening yet, connection reset) or a 5xx (momentary server
   * hiccup) — with a short backoff. A timeout is NOT retried: the backend
   * already took the full budget once, so immediately trying again would
   * only double the user's wait for no better odds of success.
   */
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const attempts = this.maxRetries + 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
        if (res.ok) return (await res.json()) as T;
        if (res.status >= 500 && attempt < attempts) {
          await sleep(this.retryDelayMs * attempt);
          continue;
        }
        throw new Error(`backend ${path} ${res.status}`);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error(`backend ${path} timed out after ${this.timeoutMs}ms`);
        }
        if (err instanceof TypeError && attempt < attempts) {
          await sleep(this.retryDelayMs * attempt);
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`backend ${path} failed after ${attempts} attempts`);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  parseResume(file: File): Promise<UserProfile> {
    const form = new FormData();
    form.append("file", file);
    return this.request<UserProfile>("/resume/parse", { method: "POST", body: form });
  }

  classify(question: string): Promise<{ category: string }> {
    return this.post("/ai/classify", { question });
  }

  /** One request for a whole page's unmatched fields (M5). */
  classifyBatch(questions: string[]): Promise<{ categories: string[] }> {
    return this.post("/ai/classify-batch", { questions });
  }

  extractJD(jdText: string): Promise<JDExtract> {
    return this.post("/ai/jd", { jd_text: jdText });
  }

  answer(req: AnswerRequest): Promise<AnswerResponse> {
    return this.post("/ai/answer", req);
  }

  coverLetter(req: CoverLetterRequest): Promise<CoverLetterResponse> {
    return this.post("/ai/cover-letter", req);
  }
}

export interface CoverLetterRequest {
  profileSummary: string;
  jdSummary: string;
  company: string;
  style?: "formal" | "startup" | "creative";
}

export interface CoverLetterResponse {
  letter: string;
  model: string;
  style: string;
  stubbed: boolean;
}

export type HealthCheckResult =
  | { ok: true; aiEnabled: boolean }
  | { ok: false; error: string };

/**
 * One-shot reachability check against the backend's /health endpoint, for a
 * "Test connection" affordance in Settings — deliberately no retry (the user
 * wants an immediate answer, not resilience) and a short timeout.
 */
export async function checkBackendHealth(baseUrl: string, timeoutMs = 5000): Promise<HealthCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: `backend /health responded ${res.status}` };
    const body = (await res.json()) as { ai_enabled?: boolean };
    return { ok: true, aiEnabled: !!body.ai_enabled };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: `timed out after ${timeoutMs}ms` };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the configured backend client. Shares `loadBackendUrl()`'s
 * zero-config default (localhost:8000) with the resume-parse path — a user
 * who never opened Settings gets the same "try the local default, show a
 * clear connection error if nothing's there" behavior for AI features too,
 * instead of AI silently reporting "not configured" while resume-parse
 * happily tries the default. Returns null only on a genuine storage failure.
 */
export async function getBackendClient(): Promise<BackendClient | null> {
  try {
    const url = await loadBackendUrl();
    return new BackendClient(url.replace(/\/$/, ""));
  } catch {
    return null;
  }
}
