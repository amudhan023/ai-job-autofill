import type { FieldRule } from "@/shared/types";
import {
  boolToYesNo,
  toFullName,
  toPreferredName,
  toCityState,
  dialCodeToCountry,
  joinList,
  visaToCitizenship,
} from "./transforms";

/**
 * Deterministic field rules — the canonical field taxonomy.
 *
 * Each rule carries alias patterns (matched against label/aria/placeholder/
 * name/id/nearby text) and optional spec-defined `autocomplete` tokens (the
 * strongest signal). Since the engine scores all rules across all signals and
 * picks the best match, array order only breaks ties — more specific rules
 * (e.g. cityState before city) are listed first.
 *
 * `profile` is a dot-path into UserProfile; `null` marks free-text fields that
 * are left for the user / AI rather than filled deterministically.
 *
 * Identity documents / legal history (SSN, EIN, DOB, driver's license,
 * criminal history) and disability/veteran status are intentionally absent
 * and additionally hard-blocked by BLOCKLIST_PATTERNS below — they must never
 * be auto-filled. Voluntary EEO self-ID (age range, race/ethnicity, gender,
 * pronouns, LGBTQIA+) *is* matched below, but every such rule carries the
 * "confirm" flag — see shouldWrite() in content/fillExecutor.ts — so it is
 * only ever detected and surfaced for the user's own review, never written to
 * the page automatically.
 */
export const FIELD_RULES: FieldRule[] = [
  // --- Name fields ---
  // preferredName and fullName must come before firstName/lastName so
  // "Preferred Name" / "Full Name" / "Legal Full Name" resolve correctly.
  { id: "preferredName", patterns: [/preferred.?name/i, /\bnickname\b/i, /known.?as/i, /display.?name/i], profile: "personal", type: "text", transform: toPreferredName, autocomplete: ["nickname"] },
  { id: "fullName", patterns: [/full.?name/i, /legal.?name/i, /candidate.?name/i, /applicant.?name/i, /^(your\s+)?name$/i], profile: "personal", type: "text", transform: toFullName, autocomplete: ["name"] },
  { id: "firstName", patterns: [/first.?name/i, /given.?name/i, /\bforename\b/i], profile: "personal.firstName", type: "text", autocomplete: ["given-name"] },
  { id: "middleName", patterns: [/middle.?(name|initial)/i], profile: "personal.middleName", type: "text", autocomplete: ["additional-name"] },
  { id: "lastName", patterns: [/last.?name/i, /family.?name/i, /surname/i], profile: "personal.lastName", type: "text", autocomplete: ["family-name"] },

  // --- Contact ---
  { id: "email", patterns: [/e-?mail/i], profile: "personal.email", type: "email", autocomplete: ["email"] },
  // phoneCountry must come before phone and country: the dial-code dropdown
  // next to a phone field (intl-tel-input's "Change country, selected …"
  // button, "Country code" selects) must not resolve to either generic rule.
  // intl-tel-input labels its trigger "Select country" before a choice is
  // made and "Change country, selected …" after — match both phrasings.
  { id: "phoneCountry", patterns: [/country.?code/i, /phone.*country|country.*phone/i, /dial.?code/i, /change country/i, /select(ed)?.?country/i], profile: "personal.phoneCountry", type: "select", transform: dialCodeToCountry, autocomplete: ["tel-country-code"] },
  { id: "phone", patterns: [/phone|mobile|cell|telephone/i, /contact.?number/i], profile: "personal.phone", type: "tel", autocomplete: ["tel", "tel-national", "tel-local"] },

  // --- Links ---
  { id: "linkedin", patterns: [/linked.?in/i], profile: "links.linkedin", type: "url" },
  { id: "github", patterns: [/git.?hub/i], profile: "links.github", type: "url" },
  { id: "portfolio", patterns: [/portfolio|personal.?(site|website|url)|\bwebsite\b/i], profile: "links.portfolio", type: "url" },

  // --- Location: combined "City, State" must come before individual city/state rules ---
  { id: "cityState", patterns: [/city[,\s/]+state/i, /location.*city|city.*location/i], profile: "personal.location", type: "text", transform: toCityState },
  // Street rules are anchored/specific so "Email Address" never matches.
  { id: "street", patterns: [/street.?address/i, /address.?line.?1/i, /^(home\s|mailing\s|current\s|present\s|street\s)?address\s*:?\*?$/i, /\bstreet\b/i], profile: "personal.location.street", type: "text", autocomplete: ["street-address", "address-line1"] },
  { id: "street2", patterns: [/address.?line.?2/i, /apartment|\bapt\b|\bsuite\b|\bunit\b/i], profile: "personal.location.street2", type: "text", autocomplete: ["address-line2"] },
  { id: "city", patterns: [/\bcity\b|\btown\b|municipality/i], profile: "personal.location.city", type: "text", autocomplete: ["address-level2"] },
  { id: "state", patterns: [/\bstate\b|\bprovince\b|\bregion\b/i], profile: "personal.location.state", type: "text", autocomplete: ["address-level1"] },
  { id: "country", patterns: [/country/i], profile: "personal.location.country", type: "text", autocomplete: ["country", "country-name"] },
  { id: "postalCode", patterns: [/zip|postal|post.?code/i], profile: "personal.location.postalCode", type: "text", autocomplete: ["postal-code"] },

  // --- Experience ---
  { id: "currentCompany", patterns: [/current.?(company|employer)|present.?company/i, /\bemployer\b/i, /most.?recent.?(company|employer)/i], profile: "experience[0].company", type: "text", autocomplete: ["organization"] },
  { id: "currentTitle", patterns: [/current.?(title|position|role)/i, /job.?title/i, /most.?recent.?(title|position|role)/i], profile: "experience[0].title", type: "text", autocomplete: ["organization-title"] },
  { id: "yearsExp", patterns: [/years.?(of.)?exp/i, /experience.*years/i, /how.?many.?years/i], profile: "meta.totalYearsExp", type: "number" },

  // --- Skills ---
  { id: "skillsList", patterns: [/\b(technical\s+|key\s+|top\s+)?skills\b/i], profile: "skills.technical", type: "textarea", transform: joinList },
  { id: "languagesSpoken", patterns: [/languages?.?(you\s+)?(speak|spoken|known|fluen)/i, /spoken.?languages?/i], profile: "skills.languages", type: "text", transform: joinList },
  { id: "certifications", patterns: [/certificat/i], profile: "skills.certifications", type: "text", transform: joinList },

  // --- Preferences ---
  { id: "salary", patterns: [/salary|compensation|expected.?pay|ctc/i, /desired.?(pay|salary)|pay.?expectation/i], profile: "preferences.salaryExpected", type: "text", flags: ["confirm"] },
  { id: "noticePeriod", patterns: [/notice.?period|availab|start.?date|when.?can.?you.?start/i], profile: "preferences.noticePeriod", type: "text", flags: ["confirm"] },
  { id: "relocate", patterns: [/reloca/i, /willing.?to.?move/i], profile: "preferences.willingToRelocate", type: "radio", transform: boolToYesNo },
  { id: "travel", patterns: [/willing.*travel|travel.?(requirement|willingness)|able.?to.?travel|comfortable.*travel/i], profile: "preferences.willingToTravel", type: "radio", transform: boolToYesNo },
  { id: "remotePreference", patterns: [/remote.?(work|preference)/i, /work.?(remotely|from.?home)/i, /(remote|hybrid|onsite).*(preference|arrangement)/i, /work.?location.?preference/i], profile: "preferences.remotePreference", type: "select" },

  // --- Work Authorization ---
  { id: "usAuthorized", patterns: [/authoriz.*(work|us|united.?states)|legally.?authorized/i, /right.?to.?work/i, /eligible.?to.?work/i], profile: "workAuth.usAuthorized", type: "radio", transform: boolToYesNo },
  { id: "sponsorship", patterns: [/sponsor/i, /require.*visa/i], profile: "workAuth.sponsorshipNeeded", type: "radio", transform: boolToYesNo },
  { id: "citizenship", patterns: [/citizen/i], profile: "workAuth.visaType", type: "radio", transform: visaToCitizenship },
  { id: "visaStatus", patterns: [/visa.?(status|type)|immigration.?status|work.?permit/i], profile: "workAuth.visaType", type: "text" },
  { id: "clearance", patterns: [/security.?clearance|\bclearance\b/i], profile: "workAuth.clearance", type: "select" },

  // --- Voluntary EEO self-identification ---
  // Optional, stored locally only (see Demographics in shared/profile.ts).
  // Every rule here is "confirm"-flagged: the engine detects and surfaces a
  // value but never writes it to the page automatically (see shouldWrite() in
  // content/fillExecutor.ts) — same treatment as salary/notice period above.
  { id: "ageRange", patterns: [/age.?range/i, /what.?is.?your.?age/i, /\bage\b/i], profile: "demographics.ageRange", type: "radio", flags: ["confirm"] },
  { id: "raceEthnicity", patterns: [/racial.*ethnic|race.*ethnic|ethnic.*race/i, /\brace\b/i, /ethnicit/i], profile: "demographics.raceEthnicity", type: "checkbox", transform: joinList, flags: ["confirm"] },
  { id: "gender", patterns: [/gender.?identity/i, /what.?gender.*identify/i, /\bgender\b/i], profile: "demographics.gender", type: "radio", flags: ["confirm"] },
  { id: "pronouns", patterns: [/pronoun/i], profile: "demographics.pronouns", type: "radio", flags: ["confirm"] },
  { id: "lgbtqia", patterns: [/lgbtq/i, /lgbt\+/i, /member.*lgbtq/i, /sexual.?orientation/i], profile: "demographics.lgbtqia", type: "radio", flags: ["confirm"] },

  // --- References (specific patterns beat the generic email/phone rules on ties) ---
  { id: "referenceName", patterns: [/reference.?s?\s*(full\s*)?name|name.?of.?(your.?)?reference/i], profile: "references[0].name", type: "text" },
  { id: "referenceEmail", patterns: [/reference.?s?\s*e-?mail/i], profile: "references[0].email", type: "email" },
  { id: "referencePhone", patterns: [/reference.?s?\s*phone/i], profile: "references[0].phone", type: "tel" },
  { id: "referenceRelationship", patterns: [/relationship.?to.?(candidate|applicant|you)|reference.?relationship/i], profile: "references[0].relationship", type: "text" },
  { id: "referenceCompany", patterns: [/reference.?s?\s*(company|employer|organi[sz]ation)/i], profile: "references[0].company", type: "text" },

  // --- Education ---
  { id: "degree", patterns: [/highest.?(education|degree)|degree/i], profile: "education[0].degree", type: "select" },
  { id: "school", patterns: [/school|university|college|institution/i], profile: "education[0].school", type: "text" },
  { id: "major", patterns: [/major|field.?of.?study|discipline|concentration/i], profile: "education[0].major", type: "text" },
  { id: "gradYear", patterns: [/graduation|grad.?year|year.?of.?completion/i], profile: "education[0].year", type: "text" },
  { id: "gpa", patterns: [/gpa|grade.?point/i], profile: "education[0].gpa", type: "text" },

  // --- Company-specific standard questions ---
  // "How did you hear about us?" — select/dropdown; profile value is configurable.
  { id: "howHeard", patterns: [/how.*hear.*about|where.*hear.*about|how.*find.*us|how.*learn.*about|source.*application/i], profile: "preferences.hearAboutUs", type: "select" },
  // "Previously employed here?" — radio; default is No (false).
  { id: "prevEmployedHere", patterns: [/previously.*employed|been employed|prior.*employment|worked.*before.*here|previously.*worked/i], profile: "preferences.previouslyEmployedHere", type: "radio", transform: boolToYesNo },
  // Consent checkbox ("agree to be contacted for opportunities") — always checked.
  { id: "consentContact", patterns: [/do you agree.*contact|allow.*contact.*opportunit|consent.*contact|^i agree$/i, /contact.*job.*opportunit.*years/i], profile: "preferences.consentToContact", type: "checkbox", transform: boolToYesNo },

  // --- File uploads (M6) ---
  // Resume/CV upload: the stored resume file is attached by fillExecutor.
  // `profile` points at the stored file name so the no-value ⇒ no-fill
  // invariant holds when no resume has been uploaded to the extension.
  // coverLetter (below, textarea-typed) also catches "Cover Letter" file
  // inputs; the executor only attaches the resume to resumeUpload matches.
  { id: "resumeUpload", patterns: [/resume|\bcv\b|curriculum.?vitae/i], profile: "meta.resumeFileName", type: "file" },

  // --- Free-text → AI; detected and flagged, not deterministically filled. ---
  { id: "coverLetter", patterns: [/cover.?letter/i], profile: null, type: "textarea", flags: ["ai_generate"] },
  { id: "whyCompany", patterns: [/why.*(company|us|role|join)|motivation/i], profile: null, type: "textarea", flags: ["ai_generate"] },
  { id: "aboutYou", patterns: [/tell.*(yourself|about.?you)|background|introduction/i], profile: null, type: "textarea", flags: ["ai_generate"] },
  { id: "behavioral", patterns: [/describe.?a.?time|tell.?me.?about.?a.?time|give.?an.?example/i], profile: null, type: "textarea", flags: ["ai_generate"] },
  { id: "describeExperience", patterns: [/describe.?your.?(relevant.?)?experience|relevant.?experience/i], profile: null, type: "textarea", flags: ["ai_generate"] },
  // Optional catch-alls: detected as free-text, no AI generation offered.
  { id: "additionalInfo", patterns: [/additional.?(info|information|comments)|anything.?else|other.?information|final.?comments/i], profile: null, type: "textarea" },
];

/**
 * Sensitive patterns that must NEVER be auto-filled, even if a rule matched.
 * Checked before any rule application, against every direct signal (label,
 * aria, placeholder, name/id). Word boundaries matter: attribute text like
 * "embrace" must not trip /race/.
 */
export const BLOCKLIST_PATTERNS: RegExp[] = [
  /ssn|social.?security/i,
  /\bein\b|employer.?identification/i,
  /tax.?id/i,
  /passport.?number/i,
  /bank|routing|account.?number/i,
  // Identity documents / legal history — user-only, never auto-filled.
  /date.?of.?birth|birth.?date|\bdob\b/i,
  /driver.?s?\s?licen[cs]e/i,
  /criminal|conviction|felony|misdemeanor/i,
  // Disability/veteran status weren't requested as supported fields — still
  // hard-blocked. Age/race/ethnicity/gender/pronouns/LGBTQIA+ are NOT blocked
  // here: they're matched by the confirm-flagged rules above instead, so they
  // still can't be auto-written but do show a reviewable value in the popup.
  /disabilit|veteran/i,
];

export function isBlocked(label: string): boolean {
  return BLOCKLIST_PATTERNS.some((re) => re.test(label));
}
