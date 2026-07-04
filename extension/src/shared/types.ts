/**
 * Core types shared across content script, background worker, and UI.
 */

import type { UserProfile } from "./profile";

/** Supported ATS platforms (Phase 1 + Phase 2). */
export type ATSPlatform =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "icims"
  | "smartrecruiters"
  | "bamboohr"
  /** No known ATS matched, but the page has a fillable form — universal engine. */
  | "generic"
  | "unknown";

/** Input control kinds the fill engine knows how to write. */
export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "select"
  | "radio"
  | "checkbox"
  | "textarea"
  | "file";

/** Behavioral flags on a rule (confirm before fill, AI-generate, etc.). */
export type RuleFlag = "confirm" | "ai_generate" | "blocklist";

/**
 * A deterministic mapping from label/placeholder patterns to a profile path.
 * `profile` is a dot-path into UserProfile (supports `arr[0].field`); a null
 * profile means the value is not deterministic (e.g. AI-generated free text).
 */
export interface FieldRule {
  id: string;
  patterns: RegExp[];
  profile: string | null;
  type: FieldType;
  flags?: RuleFlag[];
  /** Optional value transform (e.g. boolean → "Yes"/"No"). */
  transform?: (value: unknown) => string;
  /**
   * HTML `autocomplete` tokens that authoritatively identify this field
   * (e.g. "given-name"). Spec-defined semantics — strongest match signal.
   */
  autocomplete?: string[];
}

/** Confidence tier drives the badge color shown to the user. */
export type ConfidenceTier = "high" | "medium" | "low";

/** A single field discovered on the page, with its resolved fill decision. */
export interface FieldMatch {
  /** Stable selector-ish id for messaging between content/popup. */
  fieldId: string;
  label: string;
  type: FieldType;
  ruleId: string | null;
  profilePath: string | null;
  value: string | null;
  confidence: number;
  tier: ConfidenceTier;
  flags: RuleFlag[];
  /** Why this decision was made — surfaced on badge hover. */
  reason: string;
  /**
   * AI-suggested category for fields no deterministic rule matched (M5).
   * Advisory only — never triggers a write.
   */
  aiCategory?: string;
  /**
   * True when the field already held a value (never-clobber guard skipped
   * it) rather than having no match/value. Lets the UI distinguish "0 filled
   * because everything was already filled" from "0 filled because nothing
   * matched" — otherwise both look identical as "Filled 0 of N".
   */
  alreadyHadValue?: boolean;
}

/** Result of attempting to fill the current page. */
export interface FillResult {
  platform: ATSPlatform;
  url: string;
  filledCount: number;
  totalFields: number;
  matches: FieldMatch[];
  timestamp: number;
}

/** A persisted application-history record (IndexedDB). */
export interface ApplicationRecord {
  id: string;
  url: string;
  company: string;
  platform: ATSPlatform;
  date: number;
  fieldsFilled: number;
  fieldsTotal: number;
  /** Count of fields flagged for AI free-text assistance. */
  aiAssisted: number;
}

// ---- Messaging contract (typed chrome.runtime / chrome.tabs messages) ----

export type ExtensionMessage =
  | { type: "DETECT_ATS" }
  | { type: "FILL_FORM" }
  | { type: "GET_PAGE_STATUS" }
  | { type: "PROFILE_UPDATED"; profile: UserProfile }
  /** Generate an AI draft for a free-text field from the last fill (M5). */
  | { type: "AI_DRAFT_FIELD"; fieldId: string };

/** Multi-page fill-session progress shown in the popup (M4). */
export interface SessionSummary {
  pages: number;
  fieldsFilled: number;
}

export type ExtensionResponse =
  | { ok: true; platform: ATSPlatform; session?: SessionSummary }
  | { ok: true; result: FillResult; session?: SessionSummary }
  | { ok: true; value: string; cached?: boolean }
  | { ok: false; error: string };
