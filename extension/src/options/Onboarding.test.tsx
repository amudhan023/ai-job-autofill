import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Onboarding } from "./Onboarding";

describe("Onboarding", () => {
  it("walks from welcome through to completion", async () => {
    const onComplete = vi.fn();
    render(<Onboarding onComplete={onComplete} />);

    expect(screen.getByText(/welcome to ai job autofill/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /get started/i }));

    expect(screen.getByText(/add your resume/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /skip/i }));

    expect(screen.getByText(/you're set/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /review my profile/i }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("uploads a resume via the provided handler and advances", async () => {
    const onUploadResume = vi.fn(async () => {});
    const onComplete = vi.fn();
    render(<Onboarding onComplete={onComplete} onUploadResume={onUploadResume} />);

    await userEvent.click(screen.getByRole("button", { name: /get started/i }));
    const file = new File([new Uint8Array([1, 2, 3])], "resume.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText(/resume file/i), file);

    expect(onUploadResume).toHaveBeenCalledOnce();
    expect(await screen.findByText(/you're set/i)).toBeInTheDocument();
  });

  it("surfaces upload errors without advancing", async () => {
    const onUploadResume = vi.fn(async () => {
      throw new Error("backend unavailable");
    });
    render(<Onboarding onComplete={vi.fn()} onUploadResume={onUploadResume} />);

    await userEvent.click(screen.getByRole("button", { name: /get started/i }));
    const file = new File([new Uint8Array([1])], "resume.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText(/resume file/i), file);

    expect(await screen.findByText(/backend unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/add your resume/i)).toBeInTheDocument();
  });
});
