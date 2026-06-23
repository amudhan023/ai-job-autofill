import { useState } from "react";

interface OnboardingProps {
  onComplete: () => void;
  /** Optional resume upload handler (backend parse). */
  onUploadResume?: (file: File) => Promise<void>;
}

const STEPS = ["Welcome", "Add your resume", "Review & first fill"] as const;

/**
 * First-run onboarding: welcome → resume upload (optional) → review prompt.
 * Resume parsing requires a configured backend; without one the user proceeds
 * to manual profile entry.
 */
export function Onboarding({ onComplete, onUploadResume }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));

  const onFile = async (file: File | undefined) => {
    if (!file || !onUploadResume) return;
    setUploading(true);
    setError(null);
    try {
      await onUploadResume(file);
      next();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg p-8 text-center" role="dialog" aria-label="Onboarding">
      <ol className="mb-6 flex justify-center gap-2" aria-label="progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={`h-2 w-10 rounded-full ${i <= step ? "bg-blue-600" : "bg-gray-200"}`}
          />
        ))}
      </ol>

      {step === 0 && (
        <div>
          <h2 className="mb-2 text-xl font-bold">Welcome to AI Job Autofill</h2>
          <p className="mb-6 text-gray-600">
            Fill job applications in seconds. Everything stays on your device by default.
          </p>
          <button onClick={next} className="rounded-md bg-blue-600 px-4 py-2 text-white">
            Get started
          </button>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 className="mb-2 text-xl font-bold">Add your resume</h2>
          <p className="mb-4 text-gray-600">
            Upload a PDF or DOCX to auto-build your profile, or skip and enter details manually.
          </p>
          <label className="mb-3 block cursor-pointer rounded-md border-2 border-dashed border-gray-300 p-6 hover:border-blue-400">
            <input
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              aria-label="Resume file"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            {uploading ? "Parsing…" : "Choose resume file"}
          </label>
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <button onClick={next} className="text-sm text-gray-500 hover:underline">
            Skip — I'll enter details manually
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="mb-2 text-xl font-bold">You're set</h2>
          <p className="mb-6 text-gray-600">
            Review your profile, then open any supported job posting and click Autofill.
          </p>
          <button onClick={onComplete} className="rounded-md bg-blue-600 px-4 py-2 text-white">
            Review my profile
          </button>
        </div>
      )}
    </div>
  );
}
