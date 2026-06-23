import { test, expect, request, type APIRequestContext } from "@playwright/test";

/**
 * Service contract integration tests: hit the LIVE backend container over real
 * HTTP (real uvicorn, real serialization), in USE_FAKE_AI mode so AI endpoints
 * return deterministic non-stub responses. This is the integration layer the
 * in-process pytest TestClient cannot cover (no real network / ASGI server).
 */

const BASE = process.env.BACKEND_URL ?? "http://localhost:8000";

let api: APIRequestContext;

test.beforeAll(async () => {
  api = await request.newContext({ baseURL: BASE });
});
test.afterAll(async () => {
  await api.dispose();
});

test("health reports AI enabled in fake-AI mode", async () => {
  const res = await api.get("/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.ai_enabled).toBe(true);
  expect(body.models.cover_letter).toBe("claude-opus-4-8");
});

test("profile PUT/GET round-trips over HTTP", async () => {
  const profile = { personal: { firstName: "Integration", lastName: "Test" }, meta: { totalYearsExp: 7 } };
  const put = await api.put("/profile/itest", { data: profile });
  expect(put.ok()).toBeTruthy();
  const got = await api.get("/profile/itest");
  expect((await got.json()).personal.firstName).toBe("Integration");
});

test("classify returns a category", async () => {
  const res = await api.post("/ai/classify", { data: { question: "Are you authorized to work in the US?" } });
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).category).toBe("VISA_WORK_AUTH");
});

test("answer returns a non-stub STAR response with RAG context", async () => {
  const res = await api.post("/ai/answer", {
    data: {
      question: "Describe a time you led a team through change",
      jd_summary: "Staff Engineer",
      experience: [{ company: "Acme", title: "Staff Engineer", bullets: ["Led a migration across teams"] }],
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.category).toBe("BEHAVIORAL");
  expect(body.stubbed).toBe(false);
  expect(body.answer.length).toBeGreaterThan(0);
  expect(body.retrieved.length).toBeGreaterThan(0); // embeddings-backed retrieval ran
});

test("cover letter returns non-stub content in the requested style", async () => {
  const res = await api.post("/ai/cover-letter", {
    data: { profileSummary: "18y SWE", jdSummary: "Staff role", company: "Acme", style: "startup" },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.stubbed).toBe(false);
  expect(body.style).toBe("startup");
  expect(body.letter.length).toBeGreaterThan(0);
});

test("jd extraction returns structured JSON", async () => {
  const res = await api.post("/ai/jd", { data: { jd_text: "We need a Staff Engineer with Python and FastAPI." } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(Array.isArray(body.requiredSkills)).toBe(true);
  expect(body.requiredSkills.length).toBeGreaterThan(0);
});

test("jobs/rank orders by match score", async () => {
  const res = await api.post("/jobs/rank", {
    data: {
      candidate: { skills: ["Kafka", "Go"], years_experience: 18 },
      postings: [
        { id: "a", title: "Staff", company: "A", url: "u", required_skills: ["Kafka", "Go"], years_required: 8 },
        { id: "b", title: "Staff", company: "B", url: "u", required_skills: ["COBOL"], years_required: 8 },
      ],
    },
  });
  expect(res.ok()).toBeTruthy();
  const ranked = await res.json();
  expect(ranked[0].id).toBe("a");
});

test("resume parse returns 422 (not 500) for a malformed PDF", async () => {
  const res = await api.post("/resume/parse", {
    multipart: { file: { name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a real pdf") } },
  });
  expect(res.status()).toBe(422);
});

test("resume parse extracts a text resume in fake-AI mode", async () => {
  const res = await api.post("/resume/parse", {
    multipart: {
      file: {
        name: "resume.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Jane Doe\nStaff Engineer at Acme\nLed a migration across teams"),
      },
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.personal.firstName).toBeTruthy();
});
