import { APP_CONFIG } from "./config.js?v=cluster-20260701";

const IS_COARSE_POINTER =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;
const PREFERS_REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

function createMarkerIcon({ selected = false, hover = false } = {}) {
  const L = getLeaflet();
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

  const markersById = new Map();
  let selectedId = "";

  function createClusterIcon(cluster) {
    const count = cluster.getChildCount();
    const size = count < 10 ? "sm" : count < 50 ? "md" : "lg";
    const dimension = size === "sm" ? 40 : size === "md" ? 48 : 58;
    const classes = ["auqaf-cluster", `auqaf-cluster-${size}`];

    if (
      selectedId &&
      cluster.getAllChildMarkers().some((marker) => marker.options.rowId === selectedId)
    ) {
      classes.push("auqaf-cluster-has-selected");
    }

    return L.divIcon({
      html: `<div class="${classes.join(" ")}" aria-label="${count} mosques"><span>${count}</span></div>`,
      className: "auqaf-cluster-wrap",
      iconSize: [dimension, dimension],
    });
  }

  const clusterConfig = APP_CONFIG.map.cluster || {};
  const markerLayer = L.markerClusterGroup({
    maxClusterRadius: clusterConfig.maxRadius ?? 56,
    disableClusteringAtZoom: clusterConfig.disableAtZoom ?? APP_CONFIG.map.focusZoom,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: true,
    zoomToBoundsOnClick: true,
    chunkedLoading: true,
    removeOutsideVisibleBounds: true,
    animate: !PREFERS_REDUCED_MOTION,
    iconCreateFunction: createClusterIcon,
    polygonOptions: {
      color: "#0f766e",
      weight: 1.5,
      opacity: 0.5,
      fillColor: "#0f766e",
      fillOpacity: 0.08,
    },
  }).addTo(map);

  function render(rows) {
    markerLayer.clearLayers();
    markersById.clear();

    const markers = rows.map((row) => {
      const marker = L.marker([row.latitude, row.longitude], {
        icon: createMarkerIcon({ selected: row.id === selectedId }),
        title: row.title,
        bubblingMouseEvents: false,
        rowId: row.id,
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
        onSelect(row.id);
      });

      markersById.set(row.id, marker);
      return marker;
    });

    markerLayer.addLayers(markers);
  }

  function setSelected(nextSelectedId) {
    selectedId = nextSelectedId;

    markersById.forEach((marker, markerId) => {
      marker.setIcon(createMarkerIcon({ selected: markerId === selectedId }));
    });

    markerLayer.refreshClusters();
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

    const applySidebarOffsetFocus = () => {
      // zoomToShowLayer can invoke this up to a zoom-animation later; by then
      // the user may have picked another mosque or the markers may have been
      // re-rendered, so re-check before moving the map.
      if (row.id !== selectedId || markersById.get(row.id) !== marker) {
        return;
      }

      const targetZoom = Math.max(map.getZoom(), APP_CONFIG.map.focusZoom);
      const { leftOccupied, rightOccupied, topOccupied, bottomOccupied } =
        getVisiblePanelMetrics();
      const offsetX = (leftOccupied - rightOccupied) / 2;
      const offsetY = (topOccupied - bottomOccupied) / 2;
      const targetPoint = map.project(marker.getLatLng(), targetZoom).subtract([offsetX, offsetY]);
      const shiftedLatLng = map.unproject(targetPoint, targetZoom);

      if (PREFERS_REDUCED_MOTION) {
        map.setView(shiftedLatLng, targetZoom, { animate: false });
        return;
      }

      map.flyTo(shiftedLatLng, targetZoom, {
        duration: 0.55,
      });
    };

    // A marker hidden inside a cluster has no position on screen to fly to;
    // zoomToShowLayer expands clusters until it is individually visible first.
    if (markerLayer.getVisibleParent(marker) !== marker) {
      markerLayer.zoomToShowLayer(marker, applySidebarOffsetFocus);
      return;
    }

    applySidebarOffsetFocus();
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
