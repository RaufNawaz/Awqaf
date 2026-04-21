export const APP_CONFIG = {
  title: "Awqaf Mosque Map",
  subtitle: "Mapped locations from the Adil Final sheet.",
  dataSource: {
    // The uploaded workbook did not expose a Google Sheet ID, so this stays blank
    // until you paste the public spreadsheet ID here.
    spreadsheetId: "",
    gid: "2033055474",
    sheetName: "Adil Final",
    // Optional published-to-web CSV URL. If you use this, it overrides spreadsheetId.
    publishedCsvUrl: "",
    // The app falls back to this bundled snapshot when a live sheet URL is unavailable.
    fallbackCsvPath: "./data/adil-final.csv",
  },
  map: {
    defaultCenter: [30.3753, 69.3451],
    defaultZoom: 6,
    maxFitZoom: 13,
    focusZoom: 15,
    primaryLayer: "Streets (MapTiler)",
    layers: [
      {
        label: "Streets (MapTiler)",
        tileUrl:
          "https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=WDmTVcrwlj7v2t6K2h5d",
        options: {
          tileSize: 512,
          zoomOffset: -1,
          maxZoom: 20,
          attribution: "&copy; MapTiler &copy; OpenStreetMap contributors",
        },
      },
      {
        label: "Topo (MapTiler)",
        tileUrl:
          "https://api.maptiler.com/maps/topo-v2/{z}/{x}/{y}.png?key=WDmTVcrwlj7v2t6K2h5d",
        options: {
          tileSize: 512,
          zoomOffset: -1,
          maxZoom: 20,
          attribution: "&copy; MapTiler &copy; OpenStreetMap contributors",
        },
      },
      {
        label: "Voyager (CARTO)",
        tileUrl: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        options: {
          subdomains: "abcd",
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        },
      },
      {
        label: "Streets (Esri)",
        tileUrl:
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        options: {
          maxZoom: 19,
          attribution: "Tiles &copy; Esri",
        },
      },
      {
        label: "Satellite (Esri)",
        tileUrl:
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        options: {
          maxZoom: 19,
          attribution: "Tiles &copy; Esri",
        },
      },
    ],
    fitPadding: [36, 36],
  },
  columns: {
    zone: ["Zone"],
    mosqueId: ["Mosque ID"],
    mosqueName: ["Mosque Name"],
    treatmentName: ["Treatment Name"],
    mosqueNameOnGround: ["Mosque Name on Ground"],
    imamName: ["Imam Name"],
    mosqueBuiltDate: ["Mosque Built Date"],
    shrineName: ["Shrine Name"],
    womensPrayerSection: ["Women\u2019s prayer section", "Women's prayer section"],
    ruralUrban: ["Rural = 1 / Urban = 2"],
    whatsappLocation: ["WhatsApp Location"],
    latitude: ["Latitude"],
    longitude: ["Longitude"],
    closestMosqueLocation: ["Closest Mosque (WhatsApp Location)"],
    closestMosqueLatitude: ["Closest Mosque (Latitude)"],
    closestMosqueLongitude: ["Closest Mosque (Longitude)"],
    photoInside: ["Photo (Inside)"],
    photoOutside: ["Photo (Outside)"],
    comments: ["Comments"],
  },
};

export function buildPrimaryCsvUrl() {
  const { publishedCsvUrl, spreadsheetId, gid, fallbackCsvPath } = APP_CONFIG.dataSource;

  if (publishedCsvUrl) return publishedCsvUrl;

  if (spreadsheetId) {
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      spreadsheetId,
    )}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  }

  return fallbackCsvPath;
}
