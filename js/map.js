import { APP_CONFIG } from "./config.js?v=hero-photo-cap-20260710";

const IS_COARSE_POINTER =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;
const EMPTY_PANEL_METRICS = {
  leftOccupied: 0,
  rightOccupied: 0,
  topOccupied: 0,
  bottomOccupied: 0,
};

function getLeaflet() {
  if (!window.L) {
    throw new Error("Leaflet failed to load.");
  }

  return window.L;
}

function createMarkerIcon({ selected = false } = {}) {
  const L = getLeaflet();
  const classes = ["shrine-dot"];
  if (selected) classes.push("selected");

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
  const L = getLeaflet();
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
  const sidebar = document.getElementById("sidebar");
  const isMobile = window.innerWidth <= 520;

  if (!sidebar || sidebar.classList.contains("collapsed")) {
    return EMPTY_PANEL_METRICS;
  }

  const sidebarWidth = sidebar.offsetWidth;
  const sidebarHeight = sidebar.offsetHeight;
  const panelGap = 24;

  return {
    leftOccupied: 0,
    rightOccupied: isMobile ? 0 : sidebarWidth + panelGap,
    topOccupied: isMobile ? sidebarHeight + panelGap : 0,
    bottomOccupied: 0,
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
  const L = getLeaflet();

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

      // Hover styling is pure CSS (.shrine-dot-hit:hover) and the tooltip is
      // managed by Leaflet's own bindTooltip hover handling. Never swap the
      // icon on mouseover: setIcon() replaces the DOM node under the cursor,
      // and Safari drops the pending click/mouseout on the removed element
      // (broken taps + tooltips stuck open).
      if (!IS_COARSE_POINTER) {
        marker.bindTooltip(row.title, {
          direction: "top",
          offset: [0, -10],
          opacity: 1,
          sticky: true,
        });
      }

      marker.on("click", () => {
        onSelect(row.id);
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
