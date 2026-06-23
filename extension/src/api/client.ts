/**
 * Typed client for the backend AI services. Used by the background worker
 * (extension contexts proxy AI through the BG worker to keep one network
 * surface). The backend base URL is configurable in settings; AI features stay
 * dormant when no backend/keys are configured.
 */
import type { UserProfile } from "@/shared/profile";

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

export class BackendClient {
  constructor(
    private baseUrl: string,
    private timeoutMs = 20_000,
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    // Bound every request so a hung/unreachable backend can't wedge the service
    // worker indefinitely.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`backend ${path} ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`backend ${path} timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async parseResume(file: File): Promise<UserProfile> {
    const form = new FormData();
    form.append("file", file);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/resume/parse`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`backend /resume/parse ${res.status}`);
      return (await res.json()) as UserProfile;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`backend /resume/parse timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  classify(question: string): Promise<{ category: string }> {
    return this.post("/ai/classify", { question });
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

const BACKEND_URL_KEY = "backendUrl";

/** Resolve the configured backend client, or null when AI is not enabled. */
export async function getBackendClient(): Promise<BackendClient | null> {
  try {
    const stored = await chrome.storage.local.get(BACKEND_URL_KEY);
    const url = stored[BACKEND_URL_KEY] as string | undefined;
    if (!url) return null;
    return new BackendClient(url.replace(/\/$/, ""));
  } catch {
    return null;
  }
}
