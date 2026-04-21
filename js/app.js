import { APP_CONFIG } from "./config.js";
import { loadShrineRows } from "./data.js";
import { buildFilterOptions, DEFAULT_FILTERS, filterRows } from "./filters.js";
import { createShrineMap } from "./map.js";
import { joinBits } from "./utils.js";

const elements = {
  filtersPanel: document.getElementById("filtersPanel"),
  filtersPanelToggle: document.getElementById("filtersPanelToggle"),
  siteTitle: document.getElementById("siteTitle"),
  siteSubtitle: document.getElementById("siteSubtitle"),
  searchInput: document.getElementById("searchInput"),
  searchHint: document.getElementById("searchHint"),
  treatmentFilter: document.getElementById("treatmentFilter"),
  zoneFilter: document.getElementById("zoneFilter"),
  womenFilter: document.getElementById("womenFilter"),
  ruralUrbanFilter: document.getElementById("ruralUrbanFilter"),
  resetFiltersButton: document.getElementById("resetFiltersButton"),
  fitResultsButton: document.getElementById("fitResultsButton"),
  sourceChip: document.getElementById("sourceChip"),
  inlineStatus: document.getElementById("inlineStatus"),
  resultsSection: document.getElementById("resultsSection"),
  resultsCount: document.getElementById("resultsCount"),
  resultsSummary: document.getElementById("resultsSummary"),
  resultsEmpty: document.getElementById("resultsEmpty"),
  resultsList: document.getElementById("resultsList"),
  detailPanel: document.getElementById("detailPanel"),
  detailCloseButton: document.getElementById("detailCloseButton"),
  detailBody: document.getElementById("detailBody"),
  detailKicker: document.getElementById("detailKicker"),
  detailTitle: document.getElementById("detailTitle"),
  detailBadges: document.getElementById("detailBadges"),
  detailCommentsSection: document.getElementById("detailCommentsSection"),
  detailComments: document.getElementById("detailComments"),
  detailPhotosSection: document.getElementById("detailPhotosSection"),
  detailPhotos: document.getElementById("detailPhotos"),
  detailMeta: document.getElementById("detailMeta"),
  mapOverlay: document.getElementById("mapOverlay"),
  errorBanner: document.getElementById("errorBanner"),
};

const state = {
  rows: [],
  filteredRows: [],
  filters: { ...DEFAULT_FILTERS },
  filterOptions: null,
  selectedId: "",
  warningMessage: "",
};

let shrineMap = null;

function setMapMessage(message = "") {
  elements.mapOverlay.textContent = message;
  elements.mapOverlay.classList.toggle("hidden", !message);
}

function setError(message = "") {
  elements.errorBanner.textContent = message;
  elements.errorBanner.classList.toggle("hidden", !message);
}

async function waitForLibraries(timeoutMs = 5000) {
  const startedAt = Date.now();

  while (!window.L || !window.Papa) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Leaflet or Papa Parse did not finish loading.");
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 30);
    });
  }
}

function refreshMapAfterLayoutChange() {
  window.setTimeout(() => {
    shrineMap?.invalidateSize();
  }, 240);
}

function setFiltersPanelCollapsed(collapsed) {
  elements.filtersPanel.classList.toggle("collapsed", collapsed);
  refreshMapAfterLayoutChange();
}

function toggleFiltersPanel() {
  const collapsed = elements.filtersPanel.classList.contains("collapsed");
  setFiltersPanelCollapsed(!collapsed);
}

function setDetailPanelVisible(visible) {
  const isHidden = elements.detailPanel.classList.contains("hidden");
  if (visible === !isHidden) return;

  elements.detailPanel.classList.toggle("hidden", !visible);
  elements.detailPanel.setAttribute("aria-hidden", String(!visible));
  refreshMapAfterLayoutChange();
}

function hasSearchQuery(filters = state.filters) {
  return Boolean(filters.search.trim());
}

function hasActiveFilters(filters = state.filters) {
  return (
    hasSearchQuery(filters) ||
    filters.treatmentName !== DEFAULT_FILTERS.treatmentName ||
    filters.zone !== DEFAULT_FILTERS.zone ||
    filters.womensPrayerSection !== DEFAULT_FILTERS.womensPrayerSection ||
    filters.ruralUrbanLabel !== DEFAULT_FILTERS.ruralUrbanLabel
  );
}

function renderFilterPanelState() {
  const hasActive = hasActiveFilters();
  const canFitResults = hasActive && state.filteredRows.length > 0;

  elements.fitResultsButton.classList.toggle("hidden", !canFitResults);
  elements.searchHint.classList.toggle("hidden", hasActive);
}

function populateSelect(selectElement, placeholderLabel, values) {
  selectElement.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "all";
  defaultOption.textContent = placeholderLabel;
  selectElement.appendChild(defaultOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectElement.appendChild(option);
  });
}

function buildBadge(text, variant = "") {
  const badge = document.createElement("span");
  badge.className = `badge${variant ? ` ${variant}` : ""}`;
  badge.textContent = text;
  return badge;
}

function createResultPill(text, variant = "") {
  const pill = document.createElement("span");
  pill.className = `result-pill${variant ? ` ${variant}` : ""}`;
  pill.textContent = text;
  return pill;
}

function createExternalLink(url, label) {
  const anchor = document.createElement("a");
  anchor.className = "inline-link";
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = label;
  return anchor;
}

function appendDetailRow(label, renderValue) {
  const row = document.createElement("div");
  row.className = "detail-row";

  const term = document.createElement("dt");
  term.textContent = label;

  const definition = document.createElement("dd");
  if (renderValue instanceof Node) {
    definition.appendChild(renderValue);
  } else {
    definition.textContent = renderValue;
  }

  row.appendChild(term);
  row.appendChild(definition);
  elements.detailMeta.appendChild(row);
}

function renderPhotoGroup(groupTitle, photos) {
  const group = document.createElement("div");
  group.className = "photo-group";

  const title = document.createElement("h4");
  title.textContent = groupTitle;
  group.appendChild(title);

  const strip = document.createElement("div");
  strip.className = "photo-strip";

  photos.forEach((photo, index) => {
    if (photo.isRenderable) {
      const link = document.createElement("a");
      link.className = "photo-thumb";
      link.href = photo.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const image = document.createElement("img");
      image.src = photo.previewUrl;
      image.alt = `${groupTitle} photo ${index + 1}`;
      image.loading = "lazy";

      const caption = document.createElement("span");
      caption.textContent = "Open full photo";

      link.appendChild(image);
      link.appendChild(caption);
      strip.appendChild(link);
      return;
    }

    const link = document.createElement("a");
    link.className = "photo-link";
    link.href = photo.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `Open ${groupTitle.toLowerCase()} photo ${index + 1}`;
    strip.appendChild(link);
  });

  group.appendChild(strip);
  return group;
}

function clearDetailContent() {
  elements.detailBody.classList.add("hidden");
  elements.detailKicker.textContent = "";
  elements.detailTitle.textContent = "";
  elements.detailBadges.innerHTML = "";
  elements.detailComments.textContent = "";
  elements.detailCommentsSection.classList.add("hidden");
  elements.detailPhotos.innerHTML = "";
  elements.detailPhotosSection.classList.add("hidden");
  elements.detailMeta.innerHTML = "";
}

function renderDetail(row) {
  if (!row) {
    clearDetailContent();
    setDetailPanelVisible(false);
    return;
  }

  elements.detailBody.classList.remove("hidden");
  elements.detailKicker.textContent = joinBits([row.zone, row.treatmentName]);
  elements.detailTitle.textContent = row.title;
  elements.detailBadges.innerHTML = "";
  elements.detailMeta.innerHTML = "";
  elements.detailPhotos.innerHTML = "";

  [row.zone, row.ruralUrbanLabel, row.womensPrayerSection]
    .filter(Boolean)
    .forEach((value) => {
      elements.detailBadges.appendChild(
        buildBadge(value, value === "Rural" || value === "Urban" ? "warm" : ""),
      );
    });

  if (row.comments) {
    elements.detailComments.textContent = row.comments;
    elements.detailCommentsSection.classList.remove("hidden");
  } else {
    elements.detailComments.textContent = "";
    elements.detailCommentsSection.classList.add("hidden");
  }

  const detailRows = [
    ["Shrine Name", row.shrineName],
    ["Mosque Name", row.mosqueName],
    ["Mosque Name on Ground", row.mosqueNameOnGround],
    ["Mosque ID", row.mosqueId],
    ["Zone", row.zone],
    ["Treatment Name", row.treatmentName],
    ["Imam Name", row.imamName],
    ["Mosque Built Date", row.mosqueBuiltDate],
    ["Women's prayer section", row.womensPrayerSection],
    ["Rural / Urban", row.ruralUrbanLabel],
    ["Coordinates", row.coordinatesLabel],
  ];

  detailRows.forEach(([label, value]) => {
    if (!value) return;
    appendDetailRow(label, value);
  });

  if (row.whatsappLocationUrl) {
    appendDetailRow("Location", createExternalLink(row.whatsappLocationUrl, "Open map link"));
  }

  if (row.closestMosque.url || row.closestMosque.coordinatesLabel) {
    const container = document.createElement("div");
    container.className = "link-list";

    if (row.closestMosque.url) {
      container.appendChild(createExternalLink(row.closestMosque.url, "Open closest mosque link"));
    }

    if (row.closestMosque.coordinatesLabel) {
      container.appendChild(buildBadge(row.closestMosque.coordinatesLabel));
    }

    appendDetailRow("Closest Mosque", container);
  }

  if (row.insidePhotos.length || row.outsidePhotos.length) {
    if (row.insidePhotos.length) {
      elements.detailPhotos.appendChild(renderPhotoGroup("Inside", row.insidePhotos));
    }
    if (row.outsidePhotos.length) {
      elements.detailPhotos.appendChild(renderPhotoGroup("Outside", row.outsidePhotos));
    }
    elements.detailPhotosSection.classList.remove("hidden");
  } else {
    elements.detailPhotosSection.classList.add("hidden");
  }

  setDetailPanelVisible(true);
}

function renderResults() {
  const hasActive = hasActiveFilters();
  elements.resultsSection.classList.toggle("hidden", !hasActive);

  if (!hasActive) {
    elements.resultsCount.textContent = "0";
    elements.resultsSummary.textContent = "";
    elements.resultsSummary.classList.add("hidden");
    elements.resultsEmpty.textContent = "";
    elements.resultsEmpty.classList.add("hidden");
    elements.resultsList.innerHTML = "";
    return;
  }

  elements.resultsCount.textContent = String(state.filteredRows.length);
  elements.resultsSummary.textContent = `Showing ${state.filteredRows.length} of ${state.rows.length} mapped locations`;
  elements.resultsSummary.classList.remove("hidden");
  elements.resultsList.innerHTML = "";

  if (!state.filteredRows.length) {
    elements.resultsEmpty.textContent = "No locations match the current search and filters.";
    elements.resultsEmpty.classList.remove("hidden");
    return;
  }

  elements.resultsEmpty.classList.add("hidden");

  state.filteredRows.forEach((row) => {
    const button = document.createElement("button");
    button.className = "result-card";
    button.type = "button";
    button.dataset.rowId = row.id;

    if (row.id === state.selectedId) {
      button.classList.add("is-selected");
    }

    const head = document.createElement("div");
    head.className = "result-card-head";

    const title = document.createElement("span");
    title.className = "result-card-title";
    title.textContent = row.title;
    head.appendChild(title);

    if (row.mosqueId) {
      head.appendChild(createResultPill(row.mosqueId));
    }

    button.appendChild(head);

    if (row.subtitle) {
      const subtitle = document.createElement("p");
      subtitle.className = "result-card-subtitle";
      subtitle.textContent = row.subtitle;
      button.appendChild(subtitle);
    }

    const pillRow = document.createElement("div");
    pillRow.className = "result-pill-row";

    [row.treatmentName, row.ruralUrbanLabel, row.womensPrayerSection]
      .filter(Boolean)
      .forEach((value) => {
        pillRow.appendChild(
          createResultPill(value, value === "Rural" || value === "Urban" ? "warm" : ""),
        );
      });

    if (pillRow.childElementCount) {
      button.appendChild(pillRow);
    }

    button.addEventListener("click", () => {
      selectRow(row.id, { shouldFocusMap: true, shouldScrollList: false });
    });

    elements.resultsList.appendChild(button);
  });
}

function renderInlineStatus() {
  const hasActive = hasActiveFilters();

  if (!hasActive) {
    elements.inlineStatus.textContent = "";
    elements.inlineStatus.classList.add("hidden");
    return;
  }

  elements.inlineStatus.textContent = `Showing ${state.filteredRows.length} matching locations.`;
  elements.inlineStatus.classList.remove("hidden");
}

function scrollSelectedCardIntoView() {
  if (!state.selectedId) return;

  const selectedCard = elements.resultsList.querySelector(`[data-row-id="${state.selectedId}"]`);
  selectedCard?.scrollIntoView({
    block: "nearest",
    behavior: "smooth",
  });
}

function selectRow(rowId, { shouldFocusMap = false, shouldScrollList = false } = {}) {
  const row = state.filteredRows.find((entry) => entry.id === rowId);
  if (!row) return;

  state.selectedId = rowId;
  shrineMap.setSelected(rowId);
  renderResults();
  renderDetail(row);

  if (shouldFocusMap) {
    shrineMap.focusRow(row);
  }

  if (shouldScrollList) {
    scrollSelectedCardIntoView();
  }
}

function clearSelection() {
  state.selectedId = "";
  shrineMap?.setSelected("");
  renderResults();
  renderDetail(null);
}

function updateSourceChip(sourceLabel, warningMessage) {
  elements.sourceChip.className = "source-chip";

  if (warningMessage) {
    elements.sourceChip.classList.add("warning");
    elements.sourceChip.textContent = "Bundled snapshot";
    return;
  }

  if (sourceLabel === "google-sheet") {
    elements.sourceChip.textContent = "Live Google Sheet";
    return;
  }

  elements.sourceChip.classList.add("snapshot");
  elements.sourceChip.textContent = "Bundled snapshot";
}

function syncFiltersFromInputs() {
  state.filters.search = elements.searchInput.value;
  state.filters.treatmentName = elements.treatmentFilter.value;
  state.filters.zone = elements.zoneFilter.value;
  state.filters.womensPrayerSection = elements.womenFilter.value;
  state.filters.ruralUrbanLabel = elements.ruralUrbanFilter.value;
}

function updateFilteredRows({ shouldFitMap = false } = {}) {
  syncFiltersFromInputs();
  state.filteredRows = filterRows(state.rows, state.filters);
  shrineMap.render(state.filteredRows);

  const selectedRow = state.filteredRows.find((row) => row.id === state.selectedId);
  shrineMap.setSelected(selectedRow ? state.selectedId : "");

  if (selectedRow) {
    renderDetail(selectedRow);
  } else {
    state.selectedId = "";
    renderDetail(null);
  }

  renderResults();
  renderInlineStatus();
  renderFilterPanelState();

  if (shouldFitMap && state.filteredRows.length) {
    shrineMap.fitToRows(state.filteredRows);
  }

  if (!state.filteredRows.length) {
    setMapMessage("No mapped locations match the current search and filters.");
    return;
  }

  setMapMessage("");
}

function resetFilters() {
  state.filters = { ...DEFAULT_FILTERS };
  elements.searchInput.value = "";
  elements.treatmentFilter.value = "all";
  elements.zoneFilter.value = "all";
  elements.womenFilter.value = "all";
  elements.ruralUrbanFilter.value = "all";
  clearSelection();
  updateFilteredRows({ shouldFitMap: true });
}

function bindFilterEvents() {
  elements.filtersPanelToggle.addEventListener("click", toggleFiltersPanel);

  elements.searchInput.addEventListener("input", () => {
    updateFilteredRows({ shouldFitMap: true });
  });

  [
    elements.treatmentFilter,
    elements.zoneFilter,
    elements.womenFilter,
    elements.ruralUrbanFilter,
  ].forEach((select) => {
    select.addEventListener("change", () => {
      updateFilteredRows({ shouldFitMap: true });
    });
  });

  elements.resetFiltersButton.addEventListener("click", resetFilters);

  elements.fitResultsButton.addEventListener("click", () => {
    if (hasActiveFilters() && state.filteredRows.length) {
      shrineMap.fitToRows(state.filteredRows);
    }
  });

  elements.detailCloseButton.addEventListener("click", () => {
    clearSelection();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.selectedId) {
      clearSelection();
    }
  });
}

async function init() {
  elements.siteTitle.textContent = APP_CONFIG.title;
  elements.siteSubtitle.textContent = "";
  elements.siteSubtitle.classList.add("hidden");
  elements.inlineStatus.textContent = "";
  elements.inlineStatus.classList.add("hidden");
  setMapMessage("Loading locations from the Adil Final sheet...");
  setError("");

  try {
    await waitForLibraries();
    shrineMap = createShrineMap({
      onSelect: (rowId) => {
        selectRow(rowId, { shouldFocusMap: false, shouldScrollList: true });
      },
      onMapClick: () => {
        if (state.selectedId) {
          clearSelection();
        }
      },
    });

    bindFilterEvents();

    const { rows, sourceLabel, warningMessage } = await loadShrineRows();
    state.rows = rows;
    state.filteredRows = rows.slice();
    state.filterOptions = buildFilterOptions(rows);
    state.warningMessage = warningMessage || "";

    populateSelect(
      elements.treatmentFilter,
      "All treatments",
      state.filterOptions.treatmentNames,
    );
    populateSelect(elements.zoneFilter, "All zones", state.filterOptions.zones);
    populateSelect(
      elements.womenFilter,
      "All values",
      state.filterOptions.womensPrayerSections,
    );
    populateSelect(
      elements.ruralUrbanFilter,
      "All locations",
      state.filterOptions.ruralUrbanLabels,
    );

    updateSourceChip(sourceLabel, warningMessage);
    renderFilterPanelState();
    renderInlineStatus();

    if (!rows.length) {
      setMapMessage("No valid latitude and longitude pairs were found in the selected sheet.");
      renderResults();
      return;
    }

    shrineMap.render(rows);
    shrineMap.fitToRows(rows);
    renderResults();
    renderInlineStatus();
    setMapMessage("");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    setMapMessage("The map could not be loaded.");
    setError(`Failed to load data: ${message}`);
    elements.inlineStatus.textContent = "The app could not fetch the sheet data.";
    elements.inlineStatus.classList.remove("hidden");
    renderResults();
    return;
  }

  window.addEventListener("resize", () => {
    shrineMap.invalidateSize();
  });
}

init();
