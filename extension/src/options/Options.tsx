import { useEffect, useState } from "react";
import { useProfileStore } from "@/storage/store";
import type { Experience, Education } from "@/shared/profile";
import { CheckField, Section, TextField } from "./Field";
import { Dashboard } from "./Dashboard";
import { loadBackendUrl, saveBackendUrl } from "@/storage/settings";

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

  const exp0: Experience = profile.experience[0] ?? blankExperience();
  const edu0: Education = profile.education[0] ?? blankEducation();

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

      <Section title="Personal">
        <TextField label="First name" value={profile.personal.firstName}
          onChange={(v) => update((d) => (d.personal.firstName = v))} />
        <TextField label="Last name" value={profile.personal.lastName}
          onChange={(v) => update((d) => (d.personal.lastName = v))} />
        <TextField label="Email" type="email" value={profile.personal.email}
          onChange={(v) => update((d) => (d.personal.email = v))} />
        <TextField label="Phone" type="tel" value={profile.personal.phone}
          onChange={(v) => update((d) => (d.personal.phone = v))} />
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
      </Section>

      <Section title="Current Experience">
        <TextField label="Company" value={exp0.company}
          onChange={(v) => update((d) => (setExp0(d, { company: v })))} />
        <TextField label="Title" value={exp0.title}
          onChange={(v) => update((d) => (setExp0(d, { title: v })))} />
        <TextField label="Total years of experience" type="number"
          value={String(profile.meta.totalYearsExp || "")}
          onChange={(v) => update((d) => (d.meta.totalYearsExp = Number(v) || 0))} />
      </Section>

      <Section title="Education">
        <TextField label="School" value={edu0.school}
          onChange={(v) => update((d) => setEdu0(d, { school: v }))} />
        <TextField label="Degree" value={edu0.degree}
          onChange={(v) => update((d) => setEdu0(d, { degree: v }))} />
        <TextField label="Major" value={edu0.major}
          onChange={(v) => update((d) => setEdu0(d, { major: v }))} />
        <TextField label="Graduation year" value={edu0.year}
          onChange={(v) => update((d) => setEdu0(d, { year: v }))} />
      </Section>

      <Section title="Preferences">
        <TextField label="Expected salary" value={profile.preferences.salaryExpected}
          onChange={(v) => update((d) => (d.preferences.salaryExpected = v))} />
        <TextField label="Notice period" value={profile.preferences.noticePeriod}
          onChange={(v) => update((d) => (d.preferences.noticePeriod = v))} />
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

function SettingsPanel() {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadBackendUrl().then((v) => setUrl(v ?? ""));
  }, []);

  const onSave = async () => {
    await saveBackendUrl(url.trim());
    setSaved(true);
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">AI backend</h2>
      <p className="mb-4 text-sm text-gray-500">
        Optional. Set a backend URL to enable AI free-text answers and cover
        letters. Leave blank to stay fully local (deterministic autofill only).
      </p>
      <TextField label="Backend URL" value={url} onChange={setUrl} placeholder="https://api.yourdomain.com" />
      <div className="mt-4 flex items-center gap-3">
        <button onClick={onSave} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          Save settings
        </button>
        {saved && <span className="text-sm text-green-600">Saved ✓</span>}
      </div>
    </div>
  );
}

function blankExperience(): Experience {
  return { company: "", title: "", startDate: "", endDate: "", current: true, bullets: [] };
}
function blankEducation(): Education {
  return { school: "", degree: "", major: "", gpa: null, year: "" };
}
function setExp0(draft: ReturnType<typeof useProfileStore.getState>["profile"], patch: Partial<Experience>) {
  if (draft.experience.length === 0) draft.experience.push(blankExperience());
  Object.assign(draft.experience[0], patch);
}
function setEdu0(draft: ReturnType<typeof useProfileStore.getState>["profile"], patch: Partial<Education>) {
  if (draft.education.length === 0) draft.education.push(blankEducation());
  Object.assign(draft.education[0], patch);
}
