import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Popup } from "./Popup";
import type { ExtensionMessage, FillResult } from "@/shared/types";

/** Access the chrome mock installed by the global setup. */
function chromeMock() {
  return globalThis.chrome as unknown as {
    tabs: {
      query: ReturnType<typeof vi.fn>;
      sendMessage: ReturnType<typeof vi.fn>;
    };
    runtime: { openOptionsPage: ReturnType<typeof vi.fn> };
  };
}

const sampleResult: FillResult = {
  platform: "greenhouse",
  url: "https://boards.greenhouse.io/acme/jobs/1",
  filledCount: 3,
  totalFields: 5,
  timestamp: Date.now(),
  matches: [
    {
      fieldId: "1",
      label: "First Name",
      type: "text",
      ruleId: "firstName",
      profilePath: "personal.firstName",
      value: "Sam",
      confidence: 0.97,
      tier: "high",
      flags: [],
      reason: "Exact label match.",
    },
    {
      fieldId: "2",
      label: "Cover Letter",
      type: "textarea",
      ruleId: "coverLetter",
      profilePath: null,
      value: null,
      confidence: 0,
      tier: "low",
      flags: ["ai_generate"],
      reason: "Free-text.",
    },
  ],
};

function respondWith(handler: (msg: ExtensionMessage) => unknown) {
  chromeMock().tabs.sendMessage.mockImplementation(async (_id: number, msg: ExtensionMessage) =>
    handler(msg),
  );
}

describe("Popup", () => {
  beforeEach(() => {
    chromeMock().tabs.query.mockResolvedValue([{ id: 1 }]);
  });

  it("shows the detected ATS and enables the fill button", async () => {
    respondWith((msg) =>
      msg.type === "GET_PAGE_STATUS" ? { ok: true, platform: "greenhouse" } : { ok: true },
    );
    render(<Popup />);
    expect(await screen.findByText("greenhouse")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /autofill this application/i })).toBeEnabled();
  });

  it("disables fill and explains when no ATS is detected", async () => {
    respondWith(() => ({ ok: true, platform: "unknown" }));
    render(<Popup />);
    expect(await screen.findByText(/no supported ats detected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /autofill this application/i })).toBeDisabled();
  });

  it("fills on click and shows a per-field summary", async () => {
    respondWith((msg) => {
      if (msg.type === "GET_PAGE_STATUS") return { ok: true, platform: "greenhouse" };
      if (msg.type === "FILL_FORM") return { ok: true, result: sampleResult };
      return { ok: true };
    });
    render(<Popup />);
    const button = await screen.findByRole("button", { name: /autofill this application/i });
    await userEvent.click(button);

    expect(await screen.findByText(/filled 3 of 5 fields/i)).toBeInTheDocument();
    expect(screen.getByText("First Name")).toBeInTheDocument();
    expect(screen.getByText("Cover Letter")).toBeInTheDocument();
    // one field needs attention (cover letter is null/low)
    expect(screen.getByText(/need.*attention/i)).toBeInTheDocument();
  });

  it("explains a 0-filled result caused by fields already having values", async () => {
    const rerunResult: FillResult = {
      ...sampleResult,
      filledCount: 0,
      totalFields: 2,
      matches: [
        { ...sampleResult.matches[0], alreadyHadValue: true },
        {
          fieldId: "3",
          label: "Resume",
          type: "file",
          ruleId: "resumeUpload",
          profilePath: "meta.resumeFileName",
          value: "resume.pdf",
          confidence: 1,
          tier: "high",
          flags: [],
          reason: "Already has a file attached — left untouched.",
          alreadyHadValue: true,
        },
      ],
    };
    respondWith((msg) => {
      if (msg.type === "GET_PAGE_STATUS") return { ok: true, platform: "greenhouse" };
      if (msg.type === "FILL_FORM") return { ok: true, result: rerunResult };
      return { ok: true };
    });
    render(<Popup />);
    await userEvent.click(
      await screen.findByRole("button", { name: /autofill this application/i }),
    );

    expect(await screen.findByText(/filled 0 of 2 fields/i)).toBeInTheDocument();
    expect(screen.getByText(/2 already had a value/i)).toBeInTheDocument();
  });

  it("always shows the never-submit assurance", async () => {
    respondWith(() => ({ ok: true, platform: "greenhouse" }));
    render(<Popup />);
    expect(await screen.findByText(/never submit/i)).toBeInTheDocument();
  });

  it("opens the options page from the edit-profile link", async () => {
    respondWith(() => ({ ok: true, platform: "greenhouse" }));
    render(<Popup />);
    await userEvent.click(screen.getByRole("button", { name: /edit profile/i }));
    expect(chromeMock().runtime.openOptionsPage).toHaveBeenCalledOnce();
  });

  it("shows a clear, non-blocking error on the AI draft button when the backend is unreachable (T6)", async () => {
    // A generic free-text field (no rule matched) gets the plain "AI draft"
    // button — distinct from the coverLetter-ruled field, which gets the
    // dedicated CoverLetterButton flow covered below (T7).
    const genericAiResult: FillResult = {
      ...sampleResult,
      matches: [
        sampleResult.matches[0],
        {
          fieldId: "2",
          label: "Why this role?",
          type: "textarea",
          ruleId: null,
          profilePath: null,
          value: null,
          confidence: 0,
          tier: "low",
          flags: ["ai_generate"],
          reason: "Free-text.",
        },
      ],
    };
    respondWith((msg) => {
      if (msg.type === "GET_PAGE_STATUS") return { ok: true, platform: "greenhouse" };
      if (msg.type === "FILL_FORM") return { ok: true, result: genericAiResult };
      if (msg.type === "AI_DRAFT_FIELD") return { ok: false, error: "Failed to fetch" };
      return { ok: true };
    });
    render(<Popup />);
    await userEvent.click(
      await screen.findByRole("button", { name: /autofill this application/i }),
    );

    const draftButton = await screen.findByRole("button", { name: "AI draft" });
    await userEvent.click(draftButton);

    const retryButton = await screen.findByRole("button", { name: /retry ai draft/i });
    expect(retryButton).toHaveAttribute("title", expect.stringMatching(/backend configured/i));
    // The rest of the popup (fill summary, never-submit assurance) stays
    // visible and interactive — an AI failure never blocks the deterministic UI.
    expect(screen.getByText(/filled 3 of 5 fields/i)).toBeInTheDocument();
  });
});

describe("Popup — cover letter generation (T7)", () => {
  beforeEach(() => {
    chromeMock().tabs.query.mockResolvedValue([{ id: 1 }]);
  });

  async function renderWithFillResult() {
    respondWith((msg) => {
      if (msg.type === "GET_PAGE_STATUS") return { ok: true, platform: "greenhouse" };
      if (msg.type === "FILL_FORM") return { ok: true, result: sampleResult };
      return { ok: true };
    });
    render(<Popup />);
    await userEvent.click(
      await screen.findByRole("button", { name: /autofill this application/i }),
    );
    await screen.findByText(/filled 3 of 5 fields/i);
  }

  it("shows a dedicated 'Generate cover letter' control for the coverLetter-ruled field, not the generic AI draft button", async () => {
    await renderWithFillResult();
    expect(screen.getByRole("button", { name: /generate cover letter/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI draft" })).not.toBeInTheDocument();
  });

  it("expands into a company/style form pre-filled with the company parsed from the job URL", async () => {
    await renderWithFillResult();
    await userEvent.click(screen.getByRole("button", { name: /generate cover letter/i }));

    // sampleResult.url is https://boards.greenhouse.io/acme/jobs/1
    expect(screen.getByLabelText(/company name/i)).toHaveValue("acme");
    expect(screen.getByLabelText(/cover letter style/i)).toHaveValue("formal");
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
  });

  it("generates and marks the field drafted, sending the dedicated cover-letter message with company + style", async () => {
    respondWith((msg) => {
      if (msg.type === "GET_PAGE_STATUS") return { ok: true, platform: "greenhouse" };
      if (msg.type === "FILL_FORM") return { ok: true, result: sampleResult };
      if (msg.type === "AI_DRAFT_COVER_LETTER") {
        expect(msg).toMatchObject({ fieldId: "2", company: "acme", style: "formal" });
        return { ok: true, value: "Dear Acme, ..." };
      }
      return { ok: true };
    });
    render(<Popup />);
    await userEvent.click(
      await screen.findByRole("button", { name: /autofill this application/i }),
    );
    await screen.findByText(/filled 3 of 5 fields/i);

    await userEvent.click(screen.getByRole("button", { name: /generate cover letter/i }));
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByText("Drafted ✓")).toBeInTheDocument();
  });

  it("shows a clear, non-blocking error when the backend is unreachable", async () => {
    respondWith((msg) => {
      if (msg.type === "GET_PAGE_STATUS") return { ok: true, platform: "greenhouse" };
      if (msg.type === "FILL_FORM") return { ok: true, result: sampleResult };
      if (msg.type === "AI_DRAFT_COVER_LETTER") return { ok: false, error: "Failed to fetch" };
      return { ok: true };
    });
    render(<Popup />);
    await userEvent.click(
      await screen.findByRole("button", { name: /autofill this application/i }),
    );
    await screen.findByText(/filled 3 of 5 fields/i);

    await userEvent.click(screen.getByRole("button", { name: /generate cover letter/i }));
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));

    const retryButton = await screen.findByRole("button", { name: "Retry" });
    expect(retryButton).toHaveAttribute("title", expect.stringMatching(/backend configured/i));
    // Failure stays scoped to the cover-letter control — the rest of the
    // popup remains visible and interactive.
    expect(screen.getByText(/filled 3 of 5 fields/i)).toBeInTheDocument();
  });
});
