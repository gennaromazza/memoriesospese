import { describe, expect, it } from "vitest";
import { getGalleryPublicPath } from "./gallery-public-path";

describe("public gallery links", () => {
  it("keeps existing QR-code links unchanged", () => {
    expect(getGalleryPublicPath("document-id", "QR-AbC")).toBe("/gallery/QR-AbC");
  });

  it.each([null, undefined, "", "  "])("uses the document ID when the code is %s", code => {
    expect(getGalleryPublicPath("windows-gallery-id", code)).toBe("/gallery/windows-gallery-id");
  });

  it("trims and safely encodes the selected identifier", () => {
    expect(getGalleryPublicPath("document-id", " Evento 2026 ")).toBe("/gallery/Evento%202026");
  });

  it("does not silently build a URL without any identifier", () => {
    expect(() => getGalleryPublicPath("", null)).toThrow("Identificativo della galleria mancante");
  });
});