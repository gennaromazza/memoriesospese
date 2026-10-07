export interface PhotoFilenameSource {
  name?: string | null;
  originalName?: string | null;
}

type ClipboardWriter = Pick<Clipboard, "writeText">;

export function getOriginalPhotoFilename(photo: PhotoFilenameSource): string | null {
  if (typeof photo.originalName === "string" && photo.originalName.trim().length > 0) {
    return photo.originalName;
  }

  const storedName = typeof photo.name === "string" ? photo.name.replace(/\\/g, "/") : "";
  const filename = storedName.split("/").filter(Boolean).pop() ?? "";
  if (!filename) return null;

  // Gallery uploads use "{timestamp}-{originalName}" as the Storage object name.
  const withoutUploadTimestamp = filename.replace(/^\d{10,}-/, "");
  return withoutUploadTimestamp || filename;
}

export function getPhotoDownloadFilename(photo: PhotoFilenameSource, fallbackFilename: string): string {
  return getOriginalPhotoFilename(photo) || fallbackFilename;
}

export async function copyPhotoFilename(
  filename: string,
  clipboard?: ClipboardWriter | null,
): Promise<void> {
  const targetClipboard =
    clipboard === undefined
      ? typeof navigator !== "undefined"
        ? navigator.clipboard
        : undefined
      : clipboard;

  if (!filename || !targetClipboard?.writeText) {
    throw new Error("Clipboard API is unavailable");
  }

  await targetClipboard.writeText(filename);
}