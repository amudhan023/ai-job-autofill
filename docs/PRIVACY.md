# Privacy Policy — AI Job Autofill

_Last updated: 2026-06-22_

AI Job Autofill is built local-first. This policy describes what the extension
does and does not do with your data.

## What we store, and where
- **Your profile** (name, contact, work authorization, experience, education,
  preferences) is stored **locally** in your browser via `chrome.storage.local`.
- **Application history** (which sites you filled, when, how many fields) is
  stored **locally** in your browser's IndexedDB.
- **Nothing is uploaded to any server by default.**

## Optional AI backend (off by default)
AI free-text answers and cover letters require a backend you explicitly enable
by entering a backend URL in Settings. When enabled:
- Only the data needed for a specific request is sent (e.g., a question + the
  relevant experience snippets, or a resume you choose to upload).
- We do **not** persist raw resume text server-side; only derived embeddings are
  stored for retrieval, per the architecture.
- If you never set a backend URL, no data ever leaves your device.

## What we never do
- We never submit job applications for you. The extension only fills fields; you
  review and submit every application yourself.
- We never auto-fill sensitive fields (SSN, EIN, tax/passport/bank numbers).
- We never auto-generate or auto-fill diversity/EEO questions.
- We never sell data or integrate ad-tech.
- Salary and diversity responses are never written to server telemetry.

## Permissions, and why
- `storage` — save your profile and history locally.
- `activeTab` / `scripting` — read and fill the job form on the page you're on.
- Host permissions are limited to supported ATS domains (Greenhouse, Lever,
  Ashby, Workday, iCIMS, SmartRecruiters, BambooHR) plus localhost for testing.

## Your control
- Edit or clear your profile any time in the options page.
- Uninstalling the extension removes all locally stored data.
- If you used the optional backend: data export and deletion endpoints are
  provided (GDPR/CCPA).

## Contact
Open an issue in the repository for privacy questions or data requests.
