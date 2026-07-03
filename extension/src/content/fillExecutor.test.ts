import { describe, it, expect, vi } from "vitest";
import { emptyProfile } from "@/shared/profile";
import { detectAndFill, detectOnly, writeValueToField } from "./fillExecutor";

/** Tests disable the settle window unless they exercise it explicitly. */
const NO_SETTLE = { settleMs: 0 };

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
  it("fills matched fields that have profile values and clears confidence", async () => {
    greenhouseForm();
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.email = "a@example.com";
    p.links.linkedin = "https://linkedin.com/in/amudhan";

    const result = await detectAndFill(p, NO_SETTLE);

    expect(result.platform).toBe("greenhouse");
    expect((document.getElementById("fn") as HTMLInputElement).value).toBe("Amudhan");
    expect((document.getElementById("em") as HTMLInputElement).value).toBe("a@example.com");
    expect((document.getElementById("li") as HTMLInputElement).value).toBe("https://linkedin.com/in/amudhan");
    expect(result.filledCount).toBeGreaterThanOrEqual(3);
  });

  it("does NOT auto-fill 'confirm'-flagged fields like salary", async () => {
    greenhouseForm();
    const p = emptyProfile();
    p.preferences.salaryExpected = "200000";

    await detectAndFill(p, NO_SETTLE);

    expect((document.getElementById("sal") as HTMLInputElement).value).toBe("");
  });

  it("does NOT fill free-text AI fields like cover letter", async () => {
    greenhouseForm();
    const p = emptyProfile();
    await detectAndFill(p, NO_SETTLE);
    expect((document.getElementById("cl") as HTMLTextAreaElement).value).toBe("");
  });

  it("never clicks submit (zero-mutation guarantee)", async () => {
    greenhouseForm();
    const submit = document.getElementById("submitBtn") as HTMLButtonElement;
    const onClick = vi.fn();
    submit.addEventListener("click", onClick);
    const form = document.getElementById("application_form") as HTMLFormElement;
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener("submit", onSubmit);

    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    await detectAndFill(p, NO_SETTLE);

    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("never fills with empty profile values", async () => {
    greenhouseForm();
    const result = await detectAndFill(emptyProfile(), NO_SETTLE);
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

describe("detectAndFill — M2 deep reach", () => {
  it("fills fields inside an open shadow root", async () => {
    document.body.innerHTML = `<form id="application_form"><div id="field_order_1"></div><div id="host"></div><label for="top">Email</label><input id="top" type="email" /></form>`;
    const host = document.getElementById("host")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<label for="sfn">First Name</label><input id="sfn" />`;

    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.email = "a@example.com";
    await detectAndFill(p, NO_SETTLE);

    expect((shadow.getElementById("sfn") as HTMLInputElement).value).toBe("Amudhan");
    expect((document.getElementById("top") as HTMLInputElement).value).toBe("a@example.com");
  });

  it("fills a contenteditable custom widget via textContent + input event", async () => {
    document.body.innerHTML = `
      <form id="application_form"><div id="field_order_1"></div>
        <label for="fn">First Name</label><input id="fn" />
        <span id="ce-label">LinkedIn</span>
        <div id="ce" contenteditable="true" role="textbox" aria-multiline="false" aria-labelledby="ce-label"></div>
      </form>`;
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.links.linkedin = "https://linkedin.com/in/amudhan";
    const onInput = vi.fn();
    document.getElementById("ce")!.addEventListener("input", onInput);

    await detectAndFill(p, NO_SETTLE);

    expect(document.getElementById("ce")!.textContent).toBe("https://linkedin.com/in/amudhan");
    expect(onInput).toHaveBeenCalled();
  });

  it("drives an ARIA combobox: types, then clicks the matching option", async () => {
    document.body.innerHTML = `
      <form id="application_form"><div id="field_order_1"></div>
        <label for="fn">First Name</label><input id="fn" />
        <label for="country">Country</label>
        <input id="country" role="combobox" aria-autocomplete="list" aria-controls="country-menu" />
        <ul id="country-menu" role="listbox"></ul>
      </form>`;
    // Simulate a filtering combobox: options render on input.
    const input = document.getElementById("country") as HTMLInputElement;
    const menu = document.getElementById("country-menu")!;
    input.addEventListener("input", () => {
      menu.innerHTML = `<li role="option">United Kingdom</li><li role="option">United States</li>`;
    });
    let picked = "";
    menu.addEventListener("click", (e) => {
      picked = (e.target as HTMLElement).textContent ?? "";
    });

    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.location.country = "United States";
    await detectAndFill(p, NO_SETTLE);

    expect(input.value).toBe("United States");
    expect(picked).toBe("United States");
  });

  it("settle window fills conditional fields that render after the first pass", async () => {
    document.body.innerHTML = `
      <form id="application_form"><div id="field_order_1"></div>
        <label for="fn">First Name</label><input id="fn" />
        <div id="late-slot"></div>
      </form>`;
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.email = "a@example.com";

    // A conditional field appears shortly after the fill pass starts.
    setTimeout(() => {
      document.getElementById("late-slot")!.innerHTML =
        `<label for="late-em">Email</label><input id="late-em" type="email" />`;
    }, 30);

    const result = await detectAndFill(p, { settleMs: 300, debounceMs: 20 });

    expect((document.getElementById("late-em") as HTMLInputElement).value).toBe("a@example.com");
    expect(result.filledCount).toBeGreaterThanOrEqual(2);
    expect(result.matches.some((m) => m.label === "Email")).toBe(true);
  });
});

describe("detectAndFill — M4 never-clobber guard", () => {
  it("leaves user-typed values untouched and reports why", async () => {
    document.body.innerHTML = `
      <form id="application_form"><div id="field_order_1"></div>
        <label for="fn">First Name</label><input id="fn" value="Alexandra" />
        <label for="em">Email</label><input id="em" type="email" />
      </form>`;
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.email = "a@example.com";

    const result = await detectAndFill(p, NO_SETTLE);

    expect((document.getElementById("fn") as HTMLInputElement).value).toBe("Alexandra");
    expect((document.getElementById("em") as HTMLInputElement).value).toBe("a@example.com");
    const fnMatch = result.matches.find((m) => m.label === "First Name")!;
    expect(fnMatch.reason).toMatch(/already has a value/i);
    expect(result.filledCount).toBe(1); // only the email was written
  });

  it("does not re-check a radio group where an option is already selected", async () => {
    document.body.innerHTML = `
      <form id="application_form"><div id="field_order_1"></div>
        <label for="fn">First Name</label><input id="fn" />
        <fieldset>
          <legend>Are you legally authorized to work in the US?</legend>
          <label><input type="radio" name="auth" value="yes" />Yes</label>
          <label><input type="radio" name="auth" value="no" checked />No</label>
        </fieldset>
      </form>`;
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.workAuth.usAuthorized = true; // would write "Yes", but "No" is user-chosen

    await detectAndFill(p, NO_SETTLE);

    const no = document.querySelector<HTMLInputElement>('input[value="no"]')!;
    const yes = document.querySelector<HTMLInputElement>('input[value="yes"]')!;
    expect(no.checked).toBe(true);
    expect(yes.checked).toBe(false);
  });

  it("re-running a fill is idempotent (second pass writes nothing)", async () => {
    greenhouseForm();
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.email = "a@example.com";

    const first = await detectAndFill(p, NO_SETTLE);
    const second = await detectAndFill(p, NO_SETTLE);

    expect(first.filledCount).toBeGreaterThan(0);
    expect(second.filledCount).toBe(0);
    expect((document.getElementById("fn") as HTMLInputElement).value).toBe("Amudhan");
  });
});

describe("writeValueToField — M5 AI draft target", () => {
  it("writes a user-approved draft into a field from the last pass", async () => {
    document.body.innerHTML = `
      <form id="application_form"><div id="field_order_1"></div>
        <label for="fn">First Name</label><input id="fn" />
        <label for="cl">Cover Letter</label><textarea id="cl"></textarea>
      </form>`;
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    const result = await detectAndFill(p, NO_SETTLE);

    const coverLetter = result.matches.find((m) => m.label === "Cover Letter")!;
    expect(coverLetter.flags).toContain("ai_generate");
    expect((document.getElementById("cl") as HTMLTextAreaElement).value).toBe("");

    const ok = await writeValueToField(coverLetter.fieldId, "Dear team, …");
    expect(ok).toBe(true);
    expect((document.getElementById("cl") as HTMLTextAreaElement).value).toBe("Dear team, …");
  });

  it("refuses unknown field ids and empty values", async () => {
    expect(await writeValueToField("nope", "text")).toBe(false);
    expect(await writeValueToField("field_0", "")).toBe(false);
  });
});
