import { normalizeSearchText } from "./utils.js";

export const DEFAULT_FILTERS = {
  search: "",
  treatmentName: "all",
  zone: "all",
  womensPrayerSection: "all",
  ruralUrbanLabel: "all",
};

function sortValues(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
}

export function buildFilterOptions(rows) {
  return {
    treatmentNames: sortValues(rows.map((row) => row.treatmentName)),
    zones: sortValues(rows.map((row) => row.zone)),
    womensPrayerSections: sortValues(rows.map((row) => row.womensPrayerSection)),
    ruralUrbanLabels: sortValues(rows.map((row) => row.ruralUrbanLabel)),
  };
}

export function filterRows(rows, filters) {
  const query = normalizeSearchText(filters.search);

  return rows.filter((row) => {
    if (query && !row.searchBlob.includes(query)) return false;
    if (filters.treatmentName !== "all" && row.treatmentName !== filters.treatmentName) {
      return false;
    }
    if (filters.zone !== "all" && row.zone !== filters.zone) return false;
    if (
      filters.womensPrayerSection !== "all" &&
      row.womensPrayerSection !== filters.womensPrayerSection
    ) {
      return false;
    }
    if (filters.ruralUrbanLabel !== "all" && row.ruralUrbanLabel !== filters.ruralUrbanLabel) {
      return false;
    }

    return true;
  });
}
