#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PHOTOS_DIR = "photos";
const MANIFEST_PATH = `${PHOTOS_DIR}/index.json`;
const MOSQUE_MANIFESTS_DIR = `${PHOTOS_DIR}/by-mosque`;

function cleanValue(value) {
  return String(value ?? "").trim();
}

function slugifyMosqueKey(mosqueKey) {
  return mosqueKey.replace(/\s+/g, "-");
}

export async function writePerMosquePhotoManifests(manifest) {
  const groupedPhotos = new Map();

  Object.entries(manifest?.photos || {}).forEach(([fileId, entry]) => {
    const mosqueKey = cleanValue(entry?.mosqueKey);
    if (!mosqueKey) return;

    if (!groupedPhotos.has(mosqueKey)) {
      groupedPhotos.set(mosqueKey, {});
    }
    groupedPhotos.get(mosqueKey)[fileId] = entry;
  });

  await mkdir(MOSQUE_MANIFESTS_DIR, { recursive: true });

  const generatedManifests = new Map(
    Array.from(groupedPhotos, ([mosqueKey, photos]) => {
      const fileName = `${slugifyMosqueKey(mosqueKey)}.json`;
      const payload = {
        mosqueKey,
        photos,
      };
      return [fileName, `${JSON.stringify(payload)}\n`];
    }),
  );

  // Remove stale generated manifests without replacing the directory. Keeping
  // unchanged files in place also avoids needless nightly commits.
  const existingFiles = await readdir(MOSQUE_MANIFESTS_DIR);
  await Promise.all(
    existingFiles
      .filter((fileName) => fileName.endsWith(".json") && !generatedManifests.has(fileName))
      .map((fileName) => rm(path.join(MOSQUE_MANIFESTS_DIR, fileName), { force: true })),
  );

  await Promise.all(
    Array.from(generatedManifests, async ([fileName, contents]) => {
      const manifestPath = path.join(MOSQUE_MANIFESTS_DIR, fileName);
      try {
        if ((await readFile(manifestPath, "utf8")) === contents) return;
      } catch {
        // The manifest is new or unreadable and should be written below.
      }
      await writeFile(manifestPath, contents, "utf8");
    }),
  );

  return groupedPhotos.size;
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const count = await writePerMosquePhotoManifests(manifest);
  console.log(`Wrote ${count} per-mosque photo manifests.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error("Photo manifest generation failed:", error);
    process.exitCode = 1;
  });
}
