import { APP_CONFIG, buildPrimaryCsvUrl } from "./config.js";
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
} from "./utils.js";

const Papa = window.Papa;

function normalizeRawRow(rawRow) {
  const normalized = {};

  Object.entries(rawRow || {}).forEach(([key, value]) => {
    const trimmedKey = cleanCellValue(key);
    if (!trimmedKey) return;
    normalized[trimmedKey] = typeof value === "string" ? value.trim() : value ?? "";
  });

  return normalized;
}

function buildPhotoEntries(rawValue) {
  return extractUrls(rawValue).map((url) => ({
    url,
    previewUrl: getImagePreviewUrl(url),
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
      normalized.mosqueId,
    ].join(" "),
  );

  return normalized;
}

function parseCsv(url) {
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

export async function loadShrineRows() {
  const primaryUrl = buildPrimaryCsvUrl();
  const fallbackUrl = APP_CONFIG.dataSource.fallbackCsvPath;
  const usingConfiguredFallback = primaryUrl === fallbackUrl;

  let rawRows;
  let sourceLabel = usingConfiguredFallback ? "snapshot" : "google-sheet";
  let warningMessage = "";

  try {
    rawRows = await parseCsv(primaryUrl);
  } catch (error) {
    if (usingConfiguredFallback) {
      throw error;
    }

    rawRows = await parseCsv(fallbackUrl);
    sourceLabel = "snapshot";
    warningMessage =
      "The live Google Sheet could not be loaded, so the app is using the bundled Adil Final snapshot instead.";
  }

  const rows = rawRows
    .map((row, index) => normalizeRow(row, index))
    .filter(Boolean);

  return {
    rows,
    sourceLabel,
    warningMessage,
  };
}
