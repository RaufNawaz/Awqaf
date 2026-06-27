const BLANK_VALUES = new Set([
  "",
  "not found",
  "form not found",
  "n/a",
  "na",
  "null",
  "undefined",
  "end",
]);

export function toTrimmedString(value) {
  return String(value ?? "").trim();
}

export function isBlankValue(value) {
  const normalized = toTrimmedString(value).toLowerCase();
  return BLANK_VALUES.has(normalized);
}

export function cleanCellValue(value) {
  const trimmed = toTrimmedString(value);
  return isBlankValue(trimmed) ? "" : trimmed;
}

export function cleanYearLikeValue(value) {
  const trimmed = cleanCellValue(value);
  if (!trimmed) return "";
  return trimmed.replace(/\.0+$/, "");
}

export function normalizeSearchText(value) {
  return toTrimmedString(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function parseCoordinate(value) {
  const normalized = cleanCellValue(value).replace(/,/g, "");
  if (!normalized) return null;

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  if (Math.abs(parsed) > 180) return null;
  return parsed;
}

export function parseRuralUrbanLabel(value) {
  const trimmed = cleanCellValue(value);
  if (!trimmed) return "";

  if (/^1(?:\.0+)?$/.test(trimmed)) return "Rural";
  if (/^2(?:\.0+)?$/.test(trimmed)) return "Urban";
  return "";
}

export function parseWomenPrayerLabel(value) {
  const trimmed = cleanCellValue(value);
  if (!trimmed) return "";

  const lowered = trimmed.toLowerCase();
  if (lowered === "yes") return "Yes";
  if (lowered === "no") return "No";
  return trimmed;
}

export function normalizeUrl(rawUrl) {
  const trimmed = cleanCellValue(rawUrl);
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (isLocalImagePath(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

export function extractUrls(value) {
  const raw = toTrimmedString(value);
  if (!raw) return [];

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const matches = entries.flatMap((entry) => {
    const urls = entry.match(/(?:https?:\/\/|www\.)[^\s,]+/gi) || [];
    if (urls.length) return urls;
    return isLocalImagePath(entry) ? [entry] : [];
  });

  return Array.from(
    new Set(
      matches
        .map((url) => normalizeUrl(url))
        .filter(Boolean),
    ),
  );
}

export function isLocalImagePath(value) {
  const trimmed = toTrimmedString(value);
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || /^\/\//.test(trimmed)) {
    return false;
  }

  return /(?:^|\/)[^?#]+\.(?:avif|gif|heic|heif|jpe?g|png|webp|svg)(?:[?#].*)?$/i.test(trimmed);
}

export function getGoogleDriveFileId(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";

  const fileMatch =
    normalized.match(/\/file\/d\/([^/]+)/i) ||
    normalized.match(/[?&]id=([^&]+)/i) ||
    normalized.match(/\/open\?id=([^&]+)/i);

  return fileMatch ? fileMatch[1] : "";
}

export function buildGoogleDriveThumbnailUrl(fileId, size = "w1200") {
  const cleanFileId = cleanCellValue(fileId);
  const cleanSize = cleanCellValue(size) || "w1200";

  if (!cleanFileId) return "";

  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
    cleanFileId,
  )}&sz=${encodeURIComponent(cleanSize)}`;
}

export function getImagePreviewUrl(url, size = "w1200") {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";

  const driveId = getGoogleDriveFileId(normalized);
  if (driveId) {
    return buildGoogleDriveThumbnailUrl(driveId, size);
  }

  return normalized;
}

export function isRenderableImageUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;

  if (getGoogleDriveFileId(normalized)) return true;

  return /\.(avif|gif|jpe?g|png|webp|svg)(?:[?#].*)?$/i.test(normalized);
}

export function pickFirstValue(row, candidateHeaders) {
  for (const header of candidateHeaders) {
    const value = row[header];
    const cleaned = cleanCellValue(value);
    if (cleaned) return cleaned;
  }

  return "";
}

export function getDisplayTitle(row) {
  return (
    row.mosqueName ||
    row.mosqueNameOnGround ||
    row.shrineName ||
    row.mosqueId ||
    "Unnamed mosque"
  );
}

export function joinBits(parts) {
  return parts.filter(Boolean).join(" - ");
}

export function formatCoordinatePair(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
