import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

// Keep this list aligned with the API's verifyImage/upload-session allow-list.
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);

export async function walkFolder(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFolder(root, absolutePath));
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) continue;
    const info = await stat(absolutePath);
    const relativePath = path.relative(root, absolutePath);
    files.push({
      absolutePath,
      relativePath,
      fileName: entry.name,
      chapterName: path.dirname(relativePath) === "." ? null : path.dirname(relativePath).split(path.sep)[0],
      size: info.size,
      lastModified: info.mtimeMs,
    });
  }
  return files;
}

export async function hashFile(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}