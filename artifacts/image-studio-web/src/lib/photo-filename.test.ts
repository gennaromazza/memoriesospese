import { describe, expect, it, vi } from "vitest";
import {
  copyPhotoFilename,
  getOriginalPhotoFilename,
  getPhotoDownloadFilename,
} from "./photo-filename";

describe("photo filename helpers", () => {
  it("prefers the saved original filename over a timestamped storage key", () => {
    expect(
      getOriginalPhotoFilename({
        name: "galleries/gallery-1/photos/1700000000000-storage-name.jpg",
        originalName: "IMG_4821.jpg",
      }),
    ).toBe("IMG_4821.jpg");
  });

  it("derives a readable filename from a legacy storage path", () => {
    expect(
      getOriginalPhotoFilename({
        name: "galleries/gallery-1/photos/1700000000000-IMG_4821.jpg",
      }),
    ).toBe("IMG_4821.jpg");
  });

  it("keeps legacy filenames without the upload timestamp unchanged", () => {
    expect(getOriginalPhotoFilename({ name: "2024-wedding-cover.jpg" })).toBe(
      "2024-wedding-cover.jpg",
    );
  });

  it("uses the saved original filename for downloads", () => {
    expect(
      getPhotoDownloadFilename(
        {
          name: "galleries/gallery-1/photos/1700000000000-storage-name.jpg",
          originalName: "IMG_4821.jpg",
        },
        "photo_1.jpg",
      ),
    ).toBe("IMG_4821.jpg");
  });

  it("uses the readable legacy filename for downloads", () => {
    expect(
      getPhotoDownloadFilename(
        { name: "galleries/gallery-1/photos/1700000000000-IMG_4821.jpg" },
        "photo_1.jpg",
      ),
    ).toBe("IMG_4821.jpg");
  });

  it("uses the fallback filename when no photo filename is available", () => {
    expect(getPhotoDownloadFilename({}, "photo_1.jpg")).toBe("photo_1.jpg");
  });

  it("copies exactly the displayed filename", async () => {
    const writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);

    await copyPhotoFilename("IMG_4821.jpg", { writeText });

    expect(writeText).toHaveBeenCalledExactlyOnceWith("IMG_4821.jpg");
  });

  it("fails explicitly when the clipboard is unavailable", async () => {
    await expect(copyPhotoFilename("IMG_4821.jpg", null)).rejects.toThrow(
      "Clipboard API is unavailable",
    );
  });
});