# Prompt for Claude Code — Auqaf directory website revisions

Paste everything below into Claude Code from the project root.

---

You are working in the Auqaf mosque directory static site (plain HTML/CSS/ES
modules, no build step). Read `CLAUDE.md` first for architecture, then make the
changes below. Group the work exactly as listed. After editing any JS, bump the
`?v=photos-20260625` version query string everywhere it appears (see CLAUDE.md
"Cache busting"), and run the manual test checklist. Escape CSV-derived text
with `escapeHtml()` when building HTML.

Important context: on the map page, the "pop-up" the feedback refers to is the
**right-hand sidebar details panel** rendered by `renderDetails()` in
`js/app.js` — not a Leaflet popup.

## 1. Directory + district names

**1a. Rename the directory bar from "Awqaf" to "Auqaf".** The department spells
itself "Auqaf". Change the directory button/bar label. It is
`UI_TEXT.directoryButton = "Awqaf Directory"` at the top of `js/app.js`, and the
overall app title `APP_CONFIG.title = "Awqaf Directory"` in `js/config.js`
(used as the sidebar `<h1>` on the map page and the brand text on the detail
page). Update both so all user-facing text reads **"Auqaf Directory"**. Also
update the `<h1 id="mapTitle">Awqaf Directory</h1>` in `index.html` and the
visible page `<title>`s ("Awqaf Mosque Directory" in `index.html`, and
`UI_TEXT.pageEyebrow`/`document.title` usage in `js/mosque.js`) so the spelling
is consistent everywhere the user sees it. You may leave purely internal
identifiers (localStorage keys like `awqaf-drive-photo-files-v3`, JSONP callback
names, variable names) unchanged.

**1b. Fix misspelled district names in the directory contents.** District names
come from the CSV `Zone` column and surface as `row.zone` (see `normalizeRow()`
in `js/data.js`); they are grouped in the directory panel by
`groupRowsByDistrict()` in `js/app.js` and shown as the green title on the
detail page. To find the misspellings:

1. Fetch the live published CSV
   (`APP_CONFIG.dataSource.publishedCsvUrl` in `js/config.js`) and list the
   distinct `Zone` values.
2. Compare them against canonical Punjab district spellings (this is the Punjab
   Auqaf & Religious Affairs data — e.g. Lahore, Gujranwala, Sheikhupura,
   Sialkot, Faisalabad, etc.) and flag obvious misspellings.
3. Since the site reads a live sheet we cannot edit here, add a small
   **display-time correction map** (a `DISTRICT_NAME_FIXES` lookup, normalized
   key → correct spelling) applied where `row.zone` is set in `normalizeRow()`
   (`js/data.js`), so the corrected name flows through everywhere (directory
   groups, pop-up, detail page). Keep the map data-driven and easy to extend,
   and add a code comment noting these are display corrections for known
   source-data typos. List the corrections you made in your summary so they can
   be reviewed, and only correct clear spelling errors — do not merge or rename
   districts.

## 2. Map page "pop-up" (sidebar details) — `renderDetails()` in `js/app.js`

**2a. Remove the "N mosques across M districts" line from the pop-up.** That
status text is produced by `getDirectoryStatus()` and pushed into `#status` via
`setStatus()`. When a mosque is selected, the status line still shows the
directory count near the top of the panel. Make it so the count does **not**
appear above/inside the details when a mosque is selected (clear or hide
`#status` on selection; it can still be used for the initial "Loading…" state
and empty state). Confirm the "Loading photos…" status change in
`loadPhotosForRow()` no longer re-introduces the "N mosques across M districts"
prefix while a mosque is open.

**2b. Remove the duplicated mosque name.** The name currently appears twice: as
the large bold title link (built near the top of `renderDetails()` with
`.details-title` / `.details-title-link`) and again as a "Mosque Name:" fact row
(the `appendTextRow(elements.details, "Mosque Name", …)` call). **Keep the large
bold title link** and **remove the "Mosque Name" `appendTextRow` call.**

**2c. Remove the "Location" and "Photos" rows from the pop-up.** Delete the
`appendLinkRow(elements.details, "Location", …)` call and the
`appendPhotosRow(elements.details, row)` call in `renderDetails()`. (Keep the
preview image at the top of the pop-up — see 2d.) These are redundant with the
detail page. Leave the underlying helper functions defined; just stop calling
them from the pop-up. Verify nothing else the pop-up needs relied on them.

**2d. Speed up the pop-up preview photo (best-effort).** The image at the top of
the pop-up is `getPreviewPhoto(row)` rendered at the `preview` thumbnail size
(`w640`, from `APP_CONFIG.drivePhotos.thumbnailSizes.preview`). It already loads
async after text. Try to make it feel faster without hurting quality — options
to evaluate: (a) render the smaller `sidebar` (`w360`) variant first as an
instant `preview` and let the browser cache warm, (b) lower the preview
thumbnail size (e.g. `w480`), (c) add `fetchPriority`/`decoding` tuning, and/or
(d) preload the selected row's preview URL. Keep the service-worker thumbnail
cache working. If none of these give a real improvement, leave it as-is and say
so — this is explicitly "no worries if not."

> Note: Section 4 below (serving photos from the repo) is the real fix for photo
> speed here. Once local photos land, the pop-up preview loads same-origin from
> the repo/CDN and will be much faster; treat the tweaks above as a stopgap.

## 3. Individual mosque page — `renderPage()` in `js/mosque.js`

**3a. Show inside AND outside photos in the page gallery.** Right now only the
main photo appears at the bottom. The gallery is built by `buildPhotoItems(row)`
+ `renderGallerySection()`, which already iterates `row.drivePhotos` (main +
inside + outside). So the likely cause is upstream: either the inside/outside
files aren't matched, or only `_M` files exist for the mosque(s) being tested.
Investigate and fix so inside/outside photos render on the individual page:

1. Fetch the Drive file list (via `APP_CONFIG.drivePhotos.appsScriptUrl`) and
   confirm whether `_I_#` / `_O_#` files exist for the test mosque and whether
   `parseNamedPhoto()` / `buildPhotoIndex()` in `js/drive-photos.js` match them
   to the row (check filename `MosqueName` vs row name normalization).
2. If it's a matching/parsing bug, fix it in `drive-photos.js`. If the files
   simply don't exist yet, report that clearly (it's a content issue, not code).
   Ensure the gallery groups/labels inside vs outside sensibly using the
   existing `formatDrivePhotoLabel()` output.
3. These inside/outside photos must appear **only on the individual page**, not
   in the map pop-up — which is already handled by removing the pop-up Photos
   row in 2c. Confirm that separation holds.

**3b. Toolbar: keep "Back to Directory", remove "Browse Map".** In
`renderPage()` the toolbar renders two links: `UI_TEXT.backToDirectory` and
`UI_TEXT.browseMap` (`.mosque-toolbar-link-muted`). Remove the "Browse map"
link entirely (both pages/links point to the map anyway).

**3c. Rename "Awqaf" → "Auqaf" here too.** Covered structurally by 1a
(`APP_CONFIG.title` drives the sidebar brand, and `UI_TEXT.pageEyebrow` in
`js/mosque.js` reads "Awqaf Mosque Directory"). Make sure the eyebrow, brand,
and `document.title` all read "Auqaf".

**3d. Remove duplicated name and the "listed in" line in the hero.** In the
hero, `renderPage()` renders `row.title` (keep this big name), then
`alternateName` via `.mosque-alt-name` (the repeated name — **remove this**),
then the green `locationLabel` via `.mosque-location-line` (**keep this — it's
the district/city**), then `narrative.intro`. The sentence "This mosque is
listed in <location>." comes from `buildGeneratedNarrative()` /
`buildNarrative()` and is used as `narrative.intro` (the `.mosque-lede`).
**Remove that "This mosque is listed in …" intro sentence** so it doesn't repeat
the district line — but keep any real narrative that comes from the mosque's
`Comments`. Concretely: in `buildGeneratedNarrative()` stop emitting the
`This mosque is listed in ${locationLabel}.` intro (fall back to the existing
`fallbackIntro` or empty), and make sure the hero doesn't render an empty lede.

**3e. Section nav: match the About button color to the others, and remove the
"Public details" tab.** The section-nav tabs in `renderPage()` are About,
Location, Nearby, Public details. The **About** tab currently carries
`mosque-section-tab-active` (green gradient); change it so About uses the plain
`.mosque-section-tab` styling like the others (remove the active/green treatment
from the default state). **Remove the "Public details" tab** (`UI_TEXT.detailsTab`
link to `#details`). **Keep the public-details sidebar card/banner** on the
right (the `#details` `.mosque-sidebar-card` with the fact list) — only the nav
tab goes away.

**3f. Location section buttons.** In the location tools of `renderPage()`:

- **Remove the big "Open full map" button** (the second `.mosque-btn` linking to
  `fullMapUrl` with `UI_TEXT.openFullMap`). It's redundant with the "Open full
  map" link that already sits under the coordinates
  (`.mosque-coordinate-link` → `<small>${UI_TEXT.openFullMap}</small>`). Keep
  that coordinates link.
- **Change "Get directions" to the standard button color.** It's currently
  `.mosque-btn.mosque-btn-primary` (green). Drop `mosque-btn-primary` so it uses
  the standard white `.mosque-btn` styling like the other buttons.

## 4. Serve photos from the repo, kept in sync with Drive (photo speed)

Goal: make photos load faster and more reliably by serving them as same-origin
static files from the repo (on GitHub Pages) instead of hotlinking
`drive.google.com/thumbnail?...`. Google Drive is not an image CDN (rate limits,
variable latency, extra DNS/TLS, occasional redirects); repo-served,
pre-sized images off the Pages CDN are faster.

Key constraint: **the browser cannot write to the repo.** So "check Drive on
refresh and download changed photos" cannot happen client-side. The diff +
download must run in CI (a GitHub Action) that has write access. The live site
loads local photos and only falls back to Drive at runtime for a photo not yet
synced.

Deployment target is **GitHub Pages**, which has two hard implications:

- **Do NOT put served images in Git LFS** — GitHub Pages does not serve LFS
  objects (they'd render as broken pointer files). Committed thumbnails must be
  normal files.
- To keep the repo small, **commit only generated web thumbnails, not
  originals.** Drive stays the archive of full-resolution originals. Prefer
  **WebP** at **two sizes** (a small ~`w400` and a large ~`w1200`) and map the
  four UI slots onto them (`sidebar`/`preview` → small, `gallery`/`hero` →
  large). This bounds file count and bytes. Note GitHub Pages' ~1GB repo soft
  limit and ~100GB/mo bandwidth; report the resulting `photos/` size.

**4a. Repo photo store + manifest.** Add a `photos/` folder holding the
generated thumbnails, plus a committed `photos/index.json` manifest that is the
source of truth for what has been synced. Suggested manifest shape (keyed by
Drive file id so diffing is by id + `modifiedTime`):

```json
{
  "generatedAt": "2026-07-01T00:00:00Z",
  "photos": {
    "<driveFileId>": {
      "name": "MosqueName_I_1.jpg",
      "modifiedTime": "2026-06-30T12:00:00Z",
      "mosqueKey": "<normalizePhotoMosqueName output>",
      "type": "inside",
      "sequence": 1,
      "files": {
        "small": "photos/<mosqueKey>/inside_1_w400.webp",
        "large": "photos/<mosqueKey>/inside_1_w1200.webp"
      }
    }
  }
}
```

Reuse the existing parsing/keying so local and Drive paths agree:
`parseNamedPhoto()` (type/sequence), `normalizePhotoMosqueName()` (the key), and
`comparePhotoEntries()` (ordering) in `js/drive-photos.js`.

**4b. GitHub Action to sync Drive → repo.** Add
`.github/workflows/sync-photos.yml`, plus a Node script (e.g.
`scripts/sync-photos.mjs`) it runs. Requirements:

- Triggers: `workflow_dispatch` (manual) and `schedule` (nightly cron). Do not
  trigger on `push` (the job commits, which would loop).
- Permissions: `contents: write`; commit with the built-in `GITHUB_TOKEN`.
- Steps: checkout → setup Node → install `sharp` → run the sync script → commit
  only if `photos/` or `photos/index.json` changed (e.g.
  `stefanzweifel/git-auto-commit-action` or a guarded `git commit`).
- Script logic:
  1. List Drive files via `APP_CONFIG.drivePhotos.appsScriptUrl` (already public
     — no secret needed): id, name, mimeType, modifiedTime.
  2. Diff against `photos/index.json`: determine added / changed
     (`modifiedTime` differs) / removed.
  3. For added/changed: fetch image bytes as the source, then downscale to the
     two WebP sizes with `sharp`. Simplest source is a large Drive thumbnail,
     e.g. `https://drive.google.com/thumbnail?id=<id>&sz=w1600`, which avoids
     Drive's large-file download-confirm token. Write files under
     `photos/<mosqueKey>/`.
  4. For removed: delete the corresponding files.
  5. Rewrite `photos/index.json`.
- Keep the run incremental (only touch changed photos) so commits stay small —
  this is the "index, download only the diff" behavior, correctly located in CI.

**4c. Make the site load local photos first, Drive as fallback.** Add config in
`js/config.js`, e.g. `APP_CONFIG.localPhotos = { enabled: true, manifestUrl:
"./photos/index.json" }`. In `js/drive-photos.js`:

- Add `loadLocalPhotoIndex()` that fetches `photos/index.json` and builds the
  same Map shape as `buildPhotoIndex()` — keyed by `mosqueKey`, values are photo
  entries whose `thumbnailUrls` point to the **local** WebP paths
  (`sidebar`/`preview` → `small`, `gallery`/`hero` → `large`), `isRenderable:
  true`, and `url` for the "open" link (local large image or the Drive view URL,
  your call).
- Change `loadDrivePhotoIndex()` to prefer the local index and only fall back to
  the Drive listing for keys missing locally (hybrid). Preserve the existing
  Drive code path as the fallback so unsynced/new photos still appear.
- Everything downstream (`findDrivePhotosForRow`, the map pop-up preview, the
  detail-page gallery/hero, `formatDrivePhotoLabel`) should work unchanged since
  it reads the same photo-entry shape.

**4d. Cache the local photos in the service worker.** Extend `js/sw.js` (which
currently only caches Drive thumbnails) to also cache same-origin `./photos/…`
requests cache-first, and cache `photos/index.json` (network-first or short TTL
so new syncs show up). Bump the SW cache name (e.g.
`awqaf-drive-thumbnails-v1` → `awqaf-photos-v2`) since caching behavior changed.

**4e. Docs.** Update `README.md` and `PROJECT_HANDOFF.md`: photos now live in the
repo under `photos/`, synced from Drive by the GitHub Action; staff still upload
to the Drive folder (unchanged workflow) and the Action pulls changes in.
Mention the "no LFS for served images / thumbnails only, not originals"
constraint. Also add these notes to `CLAUDE.md`.

## Finishing up

- Bump `?v=photos-20260625` → a new date (e.g. `photos-YYYYMMDD` for today)
  everywhere: `index.html`, `mosque.html`, every `?v=` import in `js/*.js`, and
  each `PAGE_VERSION_QUERY`. `grep -rn "photos-20260625" .` to catch them all.
- If any Drive photo matching logic changed in `sw.js`/`drive-photos.js`, bump
  the service-worker cache name too.
- Run the manual test checklist from `CLAUDE.md` (local HTTP server, click a
  marker, open a detail page, check console).
- Summarize: the district corrections you applied, whether inside/outside photos
  were a code fix or a content gap, whether the pop-up photo got faster, and the
  resulting size of the committed `photos/` folder (flag if it's a concern for
  GitHub Pages).
