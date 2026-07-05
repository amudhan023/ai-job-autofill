import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Options } from "./Options";
import { useProfileStore } from "@/storage/store";
import { emptyProfile } from "@/shared/profile";

function storedProfile() {
  const chrome = globalThis.chrome as unknown as {
    storage: { local: { get: (k: string) => Promise<Record<string, unknown>> } };
  };
  return chrome.storage.local.get("userProfile");
}

describe("Options (profile editor)", () => {
  beforeEach(() => {
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

  it("renders voluntary disclosures (EEO) fields and never-auto-filled note", async () => {
    render(<Options />);
    await screen.findByText("Your Profile");
    expect(screen.getByText("Voluntary Disclosures (Optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Age range")).toBeInTheDocument();
    expect(screen.getByLabelText("Gender")).toBeInTheDocument();
    expect(screen.getByLabelText("Pronouns")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Do you identify as a member of the LGBTQIA+ community?"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("White / Caucasian")).toBeInTheDocument();
    expect(screen.getByLabelText("Hispanic or Latinx")).toBeInTheDocument();
    expect(screen.getByText(/never auto-filled into a form/i)).toBeInTheDocument();
  });

  it("toggles a race/ethnicity checkbox and persists the multi-select on save", async () => {
    render(<Options />);
    await screen.findByText("Your Profile");

    await userEvent.click(screen.getByLabelText("Asian"));
    await userEvent.click(screen.getByLabelText("White / Caucasian"));
    await userEvent.selectOptions(screen.getByLabelText("Gender"), "Non-binary");

    await userEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(async () => {
      const stored = (await storedProfile()) as {
        userProfile?: { demographics: { raceEthnicity: string[]; gender: string } };
      };
      expect(stored.userProfile?.demographics.raceEthnicity).toEqual([
        "Asian",
        "White / Caucasian",
      ]);
      expect(stored.userProfile?.demographics.gender).toBe("Non-binary");
    });
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
      const stored = (await storedProfile()) as {
        userProfile?: { personal: { firstName: string } };
      };
      expect(stored.userProfile?.personal.firstName).toBe("Amudhan");
    });
  });

  it("renders '+ Add experience' button and adds an entry when clicked", async () => {
    render(<Options />);
    await screen.findByText("Your Profile");

    const addBtn = screen.getByRole("button", { name: /add experience/i });
    expect(addBtn).toBeInTheDocument();

    await userEvent.click(addBtn);

    // An entry appears with Company field
    expect(screen.getAllByLabelText("Company")).toHaveLength(1);
  });

  it("saves experience entry typed into the new entry form", async () => {
    render(<Options />);
    await screen.findByText("Your Profile");

    await userEvent.click(screen.getByRole("button", { name: /add experience/i }));
    const companyInput = screen.getByLabelText("Company") as HTMLInputElement;
    await userEvent.type(companyInput, "Confluent");

    await userEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(async () => {
      const stored = (await storedProfile()) as {
        userProfile?: { experience: Array<{ company: string }> };
      };
      expect(stored.userProfile?.experience[0]?.company).toBe("Confluent");
    });
  });

  it("removes an experience entry when Remove is clicked", async () => {
    render(<Options />);
    await screen.findByText("Your Profile");

    await userEvent.click(screen.getByRole("button", { name: /add experience/i }));
    expect(screen.getAllByLabelText("Company")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /remove experience 1/i }));
    expect(screen.queryByLabelText("Company")).not.toBeInTheDocument();
  });

  it("renders '+ Add education' button and adds an entry when clicked", async () => {
    render(<Options />);
    await screen.findByText("Your Profile");

    await userEvent.click(screen.getByRole("button", { name: /add education/i }));
    expect(screen.getByLabelText("School")).toBeInTheDocument();
  });

  it("renders new preference fields", async () => {
    render(<Options />);
    await screen.findByText("Your Profile");

    expect(screen.getByLabelText(/how did you hear/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/previously employed/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/consent to be contacted/i)).toBeInTheDocument();
  });

  it("shows resume upload section", async () => {
    render(<Options />);
    await screen.findByText("Your Profile");
    expect(screen.getByLabelText("Resume file")).toBeInTheDocument();
  });
});

describe("Options — Settings panel backend connection test (T6)", () => {
  beforeEach(() => {
    useProfileStore.setState({ profile: emptyProfile(), loaded: false });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reports a reachable backend, including whether AI is enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", ai_enabled: true }),
      })),
    );
    render(<Options />);
    await screen.findByText("Your Profile");
    await userEvent.click(screen.getByRole("tab", { name: "settings" }));

    await userEvent.click(await screen.findByRole("button", { name: /test connection/i }));

    expect(await screen.findByText(/connected/i)).toBeInTheDocument();
    expect(screen.getByText(/ai enabled/i)).toBeInTheDocument();
  });

  it("reports a clear, non-blocking error for an unreachable backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(<Options />);
    await screen.findByText("Your Profile");
    await userEvent.click(screen.getByRole("tab", { name: "settings" }));

    await userEvent.click(await screen.findByRole("button", { name: /test connection/i }));

    expect(await screen.findByText(/not reachable/i)).toBeInTheDocument();
    // Saving settings still works even though the connection test failed.
    expect(screen.getByRole("button", { name: /save settings/i })).toBeEnabled();
  });
});

describe("Options — Settings panel profile import/export (T11)", () => {
  beforeEach(() => {
    useProfileStore.setState({ profile: emptyProfile(), loaded: false });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("exports the current profile as a downloaded JSON file", async () => {
    useProfileStore.setState({
      profile: { ...emptyProfile(), personal: { ...emptyProfile().personal, firstName: "Ada" } },
      loaded: true,
    });

    const createObjectURL = vi.fn((_obj: Blob | MediaSource) => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<Options />);
    await screen.findByText("Your Profile");
    await userEvent.click(screen.getByRole("tab", { name: "settings" }));

    await userEvent.click(await screen.findByRole("button", { name: /export profile/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0][0] as Blob;
    expect(blobArg.type).toBe("application/json");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    clickSpy.mockRestore();
  });

  it("imports a valid profile JSON file after confirmation and persists it", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Options />);
    await screen.findByText("Your Profile");
    await userEvent.click(screen.getByRole("tab", { name: "settings" }));

    const imported = {
      ...emptyProfile(),
      personal: { ...emptyProfile().personal, firstName: "Grace" },
    };
    const file = new File([JSON.stringify(imported)], "profile.json", {
      type: "application/json",
    });

    await userEvent.upload(await screen.findByLabelText("Import profile file"), file);

    expect(await screen.findByText(/imported/i)).toBeInTheDocument();
    await waitFor(async () => {
      const stored = (await storedProfile()) as {
        userProfile?: { personal: { firstName: string } };
      };
      expect(stored.userProfile?.personal.firstName).toBe("Grace");
    });
  });

  it("does not import when the user cancels the overwrite confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Options />);
    await screen.findByText("Your Profile");
    await userEvent.click(screen.getByRole("tab", { name: "settings" }));

    const file = new File([JSON.stringify(emptyProfile())], "profile.json", {
      type: "application/json",
    });
    await userEvent.upload(await screen.findByLabelText("Import profile file"), file);

    expect(screen.queryByText(/imported/i)).not.toBeInTheDocument();
  });

  it("shows a descriptive error for an invalid import file", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Options />);
    await screen.findByText("Your Profile");
    await userEvent.click(screen.getByRole("tab", { name: "settings" }));

    const file = new File(["not json"], "profile.json", { type: "application/json" });
    await userEvent.upload(await screen.findByLabelText("Import profile file"), file);

    expect(await screen.findByText(/import failed/i)).toBeInTheDocument();
  });
});
