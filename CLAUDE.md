# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this project is

A **static website** for the Auqaf (Awqaf) mosque directory. No build step, no
package manager, no backend, no bundled database. It is plain HTML, CSS, and
browser-native ES modules. Two public pages:

- `index.html` — interactive Leaflet map + searchable directory. Clicking a
  marker or a directory item opens an in-page details panel (the "pop-up") in
  the right sidebar. It does **not** use Leaflet popups; the "pop-up" the
  stakeholders refer to is the sidebar drawer rendered by `renderDetails()`.
- `mosque.html` — individual detail page for one mosque, reached at
  `mosque.html?id=<rowId>`.

Live mosque data comes from a **published Google Sheet CSV**. Photos come from a
**Google Drive folder**, listed through a Google Apps Script endpoint and
rendered as right-sized Drive thumbnail URLs.

> Note on naming: the department spells itself **"Auqaf"**. The codebase
> historically used **"Awqaf"** (folder name, cache keys, internal identifiers).
> User-facing text should read "Auqaf"; internal identifiers (cache keys,
> callback names, variable names) can stay as-is to avoid churn unless a task
> says otherwise.

## File map

```text
index.html          Map + directory page. Sidebar markup + module script tag.
mosque.html         Individual mosque detail page shell.
style.css           ALL styling for both pages (~1500 lines, single file).
sw.js               Service worker: caches Drive thumbnails, local photos/, and the manifest.
README.md           Public setup/usage notes (data source, Drive, Apps Script).
PROJECT_HANDOFF.md  Detailed handoff: architecture, perf decisions, troubleshooting.
photos/             Repo-committed WebP thumbnails + index.json manifest (synced from Drive).
scripts/
  sync-photos.mjs   CI script: diffs Drive against photos/index.json, downloads/converts changed photos.
.github/workflows/
  sync-photos.yml   GitHub Action that runs sync-photos.mjs on a schedule or manual trigger.
js/
  config.js         APP_CONFIG: data source, Drive photo config, map layers, CSV column map.
  data.js           CSV fetch (Papa Parse) + row normalization into the app row shape.
  drive-photos.js   Drive file listing, filename parsing/matching, photo index, caching.
  map.js            Leaflet wrapper: base layers, markers, clustering, tooltips, fit/focus.
  app.js            Map page controller: sidebar "pop-up", directory panel, photo loading.
  mosque.js         Detail page controller: hero, about, location, nearby, gallery.
  utils.js          Shared helpers: cleaning, escaping, URL/coord parsing, Drive thumb URLs.
```

The git-ignored `junk/` folder holds old local data/experiments and is not part
of the deployed site. Do not rely on it.

## Where things live (for common changes)

- **User-facing strings** on the map page: `UI_TEXT` object at the top of
  `js/app.js` (e.g. `directoryButton`, `noSelection`).
- **User-facing strings** on the detail page: `UI_TEXT` object at the top of
  `js/mosque.js` (e.g. `backToDirectory`, `openFullMap`, `publicDetails`,
  `getDirections`, tab labels).
- **App title / brand text**: `APP_CONFIG.title` in `js/config.js` (currently
  `"Auqaf Directory"`). Used by both pages.
- **The sidebar "pop-up"** (map page): `renderDetails(row)` in `js/app.js`. It
  builds the preview image (`buildPreviewImage()`, small-then-upgrade), the
  bold title link, the fact rows (`appendTextRow`), and the Comments block
  (`appendCommentsRow`). It does **not** show a subtitle line under the title,
  a Location link, a Photos grid, or the directory count status line — those
  were all removed as redundant with the bold title/detail page;
  `getAlternateName()` was deleted, and `appendLinkRow()`/`appendPhotosRow()`
  stay defined but unused by the pop-up.
- **The "N mosques across M districts" status line**: `getDirectoryStatus()` +
  `setStatus()` in `js/app.js`, rendered into `#status`. Only shown for the
  initial loading state and the no-selection ("empty") state; `selectRow()`
  clears it and `clearSelection()` restores it, so it never appears while a
  mosque's details are open.
- **The detail page layout** (hero, toolbar links, section nav tabs, location
  tools, gallery, sidebar card): `renderPage(rows, row)` in `js/mosque.js`.
- **Data source / columns / map layers / Drive config**: `APP_CONFIG` in
  `js/config.js`.
- **Marker clustering** (map page): Leaflet.markercluster v1.5.3 loaded from
  unpkg in `index.html` (after `leaflet.js` — the plugin extends `window.L`;
  only `MarkerCluster.css` is loaded, the Default theme CSS is intentionally
  skipped). The cluster group + custom badge icon live in `createShrineMap()`
  in `js/map.js`; tuning knobs are `APP_CONFIG.map.cluster`
  (`maxRadius`, `disableAtZoom`) in `js/config.js`; badge styles are the
  `.auqaf-cluster*` rules in `style.css`. `waitForLibraries()` in `js/app.js`
  also waits for `window.L.markerClusterGroup` before boot.
- **District names** come from the CSV `Zone` column (`APP_CONFIG.columns.zone`)
  and are read in `normalizeRow()` in `js/data.js` as `row.zone`, passed through
  `applyDistrictNameFix()` against the `DISTRICT_NAME_FIXES` map (also in
  `js/data.js`) to correct known source-sheet typos (e.g. `Saikot` →
  `Sialkot`). Extend that map if new typos turn up; it only fixes spelling, it
  never merges/renames districts.
- **Photo filename → mosque matching**: `parseNamedPhoto()` and
  `buildPhotoIndex()` in `js/drive-photos.js`. Photos are typed as `main`
  (`_M`), `inside` (`_I_#`), `outside` (`_O_#`), or `legacy` (`_#`). The same
  parsing rules are duplicated (not imported) in `scripts/sync-photos.mjs` for
  the CI sync — keep both in sync if the naming convention ever changes.

## Data model (the normalized "row")

`normalizeRow()` in `js/data.js` turns a raw CSV row into the shape used
everywhere. Rows without a valid lat/lng are dropped. Key fields:

- Identity: `id`, `mosqueId`, `mosqueName`, `mosqueNameOnGround`, `shrineName`,
  `title` (display title via `getDisplayTitle()`), `subtitle`.
- Location: `zone` (district), `city`, `address`, `latitude`, `longitude`,
  `coordinatesLabel`, `whatsappLocationUrl`.
- Details: `imamName`, `mosqueBuiltDate`, `womensPrayerSection`, `comments`.
- Photos: `drivePhotos` (from Drive, preferred), plus legacy CSV
  `insidePhotos` / `outsidePhotos`. Each photo has `url`, `previewUrl`,
  `thumbnailUrls` (`sidebar`/`preview`/`gallery`/`hero`), `isRenderable`,
  and (for Drive) `type` (`main`/`inside`/`outside`/`legacy`), `sequence`.

## Photo system (important + performance-sensitive)

1. `drive-photos.js` builds one in-memory **photo index** keyed by normalized
   mosque name (`normalizePhotoMosqueName()`), merged from two sources:
   `loadLocalPhotoIndex()` (repo-committed `photos/index.json`) and
   `loadRemoteDrivePhotoIndex()` (live Apps Script listing). Local entries win
   per mosque key; Drive fills in anything not synced locally yet. See
   "Local photo sync" below.
2. The remote Drive file list is cached in `localStorage` under
   `awqaf-drive-photo-files-v3` (5-min TTL). The merged photo index and
   per-row matches are cached in memory for the page session.
3. Different UI slots request different thumbnail sizes (configured in
   `APP_CONFIG.drivePhotos.thumbnailSizes`): `sidebar: w360`, `preview: w640`,
   `gallery: w1200`, `hero: w1200`. Local photos map `sidebar`/`preview` to the
   small (`~w400`) generated file and `gallery`/`hero` to the large
   (`~w1200`) one.
4. `sw.js` caches Drive thumbnail responses and local `photos/...` image
   requests cache-first, and `photos/index.json` network-first (see
   "Cache busting").
5. Both pages render **text first** and hydrate photos asynchronously so the UI
   is usable before photo metadata resolves. The map page also warms photo
   metadata in the background after first render. The map pop-up additionally
   renders a small `sidebar`-size image instantly and upgrades it to the full
   `preview` size once loaded (`buildPreviewImage()` in `js/app.js`).
6. `loadDrivePhotoIndex()`'s in-memory cache checks `drivePhotoIndex?.size`,
   not just presence — a `Map` is truthy even when empty. Fixed 2026-07-01: an
   earlier version checked plain truthiness, so a single failed/empty first
   fetch (e.g. a one-off Apps Script timeout) would permanently cache "no
   photos" for the rest of the page session, with no error anywhere. Keep any
   future change to this guard checking `.size`, or that regresses silently.
7. On the detail page, `renderPage()` in `js/mosque.js` shows the main (`_M`)
   photo only as the hero/thumbnail; it's filtered out of the gallery grid
   below (`photoItems.filter((photo) => photo.type !== "main")`) so it isn't
   also shown among its own inside/outside shots.

Photo filename convention (the `MosqueName` part must match a row identity
field, preferably `Mosque Name`):

```text
MosqueName_M.jpg        main / default preview photo
MosqueName_I.jpg        inside photo (or MosqueName_I_1.jpg, _I_2.jpg, ... for several)
MosqueName_O.jpg        outside photo (or MosqueName_O_1.jpg, _O_2.jpg, ... for several)
MosqueName_0/1/2.jpg    legacy fallback (still accepted)
```

The trailing `_<number>` on `_I`/`_O` is optional — most real uploads omit it
entirely (bare `_I` / `_O`), which is why inside/outside photos didn't render
for a while: the parser used to *require* a number and silently dropped
anything without one. `parseNamedPhoto()` in `js/drive-photos.js` (and its
mirror in `scripts/sync-photos.mjs`) now accepts both forms; files with no
explicit number get an auto-assigned sequence in upload-time order
(`assignAutoSequences()`). Prefer explicit `_I_1`/`_I_2` when uploading more
than one inside or outside photo for the same mosque — it keeps ordering
stable if photos are later added or removed, which the auto-assigned form
does not guarantee.

If inside/outside photos are still missing on a page, first check that files
actually exist in Drive for that mosque and that `MosqueName` matches the
row's name — matching, not rendering, is the usual remaining culprit. Also
check whether `photos/index.json` has synced entries for that mosque; if not,
the next `sync-photos` Action run (or a manual `workflow_dispatch`) is what
picks them up, not a code change.

## Local photo sync (GitHub Action)

Photos are mirrored from Drive into `photos/` as pre-sized WebP thumbnails so
the deployed site serves them same-origin from GitHub Pages instead of
hotlinking `drive.google.com` (which is not an image CDN and can be slow/rate
limited). See `PROJECT_HANDOFF.md` §6.1 for the full design. The short version:

- `.github/workflows/sync-photos.yml` runs `scripts/sync-photos.mjs` on a
  nightly cron and on manual `workflow_dispatch`. It never runs on `push`
  (it commits back to the repo, which would loop).
- The script diffs the Drive listing against `photos/index.json` by file id +
  `modifiedTime`, downloads/converts only what changed with `sharp`, and
  commits only if `photos/` actually changed.
- Staff keep uploading to the same Drive folder with the same `_M`/`_I_#`/`_O_#`
  convention — nothing changes for them.
- **Guardrails if you touch this system**: never commit served images via Git
  LFS (GitHub Pages does not serve LFS objects — they render as broken pointer
  files), and never commit full-resolution originals to `photos/` — only the
  two generated WebP sizes. Drive stays the permanent archive.
- `js/drive-photos.js`'s `parseNamedPhoto()`/`normalizePhotoMosqueName()`
  matching rules are duplicated in `scripts/sync-photos.mjs` (a plain Node
  script can't import the browser module). Keep them in sync by hand.

## Cache busting (do this whenever JS changes)

Every module import and both `<script>` tags carry a version query string,
currently `?v=design-20260702`. When you change any JS:

1. Bump the version string **everywhere** it appears — in `index.html`,
   `mosque.html`, and in the `import ... from "./x.js?v=..."` lines and the
   `PAGE_VERSION_QUERY` constants across `js/*.js`. They must all match.
2. If service-worker caching behavior changes, also bump the relevant cache
   name in `sw.js` (currently `awqaf-drive-thumbnails-v2`,
   `awqaf-local-photos-v1`, `awqaf-photo-manifest-v1` — e.g. bump the first to
   `-v3`).

Grep for the current version before editing so you catch every occurrence:

```bash
grep -rn "design-20260702" .
```

## Running locally

Do **not** open `index.html` from disk (`file://` breaks ES module imports, the
service worker, and remote fetches). Serve over HTTP:

```bash
python3 -m http.server 8765
# then open http://127.0.0.1:8765/
```

`npx serve .` or `npx http-server .` also work.

## Styling conventions

- All CSS is in `style.css`. It uses CSS custom properties (see `:root`) and a
  restrained, information-first visual system. Match existing patterns.
- Detail-page buttons: `.mosque-btn` is the standard (white) button;
  `.mosque-btn-primary` adds the green gradient. Section-nav tabs are
  `.mosque-section-tab`; `.mosque-section-tab-active` adds the green gradient
  (currently unused by default — no tab is active-styled out of the box).
  Toolbar links are `.mosque-toolbar-link`.
- The green accent is `var(--mosque-accent)`.

## Deployment

Static host (GitHub Pages, Netlify, Cloudflare Pages). Push the repo root; serve
`index.html`, `mosque.html`, `style.css`, `sw.js`, `js/`, and `photos/` over
HTTPS (the service worker needs HTTPS or localhost). No build artifact for the
site itself — `photos/` is kept up to date by the `sync-photos` GitHub Action,
not by a deploy-time build step.

## Manual test checklist (after any change)

1. Run a local HTTP server; open the map page.
2. Map renders; markers are clickable; the sidebar "pop-up" opens with details.
3. Open the directory panel; district groups and search work.
4. Select two mosques with photos, then switch back — photos feel immediate.
5. Open a detail page from the pop-up; text appears before photos.
6. Gallery, nearby, and map sections render; buttons/links work.
7. No console errors.
8. Confirm the version query string was bumped if JS changed.
9. If `photos/index.json` has synced entries, confirm at least one photo
   request in the Network tab is same-origin `./photos/...`, not only
   `drive.google.com`.

## Conventions & guardrails

- Keep the deployed site dependency-free and build-free. Don't introduce a
  bundler, framework, or npm runtime dependency to `index.html`/`mosque.html`/
  `js/*.js`. The one intentional exception is `scripts/sync-photos.mjs`, which
  runs only in GitHub Actions (`npm install sharp`) and never ships to the
  browser — keep it that way.
- Prefer editing `UI_TEXT` / `APP_CONFIG` for copy and config changes rather
  than hardcoding strings in render functions.
- Preserve the "render text first, hydrate photos later" pattern — it's the
  core performance decision (see `PROJECT_HANDOFF.md` §8).
- Escape any user/CSV-derived text with `escapeHtml()` when building HTML
  strings (see existing usage in `js/mosque.js`).
- After JS edits, always bump the version query string (see above).
- Never commit served photos via Git LFS, and never commit full-resolution
  photo originals to `photos/` — only the generated WebP thumbnails (see
  "Local photo sync"). GitHub Pages does not serve LFS objects.
