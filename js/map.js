import { APP_CONFIG } from "./config.js";

const L = window.L;
const IS_COARSE_POINTER =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

function createMarkerIcon({ selected = false, hover = false } = {}) {
  const classes = ["shrine-dot"];
  if (selected) classes.push("selected");
  if (hover) classes.push("hover");

  const hitSize = IS_COARSE_POINTER ? 34 : 26;
  const anchor = Math.round(hitSize / 2);

  return L.divIcon({
    className: "shrine-marker-hit",
    html: `<div class="shrine-dot-hit"><div class="${classes.join(" ")}"></div></div>`,
    iconSize: [hitSize, hitSize],
    iconAnchor: [anchor, anchor],
  });
}

function buildBaseLayers() {
  const configuredLayers = APP_CONFIG.map.layers || [];
  const baseLayers = {};

  configuredLayers.forEach((layerDefinition) => {
    baseLayers[layerDefinition.label] = L.tileLayer(
      layerDefinition.tileUrl,
      layerDefinition.options || {},
    );
  });

  return baseLayers;
}

function getVisiblePanelMetrics() {
  const filtersPanel = document.getElementById("filtersPanel");
  const detailPanel = document.getElementById("detailPanel");
  const isDesktop = window.innerWidth > 980;

  const leftOccupied =
    filtersPanel && !filtersPanel.classList.contains("collapsed") ? filtersPanel.offsetWidth + 24 : 0;
  const rightOccupied =
    detailPanel && !detailPanel.classList.contains("hidden") ? detailPanel.offsetWidth + 24 : 0;
  const topOccupied = !isDesktop && leftOccupied ? filtersPanel.offsetHeight + 24 : 0;
  const bottomOccupied = !isDesktop && rightOccupied ? detailPanel.offsetHeight + 24 : 0;

  return {
    leftOccupied: isDesktop ? leftOccupied : 0,
    rightOccupied: isDesktop ? rightOccupied : 0,
    topOccupied,
    bottomOccupied,
  };
}

function getFitPaddingOptions() {
  const basePadding = APP_CONFIG.map.fitPadding || [36, 36];
  const baseX = Array.isArray(basePadding) ? basePadding[0] : 36;
  const baseY = Array.isArray(basePadding) ? basePadding[1] : 36;
  const { leftOccupied, rightOccupied, topOccupied, bottomOccupied } = getVisiblePanelMetrics();

  return {
    paddingTopLeft: [baseX + leftOccupied, baseY + topOccupied],
    paddingBottomRight: [baseX + rightOccupied, baseY + bottomOccupied],
  };
}

export function createShrineMap({ onSelect, onMapClick }) {
  if (!L) {
    throw new Error("Leaflet failed to load.");
  }

  const map = L.map("map", {
    zoomControl: false,
    worldCopyJump: false,
  }).setView(APP_CONFIG.map.defaultCenter, APP_CONFIG.map.defaultZoom);

  L.control.zoom({ position: "bottomleft" }).addTo(map);

  const baseLayers = buildBaseLayers();
  const primaryLayer =
    baseLayers[APP_CONFIG.map.primaryLayer] || Object.values(baseLayers)[0];

  if (primaryLayer) {
    primaryLayer.addTo(map);
  }

  if (Object.keys(baseLayers).length > 1) {
    L.control.layers(baseLayers, null, { position: "bottomleft" }).addTo(map);
  }

  if (typeof onMapClick === "function") {
    map.on("click", () => {
      onMapClick();
    });
  }

  const markerLayer = L.layerGroup().addTo(map);
  const markersById = new Map();
  let selectedId = "";

  function render(rows) {
    markerLayer.clearLayers();
    markersById.clear();

    rows.forEach((row) => {
      const marker = L.marker([row.latitude, row.longitude], {
        icon: createMarkerIcon({ selected: row.id === selectedId }),
        title: row.title,
        bubblingMouseEvents: false,
      });

      marker.bindTooltip(row.title, {
        direction: "top",
        offset: [0, -10],
        opacity: 1,
        sticky: true,
      });

      marker.on("mouseover", () => {
        marker.setIcon(createMarkerIcon({ selected: row.id === selectedId, hover: true }));
        marker.openTooltip();
      });

      marker.on("mouseout", () => {
        marker.setIcon(createMarkerIcon({ selected: row.id === selectedId }));
        marker.closeTooltip();
      });

      marker.on("click", () => {
        onSelect(row.id, { source: "marker" });
      });

      marker.addTo(markerLayer);
      markersById.set(row.id, marker);
    });
  }

  function setSelected(nextSelectedId) {
    selectedId = nextSelectedId;

    markersById.forEach((marker, markerId) => {
      marker.setIcon(createMarkerIcon({ selected: markerId === selectedId }));
    });
  }

  function fitToRows(rows) {
    if (!rows.length) return;

    const bounds = L.latLngBounds(rows.map((row) => [row.latitude, row.longitude]));
    map.fitBounds(bounds, {
      ...getFitPaddingOptions(),
      maxZoom: APP_CONFIG.map.maxFitZoom,
    });
  }

  function focusRow(row) {
    const marker = markersById.get(row.id);
    if (!marker) return;

    const targetZoom = Math.max(map.getZoom(), APP_CONFIG.map.focusZoom);
    const { leftOccupied, rightOccupied, topOccupied, bottomOccupied } = getVisiblePanelMetrics();
    const offsetX = (leftOccupied - rightOccupied) / 2;
    const offsetY = (topOccupied - bottomOccupied) / 2;
    const targetPoint = map.project(marker.getLatLng(), targetZoom).subtract([offsetX, offsetY]);
    const shiftedLatLng = map.unproject(targetPoint, targetZoom);

    map.flyTo(shiftedLatLng, targetZoom, {
      duration: 0.55,
    });
  }

  function invalidateSize() {
    map.invalidateSize();
  }

  return {
    map,
    render,
    setSelected,
    fitToRows,
    focusRow,
    invalidateSize,
  };
}
