# Chrome Web Store Listing (draft)

## Name
AI Job Autofill — Private, Accurate Application Autofill

## Summary (132 chars max)
Fill job applications in seconds. Deterministic accuracy, AI for free-text,
local-first privacy. You review everything — we never submit.

## Description
Job applications waste your time re-typing the same details across every ATS.
AI Job Autofill fills them in one click — accurately and privately.

**Why it's different**
- **Deterministic first.** Names, email, phone, work authorization and other
  structured fields come from a rule engine — zero AI hallucination.
- **AI where it helps.** Behavioral, motivation and cover-letter answers are
  drafted from your real experience (optional, off by default).
- **Confidence you can see.** Every field shows a green/yellow/red badge so you
  know what was filled and how sure we are.
- **Local-first privacy.** Your profile stays on your device. Nothing is
  uploaded unless you explicitly turn on an AI backend.
- **We never submit.** The extension only fills — you review and submit.

**Supported platforms**
Greenhouse, Lever, Ashby, Workday, iCIMS, SmartRecruiters, BambooHR.

**Keyboard shortcut**
Alt+Shift+F to autofill the current application.

## Category
Productivity

## Privacy practices (CWS form answers)
- Does the item collect user data? Stored locally only by default; optional
  backend the user enables.
- Sold to third parties? No.
- Used for purposes unrelated to core functionality? No.
- Single purpose: autofill job application forms.

## Permission justifications
- `storage`: persist the user's profile and history locally.
- `activeTab` + `scripting`: detect and fill the application form on the active
  tab when the user invokes autofill.
- Host permissions: limited to supported ATS domains to run the autofill content
  script.

## Assets needed before submission
- 128×128 icon (placeholder shipped; replace with final art)
- 1280×800 screenshots (popup, options, dashboard, a filled form)
- Short promo video (optional)
- Hosted PRIVACY policy URL (see docs/PRIVACY.md)
