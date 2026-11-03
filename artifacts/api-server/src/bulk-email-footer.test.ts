import { describe, expect, it } from "vitest";
import {
  appendBulkEmailFooter,
  BulkEmailFooterConfigurationError,
} from "./bulk-email-footer.js";

describe("bulk email automatic footer", () => {
  it("adds the no-reply notice and configured studio contacts", () => {
    const html = appendBulkEmailFooter("<p>La nostra novità</p>", {
      name: "Image Studio",
      email: "studio@example.com",
      phone: "+39 081 123 4567",
      address: "Via Roma 1, Aversa",
    });

    expect(html).toContain("Comunicazione automatica");
    expect(html).toContain("non rispondere direttamente");
    expect(html).toContain("mailto:studio%40example.com");
    expect(html).toContain("+39 081 123 4567");
    expect(html).toContain("Via Roma 1, Aversa");
    expect(html).toContain("<p>La nostra novità</p>");
  });

  it("escapes contact values and replaces a previous automatic footer", () => {
    const first = appendBulkEmailFooter("<p>Messaggio</p>", {
      name: "Studio <Image>",
      email: "old@example.com",
    });
    const updated = appendBulkEmailFooter(first, {
      name: "Studio",
      email: "new@example.com",
    });

    expect(first).toContain("Studio &lt;Image&gt;");
    expect(updated).not.toContain("Studio &lt;Image&gt;");
    expect(updated).not.toContain("old@example.com");
    expect(updated.match(/image-studio-bulk-email-footer:start/g)).toHaveLength(1);
    expect(updated).toContain("mailto:new%40example.com");
  });

  it("requires at least one real email or phone contact", () => {
    expect(() => appendBulkEmailFooter("<p>Messaggio</p>", {
      name: "Image Studio",
      address: "Via Roma 1",
    })).toThrow(BulkEmailFooterConfigurationError);
  });
});
