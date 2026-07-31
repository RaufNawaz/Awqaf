import { APP_CONFIG } from "./config.js?v=shrine-links-20260731";
import {
  buildGoogleDriveThumbnailUrl,
  cleanCellValue,
  normalizeSearchText,
} from "./utils.js?v=shrine-links-20260731";

const IMAGE_EXTENSION_RE = /\.(avif|gif|heic|heif|jpe?g|png|webp|svg)$/i;
const NAMED_MAIN_PHOTO_RE = /^(.+)_M(?:\.(?:avif|gif|heic|heif|jpe?g|png|webp|svg))?$/i;
// The trailing _<number> is optional: in practice most uploads are named
// "MosqueName_I" / "MosqueName_O" with no sequence number at all (verified
// against the live Drive folder). Files without an explicit number get an
// auto-assigned sequence in buildPhotoIndex() (see assignAutoSequences()).
const NAMED_TYPED_PHOTO_RE =
  /^(.+)_(I|O)(?:_([0-9]+))?(?:\.(?:avif|gif|heic|heif|jpe?g|png|webp|svg))?$/i;
const LEGACY_NAMED_PHOTO_RE =
  /^(.+)_([0-9]+)(?:\.(?:avif|gif|heic|heif|jpe?g|png|webp|svg))?$/i;
const APPS_SCRIPT_TIMEOUT_MS = 10000;
const DRIVE_FILES_CACHE_KEY = "awqaf-drive-photo-files-v3";
const DRIVE_FILES_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_THUMBNAIL_SIZES = {
  sidebar: "w360",
  preview: "w640",
  gallery: "w1200",
  hero: "w1200",
};
const PHOTO_TYPE_SORT_ORDER = {
  main: 0,
  inside: 1,
  outside: 2,
  legacy: 3,
};
let jsonpRequestCount = 0;
let drivePhotoIndex = null;
let drivePhotoIndexPromise = null;
const rowPhotoCache = new Map();

function getDriveFilesCacheScope() {
  const { apiKey, appsScriptUrl, folderId } = APP_CONFIG.drivePhotos || {};
  return [folderId || "", appsScriptUrl || "", apiKey ? "api-key" : "no-api-key"].join("|");
}

function getDriveFilesCacheStorage() {
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function readCachedDriveFiles({ allowExpired = false } = {}) {
  const storage = getDriveFilesCacheStorage();
  if (!storage) return null;

  try {
    const cached = JSON.parse(storage.getItem(DRIVE_FILES_CACHE_KEY) || "null");
    if (!cached || cached.scope !== getDriveFilesCacheScope()) return null;
    const expiresAt = Number(cached.expiresAt);
    if (!Number.isFinite(expiresAt)) return null;
    if (!allowExpired && expiresAt < Date.now()) return null;
    return Array.isArray(cached.files) ? cached.files : null;
  } catch {
    return null;
  }
}

function writeCachedDriveFiles(files) {
  const storage = getDriveFilesCacheStorage();
  if (!storage || !Array.isArray(files)) return;

  try {
    storage.setItem(
      DRIVE_FILES_CACHE_KEY,
      JSON.stringify({
        scope: getDriveFilesCacheScope(),
        expiresAt: Date.now() + DRIVE_FILES_CACHE_TTL_MS,
        files,
      }),
    );
  } catch {
    // Browsers can disable storage or reject writes in private mode.
  }
}

function clonePhotoEntry(photo) {
  return {
    ...photo,
    thumbnailUrls: photo.thumbnailUrls ? { ...photo.thumbnailUrls } : undefined,
  };
}

function clonePhotos(photos) {
  return (photos || []).map(clonePhotoEntry);
}

function getThumbnailSize(sizeKey) {
  const configuredSizes = APP_CONFIG.drivePhotos?.thumbnailSizes || {};
  return (
    cleanCellValue(configuredSizes[sizeKey]) ||
    DEFAULT_THUMBNAIL_SIZES[sizeKey] ||
    cleanCellValue(APP_CONFIG.drivePhotos?.thumbnailSize) ||
    DEFAULT_THUMBNAIL_SIZES.gallery
  );
}

function buildDriveThumbnailUrls(fileId) {
  return {
    sidebar: buildGoogleDriveThumbnailUrl(fileId, getThumbnailSize("sidebar")),
    preview: buildGoogleDriveThumbnailUrl(fileId, getThumbnailSize("preview")),
    gallery: buildGoogleDriveThumbnailUrl(fileId, getThumbnailSize("gallery")),
    hero: buildGoogleDriveThumbnailUrl(fileId, getThumbnailSize("hero")),
  };
}

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

function buildParsedPhoto({
  mosqueName,
  type,
  index,
  sequence = index,
  namingConvention = "modern",
}) {
  const cleanMosqueName = cleanCellValue(mosqueName);

  if (!cleanMosqueName) {
    return null;
  }

  return {
    mosqueName: cleanMosqueName,
    type,
    index,
    sequence,
    namingConvention,
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
    const hasExplicitSequence = match[3] !== undefined;
    const sequence = hasExplicitSequence ? parsePhotoIndex(match[3]) : null;
    if (hasExplicitSequence && (!Number.isFinite(sequence) || sequence < 1)) {
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
    namingConvention: "legacy",
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

function buildAppsScriptUrl({ appsScriptUrl, callbackName, query = "" }) {
  const url = new URL(appsScriptUrl);
  url.searchParams.set("callback", callbackName);
  if (query) {
    url.searchParams.set("q", query);
  }
  return url.toString();
}

function buildAppsScriptJsonUrl({ appsScriptUrl, query = "" }) {
  const url = new URL(appsScriptUrl);
  url.searchParams.delete("callback");
  if (query) {
    url.searchParams.set("q", query);
  }
  return url.toString();
}

async function fetchAppsScriptFiles(appsScriptUrl, { query = "" } = {}) {
  const response = await fetch(buildAppsScriptJsonUrl({ appsScriptUrl, query }), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Apps Script photo list failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload?.files || [];
}

function loadAppsScriptFiles(appsScriptUrl, { query = "" } = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `__awqafDrivePhotos${Date.now()}_${jsonpRequestCount}`;
    jsonpRequestCount += 1;
    let didReceivePayload = false;

    const script = document.createElement("script");
    script.src = buildAppsScriptUrl({ appsScriptUrl, callbackName, query });
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
      didReceivePayload = true;
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(Array.isArray(payload) ? payload : payload?.files || []);
    };

    script.addEventListener("load", () => {
      window.setTimeout(() => {
        if (didReceivePayload) return;

        window.clearTimeout(timeoutId);
        cleanup();
        reject(new Error("Apps Script photo list did not return valid JSONP."));
      }, 0);
    });

    script.addEventListener("error", () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("Apps Script photo list failed to load."));
    });

    document.head.appendChild(script);
  });
}

async function fetchDriveFiles({ query = "" } = {}) {
  const { apiKey, appsScriptUrl, folderId } = APP_CONFIG.drivePhotos || {};

  if (appsScriptUrl) {
    try {
      return await fetchAppsScriptFiles(appsScriptUrl, { query });
    } catch (fetchError) {
      try {
        return await loadAppsScriptFiles(appsScriptUrl, { query });
      } catch (jsonpError) {
        if (!apiKey || !folderId) {
          throw fetchError;
        }

        console.warn(
          "Apps Script photo list failed, trying the Drive API fallback.",
          fetchError,
          jsonpError,
        );
      }
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
  const thumbnailUrls = buildDriveThumbnailUrls(file.id);

  return {
    source: "google-drive",
    id: file.id,
    name: file.name,
    modifiedTime: file.modifiedTime || "",
    type: parsedPhoto.type,
    index: parsedPhoto.index,
    sequence: parsedPhoto.sequence,
    namingConvention: parsedPhoto.namingConvention,
    sortOrder: parsedPhoto.sortOrder,
    url: `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
    previewUrl: thumbnailUrls.gallery,
    thumbnailUrls,
    isRenderable: true,
  };
}

// Photos named without an explicit sequence (e.g. "MosqueName_I" with no
// trailing number -- the convention actually used in the live Drive folder)
// get an auto-assigned sequence here, ordered by upload time, so labels like
// "Inside photo 2" and gallery sort order are still meaningful.
function assignAutoSequences(photos) {
  const groupsNeedingSequence = new Map();

  photos.forEach((photo) => {
    if (Number.isFinite(photo.sequence)) return;

    if (!groupsNeedingSequence.has(photo.type)) {
      groupsNeedingSequence.set(photo.type, []);
    }
    groupsNeedingSequence.get(photo.type).push(photo);
  });

  groupsNeedingSequence.forEach((typePhotos) => {
    typePhotos
      .sort((left, right) => {
        const leftTime = Date.parse(left.modifiedTime) || 0;
        const rightTime = Date.parse(right.modifiedTime) || 0;
        return leftTime - rightTime || left.name.localeCompare(right.name);
      })
      .forEach((photo, position) => {
        photo.sequence = position + 1;
        photo.index = photo.sequence;
      });
  });

  return photos;
}

function buildPhotoIndex(files) {
  const groupedPhotos = new Map();
  const index = new Map();

  files.forEach((file) => {
    if (!file?.id || !isImageFile(file)) return;

    const parsedPhoto = parseNamedPhoto(file.name);
    if (!parsedPhoto) return;

    const key = normalizePhotoMosqueName(parsedPhoto.mosqueName);
    if (!key) return;

    if (!groupedPhotos.has(key)) {
      groupedPhotos.set(key, {
        modern: [],
        legacy: [],
      });
    }

    const group = groupedPhotos.get(key);
    const target =
      parsedPhoto.namingConvention === "legacy" ? group.legacy : group.modern;
    target.push(buildDrivePhotoEntry(file, parsedPhoto));
  });

  groupedPhotos.forEach(({ modern, legacy }, key) => {
    const hasModernMain = modern.some((photo) => photo.type === "main");
    const legacyExtras = hasModernMain
      ? legacy.filter((photo) => !(photo.type === "main" && photo.index === 0))
      : legacy;
    const photos = modern.length
      ? [
          ...modern,
          ...legacyExtras.map((photo) => ({
            ...photo,
            sortOrder: PHOTO_TYPE_SORT_ORDER.legacy,
          })),
        ]
      : legacy;
    if (!photos.length) return;

    assignAutoSequences(photos);
    photos.sort(comparePhotoEntries);
    index.set(key, photos);
  });

  return index;
}

export function normalizePhotoMosqueName(value) {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPhotoMatchCandidates(row) {
  return [
    row.title,
    row.mosqueName,
    row.mosqueNameOnGround,
    row.shrineName,
    row.mosqueId,
  ];
}

async function fetchLocalPhotoManifest() {
  const localPhotosConfig = APP_CONFIG.localPhotos || {};
  if (localPhotosConfig.enabled === false || !localPhotosConfig.manifestUrl) {
    return null;
  }

  try {
    const response = await fetch(localPhotosConfig.manifestUrl, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("Local photo manifest could not be loaded.", error);
    return null;
  }
}

function buildLocalPhotoEntry(fileId, entry) {
  const smallUrl = cleanCellValue(entry?.files?.small);
  const largeUrl = cleanCellValue(entry?.files?.large);

  return {
    source: "local",
    id: fileId,
    name: entry.name,
    type: entry.type,
    index: entry.sequence,
    sequence: entry.sequence,
    namingConvention: "modern",
    sortOrder: PHOTO_TYPE_SORT_ORDER[entry.type] ?? PHOTO_TYPE_SORT_ORDER.legacy,
    url: `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`,
    previewUrl: largeUrl,
    thumbnailUrls: {
      sidebar: smallUrl,
      preview: smallUrl,
      gallery: largeUrl,
      hero: largeUrl,
    },
    isRenderable: true,
  };
}

// Builds the same Map shape as buildPhotoIndex() (mosqueKey -> photo array)
// from the repo-committed manifest generated by scripts/sync-photos.mjs, so
// downstream matching/rendering code cannot tell local and Drive photos apart.
export async function loadLocalPhotoIndex() {
  const manifest = await fetchLocalPhotoManifest();
  const index = new Map();
  if (!manifest?.photos) {
    return index;
  }

  const groupedByKey = new Map();

  Object.entries(manifest.photos).forEach(([fileId, entry]) => {
    const key = cleanCellValue(entry?.mosqueKey);
    if (!key || !entry?.files?.small || !entry?.files?.large) return;

    if (!groupedByKey.has(key)) {
      groupedByKey.set(key, []);
    }
    groupedByKey.get(key).push(buildLocalPhotoEntry(fileId, entry));
  });

  groupedByKey.forEach((photos, key) => {
    photos.sort(comparePhotoEntries);
    index.set(key, photos);
  });

  return index;
}

async function loadRemoteDrivePhotoIndex() {
  const cachedFiles = readCachedDriveFiles();
  if (cachedFiles) {
    return buildPhotoIndex(cachedFiles);
  }

  try {
    const files = await fetchDriveFiles();
    writeCachedDriveFiles(files);
    return buildPhotoIndex(files);
  } catch (error) {
    const staleFiles = readCachedDriveFiles({ allowExpired: true });
    if (staleFiles) {
      console.warn("Google Drive photos could not be refreshed; using cached photos.", error);
      return buildPhotoIndex(staleFiles);
    }

    console.warn("Google Drive photos could not be loaded.", error);
    return new Map();
  }
}

export async function loadDrivePhotoIndex() {
  if (APP_CONFIG.drivePhotos?.enabled === false) {
    return new Map();
  }

  // Only treat a cached index as a hit when it actually has entries. A Map is
  // truthy even when empty, so without the ?.size check a single transient
  // failure (e.g. an Apps Script cold-start timeout) on the very first call
  // would latch an empty index in for the rest of the page session -- every
  // mosque would show no photos until a full reload, with no error anywhere.
  if (drivePhotoIndex?.size) {
    return drivePhotoIndex;
  }

  if (drivePhotoIndexPromise) {
    return drivePhotoIndexPromise;
  }

  drivePhotoIndexPromise = (async () => {
    const [localIndex, remoteIndex] = await Promise.all([
      loadLocalPhotoIndex(),
      loadRemoteDrivePhotoIndex(),
    ]);

    // Repo-served (local) photos win per photo (matched by Drive file id);
    // the live Drive listing fills in any photo the sync hasn't picked up
    // yet, even for a mosque that already has other photos synced locally.
    const mergedIndex = new Map();
    const allKeys = new Set([...remoteIndex.keys(), ...localIndex.keys()]);

    allKeys.forEach((key) => {
      const localPhotos = localIndex.get(key) || [];
      const remotePhotos = remoteIndex.get(key) || [];
      const localIds = new Set(localPhotos.map((photo) => photo.id));
      const remoteOnly = remotePhotos.filter((photo) => !localIds.has(photo.id));
      const combined = [...localPhotos, ...remoteOnly];
      combined.sort(comparePhotoEntries);
      mergedIndex.set(key, combined);
    });

    drivePhotoIndex = mergedIndex;
    return drivePhotoIndex;
  })();

  try {
    return await drivePhotoIndexPromise;
  } finally {
    if (!drivePhotoIndex?.size) {
      drivePhotoIndexPromise = null;
    }
  }
}

export function findDrivePhotosForRow(row, drivePhotoIndex) {
  if (!drivePhotoIndex?.size) {
    return [];
  }

  const candidates = getPhotoMatchCandidates(row);
  const seen = new Set();

  for (const candidate of candidates) {
    const key = normalizePhotoMosqueName(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const photos = drivePhotoIndex.get(key);
    if (photos?.length) {
      return clonePhotos(photos);
    }
  }

  return [];
}

function getRowPhotoCacheKey(row) {
  return getPhotoMatchCandidates(row)
    .map((candidate) => normalizePhotoMosqueName(candidate))
    .filter(Boolean)
    .join("|");
}

export async function loadDrivePhotosForRow(row) {
  if (APP_CONFIG.drivePhotos?.enabled === false) {
    return [];
  }

  const cacheKey = getRowPhotoCacheKey(row);
  if (!cacheKey) {
    return [];
  }

  if (rowPhotoCache.has(cacheKey)) {
    return clonePhotos(rowPhotoCache.get(cacheKey));
  }

  const photos = findDrivePhotosForRow(row, await loadDrivePhotoIndex());
  rowPhotoCache.set(cacheKey, clonePhotos(photos));
  return clonePhotos(photos);
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
