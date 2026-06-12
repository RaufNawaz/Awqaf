export const APP_CONFIG = {
  title: "Awqaf Directory",
  dataSource: {
    // This stays blank because the app is using the sheet's published CSV URL below.
    spreadsheetId: "",
    gid: "0",
    // Optional published-to-web CSV URL. If you use this, it overrides spreadsheetId.
    publishedCsvUrl:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTzVlDrUr-dFWeLl2lzJhuMZ9h98xNWyZ9yt3o2eIgt-YEObRl1FQJ4IDKWpV0hiQo9ISs8qggVIh1E/pub?output=csv",
  },
  drivePhotos: {
    enabled: true,
    folderId: "15Wj0hXX2HjQvyYDvx4I-XAtClrGSDElo",
    // Free workaround: deploy the Apps Script from README.md and paste its JSON URL here.
    appsScriptUrl:
      "https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnQiDLGl7D1CHZw5lNOslN7cveZmy08l_FVVJv_xetYhyUgZohHMaKwpKKTGwvbB4puELDAmigTkDp-gGjYglTOvkMxn2PrIRC_euJwvjaL6wWFFli08TD3pZJ4Zx_aRCwipuGtHrsvLejlMTz7kRYuOKIu_w7Ux00YpuF9D2OBWoO7BQa_GhdGeeX-vdoQFGibwNFrABMcEVPujYGY13YcQhF22nThKA4dnsRxvRPbrwLrK0eQ972WEg3sy6OYMk_6ogz1OakZp6NAkVKVQ6_AA5aFTdg&lib=MpWdW5Xnf2iro3L6DlvNqqeSOIo3kG7Kb",
    // Optional Google Drive API fallback. Restrict this key to the Google Drive API
    // and your website domain in Google Cloud if you choose to use it.
    apiKey: "",
    thumbnailSize: "w1600",
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
        tileUrl:
          "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
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
    city: ["City", "city", "Town", "Tehsil"],
    address: ["Address", "address", "Location Address", "Mosque Address"],
    mosqueId: ["Mosque ID"],
    mosqueName: ["Mosque Name"],
    treatmentName: ["Treatment Name"],
    mosqueNameOnGround: ["Mosque Name on Ground"],
    imamName: ["Imam Name"],
    mosqueBuiltDate: ["Mosque Built Date"],
    shrineName: ["Shrine Name"],
    womensPrayerSection: [
      "Women\u2019s prayer section",
      "Women's prayer section",
    ],
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
  const { publishedCsvUrl, spreadsheetId, gid } = APP_CONFIG.dataSource;

  if (publishedCsvUrl) return publishedCsvUrl;

  if (spreadsheetId) {
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      spreadsheetId,
    )}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  }

  throw new Error("No live CSV source is configured.");
}
