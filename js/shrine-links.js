// Links from Auqaf records to their pages on the Sufi Shrines archive
// (https://raufnawaz.github.io/Sufi-Shrines/).
//
// HOW TO ADD A SHRINE:
// Add one entry to SHRINE_PAGE_LINKS below. The key is the shrine's name as it
// appears in the sheet's "Shrine Name" column (case/punctuation-insensitive —
// a few alias spellings are fine and encouraged). The value gives the display
// name to show when the sheet cell is empty, and the shrine page URL.
// No other code changes are needed: the map drawer and the mosque detail page
// both pick the link up automatically.

import { normalizeSearchText } from "./utils.js?v=shrine-links-20260731";

const SHRINE_SITE_BASE = "https://raufnawaz.github.io/Sufi-Shrines";

const BIBI_PAK_DAMAN = {
  name: "Bibi Pak Daman",
  url: `${SHRINE_SITE_BASE}/shrine/shrine-of-bibi-pak-daman`,
};

const SHRINE_PAGE_LINKS = {
  "bibi pak daman": BIBI_PAK_DAMAN,
  "bibi pak daman lahore": BIBI_PAK_DAMAN,
  "shrine of bibi pak daman": BIBI_PAK_DAMAN,
  "bibi pak daman shrine": BIBI_PAK_DAMAN,
  "bibian pak daman": BIBI_PAK_DAMAN,
};

function toLinkKey(value) {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns { name, url } for the shrine associated with this row, or null.
// Tries the row's shrine name first, then the mosque names, so the link still
// resolves when the "Shrine Name" cell is empty but the mosque itself is the
// shrine's mosque (e.g. "Jamia Masjid Bibi Pak Daman Lahore").
export function getShrineLink(row) {
  const candidates = [
    row?.shrineName,
    row?.mosqueNameOnGround,
    row?.mosqueName,
    row?.title,
  ];

  for (const candidate of candidates) {
    const key = toLinkKey(candidate || "");
    if (key && SHRINE_PAGE_LINKS[key]) {
      return SHRINE_PAGE_LINKS[key];
    }
  }

  // Also match mosque names that *contain* a linked shrine name, so rows like
  // "Jamia Masjid Bibi Pak Daman Lahore" resolve without an exact alias.
  const haystack = candidates.map((value) => toLinkKey(value || "")).join(" | ");
  for (const [key, link] of Object.entries(SHRINE_PAGE_LINKS)) {
    if (haystack.includes(key)) {
      return link;
    }
  }

  return null;
}
