import { APP_CONFIG, buildPrimaryCsvUrl } from "./config.js?v=photos-20260704";
import {
  findDrivePhotosForRow,
  loadDrivePhotosForRow as fetchDrivePhotosForRow,
  loadDrivePhotoIndex,
} from "./drive-photos.js?v=photos-20260704";
import {
  cleanCellValue,
  cleanYearLikeValue,
  extractUrls,
  formatCoordinatePair,
  getDisplayTitle,
  getImagePreviewUrl,
  isRenderableImageUrl,
  joinBits,
  normalizeSearchText,
  normalizeUrl,
  parseCoordinate,
  parseRuralUrbanLabel,
  parseWomenPrayerLabel,
  pickFirstValue,
} from "./utils.js?v=photos-20260704";

const DEFAULT_PHOTO_THUMBNAIL_SIZES = {
  sidebar: "w360",
  preview: "w640",
  gallery: "w1200",
  hero: "w1200",
};

function normalizeRawRow(rawRow) {
  const normalized = {};

  Object.entries(rawRow || {}).forEach(([key, value]) => {
    const trimmedKey = cleanCellValue(key);
    if (!trimmedKey) return;
    normalized[trimmedKey] = typeof value === "string" ? value.trim() : value ?? "";
  });

  return normalized;
}

function getPhotoThumbnailSize(sizeKey) {
  return (
    APP_CONFIG.drivePhotos?.thumbnailSizes?.[sizeKey] ||
    DEFAULT_PHOTO_THUMBNAIL_SIZES[sizeKey] ||
    APP_CONFIG.drivePhotos?.thumbnailSize ||
    DEFAULT_PHOTO_THUMBNAIL_SIZES.gallery
  );
}

function buildPhotoThumbnailUrls(url) {
  return {
    sidebar: getImagePreviewUrl(url, getPhotoThumbnailSize("sidebar")),
    preview: getImagePreviewUrl(url, getPhotoThumbnailSize("preview")),
    gallery: getImagePreviewUrl(url, getPhotoThumbnailSize("gallery")),
    hero: getImagePreviewUrl(url, getPhotoThumbnailSize("hero")),
  };
}

function buildPhotoEntries(rawValue) {
  return extractUrls(rawValue).map((url) => ({
    url,
    previewUrl: getImagePreviewUrl(url, getPhotoThumbnailSize("gallery")),
    thumbnailUrls: buildPhotoThumbnailUrls(url),
    isRenderable: isRenderableImageUrl(url),
  }));
}

function normalizeRow(rawRow, index) {
  const row = normalizeRawRow(rawRow);
  const columns = APP_CONFIG.columns;

  const latitude = parseCoordinate(pickFirstValue(row, columns.latitude));
  const longitude = parseCoordinate(pickFirstValue(row, columns.longitude));

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  const zone = pickFirstValue(row, columns.zone);
  const city = pickFirstValue(row, columns.city);
  const address = pickFirstValue(row, columns.address);
  const mosqueId = pickFirstValue(row, columns.mosqueId);
  const mosqueName = pickFirstValue(row, columns.mosqueName);
  const treatmentName = pickFirstValue(row, columns.treatmentName);
  const mosqueNameOnGround = pickFirstValue(row, columns.mosqueNameOnGround);
  const imamName = pickFirstValue(row, columns.imamName);
  const mosqueBuiltDate = cleanYearLikeValue(pickFirstValue(row, columns.mosqueBuiltDate));
  const shrineName = pickFirstValue(row, columns.shrineName);
  const womensPrayerSection = parseWomenPrayerLabel(
    pickFirstValue(row, columns.womensPrayerSection),
  );
  const ruralUrbanLabel = parseRuralUrbanLabel(pickFirstValue(row, columns.ruralUrban));
  const whatsappLocationUrl = normalizeUrl(pickFirstValue(row, columns.whatsappLocation));
  const closestMosqueLocationUrl = normalizeUrl(
    pickFirstValue(row, columns.closestMosqueLocation),
  );
  const closestMosqueLatitude = parseCoordinate(
    pickFirstValue(row, columns.closestMosqueLatitude),
  );
  const closestMosqueLongitude = parseCoordinate(
    pickFirstValue(row, columns.closestMosqueLongitude),
  );
  const comments = cleanCellValue(pickFirstValue(row, columns.comments));
  const title = getDisplayTitle({
    shrineName,
    mosqueName,
    mosqueNameOnGround,
    mosqueId,
  });

  const normalized = {
    id: `${mosqueId || "row"}-${index}`,
    index,
    zone,
    city,
    address,
    mosqueId,
    mosqueName,
    treatmentName,
    mosqueNameOnGround,
    imamName,
    mosqueBuiltDate,
    shrineName,
    womensPrayerSection,
    ruralUrbanLabel,
    whatsappLocationUrl,
    latitude,
    longitude,
    coordinatesLabel: formatCoordinatePair(latitude, longitude),
    closestMosque: {
      url: closestMosqueLocationUrl,
      latitude: closestMosqueLatitude,
      longitude: closestMosqueLongitude,
      coordinatesLabel: formatCoordinatePair(closestMosqueLatitude, closestMosqueLongitude),
    },
    drivePhotos: [],
    insidePhotos: buildPhotoEntries(pickFirstValue(row, columns.photoInside)),
    outsidePhotos: buildPhotoEntries(pickFirstValue(row, columns.photoOutside)),
    comments,
    title,
  };

  normalized.subtitle = joinBits([
    normalized.mosqueNameOnGround && normalized.mosqueNameOnGround !== normalized.title
      ? normalized.mosqueNameOnGround
      : normalized.mosqueName,
    normalized.zone,
  ]);

  normalized.searchBlob = normalizeSearchText(
    [
      normalized.shrineName,
      normalized.mosqueName,
      normalized.mosqueNameOnGround,
      normalized.imamName,
      normalized.zone,
      normalized.city,
      normalized.address,
      normalized.mosqueId,
    ].join(" "),
  );

  return normalized;
}

export async function loadDrivePhotosForRows(rows) {
  const drivePhotoIndex = await loadDrivePhotoIndex();

  rows.forEach((row) => {
    row.drivePhotos = findDrivePhotosForRow(row, drivePhotoIndex);
  });

  return rows;
}

export async function loadDrivePhotosForRow(row) {
  row.drivePhotos = await fetchDrivePhotosForRow(row);
  return row.drivePhotos;
}

function parseCsv(url) {
  const Papa = window.Papa;

  if (!Papa) {
    return Promise.reject(new Error("Papa Parse failed to load."));
  }

  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors?.length && !results.data?.length) {
          reject(new Error(results.errors[0].message || "CSV parsing failed."));
          return;
        }

        resolve(results.data || []);
      },
      error: (error) => reject(error),
    });
  });
}

export async function loadShrineRows({ includeDrivePhotos = true } = {}) {
  let rawRows;

  try {
    rawRows = await parseCsv(buildPrimaryCsvUrl());
  } catch (error) {
    throw new Error(
      `The live published Google Sheet could not be loaded. ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }

  const rows = rawRows
    .map((row, index) => normalizeRow(row, index))
    .filter(Boolean);

  if (includeDrivePhotos) {
    await loadDrivePhotosForRows(rows);
  }

  return {
    rows,
  };
}
