# Awqaf Website Handoff

Last updated: 2026-06-25

## 1. Project Overview

This repository is a static website for the Awqaf mosque directory. It has two public surfaces:

- `index.html`: interactive Leaflet map and searchable mosque directory.
- `mosque.html`: detail page for one mosque, reached with `mosque.html?id=...`.

The site is plain HTML, CSS, and browser JavaScript. There is no build step, package manager requirement, backend server, or bundled database. Live data comes from a published Google Sheet CSV. Photos come from a Google Drive folder through an Apps Script listing endpoint.

## 2. Repository Structure

```text
.
|-- index.html              Main map/directory page
|-- mosque.html             Individual mosque detail page
|-- style.css               Shared styling for map, drawer, and detail page
|-- sw.js                   Service worker that caches Drive thumbnails
|-- README.md               Public setup and usage notes
|-- PROJECT_HANDOFF.md      This handoff document
`-- js/
    |-- app.js              Main map page controller
    |-- config.js           Data source, photo source, map layer config, CSV columns
    |-- data.js             CSV parsing and row normalization
    |-- drive-photos.js     Google Drive photo listing, matching, caching, thumbnail URLs
    |-- map.js              Leaflet map wrapper and marker rendering
    |-- mosque.js           Individual mosque page controller
    `-- utils.js            Shared parsing, escaping, URL, and formatting helpers
```

The ignored `junk/` folder may contain old local data, snapshots, or import experiments. It is not part of the deployed website.

## 3. Local Development

Do not open `index.html` directly from disk. Browser module imports, the service worker, and remote CSV/photo fetches should be tested through a local HTTP server.

Recommended command from the project root:

```bash
py -3 -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/
```

Other static servers are fine, for example `npx serve .` or `npx http-server .`.

## 4. Deployment Model

This project deploys as static files. GitHub Pages, Netlify, Cloudflare Pages, or any basic static host can serve it.

Deployment checklist:

1. Upload or push the full repository root.
2. Make sure `index.html`, `mosque.html`, `style.css`, `sw.js`, and `js/` are published.
3. Serve over HTTPS in production so the service worker can run.
4. After JavaScript changes, bump the `photos-YYYYMMDD` query string in HTML and module imports so browsers do not keep stale JS.

There is no build artifact to generate.

## 5. Data Source

The live data source is configured in `js/config.js`:

```js
APP_CONFIG.dataSource.publishedCsvUrl
```

The current setup uses a published-to-web Google Sheets CSV URL. If changing the sheet:

1. Publish the target Google Sheet tab to the web as CSV.
2. Replace `APP_CONFIG.dataSource.publishedCsvUrl`.
3. Confirm the expected columns still match `APP_CONFIG.columns`.

Important column groups:

- Location: `Latitude`, `Longitude`, `Zone`, `City`, `Address`
- Identity: `Mosque ID`, `Mosque Name`, `Mosque Name on Ground`, `Shrine Name`
- Details: `Imam Name`, `Mosque Built Date`, `Women's prayer section`, `Comments`
- Legacy photos: `Photo (Inside)`, `Photo (Outside)`

`js/data.js` normalizes raw CSV rows into the app row shape. Rows without valid latitude and longitude are excluded from the map.

## 6. Photo Source

Photos are stored in this Google Drive folder:

```text
https://drive.google.com/drive/folders/15Wj0hXX2HjQvyYDvx4I-XAtClrGSDElo
```

The browser does not download a folder manually. Instead:

1. `js/drive-photos.js` asks the Apps Script URL in `APP_CONFIG.drivePhotos.appsScriptUrl` for a list of Drive image files.
2. The file names are parsed and matched to mosque rows.
3. The site builds Google Drive thumbnail URLs for each matched file.
4. The map drawer and detail page render the correct thumbnail size for the UI slot.

Recommended file naming:

```text
MosqueName_M.jpg
MosqueName_I_1.jpg
MosqueName_I_2.jpg
MosqueName_O_1.jpg
```

Meaning:

- `_M`: main/default photo.
- `_I_#`: inside photo sequence.
- `_O_#`: outside photo sequence.

Legacy numbered files are still accepted:

```text
MosqueName_0.jpg
MosqueName_1.jpg
MosqueName_2.jpg
```

The `MosqueName` part should match one of the row identity fields, preferably `Mosque Name`.

## 7. Apps Script Setup

The recommended no-API-key setup uses Google Apps Script. The Apps Script lists files from the Drive folder and returns JSON or JSONP.

Config location:

```js
APP_CONFIG.drivePhotos.appsScriptUrl
```

Access requirements:

- Deploy Apps Script as a web app.
- Execute as the script owner.
- Allow access to anyone.
- The Drive folder and uploaded images should be viewable by anyone with the link.

If replacing the Apps Script deployment, update `appsScriptUrl` in `js/config.js`.

Optional fallback:

```js
APP_CONFIG.drivePhotos.apiKey
```

If using a Google Drive API key, restrict it to the Google Drive API and the production domain.

## 8. Photo Performance Decisions

The photo system was optimized on 2026-06-25 because images felt slow and redundant when opening and switching mosques.

Key decisions:

1. The map page no longer blocks first load on Drive photo metadata.
2. The Drive file list is cached in `localStorage` under `awqaf-drive-photo-files-v3`.
3. `drive-photos.js` now keeps a module-level in-memory photo index, so the index is built once per page session instead of being rebuilt on every shrine click.
4. Row-level photo matches are cached in memory, so repeated selection of the same mosque is instant.
5. The map page warms the Drive photo metadata in the background after the map and directory are usable.
6. The detail page renders text and map content first, then hydrates photos asynchronously.
7. Different UI slots request different thumbnail sizes:
   - Sidebar thumbnails: `w360`
   - Sidebar preview image: `w640`
   - Detail gallery images: `w1200`
   - Detail hero image: `w1200`
8. `sw.js` caches Drive thumbnail responses so repeat visits and repeat shrine switches reuse cached images.
9. HTML preconnects include Drive, `lh3.googleusercontent.com`, and Apps Script hosts to reduce connection setup time.

These changes reduce both metadata work and actual image bytes.

## 9. Service Worker

`sw.js` handles only Drive thumbnail requests:

```text
https://drive.google.com/thumbnail?id=...&sz=...
```

Behavior:

- Cache-first for Drive thumbnails.
- Keeps up to 180 thumbnail entries.
- Ignores map tiles, CSV, scripts, CSS, and HTML.
- Works on `http://localhost` and HTTPS.
- Does not work from `file://`.

If thumbnail behavior changes, increment the cache name in `sw.js`, for example from `awqaf-drive-thumbnails-v1` to `awqaf-drive-thumbnails-v2`.

## 10. Map Page Flow

Main controller: `js/app.js`

Startup flow:

1. Wait for Leaflet and Papa Parse.
2. Create the Leaflet map.
3. Load CSV rows with `loadShrineRows({ includeDrivePhotos: false })`.
4. Render markers and searchable district list.
5. Show status like `N mosques across M districts`.
6. Schedule background Drive photo warmup.
7. If the URL has `?id=...`, select that row.

On marker/list click:

1. Set selected row ID in state and URL.
2. Render text details immediately.
3. Load or reuse Drive photos for that row.
4. Re-render the drawer if photos arrive while the row is still selected.

## 11. Detail Page Flow

Main controller: `js/mosque.js`

Startup flow:

1. Wait for Papa Parse.
2. Read `id` or `mosque` from the URL.
3. Load CSV rows without blocking on Drive photos.
4. Render the detail page immediately.
5. Schedule Drive photo loading.
6. Re-render once photos are available.

This makes the page feel faster because public facts, narrative text, nearby mosques, and map content do not wait for the Drive photo list.

## 12. Styling System

All styling lives in `style.css`.

Major sections:

- Global CSS variables and base typography.
- Map shell, sidebar, and detail drawer styles.
- Directory dropdown and Leaflet marker styles.
- Mosque detail page hero, layout, gallery, facts, nearby cards, and responsive rules.

The visual system is restrained and information-first. Keep future UI changes consistent with the existing map/directory tool style.

## 13. Map Layers

Map layers are configured in `APP_CONFIG.map.layers`.

Current layer types include:

- MapTiler streets
- MapTiler topo
- CARTO Voyager
- Esri streets
- Esri satellite

If changing providers, update tile URLs, attributions, and any required API keys in `js/config.js`.

## 14. Cache and Freshness

Cache layers:

- Browser HTTP cache for normal static assets.
- Version query strings on JS modules, currently `photos-20260625`.
- Apps Script cache, described in `README.md`.
- Browser `localStorage` cache for Drive file metadata, TTL 5 minutes.
- In-memory Drive photo index for the current page session.
- In-memory row match cache for selected rows.
- Service worker thumbnail cache for repeated Drive images.

When photos are added to Drive:

- The Apps Script and browser metadata caches may take a few minutes to refresh.
- Hard refresh or clear site data if testing immediately.
- Make sure file names match the naming convention.

When JavaScript changes:

- Bump the version query string in `index.html`, `mosque.html`, and module imports.

When service worker logic changes:

- Change the service worker cache name if cached thumbnail behavior needs a clean slate.

## 15. Troubleshooting

No map appears:

- Confirm Leaflet loaded from `unpkg.com`.
- Open browser devtools and check console/network errors.
- Confirm CSV rows include valid latitude and longitude.

No rows appear:

- Check `APP_CONFIG.dataSource.publishedCsvUrl`.
- Confirm the Google Sheet is published to the web as CSV.
- Confirm column names match `APP_CONFIG.columns`.

Photos do not appear:

- Confirm `APP_CONFIG.drivePhotos.enabled` is `true`.
- Confirm the Apps Script URL is deployed and accessible.
- Confirm Drive folder permissions allow public viewing.
- Confirm photo file names match mosque names.
- Check whether localStorage has an old photo list; clear site data for immediate retesting.

Photos appear slowly:

- Test through a real HTTP server, not `file://`.
- Confirm `sw.js` is published and registered.
- Confirm the browser is requesting `w360`, `w640`, or `w1200` thumbnail URLs rather than original images.
- Use browser devtools Network tab to see whether repeat requests are served from the service worker or memory/disk cache.

Service worker not active:

- Service workers require HTTPS or `localhost`.
- Hard refresh once after deployment.
- Check Application -> Service Workers in browser devtools.

## 16. Safe Change Checklist

Before handing changes to production:

1. Run a local static server.
2. Open the map page.
3. Confirm the map renders and markers are clickable.
4. Select two different mosques with photos.
5. Switch back to the first mosque and confirm photos feel immediate.
6. Open a mosque detail page from the drawer.
7. Confirm text appears before photos if Drive metadata is cold.
8. Confirm gallery photos appear after hydration.
9. Check browser console for errors.
10. Bump module query strings if JavaScript changed.

## 17. Ownership Notes

The most important files for future maintenance are:

- `js/config.js` for data, photo, and map provider settings.
- `js/drive-photos.js` for photo matching and performance.
- `js/data.js` for CSV schema changes.
- `js/app.js` for map/drawer behavior.
- `js/mosque.js` for detail page behavior.
- `sw.js` for thumbnail caching.

If a future maintainer needs to make the photo system even faster, the next larger step would be moving Drive images into a real image CDN or static object storage with generated thumbnails. The current solution keeps the existing Google Drive workflow and removes the main redundant work without changing the content workflow.
