/**
 * UserProfile — the single source of truth for everything the extension fills.
 * Stored locally in chrome.storage.local (see src/storage/profile.ts).
 * Mirrors the backend Pydantic schema (backend/app/models/profile.py).
 */

export interface Location {
  /** Street address line 1 (e.g. "123 Main St"). */
  street: string;
  /** Street address line 2 (apartment, suite, unit). */
  street2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface PersonalInfo {
  firstName: string;
  /** Middle name or initial — some legal-name forms require it. */
  middleName: string;
  lastName: string;
  /** Preferred/display name; falls back to first+last when empty. */
  preferredName: string;
  email: string;
  phone: string;
  /** Phone dial code (e.g. "+1") for country-code dropdowns next to phone fields. */
  phoneCountry: string;
  location: Location;
}

export interface Links {
  linkedin: string;
  github: string;
  portfolio: string;
  website: string;
}

/** Visa / legal status. USC = US Citizen, GC = Green Card, etc. */
export type VisaType = "USC" | "GC" | "H1B" | "F1_OPT" | "TN" | "OTHER" | "";

export interface WorkAuth {
  usAuthorized: boolean;
  sponsorshipNeeded: boolean;
  visaType: VisaType;
  /** Security clearance level ("", "None", "Public Trust", "Secret", …). */
  clearance: string;
}

/** A professional reference (defense-heavy and older ATS forms ask for them). */
export interface Reference {
  name: string;
  relationship: string;
  company: string;
  email: string;
  phone: string;
}

export interface Experience {
  company: string;
  title: string;
  startDate: string; // YYYY-MM
  endDate: string; // YYYY-MM or "" for present
  current: boolean;
  bullets: string[];
}

export interface Education {
  school: string;
  degree: string;
  major: string;
  gpa: number | null;
  year: string; // graduation year
}

export interface Skills {
  technical: string[];
  languages: string[];
  certifications: string[];
}

export interface Preferences {
  salaryExpected: string;
  noticePeriod: string;
  remotePreference: "remote" | "hybrid" | "onsite" | "";
  willingToRelocate: boolean;
  /** Filled into "How did you hear about us?" selects/dropdowns. */
  hearAboutUs: string;
  /** Consent checkbox ("agree to contact for opportunities") — default true. */
  consentToContact: boolean;
  /** Answer for "previously employed here?" questions — default false → "No". */
  previouslyEmployedHere: boolean;
  /** "Willing to travel?" questions — default false → "No". */
  willingToTravel: boolean;
}

export interface ProfileMeta {
  /** Derived total years of experience; used for "years of experience" fields. */
  totalYearsExp: number;
  /** Original resume file name, set after a successful parse. */
  resumeFileName?: string;
}

/**
 * Voluntary EEO self-identification. Entirely optional, stored locally only
 * (never synced to the backend), and — even when filled in — never
 * auto-written to a page; see the "confirm" flag on the matching field rules
 * in rules/fieldRules.ts. The user reviews and fills these themselves.
 */
export interface Demographics {
  ageRange: string;
  /** Multi-select — "Select all that apply". */
  raceEthnicity: string[];
  gender: string;
  pronouns: string;
  lgbtqia: string;
}

export interface UserProfile {
  personal: PersonalInfo;
  links: Links;
  workAuth: WorkAuth;
  experience: Experience[];
  education: Education[];
  skills: Skills;
  preferences: Preferences;
  references: Reference[];
  demographics: Demographics;
  meta: ProfileMeta;
}

/** A blank profile used as the default and as a form baseline. */
export function emptyProfile(): UserProfile {
  return {
    personal: {
      firstName: "",
      middleName: "",
      lastName: "",
      preferredName: "",
      email: "",
      phone: "",
      phoneCountry: "+1",
      location: { street: "", street2: "", city: "", state: "", country: "", postalCode: "" },
    },
    links: { linkedin: "", github: "", portfolio: "", website: "" },
    workAuth: { usAuthorized: false, sponsorshipNeeded: false, visaType: "", clearance: "" },
    experience: [],
    education: [],
    skills: { technical: [], languages: [], certifications: [] },
    preferences: {
      salaryExpected: "",
      noticePeriod: "",
      remotePreference: "",
      willingToRelocate: false,
      hearAboutUs: "Job Board",
      consentToContact: true,
      previouslyEmployedHere: false,
      willingToTravel: false,
    },
    references: [],
    demographics: { ageRange: "", raceEthnicity: [], gender: "", pronouns: "", lgbtqia: "" },
    meta: { totalYearsExp: 0 },
  };
}

/**
 * Schema migration: fill any fields missing from a stored profile (written by
 * an older extension version) with blank defaults, recursively. Arrays and
 * scalars are taken from the stored value when present; unknown extra keys
 * are preserved so downgrades don't lose data.
 */
export function migrateProfile(stored: unknown): UserProfile {
  return deepMerge(emptyProfile(), stored) as UserProfile;
}

function deepMerge(defaults: unknown, stored: unknown): unknown {
  if (stored === undefined || stored === null) return defaults;
  if (
    typeof defaults !== "object" ||
    defaults === null ||
    Array.isArray(defaults) ||
    typeof stored !== "object" ||
    Array.isArray(stored)
  ) {
    return stored;
  }
  const out: Record<string, unknown> = { ...(stored as Record<string, unknown>) };
  for (const [key, defVal] of Object.entries(defaults as Record<string, unknown>)) {
    out[key] = deepMerge(defVal, (stored as Record<string, unknown>)[key]);
  }
  return out;
}
