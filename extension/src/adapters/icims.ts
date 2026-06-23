import type { ATSAdapter, FieldHandle } from "./types";
import { scoreSignals } from "./types";
import { discoverWithin } from "./discover";

/**
 * iCIMS — careers.icims.com. Forms are commonly embedded in an iframe
 * (`icims_content`). When our content script runs inside that iframe (the
 * manifest can declare `all_frames`), `document` is already the iframe doc, so
 * discovery works against it directly. When run in the top frame, we try to
 * reach a same-origin iframe; cross-origin iframes are out of reach (expected).
 */
export class IcimsAdapter implements ATSAdapter {
  platform = "icims" as const;

  private formRoot(): ParentNode {
    // Already inside the iCIMS iframe?
    if (document.querySelector(".icims_content, #icims_content")) {
      return (
        document.querySelector(".icims_content, #icims_content") ?? document
      );
    }
    // Top frame: attempt a same-origin iframe reach.
    const frame = document.querySelector<HTMLIFrameElement>(
      'iframe[src*="icims"]',
    );
    try {
      if (frame?.contentDocument) return frame.contentDocument;
    } catch {
      // Cross-origin — cannot access; fall through.
    }
    return document.querySelector("form") ?? document;
  }

  score(): number {
    const host = location.hostname;
    const hasIcims =
      !!document.querySelector(".icims_content, #icims_content") ||
      !!document.querySelector('iframe[src*="icims"]');
    return scoreSignals({
      urlMatch: host.endsWith("icims.com") || host.includes("icims"),
      domFingerprint: hasIcims,
      htmlStructure: !!document.querySelector('[id^="icims_"], [name^="icims_"]'),
      cssHints: !!document.querySelector('[class*="icims"]'),
    });
  }

  discoverFields(): FieldHandle[] {
    return discoverWithin(this.formRoot());
  }
}
