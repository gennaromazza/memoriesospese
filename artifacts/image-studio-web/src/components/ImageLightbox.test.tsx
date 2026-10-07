import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PhotoData } from "../hooks/use-gallery-data";
import ImageLightbox from "./ImageLightbox";

function renderLightbox(photo: PhotoData, initialIndex = 0) {
  return renderToStaticMarkup(
    <ImageLightbox
      isOpen
      onClose={() => undefined}
      photos={[
        photo,
        { ...photo, id: "photo-2", name: "next-storage-key.jpg", originalName: "NEXT_01.jpg" },
      ]}
      initialIndex={initialIndex}
    />,
  );
}

const photo: PhotoData = {
  id: "photo-1",
  name: "1700000000000-storage-key.jpg",
  originalName: "IMG_4821.jpg",
  url: "https://example.test/photo.jpg",
  contentType: "image/jpeg",
  size: 1024,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
};

describe("ImageLightbox filename metadata", () => {
  it("shows the original filename separately from the photo counter", () => {
    const markup = renderLightbox(photo);

    expect(markup).toContain('data-testid="text-photo-filename"');
    expect(markup).toContain("IMG_4821.jpg");
    expect(markup).toContain('data-testid="text-photo-counter"');
    expect(markup).toContain("1 / 2");
  });

  it("updates the filename and counter for the selected photo", () => {
    const markup = renderLightbox(photo, 1);

    expect(markup).toContain("NEXT_01.jpg");
    expect(markup).toContain("2 / 2");
  });

  it("provides a labeled, touch-sized copy action and truncates long filenames", () => {
    const markup = renderLightbox({
      ...photo,
      originalName: "a-very-long-original-filename-from-the-camera.jpg",
    });

    expect(markup).toContain('data-testid="button-copy-photo-filename"');
    expect(markup).toContain('aria-label="Copia nome file"');
    expect(markup).toContain("touch-target");
    expect(markup).toContain("truncate");
  });

  it("shows a readable filename for legacy photos without originalName", () => {
    const markup = renderLightbox({ ...photo, originalName: undefined });

    expect(markup).toContain("storage-key.jpg");
    expect(markup).not.toContain("1700000000000-storage-key.jpg");
  });
});