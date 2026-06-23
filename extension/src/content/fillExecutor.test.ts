import { describe, it, expect, vi } from "vitest";
import { emptyProfile } from "@/shared/profile";
import { detectAndFill, detectOnly } from "./fillExecutor";

function greenhouseForm(): void {
  document.body.innerHTML = `
    <form id="application_form" class="greenhouse-application">
      <div id="field_order_1"></div>
      <input id="job_application_first_name" />
      <label for="fn">First Name</label><input id="fn" />
      <label for="em">Email</label><input id="em" type="email" />
      <label for="li">LinkedIn</label><input id="li" type="url" />
      <label for="sal">Expected Salary</label><input id="sal" />
      <label for="cl">Cover Letter</label><textarea id="cl"></textarea>
      <button type="submit" id="submitBtn">Submit Application</button>
    </form>`;
}

describe("detectAndFill (integration)", () => {
  it("fills matched fields that have profile values and clears confidence", () => {
    greenhouseForm();
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.email = "a@example.com";
    p.links.linkedin = "https://linkedin.com/in/amudhan";

    const result = detectAndFill(p);

    expect(result.platform).toBe("greenhouse");
    expect((document.getElementById("fn") as HTMLInputElement).value).toBe("Amudhan");
    expect((document.getElementById("em") as HTMLInputElement).value).toBe("a@example.com");
    expect((document.getElementById("li") as HTMLInputElement).value).toBe("https://linkedin.com/in/amudhan");
    expect(result.filledCount).toBeGreaterThanOrEqual(3);
  });

  it("does NOT auto-fill 'confirm'-flagged fields like salary", () => {
    greenhouseForm();
    const p = emptyProfile();
    p.preferences.salaryExpected = "200000";

    detectAndFill(p);

    expect((document.getElementById("sal") as HTMLInputElement).value).toBe("");
  });

  it("does NOT fill free-text AI fields like cover letter", () => {
    greenhouseForm();
    const p = emptyProfile();
    detectAndFill(p);
    expect((document.getElementById("cl") as HTMLTextAreaElement).value).toBe("");
  });

  it("never clicks submit (zero-mutation guarantee)", () => {
    greenhouseForm();
    const submit = document.getElementById("submitBtn") as HTMLButtonElement;
    const onClick = vi.fn();
    submit.addEventListener("click", onClick);
    const form = document.getElementById("application_form") as HTMLFormElement;
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener("submit", onSubmit);

    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    detectAndFill(p);

    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("never fills with empty profile values", () => {
    greenhouseForm();
    const result = detectAndFill(emptyProfile());
    expect(result.filledCount).toBe(0);
  });

  it("detectOnly reports platform and field count without writing", () => {
    greenhouseForm();
    const { platform, fieldCount } = detectOnly();
    expect(platform).toBe("greenhouse");
    expect(fieldCount).toBeGreaterThan(0);
    // nothing written
    expect((document.getElementById("fn") as HTMLInputElement).value).toBe("");
  });
});
