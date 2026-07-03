import { useEffect, useRef, useState } from "react";
import { useProfileStore } from "@/storage/store";
import type { Experience, Education, Reference, VisaType } from "@/shared/profile";
import { CheckField, Section, SelectField, TextField } from "./Field";
import { Dashboard } from "./Dashboard";
import {
  loadAutofillOnNavigation,
  loadBackendUrl,
  saveAutofillOnNavigation,
  saveBackendUrl,
} from "@/storage/settings";
import { BackendClient } from "@/api/client";
import { saveResumeFile } from "@/storage/resumeFile";
import { PHONE_COUNTRY_OPTIONS } from "@/rules/transforms";

type Tab = "profile" | "applications" | "settings";

export function Options() {
  const { profile, loaded, hydrate, setProfile, persist } = useProfileStore();
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>("profile");

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!loaded) return <div className="p-8 text-gray-500">Loading…</div>;

  const update = (mutate: (draft: typeof profile) => void) => {
    const next = structuredClone(profile);
    mutate(next);
    setProfile(next);
    setSaved(false);
  };

  const onSave = async () => {
    await persist();
    setSaved(true);
  };

  return (
    <div className="mx-auto max-w-3xl p-8 font-sans">
      <nav className="mb-6 flex gap-1 border-b" role="tablist">
        {(["profile", "applications", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm capitalize ${
              tab === t ? "border-b-2 border-blue-600 font-medium text-blue-700" : "text-gray-500"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "applications" && <Dashboard />}
      {tab === "settings" && <SettingsPanel />}
      {tab !== "profile" ? null : (
        <>
          <h1 className="mb-1 text-xl font-bold text-gray-900">Your Profile</h1>
          <p className="mb-6 text-sm text-gray-500">
            Stored locally on this device. Used to autofill applications. Nothing is
            uploaded.
          </p>

          <ResumeUploadSection
            resumeFileName={profile.meta.resumeFileName}
            onParsed={(parsed) => {
              update((d) => {
                // Merge parsed fields — preserve existing non-empty values
                if (parsed.personal.firstName) d.personal.firstName = parsed.personal.firstName;
                if (parsed.personal.lastName) d.personal.lastName = parsed.personal.lastName;
                if (parsed.personal.email) d.personal.email = parsed.personal.email;
                if (parsed.personal.phone) d.personal.phone = parsed.personal.phone;
                if (parsed.personal.location.city) d.personal.location.city = parsed.personal.location.city;
                if (parsed.personal.location.state) d.personal.location.state = parsed.personal.location.state;
                if (parsed.personal.location.country) d.personal.location.country = parsed.personal.location.country;
                if (parsed.personal.location.postalCode) d.personal.location.postalCode = parsed.personal.location.postalCode;
                if (parsed.experience.length > 0) d.experience = parsed.experience;
                if (parsed.education.length > 0) d.education = parsed.education;
                if (parsed.skills.technical.length > 0) d.skills = parsed.skills;
                if (parsed.meta.totalYearsExp > 0) d.meta.totalYearsExp = parsed.meta.totalYearsExp;
              });
              setSaved(false);
            }}
            onFileNameChange={(name) => {
              update((d) => (d.meta.resumeFileName = name));
              // Persist right away: resume auto-attach must work even if the
              // user never clicks "Save profile" after uploading.
              void persist();
            }}
          />

          <Section title="Personal">
            <TextField label="First name" value={profile.personal.firstName}
              onChange={(v) => update((d) => (d.personal.firstName = v))} />
            <TextField label="Middle name" value={profile.personal.middleName}
              onChange={(v) => update((d) => (d.personal.middleName = v))} />
            <TextField label="Last name" value={profile.personal.lastName}
              onChange={(v) => update((d) => (d.personal.lastName = v))} />
            <TextField label="Preferred name (optional)" value={profile.personal.preferredName}
              onChange={(v) => update((d) => (d.personal.preferredName = v))} />
            <TextField label="Email" type="email" value={profile.personal.email}
              onChange={(v) => update((d) => (d.personal.email = v))} />
            <TextField label="Phone" type="tel" value={profile.personal.phone}
              onChange={(v) => update((d) => (d.personal.phone = v))} />
            <SelectField label="Phone country code" value={profile.personal.phoneCountry}
              onChange={(v) => update((d) => (d.personal.phoneCountry = v))}
              options={PHONE_COUNTRY_OPTIONS} />
            <TextField label="Street address" value={profile.personal.location.street}
              onChange={(v) => update((d) => (d.personal.location.street = v))} />
            <TextField label="Apt / suite / unit" value={profile.personal.location.street2}
              onChange={(v) => update((d) => (d.personal.location.street2 = v))} />
            <TextField label="City" value={profile.personal.location.city}
              onChange={(v) => update((d) => (d.personal.location.city = v))} />
            <TextField label="State" value={profile.personal.location.state}
              onChange={(v) => update((d) => (d.personal.location.state = v))} />
            <TextField label="Country" value={profile.personal.location.country}
              onChange={(v) => update((d) => (d.personal.location.country = v))} />
            <TextField label="Postal code" value={profile.personal.location.postalCode}
              onChange={(v) => update((d) => (d.personal.location.postalCode = v))} />
          </Section>

          <Section title="Links">
            <TextField label="LinkedIn" type="url" value={profile.links.linkedin}
              onChange={(v) => update((d) => (d.links.linkedin = v))} />
            <TextField label="GitHub" type="url" value={profile.links.github}
              onChange={(v) => update((d) => (d.links.github = v))} />
            <TextField label="Portfolio" type="url" value={profile.links.portfolio}
              onChange={(v) => update((d) => (d.links.portfolio = v))} />
            <TextField label="Website" type="url" value={profile.links.website}
              onChange={(v) => update((d) => (d.links.website = v))} />
          </Section>

          <Section title="Work Authorization">
            <CheckField label="Authorized to work in the US"
              checked={profile.workAuth.usAuthorized}
              onChange={(v) => update((d) => (d.workAuth.usAuthorized = v))} />
            <CheckField label="Requires sponsorship"
              checked={profile.workAuth.sponsorshipNeeded}
              onChange={(v) => update((d) => (d.workAuth.sponsorshipNeeded = v))} />
            <SelectField label="Visa / status" value={profile.workAuth.visaType}
              onChange={(v) => update((d) => (d.workAuth.visaType = v as VisaType))}
              options={[
                { value: "", label: "Not set" },
                { value: "USC", label: "US Citizen" },
                { value: "GC", label: "Green Card" },
                { value: "H1B", label: "H-1B" },
                { value: "F1_OPT", label: "F-1 / OPT" },
                { value: "TN", label: "TN" },
                { value: "OTHER", label: "Other" },
              ]} />
            <TextField label="Security clearance (optional)" value={profile.workAuth.clearance}
              onChange={(v) => update((d) => (d.workAuth.clearance = v))} />
          </Section>

          <Section title="Experience">
            {profile.experience.length === 0 && (
              <p className="mb-2 text-sm text-gray-400">No experience entries yet.</p>
            )}
            {profile.experience.map((exp, i) => (
              <ExperienceEntry
                key={i}
                exp={exp}
                index={i}
                onUpdate={(patch) => update((d) => Object.assign(d.experience[i], patch))}
                onRemove={() => update((d) => d.experience.splice(i, 1))}
              />
            ))}
            <button
              type="button"
              onClick={() => update((d) => d.experience.push(blankExperience()))}
              className="mt-1 text-sm text-blue-600 hover:underline"
            >
              + Add experience
            </button>
            <div className="mt-3">
              <TextField label="Total years of experience" type="number"
                value={String(profile.meta.totalYearsExp || "")}
                onChange={(v) => update((d) => (d.meta.totalYearsExp = Number(v) || 0))} />
            </div>
          </Section>

          <Section title="Education">
            {profile.education.length === 0 && (
              <p className="mb-2 text-sm text-gray-400">No education entries yet.</p>
            )}
            {profile.education.map((edu, i) => (
              <EducationEntry
                key={i}
                edu={edu}
                index={i}
                onUpdate={(patch) => update((d) => Object.assign(d.education[i], patch))}
                onRemove={() => update((d) => d.education.splice(i, 1))}
              />
            ))}
            <button
              type="button"
              onClick={() => update((d) => d.education.push(blankEducation()))}
              className="mt-1 text-sm text-blue-600 hover:underline"
            >
              + Add education
            </button>
          </Section>

          <Section title="Preferences">
            <TextField label="Expected salary" value={profile.preferences.salaryExpected}
              onChange={(v) => update((d) => (d.preferences.salaryExpected = v))} />
            <TextField label="Notice period" value={profile.preferences.noticePeriod}
              onChange={(v) => update((d) => (d.preferences.noticePeriod = v))} />
            <TextField
              label='How did you hear about us? (default for "How did you hear?" fields)'
              value={profile.preferences.hearAboutUs}
              onChange={(v) => update((d) => (d.preferences.hearAboutUs = v))}
            />
            <CheckField
              label="Previously employed at the company I'm applying to"
              checked={profile.preferences.previouslyEmployedHere}
              onChange={(v) => update((d) => (d.preferences.previouslyEmployedHere = v))}
            />
            <CheckField
              label="Consent to be contacted for job opportunities (always check consent boxes)"
              checked={profile.preferences.consentToContact}
              onChange={(v) => update((d) => (d.preferences.consentToContact = v))}
            />
            <CheckField
              label="Willing to relocate"
              checked={profile.preferences.willingToRelocate}
              onChange={(v) => update((d) => (d.preferences.willingToRelocate = v))}
            />
            <CheckField
              label="Willing to travel"
              checked={profile.preferences.willingToTravel}
              onChange={(v) => update((d) => (d.preferences.willingToTravel = v))}
            />
            <SelectField label="Remote preference" value={profile.preferences.remotePreference}
              onChange={(v) => update((d) => (d.preferences.remotePreference = v as typeof d.preferences.remotePreference))}
              options={[
                { value: "", label: "Not set" },
                { value: "remote", label: "Remote" },
                { value: "hybrid", label: "Hybrid" },
                { value: "onsite", label: "Onsite" },
              ]} />
          </Section>

          <Section title="References">
            {profile.references.length === 0 && (
              <p className="col-span-2 mb-2 text-sm text-gray-400">
                No references yet. Only filled when a form asks for them.
              </p>
            )}
            {profile.references.map((ref, i) => (
              <ReferenceEntry
                key={i}
                reference={ref}
                index={i}
                onUpdate={(patch) => update((d) => Object.assign(d.references[i], patch))}
                onRemove={() => update((d) => d.references.splice(i, 1))}
              />
            ))}
            <button
              type="button"
              onClick={() => update((d) => d.references.push(blankReference()))}
              className="col-span-2 mt-1 text-left text-sm text-blue-600 hover:underline"
            >
              + Add reference
            </button>
          </Section>

          <div className="flex items-center gap-3">
            <button onClick={onSave}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Save profile
            </button>
            {saved && <span className="text-sm text-green-600">Saved ✓</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resume upload section
// ---------------------------------------------------------------------------

interface ResumeUploadSectionProps {
  resumeFileName?: string;
  onParsed: (profile: ReturnType<typeof import("@/shared/profile").emptyProfile>) => void;
  onFileNameChange: (name: string) => void;
}

function ResumeUploadSection({ resumeFileName, onParsed, onFileNameChange }: ResumeUploadSectionProps) {
  const [status, setStatus] = useState<"idle" | "parsing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [backendUrl, setBackendUrl] = useState<string>("http://localhost:8000");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadBackendUrl().then(setBackendUrl);
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setStatus("parsing");
    setErrorMsg("");
    // Store the file bytes AND record the name immediately — resume
    // auto-attach on application forms must not depend on the optional
    // backend parse succeeding.
    const stored = await saveResumeFile(file);
    if (stored) onFileNameChange(file.name);
    const url = backendUrl ?? "http://localhost:8000";
    try {
      const client = new BackendClient(url.replace(/\/$/, ""));
      const parsed = await client.parseResume(file);
      onParsed(parsed as ReturnType<typeof import("@/shared/profile").emptyProfile>);
      setStatus("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Parse failed";
      const isConnectionError = msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("timed out");
      const saved = stored
        ? "Resume saved — it will still be auto-attached to applications. "
        : "";
      setErrorMsg(
        isConnectionError
          ? `${saved}Profile auto-fill from the resume needs the backend: cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
          : `${saved}${msg}`,
      );
      setStatus("error");
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Resume</span>
        {resumeFileName && (
          <span className="text-xs text-gray-500">{resumeFileName}</span>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Upload a PDF or DOCX to automatically populate experience, education, and skills.
        Connects to the local backend (<code>localhost:8000</code>). With an{" "}
        <code>ANTHROPIC_API_KEY</code> in <code>backend/.env</code> it does full AI extraction;
        without one it still extracts name, email, phone, and links via regex.
      </p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          aria-label="Resume file"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {status === "parsing" ? "Parsing…" : resumeFileName ? "Replace resume" : "Choose resume file"}
      </label>
      {status === "done" && (
        <span className="ml-3 text-sm text-green-600">Parsed ✓ — review fields below</span>
      )}
      {status === "error" && (
        <p className="mt-2 text-sm text-red-600">{errorMsg}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Experience entry row
// ---------------------------------------------------------------------------

interface ExperienceEntryProps {
  exp: Experience;
  index: number;
  onUpdate: (patch: Partial<Experience>) => void;
  onRemove: () => void;
}

function ExperienceEntry({ exp, index, onUpdate, onRemove }: ExperienceEntryProps) {
  return (
    <div className="mb-4 rounded-md border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">Experience {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:underline"
          aria-label={`Remove experience ${index + 1}`}
        >
          Remove
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Company" value={exp.company} onChange={(v) => onUpdate({ company: v })} />
        <TextField label="Title" value={exp.title} onChange={(v) => onUpdate({ title: v })} />
        <TextField label="Start date (YYYY-MM)" value={exp.startDate} onChange={(v) => onUpdate({ startDate: v })} />
        <TextField label="End date (YYYY-MM or blank)" value={exp.endDate} onChange={(v) => onUpdate({ endDate: v })} />
      </div>
      <div className="mt-2">
        <CheckField
          label="Currently working here"
          checked={exp.current}
          onChange={(v) => onUpdate({ current: v, endDate: v ? "" : exp.endDate })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Education entry row
// ---------------------------------------------------------------------------

interface EducationEntryProps {
  edu: Education;
  index: number;
  onUpdate: (patch: Partial<Education>) => void;
  onRemove: () => void;
}

function EducationEntry({ edu, index, onUpdate, onRemove }: EducationEntryProps) {
  return (
    <div className="mb-4 rounded-md border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">Education {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:underline"
          aria-label={`Remove education ${index + 1}`}
        >
          Remove
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="School" value={edu.school} onChange={(v) => onUpdate({ school: v })} />
        <TextField label="Degree" value={edu.degree} onChange={(v) => onUpdate({ degree: v })} />
        <TextField label="Major" value={edu.major} onChange={(v) => onUpdate({ major: v })} />
        <TextField label="Graduation year" value={edu.year} onChange={(v) => onUpdate({ year: v })} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------

function SettingsPanel() {
  const [url, setUrl] = useState("");
  const [autofillOnNav, setAutofillOnNav] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadBackendUrl().then(setUrl);
    void loadAutofillOnNavigation().then(setAutofillOnNav);
  }, []);

  const onSave = async () => {
    await saveBackendUrl(url.trim());
    await saveAutofillOnNavigation(autofillOnNav);
    setSaved(true);
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">AI backend</h2>
      <p className="mb-4 text-sm text-gray-500">
        Set a backend URL to enable resume parsing and AI free-text answers.
        Defaults to <code>http://localhost:8000</code> — start the local server with:
        <code className="ml-1 rounded bg-gray-100 px-1">uvicorn app.main:app --reload</code>
        (from the <code>backend/</code> folder). Add your <code>ANTHROPIC_API_KEY</code> to
        <code className="ml-1 rounded bg-gray-100 px-1">backend/.env</code> for AI-powered parsing.
      </p>
      <TextField label="Backend URL" value={url} onChange={setUrl} placeholder="http://localhost:8000" />
      <div className="mt-4">
        <CheckField
          label="Continue filling automatically across pages of the same application (multi-step wizards)"
          checked={autofillOnNav}
          onChange={setAutofillOnNav}
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={onSave} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          Save settings
        </button>
        {saved && <span className="text-sm text-green-600">Saved ✓</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blankExperience(): Experience {
  return { company: "", title: "", startDate: "", endDate: "", current: true, bullets: [] };
}
function blankEducation(): Education {
  return { school: "", degree: "", major: "", gpa: null, year: "" };
}
function blankReference(): Reference {
  return { name: "", relationship: "", company: "", email: "", phone: "" };
}

// ---------------------------------------------------------------------------
// Reference entry row
// ---------------------------------------------------------------------------

interface ReferenceEntryProps {
  reference: Reference;
  index: number;
  onUpdate: (patch: Partial<Reference>) => void;
  onRemove: () => void;
}

function ReferenceEntry({ reference, index, onUpdate, onRemove }: ReferenceEntryProps) {
  return (
    <div className="col-span-2 mb-4 rounded-md border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">Reference {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:underline"
          aria-label={`Remove reference ${index + 1}`}
        >
          Remove
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Name" value={reference.name} onChange={(v) => onUpdate({ name: v })} />
        <TextField label="Relationship" value={reference.relationship} onChange={(v) => onUpdate({ relationship: v })} />
        <TextField label="Company" value={reference.company} onChange={(v) => onUpdate({ company: v })} />
        <TextField label="Reference email" type="email" value={reference.email} onChange={(v) => onUpdate({ email: v })} />
        <TextField label="Reference phone" type="tel" value={reference.phone} onChange={(v) => onUpdate({ phone: v })} />
      </div>
    </div>
  );
}
