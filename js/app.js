import { APP_CONFIG } from "./config.js?v=cluster-20260701";
import {
  loadDrivePhotosForRow,
  loadDrivePhotosForRows,
  loadShrineRows,
} from "./data.js?v=cluster-20260701";
import { formatDrivePhotoLabel } from "./drive-photos.js?v=cluster-20260701";
import { createShrineMap } from "./map.js?v=cluster-20260701";
import { escapeHtml, joinBits, normalizeSearchText, wait } from "./utils.js?v=cluster-20260701";

const UI_TEXT = {
  loading: "Loading mosque data...",
  loadingPhotos: "Loading photos...",
  noSelection: "No mosque selected yet. Click a marker to view details.",
  directoryButton: "Auqaf Directory",
  searchPlaceholder: "Search mosques...",
  noMatches: "No matches.",
  uncategorized: "Other Districts",
  viewGallery: "View gallery",
};
const SIDEBAR_PHOTO_PREVIEW_LIMIT = 2;
const PAGE_VERSION_QUERY = "v=cluster-20260701";

const elements = {
  sidebar: document.getElementById("sidebar"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  mapTitle: document.getElementById("mapTitle"),
  status: document.getElementById("status"),
  details: document.getElementById("details"),
};

const state = {
  rows: [],
  selectedId: "",
};

let shrineMap = null;
let tablePanelEl = null;
let tableButtonEl = null;

function registerPhotoCacheWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Photo cache worker could not be registered.", error);
    });
  });
}

async function waitForLibraries(timeoutMs = 5000) {
  const startedAt = Date.now();

  while (
    !window.L ||
    !window.Papa ||
    typeof window.L.markerClusterGroup !== "function"
  ) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Leaflet, Leaflet.markercluster, or Papa Parse did not finish loading.");
    }

    await wait(30);
  }
}

function refreshMapAfterLayoutChange() {
  window.setTimeout(() => {
    shrineMap?.invalidateSize();
  }, 240);
}

function setStatus(message = "") {
  elements.status.textContent = message;
  elements.status.classList.toggle("hidden", !message);
}

function setMapPanelTitle(title = "") {
  elements.mapTitle.textContent = String(title || "").trim() || APP_CONFIG.title;
}

function resetMapPanelTitle() {
  setMapPanelTitle(APP_CONFIG.title);
}

function getNoSelectionMessage() {
  return `<p class="muted">${escapeHtml(UI_TEXT.noSelection)}</p>`;
}

function setSidebarCollapsed(collapsed) {
  elements.sidebar.classList.toggle("collapsed", collapsed);
  elements.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  refreshMapAfterLayoutChange();
}

function openSidebar() {
  setSidebarCollapsed(false);
}

function collapseSidebar() {
  setSidebarCollapsed(true);
}

function toggleSidebar() {
  setSidebarCollapsed(!elements.sidebar.classList.contains("collapsed"));
}

function getDistrictLabel(row) {
  return row.zone || UI_TEXT.uncategorized;
}

function getLocationLinkLabel(row) {
  return row.coordinatesLabel || joinBits([row.city, row.zone].filter(Boolean)) || "Open map";
}

function getMapLink(row) {
  if (row.whatsappLocationUrl) {
    return row.whatsappLocationUrl;
  }

  if (Number.isFinite(row.latitude) && Number.isFinite(row.longitude)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${row.latitude},${row.longitude}`,
    )}`;
  }

  return "";
}

function getDistrictCount(rows) {
  return new Set(rows.map((row) => getDistrictLabel(row))).size;
}

function getDirectoryStatus(rows = state.rows) {
  return `${rows.length} mosques across ${getDistrictCount(rows)} districts.`;
}

function getRequestedRowId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || params.get("mosque") || "";
}

function setCurrentMapRowId(rowId = "") {
  if (!window.history || typeof window.history.replaceState !== "function") {
    return;
  }

  const url = new URL(window.location.href);
  if (rowId) {
    url.searchParams.set("id", rowId);
  } else {
    url.searchParams.delete("id");
  }
  url.searchParams.delete("mosque");
  window.history.replaceState(null, "", url);
}

function getMosquePageUrl(row) {
  return `./mosque.html?id=${encodeURIComponent(row.id)}&${PAGE_VERSION_QUERY}`;
}

function getMosqueGalleryUrl(row) {
  return `${getMosquePageUrl(row)}#gallery`;
}

function getPreviewPhoto(row) {
  return getDisplayablePhotoItems(row)[0]?.photo || null;
}

function getPhotoImageUrl(photo, variant = "gallery") {
  return photo?.thumbnailUrls?.[variant] || photo?.previewUrl || photo?.url || "";
}

function setImagePerformanceAttributes(
  image,
  { loading = "lazy", fetchPriority = "low" } = {},
) {
  image.loading = loading;
  image.decoding = "async";

  if ("fetchPriority" in image) {
    image.fetchPriority = fetchPriority;
  }
}

function buildPreviewImage(row) {
  const preview = getPreviewPhoto(row);
  if (!preview) return null;

  const instantUrl = getPhotoImageUrl(preview, "sidebar");
  const fullUrl = getPhotoImageUrl(preview, "preview");
  const initialUrl = instantUrl || fullUrl;
  if (!initialUrl) return null;

  const image = document.createElement("img");
  image.className = "preview";
  image.src = initialUrl;
  image.alt = row.title;
  setImagePerformanceAttributes(image, { loading: "eager", fetchPriority: "high" });
  image.addEventListener("error", () => image.remove(), { once: true });

  if (fullUrl && fullUrl !== initialUrl) {
    const upgrade = new Image();
    upgrade.decoding = "async";
    upgrade.addEventListener(
      "load",
      () => {
        if (image.isConnected) {
          image.src = fullUrl;
        }
      },
      { once: true },
    );
    upgrade.src = fullUrl;
  }

  return image;
}

function isDisplayablePhoto(photo) {
  return Boolean(photo?.isRenderable && (photo.previewUrl || photo.url));
}

function getDisplayablePhotoItems(rowData) {
  const photos = rowData.drivePhotos?.length
    ? rowData.drivePhotos.map((photo, index) => ({
        photo,
        label: formatDrivePhotoLabel(photo, index),
      }))
    : [
        ...rowData.outsidePhotos.map((photo, index) => ({
          photo,
          label: `Outside photo ${index + 1}`,
        })),
        ...rowData.insidePhotos.map((photo, index) => ({
          photo,
          label: `Inside photo ${index + 1}`,
        })),
      ];

  return photos.filter(({ photo }) => isDisplayablePhoto(photo));
}

function refreshDetailAnimation() {
  Array.from(elements.details.children).forEach((child, index) => {
    child.style.setProperty("--enter-delay", `${Math.min(index * 35, 240)}ms`);
  });
}

function clearDetails() {
  elements.details.innerHTML = getNoSelectionMessage();
  refreshDetailAnimation();
  resetMapPanelTitle();
}

function appendTextRow(container, label, value) {
  if (!value) return;

  const row = document.createElement("div");
  row.className = "row";

  const labelEl = document.createElement("b");
  labelEl.textContent = `${label}:`;
  row.appendChild(labelEl);

  const valueEl = document.createElement("span");
  valueEl.textContent = value;
  row.appendChild(valueEl);

  container.appendChild(row);
}

function appendLinkRow(container, label, url, linkLabel, linkClassName = "") {
  if (!url) return;

  const row = document.createElement("div");
  row.className = "row";

  const labelEl = document.createElement("b");
  labelEl.textContent = `${label}:`;
  row.appendChild(labelEl);

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = linkLabel;
  if (linkClassName) {
    link.className = linkClassName;
  }
  row.appendChild(link);

  container.appendChild(row);
}

function appendCommentsRow(container, comments) {
  if (!comments) return;

  const row = document.createElement("div");
  row.className = "row row-block";

  const labelEl = document.createElement("b");
  labelEl.textContent = "Comments:";
  row.appendChild(labelEl);

  const body = document.createElement("div");
  body.className = "row-block-body";
  body.textContent = comments;
  row.appendChild(body);

  container.appendChild(row);
}

function createPhotoLink(photo, label, imageVariant = "sidebar") {
  const link = document.createElement("a");
  link.className = photo.isRenderable ? "photo-thumb" : "photo-link";
  link.href = photo.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const imageUrl = getPhotoImageUrl(photo, imageVariant);
  if (photo.isRenderable && imageUrl) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = label;
    setImagePerformanceAttributes(image, { loading: "lazy", fetchPriority: "low" });

    const caption = document.createElement("span");
    caption.textContent = label;

    link.appendChild(image);
    link.appendChild(caption);
    return link;
  }

  link.textContent = label;
  return link;
}

function createMorePhotosLink(photo, moreCount, rowData) {
  const link = createPhotoLink(photo, UI_TEXT.viewGallery);
  link.classList.add("photo-more-thumb");
  link.href = getMosqueGalleryUrl(rowData);

  const overlay = document.createElement("span");
  overlay.className = "photo-more-overlay";
  overlay.textContent = `+${moreCount} more`;
  link.appendChild(overlay);

  return link;
}

function attachPreviewPhotoFallbacks(row, grid) {
  grid.querySelectorAll("img").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        image.closest("a")?.remove();
        if (!grid.querySelector(".photo-thumb")) {
          row.remove();
        }
      },
      { once: true },
    );
  });
}

function appendPhotosRow(container, rowData) {
  const photos = getDisplayablePhotoItems(rowData);

  if (!photos.length) return;

  const row = document.createElement("div");
  row.className = "row row-block";

  const labelEl = document.createElement("b");
  labelEl.textContent = "Photos:";
  row.appendChild(labelEl);

  const grid = document.createElement("div");
  grid.className = "photo-grid";

  photos.slice(0, SIDEBAR_PHOTO_PREVIEW_LIMIT).forEach(({ photo, label }) => {
    grid.appendChild(createPhotoLink(photo, label));
  });

  if (photos.length > SIDEBAR_PHOTO_PREVIEW_LIMIT) {
    const morePhoto = photos[SIDEBAR_PHOTO_PREVIEW_LIMIT].photo;
    const moreCount = photos.length - SIDEBAR_PHOTO_PREVIEW_LIMIT;
    grid.appendChild(createMorePhotosLink(morePhoto, moreCount, rowData));
  }

  row.appendChild(grid);
  container.appendChild(row);
  attachPreviewPhotoFallbacks(row, grid);
}

function renderDetails(row) {
  if (!row) {
    clearDetails();
    return;
  }

  setMapPanelTitle(getDistrictLabel(row));
  elements.details.innerHTML = "";

  const previewImage = buildPreviewImage(row);
  if (previewImage) {
    elements.details.appendChild(previewImage);
  }

  const title = document.createElement("h2");
  title.className = "details-title";
  const titleLink = document.createElement("a");
  titleLink.className = "details-title-link";
  titleLink.href = getMosquePageUrl(row);
  titleLink.textContent = row.title;
  title.appendChild(titleLink);
  elements.details.appendChild(title);

  appendTextRow(elements.details, "District", getDistrictLabel(row));
  appendTextRow(elements.details, "City", row.city);
  appendTextRow(elements.details, "Imam", row.imamName);
  appendTextRow(elements.details, "Built", row.mosqueBuiltDate);
  appendTextRow(elements.details, "Women's Prayer Section", row.womensPrayerSection);
  appendTextRow(
    elements.details,
    "Associated Shrine",
    row.shrineName && row.shrineName !== row.title ? row.shrineName : "",
  );
  appendCommentsRow(elements.details, row.comments);
  refreshDetailAnimation();
}

function getRowById(rowId) {
  return state.rows.find((row) => row.id === rowId) || null;
}

function selectRow(rowId, { shouldFocusMap = true } = {}) {
  const row = getRowById(rowId);
  if (!row) return;

  state.selectedId = rowId;
  setCurrentMapRowId(rowId);
  shrineMap.setSelected(rowId);
  setStatus("");
  renderDetails(row);
  schedulePhotoLoad(rowId);
  openSidebar();
  hideTablePanel();

  if (shouldFocusMap) {
    shrineMap.focusRow(row);
    window.setTimeout(() => {
      if (state.selectedId === rowId) {
        shrineMap?.focusRow(row);
      }
    }, 280);
  }
}

function clearSelection() {
  state.selectedId = "";
  setCurrentMapRowId("");
  shrineMap?.setSelected("");
  clearDetails();
  setStatus(getDirectoryStatus());
}

function hideTablePanel() {
  if (tablePanelEl) {
    tablePanelEl.classList.add("hidden");
  }
  tableButtonEl?.setAttribute("aria-expanded", "false");
}

function toggleTablePanel() {
  if (!tablePanelEl) return;
  const isHidden = tablePanelEl.classList.toggle("hidden");
  tableButtonEl?.setAttribute("aria-expanded", String(!isHidden));
}

function groupRowsByDistrict(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const district = getDistrictLabel(row);
    if (!groups.has(district)) {
      groups.set(district, []);
    }
    groups.get(district).push(row);
  });

  const orderedDistricts = Array.from(groups.keys()).sort((left, right) =>
    left.localeCompare(right),
  );

  if (orderedDistricts.includes(UI_TEXT.uncategorized)) {
    return {
      groups,
      orderedDistricts: orderedDistricts
        .filter((district) => district !== UI_TEXT.uncategorized)
        .concat(UI_TEXT.uncategorized),
    };
  }

  return { groups, orderedDistricts };
}

function renderTableList(searchTerm = "") {
  const list = document.getElementById("mosquePanelList");
  if (!list) return;

  const query = normalizeSearchText(searchTerm);
  list.innerHTML = "";

  const { groups, orderedDistricts } = groupRowsByDistrict(state.rows);
  let totalShown = 0;

  orderedDistricts.forEach((district) => {
    const items = groups.get(district) || [];
    const filtered = query
      ? items.filter((row) => row.searchBlob.includes(query))
      : items;

    if (!filtered.length) return;

    const groupEl = document.createElement("div");
    const shouldStartExpanded = Boolean(query);
    groupEl.className = shouldStartExpanded ? "group" : "group collapsed";

    const header = document.createElement("button");
    header.type = "button";
    header.className = "group-header";
    header.innerHTML = `
      <span>${escapeHtml(district)}</span>
      <span class="group-meta">
        <span class="count">${filtered.length}</span>
        <span class="group-chevron"></span>
      </span>
    `;

    const itemsWrap = document.createElement("div");
    itemsWrap.className = "group-items";

    header.addEventListener("click", (event) => {
      event.stopPropagation();
      groupEl.classList.toggle("collapsed");
    });

    filtered.forEach((row) => {
      const item = document.createElement("button");
      item.className = "panel-item";
      item.type = "button";
      item.textContent = row.title;
      item.style.setProperty("--item-delay", `${Math.min(totalShown * 18, 180)}ms`);

      item.addEventListener("click", (event) => {
        event.stopPropagation();
        selectRow(row.id, { shouldFocusMap: true });

        const searchInput = document.getElementById("mosqueSearch");
        if (searchInput) {
          searchInput.value = "";
        }

        renderTableList("");
      });

      itemsWrap.appendChild(item);
      totalShown += 1;
    });

    groupEl.appendChild(header);
    groupEl.appendChild(itemsWrap);
    list.appendChild(groupEl);
  });

  if (!totalShown) {
    const empty = document.createElement("div");
    empty.className = "panel-empty";
    empty.textContent = UI_TEXT.noMatches;
    list.appendChild(empty);
  }
}

function buildTableControls() {
  const L = window.L;
  if (!L) {
    throw new Error("Leaflet failed to load.");
  }

  const TableControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd: () => {
      const container = L.DomUtil.create(
        "div",
        "leaflet-control shrine-table-btn",
      );

      tableButtonEl = L.DomUtil.create("button", "", container);
      tableButtonEl.type = "button";
      tableButtonEl.setAttribute("aria-expanded", "false");
      tableButtonEl.setAttribute("aria-controls", "mosqueDirectoryPanel");
      tableButtonEl.innerHTML = `
        <svg class="shrine-table-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#111827" d="M12 2 1 7l11 5 11-5-11-5Zm0 8L1 5v3l11 5 11-5V5l-11 5Zm0 6L1 11v3l11 5 11-5v-3l-11 5Z"/>
        </svg>
        <span>${escapeHtml(UI_TEXT.directoryButton)}</span>
      `;

      tablePanelEl = L.DomUtil.create("div", "shrine-drop hidden", container);
      tablePanelEl.id = "mosqueDirectoryPanel";
      tablePanelEl.innerHTML = `
        <div class="panel-search">
          <input
            id="mosqueSearch"
            type="text"
            placeholder="${escapeHtml(UI_TEXT.searchPlaceholder)}"
            autocomplete="off"
          />
        </div>
        <div class="panel-list" id="mosquePanelList"></div>
      `;

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      L.DomEvent.on(tableButtonEl, "click", (event) => {
        L.DomEvent.stop(event);
        toggleTablePanel();

        if (tablePanelEl && !tablePanelEl.classList.contains("hidden")) {
          window.setTimeout(() => {
            const searchInput = document.getElementById("mosqueSearch");
            searchInput?.focus();
          }, 0);
        }
      });

      window.setTimeout(() => {
        const searchInput = document.getElementById("mosqueSearch");
        if (!searchInput) return;

        searchInput.addEventListener("input", () => {
          renderTableList(searchInput.value);
        });
      }, 0);

      return container;
    },
  });

  shrineMap.map.addControl(new TableControl());
}

function bindSidebarEvents() {
  elements.sidebarToggle.addEventListener("click", toggleSidebar);
}

async function loadPhotosForRow(rowId) {
  const row = getRowById(rowId);
  if (!row || row.drivePhotosState === "loaded" || row.drivePhotosState === "loading") {
    return;
  }

  row.drivePhotosState = "loading";
  if (state.selectedId === rowId) {
    setStatus(UI_TEXT.loadingPhotos);
  }

  try {
    await loadDrivePhotosForRow(row);
    row.drivePhotosState = "loaded";

    if (state.selectedId === rowId) {
      renderDetails(row);
    }
  } catch (error) {
    row.drivePhotosState = "failed";
    console.warn("Google Drive photos could not be loaded for this mosque.", error);
  } finally {
    if (state.selectedId === rowId) {
      setStatus("");
    }
  }
}

function schedulePhotoLoad(rowId) {
  const loadPhotos = () => {
    void loadPhotosForRow(rowId);
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(loadPhotos, { timeout: 1500 });
    return;
  }

  window.setTimeout(loadPhotos, 0);
}

async function warmDrivePhotosForRows(rows) {
  if (APP_CONFIG.drivePhotos?.enabled === false || !rows.length) {
    return;
  }

  try {
    await loadDrivePhotosForRows(rows);
    rows.forEach((row) => {
      row.drivePhotosState = "loaded";
    });

    if (state.selectedId) {
      const selectedRow = getRowById(state.selectedId);
      if (selectedRow) {
        renderDetails(selectedRow);
      }
    }
  } catch (error) {
    console.warn("Google Drive photos could not be warmed in the background.", error);
  }
}

function schedulePhotoWarmup(rows) {
  const warmPhotos = () => {
    void warmDrivePhotosForRows(rows);
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(warmPhotos, { timeout: 2500 });
    return;
  }

  window.setTimeout(warmPhotos, 800);
}

async function init() {
  setMapPanelTitle(APP_CONFIG.title);
  setStatus(UI_TEXT.loading);
  clearDetails();
  collapseSidebar();

  try {
    await waitForLibraries();

    shrineMap = createShrineMap({
      onSelect: (rowId) => {
        selectRow(rowId);
      },
      onMapClick: () => {
        if (!state.selectedId) {
          hideTablePanel();
          collapseSidebar();
          return;
        }

        clearSelection();
        collapseSidebar();
        hideTablePanel();
      },
    });

    bindSidebarEvents();

    const { rows } = await loadShrineRows({ includeDrivePhotos: false });
    state.rows = rows;

    if (!rows.length) {
      setStatus("No valid latitude and longitude pairs were found for the mosque directory.");
      clearDetails();
      collapseSidebar();
      return;
    }

    shrineMap.render(rows);
    shrineMap.fitToRows(rows);
    buildTableControls();
    renderTableList("");
    setStatus(getDirectoryStatus(rows));
    schedulePhotoWarmup(rows);

    const requestedRowId = getRequestedRowId();
    if (requestedRowId && getRowById(requestedRowId)) {
      selectRow(requestedRowId, { shouldFocusMap: true });
    } else {
      clearDetails();
      collapseSidebar();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    setStatus(`Failed to load mosque data. ${message}`);
    clearDetails();
    collapseSidebar();
  }

  window.addEventListener("resize", () => {
    shrineMap?.invalidateSize();
  });
}

registerPhotoCacheWorker();
init();
