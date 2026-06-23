import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Options } from "./Options";
import { useProfileStore } from "@/storage/store";
import { emptyProfile } from "@/shared/profile";

function storedProfile() {
  const chrome = globalThis.chrome as unknown as { storage: { local: { get: (k: string) => Promise<Record<string, unknown>> } } };
  return chrome.storage.local.get("userProfile");
}

describe("Options (profile editor)", () => {
  beforeEach(() => {
    // Reset the shared zustand store between tests.
    useProfileStore.setState({ profile: emptyProfile(), loaded: false });
  });

  it("renders profile sections after hydration", async () => {
    render(<Options />);
    expect(await screen.findByText("Your Profile")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Work Authorization")).toBeInTheDocument();
    expect(screen.getByText("Education")).toBeInTheDocument();
  });

  it("exposes accessible labels for inputs", async () => {
    render(<Options />);
    await screen.findByText("Your Profile");
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("LinkedIn")).toBeInTheDocument();
  });

  it("states the local-only privacy guarantee", async () => {
    render(<Options />);
    await screen.findByText("Your Profile");
    expect(screen.getByText(/stored locally on this device/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is\s+uploaded/i)).toBeInTheDocument();
  });

  it("edits a field and persists it to chrome.storage.local on save", async () => {
    render(<Options />);
    await screen.findByText("Your Profile");

    const firstName = screen.getByLabelText("First name") as HTMLInputElement;
    await userEvent.type(firstName, "Amudhan");
    expect(firstName.value).toBe("Amudhan");

    await userEvent.click(screen.getByRole("button", { name: /save profile/i }));

    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
    await waitFor(async () => {
      const stored = (await storedProfile()) as { userProfile?: { personal: { firstName: string } } };
      expect(stored.userProfile?.personal.firstName).toBe("Amudhan");
    });
  });

  it("creates an experience entry when editing current company", async () => {
    render(<Options />);
    await screen.findByText("Your Profile");

    await userEvent.type(screen.getByLabelText("Company"), "Confluent");
    await userEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(async () => {
      const stored = (await storedProfile()) as { userProfile?: { experience: Array<{ company: string }> } };
      expect(stored.userProfile?.experience[0]?.company).toBe("Confluent");
    });
  });
});
