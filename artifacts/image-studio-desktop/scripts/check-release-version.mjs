import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../package.json");
const { version } = JSON.parse(await readFile(packagePath, "utf8"));
const tag = process.env.GITHUB_REF_NAME;
if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `image-studio-desktop-v${version}`) {
  throw new Error("Refuse test, mismatched or pre-release tags.");
}

const response = await fetch("https://api.github.com/repos/gennaromazza/memoriesospese/releases/latest", {
  headers: {
    Accept: "application/vnd.github+json",
    "User-Agent": "image-studio-windows-release",
    ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}),
  },
});
if (response.status !== 404) {
  if (!response.ok) throw new Error(`Cannot verify the latest published release (${response.status}).`);
  const { tag_name: previousTag } = await response.json();
  const match = /^image-studio-desktop-v(\d+)\.(\d+)\.(\d+)$/.exec(previousTag);
  if (!match) throw new Error("Latest repository release is not a stable Windows desktop release.");
  const next = version.split(".").map(Number);
  const previous = match.slice(1).map(Number);
  const higher = next.findIndex((value, index) => value !== previous[index]);
  if (higher === -1 || next[higher] < previous[higher]) {
    throw new Error(`Version ${version} must be higher than ${previousTag}.`);
  }
}
console.log(`Release ${tag} is newer than the public Windows release.`);