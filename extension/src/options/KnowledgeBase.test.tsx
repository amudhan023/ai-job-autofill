import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KnowledgeBase } from "./KnowledgeBase";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(handler: (path: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => handler(new URL(url).pathname, init),
    })),
  );
}

describe("KnowledgeBase", () => {
  it("loads the persisted corpus on mount", async () => {
    stubFetch(() => ({ chunks: ["I led a Kafka migration", "I enjoy hiking"] }));
    render(<KnowledgeBase />);

    const textarea = (await screen.findByLabelText("Knowledge base")) as HTMLTextAreaElement;
    expect(textarea.value).toBe("I led a Kafka migration\n\nI enjoy hiking");
  });

  it("saves edited text and shows the re-chunked result", async () => {
    let saved = "";
    stubFetch((path, init) => {
      if (path === "/ai/documents" && init?.method === "PUT") {
        saved = (JSON.parse(init.body as string) as { text: string }).text;
        return { chunks: saved.split("\n\n") };
      }
      return { chunks: [] };
    });
    render(<KnowledgeBase />);

    const textarea = (await screen.findByLabelText("Knowledge base")) as HTMLTextAreaElement;
    await userEvent.type(textarea, "new fact");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Saved ✓")).toBeInTheDocument();
    expect(saved).toBe("new fact");
  });

  it("shows a clear error when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(<KnowledgeBase />);

    expect(await screen.findByText(/needs the backend/i)).toBeInTheDocument();
  });
});
