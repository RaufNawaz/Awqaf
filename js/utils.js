export function toTrimmedString(value) {
  return String(value ?? "").trim();
}

export function isBlankValue(value) {
  const normalized = toTrimmedString(value).toLowerCase();
  return !normalized || ["not found", "form not found", "n/a", "na", "null", "undefined", "end"].includes(normalized);
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
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

export function extractUrls(value) {
  const raw = toTrimmedString(value);
  if (!raw) return [];

  const matches = raw.match(/(?:https?:\/\/|www\.)[^\s,]+/gi) || [];
  return Array.from(
    new Set(
      matches
        .map((url) => normalizeUrl(url))
        .filter(Boolean),
    ),
  );
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

export function getImagePreviewUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";

  const driveId = getGoogleDriveFileId(normalized);
  if (driveId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1200`;
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
  return row.shrineName || row.mosqueName || row.mosqueNameOnGround || row.mosqueId || "Unnamed location";
}

export function joinBits(parts) {
  return parts.filter(Boolean).join(" - ");
}

export function formatCoordinatePair(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
