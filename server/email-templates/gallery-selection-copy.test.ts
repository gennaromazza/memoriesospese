import { describe, expect, it } from "vitest";
import { generateGallerySelectionCopyEmail } from "./gallery-selection-copy.js";

describe("generateGallerySelectionCopyEmail", () => {
  const baseParams = {
    galleryName: "Matrimonio Anna e Luca",
    galleryUrl: "https://example.com/gallery/anna-luca",
    selectedPhotos: [
      { url: "https://example.com/verticale.jpg", name: "Verticale" },
      { url: "https://example.com/orizzontale.jpg", name: "Orizzontale" },
    ],
  };

  it("usa la palette della piattaforma senza il vecchio tema viola", () => {
    const html = generateGallerySelectionCopyEmail(baseParams);

    expect(html).toContain("#8b9a7d");
    expect(html).toContain("#a8c5b5");
    expect(html).toContain("#c4724a");
    expect(html).not.toContain("#9333ea");
    expect(html).not.toContain("#7c3aed");
  });

  it("mantiene le proporzioni delle miniature senza ritagli quadrati", () => {
    const html = generateGallerySelectionCopyEmail(baseParams);

    expect(html).toContain("width:auto;height:auto");
    expect(html).toContain("max-width:140px;max-height:140px");
    expect(html).toContain("object-fit:contain");
    expect(html).not.toContain("width:80px;height:80px");
    expect(html).not.toContain("object-fit:cover");
  });

  it("mostra al massimo trenta miniature e indica quelle rimanenti", () => {
    const html = generateGallerySelectionCopyEmail({
      ...baseParams,
      selectedPhotos: Array.from({ length: 32 }, (_, index) => ({
        url: `https://example.com/photo-${index + 1}.jpg`,
      })),
    });

    expect(html).toContain("...e altre 2 foto");
    expect(html).toContain("photo-30.jpg");
    expect(html).not.toContain("photo-31.jpg");
  });

  it("protegge i contenuti dinamici inseriti nell'HTML", () => {
    const html = generateGallerySelectionCopyEmail({
      galleryName: '<script>alert("x")</script>',
      galleryUrl: 'https://example.com/" onclick="alert(1)',
      selectedPhotos: [
        {
          url: 'https://example.com/photo.jpg" onerror="alert(1)',
          name: '<b>Foto</b>',
        },
      ],
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain('onclick="alert(1)');
    expect(html).not.toContain('onerror="alert(1)');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Foto&lt;/b&gt;");
  });
});
