# Awqaf Website Handoff

Last updated: 2026-07-10

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
|-- sw.js                   Service worker that caches Drive thumbnails and local photos
|-- README.md               Public setup and usage notes
|-- PROJECT_HANDOFF.md      This handoff document
|-- photos/                 Repo-committed WebP thumbnails + index.json manifest (synced from Drive)
|-- scripts/
|   `-- sync-photos.mjs     Node/CI script that syncs Drive photos into photos/
|-- .github/workflows/
|   `-- sync-photos.yml     GitHub Action that runs the sync on a schedule or manually
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

This project deploys as static files from **GitHub Pages, built from the
default branch `1.1`** (repo `RaufNawaz/Awqaf`, live at
`https://raufnawaz.github.io/Awqaf/`). **Pushing or merging to `1.1` IS a
production deploy** — Pages rebuilds within ~1–2 minutes of the push.

Branch model (as of 2026-07):

- `1.1` — default branch, deployed, and the branch the nightly `sync-photos`
  Action commits photos to. All feature branches merge back here.
- `origin/main` — stale, predates the `1.1` workflow; not deployed.
- Feature branches: **merge `1.1` in before local testing.** The photo sync
  bot commits `photos/` (960 WebP files, ~166 MB) to `1.1` nightly, so any
  branch cut before the latest sync has a stale or empty `photos/index.json`
  and silently falls back to the slow live-Drive photo path. This bit us
  twice — it looks like "photos are broken again" but is just a stale branch.

Deployment checklist:

1. Merge to `1.1` (or push it) — that is the deploy.
2. Make sure `index.html`, `mosque.html`, `style.css`, `sw.js`, `favicon.svg`,
   `js/`, and `photos/` are published.
3. Serve over HTTPS in production so the service worker can run.
4. After JavaScript **or** `style.css` changes, bump the shared `?v=` query
   string (current pattern: `<change-name>-YYYYMMDD`) everywhere it appears —
   both `<script>` tags, both `<link rel="stylesheet">` tags, every
   `import ... from "./x.js?v=..."` line, and every `PAGE_VERSION_QUERY`
   constant in `js/*.js`. They must all match, or navigation links built with
   `PAGE_VERSION_QUERY` (e.g. `getMosquePageUrl()`) will point at a stale
   value. `style.css` used to be linked without a version query and skip this
   step; as of the 2026-07-10 mosque detail-page redesign it carries the same
   `?v=` as the JS files, so a CSS-only change now needs the same bump too.

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
MosqueName_I.jpg
MosqueName_I_2.jpg
MosqueName_O.jpg
```

Meaning:

- `_M`: main/default photo.
- `_I` or `_I_#`: inside photo. The `_#` is only required when uploading more
  than one inside photo for the same mosque (`_I_1`, `_I_2`, ...); a bare `_I`
  is fine for a single photo, and is in fact the convention most of the
  existing Drive folder actually uses. Files without a number are ordered by
  upload time (`assignAutoSequences()` in `js/drive-photos.js`).
- `_O` or `_O_#`: outside photo, same rule.

Legacy numbered files are still accepted:

```text
MosqueName_0.jpg
MosqueName_1.jpg
MosqueName_2.jpg
```

The `MosqueName` part should match one of the row identity fields, preferably `Mosque Name`.

### 6.1 Local Photo Sync (GitHub Action)

Hotlinked Drive thumbnails work, but Drive is not an image CDN -- rate limits
and variable latency make photos feel slow. A GitHub Action
(`.github/workflows/sync-photos.yml`, running `scripts/sync-photos.mjs`)
mirrors Drive photos into the repo as same-origin, pre-sized WebP thumbnails
so the deployed site serves them from the GitHub Pages CDN instead of
hotlinking Drive on every view.

- The Action runs nightly and can also be triggered manually
  (`workflow_dispatch`). It intentionally never runs on `push`, since it
  commits back to the repo and a push trigger would loop.
- It lists the Drive folder via the same Apps Script endpoint the browser
  uses, diffs against the committed `photos/index.json` manifest by Drive
  file id and `modifiedTime`, and only downloads/converts what changed, so
  commits stay small.
- Each changed photo is written as two WebP sizes (`~w400` small, `~w1200`
  large) under `photos/<mosque-slug>/`, and `photos/index.json` is rewritten
  to match. Files for photos removed from Drive are deleted the same way.
- Staff upload workflow is unchanged: keep using the `_M` / `_I_#` / `_O_#`
  naming convention in the same Drive folder. The Action is what picks up new
  uploads; there is no manual publishing step.

Two constraints specific to deploying on GitHub Pages:

- **No Git LFS for served images.** GitHub Pages does not serve LFS objects
  (they show up as broken pointer files), so committed thumbnails must be
  ordinary files in the repo.
- **Only generated thumbnails are committed, never full-resolution
  originals.** Drive remains the permanent archive. This keeps `photos/`
  small relative to GitHub Pages' repo-size and bandwidth limits.

At runtime, `js/drive-photos.js` builds a local photo index from
`photos/index.json` (`loadLocalPhotoIndex()`) and merges it with the live
Drive listing (`loadRemoteDrivePhotoIndex()`) inside `loadDrivePhotoIndex()`.
Local entries win when a mosque has been synced; the Drive listing fills in
anything not synced yet. Row matching, the map pop-up preview, and the
detail-page gallery/hero all read the same photo entry shape regardless of
source, so they needed no changes.

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

`sw.js` handles three kinds of requests, each in its own cache:

```text
https://drive.google.com/thumbnail?id=...&sz=...   (awqaf-drive-thumbnails-v2)
<origin>/photos/index.json                          (awqaf-photo-manifest-v1)
<origin>/photos/...                                 (awqaf-local-photos-v1)
```

Behavior:

- Cache-first for Drive thumbnails and local `photos/` image files.
- Network-first (falling back to cache) for `photos/index.json`, so a fresh
  sync is picked up quickly instead of being pinned by an old cached manifest.
- Keeps up to 180 Drive thumbnail entries and 400 local photo entries.
- Ignores map tiles, CSV, scripts, CSS, and HTML.
- Works on `http://localhost` and HTTPS.
- Does not work from `file://`.

If caching behavior changes, increment the relevant cache name in `sw.js`, for example from `awqaf-drive-thumbnails-v2` to `awqaf-drive-thumbnails-v3`.

## 10. Map Page Flow

Main controller: `js/app.js`

Startup flow:

1. Wait for Leaflet, Leaflet.markercluster, and Papa Parse
   (`waitForLibraries()` also checks `window.L.markerClusterGroup`).
2. Create the Leaflet map. Markers live in an `L.markerClusterGroup`, not a
   plain layer group (see §18 "Marker clustering" for tuning/removal).
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
- A shared version query string on JS modules and, as of 2026-07-10,
  `style.css` too — currently `mosque-page-refresh-20260710`.
- Apps Script cache, described in `README.md`.
- Browser `localStorage` cache for Drive file metadata, TTL 5 minutes.
- In-memory Drive photo index for the current page session.
- In-memory row match cache for selected rows.
- Service worker thumbnail cache for repeated Drive images.
- Service worker cache-first store for repo-served `photos/` thumbnails, plus
  a network-first cache for the `photos/index.json` manifest.
- Committed `photos/index.json`, refreshed on each GitHub Action sync run.

When photos are added to Drive:

- The Apps Script and browser metadata caches may take a few minutes to refresh.
- Hard refresh or clear site data if testing immediately.
- Make sure file names match the naming convention.

When JavaScript or `style.css` changes:

- Bump the shared version query string in `index.html`, `mosque.html`,
  module imports, and both `style.css` `<link>` tags.

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

Only the main photo appears, inside/outside photos are missing:

- This used to be a parsing bug, not a content gap: most of the live Drive
  folder names inside/outside photos as bare `MosqueName_I` / `MosqueName_O`
  (no trailing sequence number), but `parseNamedPhoto()` originally required
  `_I_#` / `_O_#`, so those files were silently skipped. Fixed 2026-07-01 --
  the parser now accepts both forms and auto-numbers files with no explicit
  sequence (`assignAutoSequences()` in `js/drive-photos.js`, mirrored in
  `scripts/sync-photos.mjs`). If this regresses, check that fix is still in
  place before assuming it's a content gap again.

All photos stopped appearing mid-session (not just for one mosque, and not
tied to any particular photo's naming):

- Fixed 2026-07-01 -- `loadDrivePhotoIndex()` in `js/drive-photos.js` caches
  its merged photo index in a module-level variable so it's only built once
  per page load. The cache-hit check used to be plain truthiness
  (`if (drivePhotoIndex) {...}`), but an empty `Map` is still truthy in
  JavaScript. If the very first attempt to build the index for the whole
  session came back empty (e.g. a one-off Apps Script cold-start timeout or
  any transient network failure -- both `loadLocalPhotoIndex()` and
  `loadRemoteDrivePhotoIndex()` fail safe to an empty Map rather than
  throwing), that empty result got locked in as "the" answer for the rest of
  the page session: every mosque showed no photos, with no console error,
  until a full reload. The guard now checks `drivePhotoIndex?.size`, so an
  empty result is retried on the next photo request instead of being
  permanently cached. If this regresses, that's the first thing to check.

The bottom-of-page gallery repeats the same photo shown at the top:

- The gallery intentionally excludes the main (`_M`) photo, since it's already
  shown as the hero/thumbnail. `renderPage()` in `js/mosque.js` filters
  `buildPhotoItems(row)`'s full list down to `type !== "main"` before passing
  it to `renderGallerySection()`. If a duplicate reappears, check that filter
  is still applied before the gallery render call.

No photos on a feature branch or fresh local checkout (live site is fine):

- Almost certainly a stale branch, not a code bug. `photos/index.json` and the
  `photos/` folder are committed to `1.1` by the nightly sync Action; a branch
  cut before the latest sync has the empty stub and falls back to the live
  Apps Script + Drive path, which is slow (2–10s listing) and flaky. Fix:
  `git merge 1.1` into the branch. Verify with
  `python3 -c "import json; print(len(json.load(open('photos/index.json'))['photos']))"`
  — should print ~960, not 0.

One mosque's pop-up preview is missing while others work:

- First check the synced manifest actually has that mosque
  (search `photos/index.json` for a normalized fragment of its name).
- The pop-up `<img>` removes itself on a failed load
  (`buildPreviewImage()` in `js/app.js` — `error` listener calls
  `image.remove()`), so a transient thumbnail failure shows as "no photo"
  with no error. Reload to retry.
- `rowPhotoCache` in `js/drive-photos.js` caches per-row results (including
  empty ones) for the page session; a row viewed while the photo index was
  still failing keeps showing no photos until a full reload even after the
  network recovers.

A marker sits ~50 km from the real mosque:

- 2–3 source-sheet rows store DMS coordinates (e.g. `31°33'49.5`) instead of
  decimal degrees. `parseCoordinate()` in `js/utils.js` truncates these via
  `parseFloat` to whole degrees, keeping the row but placing it far off. Fix
  the sheet values (preferred) or teach `parseCoordinate()` DMS.

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
10. Bump the shared `?v=` query string if JavaScript or `style.css` changed.

## 17. Ownership Notes

The most important files for future maintenance are:

- `js/config.js` for data, photo, and map provider settings.
- `js/drive-photos.js` for photo matching and performance.
- `js/data.js` for CSV schema changes.
- `js/app.js` for map/drawer behavior.
- `js/mosque.js` for detail page behavior.
- `sw.js` for thumbnail caching.

If a future maintainer needs to make the photo system even faster, the next larger step would be moving Drive images into a real image CDN or static object storage with generated thumbnails. The current solution keeps the existing Google Drive workflow and removes the main redundant work without changing the content workflow.

## 18. Design Decisions Log (2026-07) — what changed and how to undo it

Every item below shipped in July 2026 (branches `1.2`, `1.2.0`,
`design-polish`, all merged into `1.1`). Each entry says where the feature
lives and the minimal revert path, so any of them can be pulled out without
archaeology. After any JS revert, bump the `?v=` version string per CLAUDE.md.

### Marker clustering (map page)

- **What**: Leaflet.markercluster v1.5.3 from unpkg; markers live in an
  `L.markerClusterGroup` with custom green badge icons in three size tiers
  (<10 / <50 / 50+), density-encoded gradient depth, an amber ring when a
  cluster contains the selected mosque, and `zoomToShowLayer()` in
  `focusRow()` so selecting a clustered mosque expands its cluster first
  (with a stale-callback guard so rapid re-selection can't fly to the wrong
  mosque).
- **Chosen options**: `maxClusterRadius 56`, `disableClusteringAtZoom 15`
  (= `focusZoom`, so street level always shows individual pins). Both exposed
  as `APP_CONFIG.map.cluster { maxRadius, disableAtZoom }` in `js/config.js`.
  Known side effect: because clustering turns off at zoom 15,
  `spiderfyOnMaxZoom` never activates and exactly co-located pins overlap at
  high zoom. Set `disableAtZoom: null` to restore spiderfying instead.
- **To tune**: edit `APP_CONFIG.map.cluster` only — no other file needed.
- **To remove entirely**:
  1. `index.html`: delete the two `leaflet.markercluster` tags
     (`MarkerCluster.css` link + plugin `<script>`).
  2. `js/app.js` `waitForLibraries()`: drop the
     `typeof window.L.markerClusterGroup !== "function"` condition.
  3. `js/map.js` `createShrineMap()`: replace the `L.markerClusterGroup({...})`
     block with `const markerLayer = L.layerGroup().addTo(map);`, delete
     `createClusterIcon()`, in `render()` swap the bulk
     `markerLayer.addLayers(markers)` back to `marker.addTo(markerLayer)` per
     marker, in `setSelected()` drop `markerLayer.refreshClusters()`, and in
     `focusRow()` delete the `getVisibleParent`/`zoomToShowLayer` branch
     (keep `applySidebarOffsetFocus`, which is the original pan/fly logic).
  4. `js/config.js`: delete `APP_CONFIG.map.cluster`.
  5. `style.css`: delete the `.auqaf-cluster*` rules (near `.shrine-dot`) and
     the `.auqaf-cluster` lines in the reduced-motion block.

### One brand green across both pages

- **What**: the detail page's `--mosque-accent` / `--mosque-accent-strong`
  alias the map page's `:root` `--accent #0f766e` / `--accent-strong`
  (previously `#1f5e56` / `#184b45`, a second, slightly different green).
  Old-green literals in gradients/hover borders were replaced with the
  `#0f766e` family (`#12867d` gradient tops).
- **To revert**: restore raw values in `.mosque-body` and grep `#12867d` /
  `rgba(15, 118, 110,` in the `.mosque-*` rules back to the old literals.
  Nothing outside `style.css` is involved.

### Shared design tokens (partial by design)

- **Merged now** (values were identical or the token was dead):
  `--mosque-bg`, `--mosque-bg-soft`, `--mosque-surface`, `--mosque-muted`,
  `--mosque-shadow-sm/md/lg` all alias `:root` tokens; `:root` owns
  `--shadow-sm/md/lg`, `--radius-control/card/media`, `--space-1..7`.
- **Deliberately DEFERRED** (do not "finish" this blindly): `--mosque-border`
  (rgba vs solid, ~7% lighter), `--mosque-text` (`#172739` vs `#172033`,
  ΔE ≈ 4 on all body text), `--mosque-accent-soft` (translucent vs solid).
  Merging any of these visibly changes the detail page — screenshot before
  and after if you attempt it.

### Radius hierarchy and spacing scale

- **What**: flat 8px radius replaced by `--radius-control: 6px` (buttons,
  inputs, tabs, tooltips, status chip), `--radius-card: 12px` (sidebar panel,
  cards, dropdown), `--radius-media: 12px` (images, iframes). 999px pills/dots
  stay literal. High-traffic off-scale paddings/gaps snapped to the
  `--space-*` scale (3→4, 7→8, 11→12, 14/17/18→16, 22/26→24, 34→32, 42→40).
- **Deliberate off-scale exceptions — do not snap**: the 10px directory-row
  density, the 20px cluster (sidebar inner padding etc.), 28px page rhythm,
  the 36px column gutter, and the 18px map-edge insets (which mirror
  `#sidebar`'s 18px offsets).
- **To revert**: change the three `--radius-*` values back to 8px in `:root`
  (one line each); spacing tokens can be re-literalized selector by selector.

### Detail-page type scale ("reference" not "magazine")

- **What/why**: hero title 4.4rem→3.2rem (compact 3→2.4rem), section
  h2 2.45rem→2rem, standalone sidebar h3 1.8→1.5rem, lede 1.12→1.05rem;
  responsive echoes 2.5/1.7rem (1024px) and 1.9/1rem (720px); line-heights
  loosened (0.98/1 → 1.05/1.1/1.15); hero media offset 42→28px and divider
  44/36→36/30px retuned for the shorter title block. Rationale: the old 70px
  title pushed facts/photos below the fold and clashed with the
  database-style body (see DESIGN_CRITIQUE.md).
- **To revert**: all in `style.css` under `.mosque-title` /
  `.mosque-section-heading` / `.mosque-lede` and the two media queries.

### Typography and affordance rules

- Small uppercase labels carry 0.06–0.08em letter-spacing; buttons and
  section tabs are sentence case at weight 700 (labels in `UI_TEXT` are
  already sentence case — do not re-add `text-transform: uppercase`).
- `.details-title-link` (pop-up title) underlines on hover/focus only.
- Hover-lift (translateY + shadow) is an affordance reserved for actual
  links; static cards (`.mosque-sidebar-card`, `.mosque-coordinate-card`,
  `.mosque-map-wrap`) intentionally have no hover transform.
- Contrast: `.mosque-fact dt` uses `var(--mosque-muted)` `#647084` = 5.01:1
  on the white card (the old `#6a7b8e` was 4.34:1 and failed AA). If you
  change any label gray, keep ≥ 4.5:1 on white.
- Map-page/sidebar type is in rem (exact conversions from the old px values);
  Leaflet control geometry and the JS `divIcon` pixel sizes stay px on
  purpose.

### Inline SVG icon set

- **What**: `ICONS` (frozen object, 12 stroke-based 24-grid SVGs) exported
  from `js/utils.js`; used in the detail-page fact list (`renderFactRows` /
  `publicFacts` in `js/mosque.js`), the address/coordinates cards, the
  Get-directions button, and the map pop-up rows (`appendTextRow` /
  `appendCommentsRow` in `js/app.js`). Styled by `.icon-inline` in
  `style.css` (em-sized, `var(--accent)` at 0.85 opacity, aria-hidden).
- **Safety rule (load-bearing)**: icon strings are static markup injected via
  `insertAdjacentHTML`/template interpolation, while all CSV-derived text
  stays in `textContent` / `escapeHtml()`. Never build icon markup from CSV
  data, and never widen the interpolation to anything user-derived.
- **To remove**: drop the `icon` fields from `publicFacts`, the `${ICONS.*}`
  interpolations in `js/mosque.js`, the icon args in `js/app.js` call sites
  (the `iconSvg` param defaults to empty), the `ICONS` block in
  `js/utils.js`, and `.icon-inline` in `style.css`. Bump `?v=`.

### Page metadata / favicon (1.2.0)

- `favicon.svg` (dome mark), `theme-color`, meta descriptions, and Open Graph
  tags on both pages. `og:image` is intentionally absent — it needs an
  absolute URL of the deployed site
  (`https://raufnawaz.github.io/Awqaf/...`); add it with a representative
  image if link previews should carry a picture.

### Mosque detail-page redesign (2026-07-10)

- **What**: `mosque.html` moved from the map page's rounded/pill visual
  language to its own scoped look — a serif display face
  (`--font-display: "Source Serif 4"`, loaded alongside Inter/Roboto Mono in
  `mosque.html`'s Google Fonts `<link>`), a muted brass accent
  (`--mosque-brass` / `--mosque-brass-strong` / `--mosque-brass-soft`) layered
  on top of the existing emerald accent, an 8-point-star mark (two overlapping
  squares via `::before`/`::after`) on `.mosque-eyebrow` and
  `.mosque-sidebar-brand`, underline-style section tabs
  (`.mosque-section-tab` / `.mosque-section-tab-active`) replacing the old
  pill buttons, a brass top border on `.mosque-sidebar-card`, and a padded
  white "frame" around the hero photo (`.mosque-hero-media-wrap` padding +
  white background). Corner radius on cards/buttons/tabs tightened from 8px to
  4–6px; hover states lost their `translateY` lift in favor of a calmer
  box-shadow-only change.
- **Scoped, not global**: all of this lives inside the `.mosque-body` selector
  in `style.css` (variables redeclared there override the `:root` values only
  for descendants of `mosque.html`'s `<body>`), so `index.html`'s Manrope
  headings and pill buttons are untouched. Do not hoist `--font-display` or
  the brass tokens into `:root` without deliberately deciding to restyle the
  map page too.
- **Hero layout**: the hero photo column widened from
  `minmax(360px, 460px)` to `minmax(420px, 560px)` (and the 1024px breakpoint
  from `minmax(300px, 380px)` to `minmax(320px, 420px)`), and
  `.mosque-hero-top` switched from `align-items: center` to `align-items:
  start` — with a much taller photo than the text block, center-alignment
  left a large dead gap above the tab row; top-alignment closes it.
- **Lede sentence removed from the hero**: the boilerplate line under the
  title/district ("This page brings together the core public information
  available for this mosque.") is gone. `UI_TEXT.fallbackIntro` was deleted
  and `buildGeneratedNarrative()` in `js/mosque.js` now returns `intro: ""`.
  The "About this mosque" section renders
  `formatParagraphs([narrative.intro, ...narrative.body])` instead of just
  `narrative.body`, so on the rare path where `narrative.intro` holds real
  sheet content (multi-paragraph or long single-paragraph `Comments`, see
  `buildNarrative()`), that text still shows — just in the About section
  instead of the hero. The current published sheet has no `Comments` column at
  all, so in practice every mosque hits the generated-narrative path and
  `narrative.intro` is always empty.
- **Mobile tab row**: `.mosque-section-nav` on the sub-720px breakpoint is now
  `flex-wrap: nowrap` with `overflow-x: auto` (a horizontally scrollable tab
  strip) instead of stacking each tab full-width, since underline tabs don't
  read well stacked the way pill buttons did.
- **To revert**: everything is in `style.css` under the `.mosque-body` block
  through the two responsive media queries at the bottom of the file, plus
  the small `js/mosque.js` changes described above (`fallbackIntro` removal,
  the hero `<p class="mosque-lede">` removal, and the About-section
  `formatParagraphs` call). Restore `Manrope` in the `mosque.html` font
  `<link>` if reverting the serif change (Inter and Roboto Mono weights were
  also trimmed in that `<link>` — 800 dropped from Inter, 700-only kept on
  Roboto Mono — restore the wider weight list if something outside
  `.mosque-body` needs them).

### Known data quirks (source sheet, not code)

- `DISTRICT_NAME_FIXES` in `js/data.js` covers all six known Zone typos;
  `Burewala`, `Shahkot`, and `DG Khan` are legitimate names/abbreviations,
  not typos — do not "fix" them.
- One sheet row is a literal `End` sentinel (every field "End"); it is
  dropped by coordinate validation and never reaches the UI.
- 2–3 rows have DMS coordinates (see Troubleshooting §15).
- Roughly two dozen mosques have a main photo but no inside/outside upload —
  a content gap, not a matching bug (verified against the full Drive listing
  2026-07-01: all 960 files parse and 308/308 mosque keys match CSV rows).
