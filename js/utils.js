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

// Static inline icon set for fact labels, location cards, and buttons.
// Stroke-based on currentColor so CSS controls the tint; every string is
// static markup (never CSV-derived) and is injected next to escapeHtml()'d
// text without passing through the escaper itself.
const ICON_ATTRS =
  'class="icon-inline" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

export const ICONS = Object.freeze({
  pin: `<svg ${ICON_ATTRS}><path d="M12 21.5c4.5-4.2 7-7.9 7-11.4a7 7 0 0 0-14 0c0 3.5 2.5 7.2 7 11.4z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
  tag: `<svg ${ICON_ATTRS}><path d="M4 4h6.6l9.4 9.4a1.55 1.55 0 0 1 0 2.2l-4.4 4.4a1.55 1.55 0 0 1-2.2 0L4 10.6V4z"/><circle cx="8.2" cy="8.2" r="1.3"/></svg>`,
  signpost: `<svg ${ICON_ATTRS}><path d="M12 3v3M12 12v9M9 21h6"/><path d="M5 6h11.5l3 3-3 3H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/></svg>`,
  district: `<svg ${ICON_ATTRS}><path d="M9 3.8 3.5 5.8v14.4l5.5-2 6 2 5.5-2V3.8l-5.5 2z"/><path d="M9 3.8v14.4M15 5.8v14.4"/></svg>`,
  city: `<svg ${ICON_ATTRS}><path d="M3 21h18"/><path d="M5 21V7.5h6.5V21"/><path d="M11.5 21V3.5h7.5V21"/></svg>`,
  imam: `<svg ${ICON_ATTRS}><circle cx="12" cy="7.5" r="3.5"/><path d="M5 20.5a7 7 0 0 1 14 0"/></svg>`,
  calendar: `<svg ${ICON_ATTRS}><rect x="3.75" y="5" width="16.5" height="15.5" rx="2"/><path d="M3.75 9.75h16.5M8.5 2.75V7M15.5 2.75V7"/></svg>`,
  women: `<svg ${ICON_ATTRS}><circle cx="9.2" cy="7.8" r="3.4"/><path d="M3.2 20.2a6 6 0 0 1 12 0"/><path d="M16.4 4.9a3.4 3.4 0 0 1 0 6.6M17.8 14.6a6 6 0 0 1 3.4 5.4"/></svg>`,
  shrine: `<svg ${ICON_ATTRS}><path d="M4 20.5h16v-8.4a8 8 0 0 0-16 0z"/><path d="M12 4.1V2.4"/><path d="M9.5 20.5v-3a2.5 2.5 0 0 1 5 0v3"/></svg>`,
  directions: `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="8.5"/><path d="M15.7 8.3l-2.1 5.3-5.3 2.1 2.1-5.3z"/></svg>`,
  coordinates: `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="6.8"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6"/></svg>`,
  comments: `<svg ${ICON_ATTRS}><path d="M21 15a2 2 0 0 1-2 2H8l-4.5 4V5a2 2 0 0 1 2-2h13.5a2 2 0 0 1 2 2z"/></svg>`,
});
