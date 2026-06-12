import { APP_CONFIG } from "./config.js";
import { cleanCellValue, normalizeSearchText } from "./utils.js";

const IMAGE_EXTENSION_RE = /\.(avif|gif|heic|heif|jpe?g|png|webp|svg)$/i;
const NAMED_MAIN_PHOTO_RE = /^(.+)_M(?:\.(?:avif|gif|heic|heif|jpe?g|png|webp|svg))?$/i;
const NAMED_TYPED_PHOTO_RE =
  /^(.+)_(I|O)_([0-9]+)(?:\.(?:avif|gif|heic|heif|jpe?g|png|webp|svg))?$/i;
const LEGACY_NAMED_PHOTO_RE =
  /^(.+)_([0-9]+)(?:\.(?:avif|gif|heic|heif|jpe?g|png|webp|svg))?$/i;
const APPS_SCRIPT_TIMEOUT_MS = 10000;
const PHOTO_TYPE_SORT_ORDER = {
  main: 0,
  inside: 1,
  outside: 2,
  legacy: 3,
};
let jsonpRequestCount = 0;

function parsePhotoIndex(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function comparePhotoEntries(left, right) {
  const leftSortOrder = Number.isFinite(left.sortOrder)
    ? left.sortOrder
    : Number.MAX_SAFE_INTEGER;
  const rightSortOrder = Number.isFinite(right.sortOrder)
    ? right.sortOrder
    : Number.MAX_SAFE_INTEGER;

  if (leftSortOrder !== rightSortOrder) {
    return leftSortOrder - rightSortOrder;
  }

  const leftIndex = Number.isFinite(left.sequence)
    ? left.sequence
    : Number.isFinite(left.index)
      ? left.index
      : Number.MAX_SAFE_INTEGER;
  const rightIndex = Number.isFinite(right.sequence)
    ? right.sequence
    : Number.isFinite(right.index)
      ? right.index
      : Number.MAX_SAFE_INTEGER;

  if (leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }

  return left.name.localeCompare(right.name);
}

function isImageFile(file) {
  return (
    cleanCellValue(file?.mimeType).toLowerCase().startsWith("image/") ||
    IMAGE_EXTENSION_RE.test(cleanCellValue(file?.name))
  );
}

function buildParsedPhoto({ mosqueName, type, index, sequence = index }) {
  const cleanMosqueName = cleanCellValue(mosqueName);

  if (!cleanMosqueName || !Number.isFinite(index)) {
    return null;
  }

  return {
    mosqueName: cleanMosqueName,
    type,
    index,
    sequence,
    sortOrder: PHOTO_TYPE_SORT_ORDER[type] ?? PHOTO_TYPE_SORT_ORDER.legacy,
  };
}

function parseNamedPhoto(fileName) {
  const normalizedFileName = cleanCellValue(fileName);
  let match = normalizedFileName.match(NAMED_MAIN_PHOTO_RE);

  if (match) {
    return buildParsedPhoto({
      mosqueName: match[1],
      type: "main",
      index: 0,
      sequence: 0,
    });
  }

  match = normalizedFileName.match(NAMED_TYPED_PHOTO_RE);

  if (match) {
    const sequence = parsePhotoIndex(match[3]);
    if (!Number.isFinite(sequence) || sequence < 1) {
      return null;
    }

    return buildParsedPhoto({
      mosqueName: match[1],
      type: match[2].toUpperCase() === "I" ? "inside" : "outside",
      index: sequence,
      sequence,
    });
  }

  match = normalizedFileName.match(LEGACY_NAMED_PHOTO_RE);
  if (!match) return null;

  const index = parsePhotoIndex(match[2]);
  const type = index === 0 ? "main" : "legacy";

  return buildParsedPhoto({
    mosqueName: match[1],
    type,
    index,
    sequence: index,
  });
}

function buildDriveApiUrl({ folderId, apiKey, pageToken = "" }) {
  const query = `'${folderId}' in parents and trashed = false`;
  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    fields: "nextPageToken,files(id,name,mimeType,modifiedTime)",
    orderBy: "name",
    pageSize: "1000",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  return `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
}

function buildAppsScriptUrl({ appsScriptUrl, callbackName }) {
  const url = new URL(appsScriptUrl);
  url.searchParams.set("callback", callbackName);
  return url.toString();
}

function loadAppsScriptFiles(appsScriptUrl) {
  return new Promise((resolve, reject) => {
    const callbackName = `__awqafDrivePhotos${Date.now()}_${jsonpRequestCount}`;
    jsonpRequestCount += 1;

    const script = document.createElement("script");
    script.src = buildAppsScriptUrl({ appsScriptUrl, callbackName });
    script.async = true;

    const cleanup = () => {
      script.remove();
      delete window[callbackName];
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Apps Script photo list timed out."));
    }, APPS_SCRIPT_TIMEOUT_MS);

    window[callbackName] = (payload) => {
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(Array.isArray(payload) ? payload : payload?.files || []);
    };

    script.addEventListener("error", () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("Apps Script photo list failed to load."));
    });

    document.head.appendChild(script);
  });
}

async function fetchDriveFiles() {
  const { apiKey, appsScriptUrl, folderId } = APP_CONFIG.drivePhotos || {};

  if (appsScriptUrl) {
    try {
      return await loadAppsScriptFiles(appsScriptUrl);
    } catch (error) {
      if (!apiKey || !folderId) {
        throw error;
      }

      console.warn("Apps Script photo list failed, trying the Drive API fallback.", error);
    }
  }

  if (!apiKey || !folderId) {
    if (!apiKey) {
      console.warn(
        "Google Drive photos are enabled, but APP_CONFIG.drivePhotos.appsScriptUrl and apiKey are blank.",
      );
    }
    return [];
  }

  const files = [];
  let pageToken = "";

  do {
    const response = await fetch(buildDriveApiUrl({ folderId, apiKey, pageToken }), {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Google Drive photo list failed with HTTP ${response.status}.`);
    }

    const payload = await response.json();
    files.push(...(payload.files || []));
    pageToken = payload.nextPageToken || "";
  } while (pageToken);

  return files;
}

function buildDrivePhotoEntry(file, parsedPhoto) {
  const thumbnailSize = APP_CONFIG.drivePhotos?.thumbnailSize || "w1600";

  return {
    source: "google-drive",
    id: file.id,
    name: file.name,
    type: parsedPhoto.type,
    index: parsedPhoto.index,
    sequence: parsedPhoto.sequence,
    sortOrder: parsedPhoto.sortOrder,
    url: `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
    previewUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(
      file.id,
    )}&sz=${encodeURIComponent(thumbnailSize)}`,
    isRenderable: true,
  };
}

function buildPhotoIndex(files) {
  const index = new Map();

  files.forEach((file) => {
    if (!file?.id || !isImageFile(file)) return;

    const parsedPhoto = parseNamedPhoto(file.name);
    if (!parsedPhoto) return;

    const key = normalizePhotoMosqueName(parsedPhoto.mosqueName);
    if (!key) return;

    if (!index.has(key)) {
      index.set(key, []);
    }

    index.get(key).push(buildDrivePhotoEntry(file, parsedPhoto));
  });

  index.forEach((photos) => {
    photos.sort(comparePhotoEntries);
  });

  return index;
}

export function normalizePhotoMosqueName(value) {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function loadDrivePhotoIndex() {
  if (APP_CONFIG.drivePhotos?.enabled === false) {
    return new Map();
  }

  try {
    return buildPhotoIndex(await fetchDriveFiles());
  } catch (error) {
    console.warn("Google Drive photos could not be loaded.", error);
    return new Map();
  }
}

export function findDrivePhotosForRow(row, drivePhotoIndex) {
  if (!drivePhotoIndex?.size) {
    return [];
  }

  const candidates = [
    row.title,
    row.mosqueName,
    row.mosqueNameOnGround,
    row.shrineName,
    row.mosqueId,
  ];
  const seen = new Set();

  for (const candidate of candidates) {
    const key = normalizePhotoMosqueName(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const photos = drivePhotoIndex.get(key);
    if (photos?.length) {
      return photos.map((photo) => ({ ...photo }));
    }
  }

  return [];
}

export function formatDrivePhotoLabel(photo, fallbackPosition = 0) {
  if (photo?.type === "main" || photo?.index === 0) {
    return "Main photo";
  }

  if (photo?.type === "inside") {
    return `Inside photo ${photo.sequence || photo.index}`;
  }

  if (photo?.type === "outside") {
    return `Outside photo ${photo.sequence || photo.index}`;
  }

  if (Number.isFinite(photo?.index)) {
    return `Photo ${photo.index}`;
  }

  return `Photo ${fallbackPosition + 1}`;
}
