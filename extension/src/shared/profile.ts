/**
 * UserProfile — the single source of truth for everything the extension fills.
 * Stored locally in chrome.storage.local (see src/storage/profile.ts).
 * Mirrors the backend Pydantic schema (backend/app/models/profile.py).
 */

export interface Location {
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
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
}

export interface ProfileMeta {
  /** Derived total years of experience; used for "years of experience" fields. */
  totalYearsExp: number;
  /** Original resume file name, set after a successful parse. */
  resumeFileName?: string;
}

export interface UserProfile {
  personal: PersonalInfo;
  links: Links;
  workAuth: WorkAuth;
  experience: Experience[];
  education: Education[];
  skills: Skills;
  preferences: Preferences;
  meta: ProfileMeta;
}

/** A blank profile used as the default and as a form baseline. */
export function emptyProfile(): UserProfile {
  return {
    personal: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      location: { city: "", state: "", country: "", postalCode: "" },
    },
    links: { linkedin: "", github: "", portfolio: "", website: "" },
    workAuth: { usAuthorized: false, sponsorshipNeeded: false, visaType: "" },
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
    },
    meta: { totalYearsExp: 0 },
  };
}
