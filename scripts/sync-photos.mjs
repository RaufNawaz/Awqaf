#!/usr/bin/env node
// Syncs mosque photos from the Google Drive folder into ./photos as pre-sized
// WebP thumbnails, tracked in photos/index.json. This runs in CI (see
// .github/workflows/sync-photos.yml) because it needs write access to commit
// the results back to the repo -- the browser can only read the repo, it
// cannot write to it. The live site prefers these local files and falls back
// to live Drive thumbnails for anything this script hasn't synced yet (see
// loadLocalPhotoIndex() in js/drive-photos.js).
//
// Keep APPS_SCRIPT_URL and the parsing rules below in sync with
// APP_CONFIG.drivePhotos in js/config.js and the matching logic in
// js/drive-photos.js -- they intentionally duplicate that (small) logic
// rather than importing it, since this script runs under plain Node and the
// browser modules are not meant to be imported outside a browser.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const APPS_SCRIPT_URL =
  "https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnQiDLGl7D1CHZw5lNOslN7cveZmy08l_FVVJv_xetYhyUgZohHMaKwpKKTGwvbB4puELDAmigTkDp-gGjYglTOvkMxn2PrIRC_euJwvjaL6wWFFli08TD3pZJ4Zx_aRCwipuGtHrsvLejlMTz7kRYuOKIu_w7Ux00YpuF9D2OBWoO7BQa_GhdGeeX-vdoQFGibwNFrABMcEVPujYGY13YcQhF22nThKA4dnsRxvRPbrwLrK0eQ972WEg3sy6OYMk_6ogz1OakZp6NAkVKVQ6_AA5aFTdg&lib=MpWdW5Xnf2iro3L6DlvNqqeSOIo3kG7Kb";

const PHOTOS_DIR = "photos";
const MANIFEST_PATH = `${PHOTOS_DIR}/index.json`;
const THUMBNAIL_SIZES = { small: 400, large: 1200 };
const SOURCE_THUMBNAIL_SIZE = "w1600";

const IMAGE_EXTENSION_RE = /\.(avif|gif|heic|heif|jpe?g|png|webp|svg)$/i;
const NAMED_MAIN_PHOTO_RE = /^(.+)_M(?:\.(?:avif|gif|heic|heif|jpe?g|png|webp|svg))?$/i;
// The trailing _<number> is optional -- in practice most uploads are named
// "MosqueName_I" / "MosqueName_O" with no sequence number (verified against
// the live Drive folder). Files without one get an auto-assigned sequence in
// assignAutoSequences() below.
const NAMED_TYPED_PHOTO_RE =
  /^(.+)_(I|O)(?:_([0-9]+))?(?:\.(?:avif|gif|heic|heif|jpe?g|png|webp|svg))?$/i;
const LEGACY_NAMED_PHOTO_RE = /^(.+)_([0-9]+)(?:\.(?:avif|gif|heic|heif|jpe?g|png|webp|svg))?$/i;

function cleanValue(value) {
  return String(value ?? "").trim();
}

// Mirrors normalizePhotoMosqueName() in js/drive-photos.js so manifest
// mosqueKey values match what the browser looks rows up by.
function normalizePhotoMosqueName(value) {
  return cleanValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyMosqueKey(mosqueKey) {
  return mosqueKey.replace(/\s+/g, "-");
}

// Mirrors parseNamedPhoto() in js/drive-photos.js.
function parseNamedPhoto(fileName) {
  const normalizedFileName = cleanValue(fileName);
  let match = normalizedFileName.match(NAMED_MAIN_PHOTO_RE);

  if (match) {
    return { mosqueName: match[1], type: "main", sequence: 0 };
  }

  match = normalizedFileName.match(NAMED_TYPED_PHOTO_RE);
  if (match) {
    const hasExplicitSequence = match[3] !== undefined;
    const sequence = hasExplicitSequence ? Number.parseInt(match[3], 10) : null;
    if (hasExplicitSequence && (!Number.isFinite(sequence) || sequence < 1)) {
      return null;
    }

    return {
      mosqueName: match[1],
      type: match[2].toUpperCase() === "I" ? "inside" : "outside",
      sequence,
    };
  }

  match = normalizedFileName.match(LEGACY_NAMED_PHOTO_RE);
  if (!match) return null;

  const index = Number.parseInt(match[2], 10);
  return {
    mosqueName: match[1],
    type: index === 0 ? "main" : "legacy",
    sequence: index,
  };
}

// Mirrors assignAutoSequences() in js/drive-photos.js. Note: if a sibling
// photo is later removed from Drive, an unrelated unchanged photo's
// auto-assigned sequence can shift on the next run without its own
// modifiedTime changing, so the diff below (keyed on modifiedTime) may keep
// a stale sequence/path for it. The photo still renders fine either way --
// only the label/sort position among siblings can drift. Not worth the
// complexity of a stable id-based scheme for that narrow a case.
function assignAutoSequences(parsedFiles) {
  const groupsNeedingSequence = new Map();

  parsedFiles.forEach((entry) => {
    if (Number.isFinite(entry.parsed.sequence)) return;

    const groupKey = `${entry.mosqueKey}|${entry.parsed.type}`;
    if (!groupsNeedingSequence.has(groupKey)) {
      groupsNeedingSequence.set(groupKey, []);
    }
    groupsNeedingSequence.get(groupKey).push(entry);
  });

  groupsNeedingSequence.forEach((entries) => {
    entries
      .sort((left, right) => {
        const leftTime = Date.parse(left.file.modifiedTime) || 0;
        const rightTime = Date.parse(right.file.modifiedTime) || 0;
        return leftTime - rightTime || left.file.name.localeCompare(right.file.name);
      })
      .forEach((entry, position) => {
        entry.parsed.sequence = position + 1;
      });
  });
}

function isImageFile(file) {
  return (
    cleanValue(file?.mimeType).toLowerCase().startsWith("image/") ||
    IMAGE_EXTENSION_RE.test(cleanValue(file?.name))
  );
}

function buildAppsScriptJsonUrl() {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.delete("callback");
  return url.toString();
}

async function fetchDriveFiles() {
  const response = await fetch(buildAppsScriptJsonUrl(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Apps Script photo list failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload?.files || [];
}

function buildDriveSourceUrl(fileId) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=${SOURCE_THUMBNAIL_SIZE}`;
}

async function downloadSourceImage(fileId) {
  const response = await fetch(buildDriveSourceUrl(fileId));
  if (!response.ok) {
    throw new Error(`Failed to download Drive file ${fileId}: HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function writeResizedWebp(sourceBuffer, destPath, width) {
  await mkdir(path.dirname(destPath), { recursive: true });
  await sharp(sourceBuffer)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(destPath);
}

async function loadManifest() {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.photos === "object" && parsed.photos
      ? parsed
      : { generatedAt: null, photos: {} };
  } catch {
    return { generatedAt: null, photos: {} };
  }
}

async function removePhotoFiles(entry) {
  if (!entry?.files) return;
  await Promise.all([
    rm(entry.files.small, { force: true }),
    rm(entry.files.large, { force: true }),
  ]);
}

async function main() {
  const manifest = await loadManifest();
  const files = await fetchDriveFiles();

  const parsedFiles = [];
  files.forEach((file) => {
    if (!file?.id || !isImageFile(file)) return;

    const parsed = parseNamedPhoto(file.name);
    if (!parsed) return;

    const mosqueKey = normalizePhotoMosqueName(parsed.mosqueName);
    if (!mosqueKey) return;

    parsedFiles.push({ file, parsed, mosqueKey });
  });

  assignAutoSequences(parsedFiles);

  const seenFileIds = new Set();
  let added = 0;
  let updated = 0;
  let removed = 0;
  let skipped = 0;

  for (const { file, parsed, mosqueKey } of parsedFiles) {
    seenFileIds.add(file.id);
    const existingEntry = manifest.photos[file.id];

    if (existingEntry && existingEntry.modifiedTime === file.modifiedTime) {
      continue;
    }

    const folderSlug = slugifyMosqueKey(mosqueKey);
    const baseName = `${parsed.type}_${parsed.sequence}`;
    // Always forward-slash-joined (not path.join): these strings are stored
    // in the manifest and used as browser URL paths, not just local fs paths.
    const smallPath = `${PHOTOS_DIR}/${folderSlug}/${baseName}_w400.webp`;
    const largePath = `${PHOTOS_DIR}/${folderSlug}/${baseName}_w1200.webp`;

    try {
      const sourceBuffer = await downloadSourceImage(file.id);
      await writeResizedWebp(sourceBuffer, smallPath, THUMBNAIL_SIZES.small);
      await writeResizedWebp(sourceBuffer, largePath, THUMBNAIL_SIZES.large);
    } catch (error) {
      skipped += 1;
      console.warn(`Skipping "${file.name}" (${file.id}): ${error.message}`);
      continue;
    }

    manifest.photos[file.id] = {
      name: file.name,
      modifiedTime: file.modifiedTime,
      mosqueKey,
      type: parsed.type,
      sequence: parsed.sequence,
      files: {
        small: smallPath,
        large: largePath,
      },
    };

    if (existingEntry) {
      updated += 1;
    } else {
      added += 1;
    }
  }

  for (const [fileId, entry] of Object.entries(manifest.photos)) {
    if (seenFileIds.has(fileId)) continue;

    await removePhotoFiles(entry);
    delete manifest.photos[fileId];
    removed += 1;
  }

  manifest.generatedAt = new Date().toISOString();
  await mkdir(PHOTOS_DIR, { recursive: true });
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(
    `Photo sync complete: ${added} added, ${updated} updated, ${removed} removed, ${skipped} skipped.`,
  );
}

main().catch((error) => {
  console.error("Photo sync failed:", error);
  process.exitCode = 1;
});
