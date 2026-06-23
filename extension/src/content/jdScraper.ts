/**
 * Extracts the visible job-description text from the current page (Phase 3
 * FR-11). Heuristic: prefer known JD containers, else the largest text block,
 * capped to keep token usage sane.
 */

const JD_SELECTORS = [
  '[class*="job-description"]',
  '[class*="jobDescription"]',
  '[data-automation-id="jobPostingDescription"]',
  '[class*="posting"] [class*="description"]',
  "#content .description",
  '[class*="opening"] [class*="content"]',
];

export function scrapeJobDescription(root: ParentNode = document): string {
  for (const sel of JD_SELECTORS) {
    const el = root.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text && text.length > 200) return clamp(text);
  }
  // Fallback: pick the densest text block among main/section/article.
  const candidates = Array.from(root.querySelectorAll("main, article, section, div"));
  let best = "";
  for (const el of candidates) {
    const text = (el.textContent ?? "").trim();
    if (text.length > best.length && text.length < 12000) best = text;
  }
  return clamp(best);
}

function clamp(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, 8000);
}
