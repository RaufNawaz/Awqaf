import { APP_CONFIG } from "./config.js?v=photo-startup-20260920";
import { cleanCellValue, normalizeSearchText } from "./utils.js?v=photo-startup-20260920";

const PHOTO_TYPE_SORT_ORDER = {
  main: 0,
  inside: 1,
  outside: 2,
  legacy: 3,
};

let localPhotoIndex = null;
let localPhotoIndexPromise = null;
const mosqueManifestPromises = new Map();
const rowPhotoCache = new Map();

function clonePhotoEntry(photo) {
  return {
    ...photo,
    thumbnailUrls: photo.thumbnailUrls ? { ...photo.thumbnailUrls } : undefined,
  };
}

function clonePhotos(photos) {
  return (photos || []).map(clonePhotoEntry);
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

  return cleanCellValue(left.name).localeCompare(cleanCellValue(right.name));
}

export function normalizePhotoMosqueName(value) {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPhotoMatchCandidates(row) {
  // Synced files are named after the Mosque Name column, so check it first.
  // The remaining fields retain the more forgiving historical matching.
  return [
    row.mosqueName,
    row.mosqueNameOnGround,
    row.title,
    row.shrineName,
    row.mosqueId,
  ];
}

function getUniquePhotoMatchKeys(row) {
  return Array.from(
    new Set(getPhotoMatchCandidates(row).map(normalizePhotoMosqueName).filter(Boolean)),
  );
}

function getRowPhotoCacheKey(row) {
  return getUniquePhotoMatchKeys(row).join("|");
}

function slugifyMosqueKey(mosqueKey) {
  return mosqueKey.replace(/\s+/g, "-");
}

async function fetchPhotoManifest(url, { warnOnFailure = true } = {}) {
  try {
    // Use normal browser caching. The service worker serves a cached copy
    // immediately and revalidates it in the background when available.
    const response = await fetch(url);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Photo manifest failed with HTTP ${response.status}.`);
    }
    return await response.json();
  } catch (error) {
    if (warnOnFailure) {
      console.warn("Local photo manifest could not be loaded.", error);
    }
    throw error;
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

function buildLocalPhotoIndex(manifest) {
  const index = new Map();
  if (!manifest?.photos) return index;

  Object.entries(manifest.photos).forEach(([fileId, entry]) => {
    const key = cleanCellValue(entry?.mosqueKey || manifest.mosqueKey);
    if (!key || !entry?.files?.small || !entry?.files?.large) return;

    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key).push(buildLocalPhotoEntry(fileId, entry));
  });

  index.forEach((photos) => photos.sort(comparePhotoEntries));
  return index;
}

export async function loadLocalPhotoIndex() {
  const localPhotosConfig = APP_CONFIG.localPhotos || {};
  if (localPhotosConfig.enabled === false || !localPhotosConfig.manifestUrl) {
    return new Map();
  }

  const manifest = await fetchPhotoManifest(localPhotosConfig.manifestUrl);
  return buildLocalPhotoIndex(manifest);
}

async function loadMosquePhotoManifest(mosqueKey) {
  const manifestDirectory = cleanCellValue(APP_CONFIG.localPhotos?.manifestDirectory);
  if (!manifestDirectory || !mosqueKey) return null;

  if (!mosqueManifestPromises.has(mosqueKey)) {
    const manifestUrl = `${manifestDirectory.replace(/\/$/, "")}/${encodeURIComponent(
      slugifyMosqueKey(mosqueKey),
    )}.json`;
    const manifestPromise = fetchPhotoManifest(manifestUrl, { warnOnFailure: false }).catch(
      (error) => {
        mosqueManifestPromises.delete(mosqueKey);
        throw error;
      },
    );
    mosqueManifestPromises.set(mosqueKey, manifestPromise);
  }

  return mosqueManifestPromises.get(mosqueKey);
}

export async function loadDrivePhotoIndex() {
  if (APP_CONFIG.localPhotos?.enabled === false) {
    return new Map();
  }

  if (localPhotoIndex) {
    return localPhotoIndex;
  }

  if (!localPhotoIndexPromise) {
    localPhotoIndexPromise = loadLocalPhotoIndex().then((index) => {
      if (index.size) {
        localPhotoIndex = index;
      }
      return index;
    });
  }

  try {
    return await localPhotoIndexPromise;
  } finally {
    if (!localPhotoIndex?.size) {
      localPhotoIndexPromise = null;
    }
  }
}

export function findDrivePhotosForRow(row, photoIndex) {
  if (!photoIndex?.size) {
    return [];
  }

  for (const key of getUniquePhotoMatchKeys(row)) {
    const photos = photoIndex.get(key);
    if (photos?.length) {
      return clonePhotos(photos);
    }
  }

  return [];
}

export async function loadDrivePhotosForRow(row) {
  if (APP_CONFIG.localPhotos?.enabled === false) {
    return [];
  }

  const cacheKey = getRowPhotoCacheKey(row);
  if (!cacheKey) {
    return [];
  }

  if (rowPhotoCache.has(cacheKey)) {
    return clonePhotos(rowPhotoCache.get(cacheKey));
  }

  if (localPhotoIndex) {
    const indexedPhotos = findDrivePhotosForRow(row, localPhotoIndex);
    rowPhotoCache.set(cacheKey, clonePhotos(indexedPhotos));
    return indexedPhotos;
  }

  for (const mosqueKey of getUniquePhotoMatchKeys(row)) {
    const manifest = await loadMosquePhotoManifest(mosqueKey);
    const photos = findDrivePhotosForRow(row, buildLocalPhotoIndex(manifest));
    if (photos.length) {
      rowPhotoCache.set(cacheKey, clonePhotos(photos));
      return photos;
    }
  }

  rowPhotoCache.set(cacheKey, []);
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
