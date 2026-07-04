# Awqaf Mosque Map

This is a static single-page website inspired by the look and feel of the Sufi Shrines map, rebuilt around the `Adil Final` data. It uses Leaflet for the map, Papa Parse for CSV loading, and opens record details in an in-page drawer instead of navigating to a second page.

## File structure

```text
.
|-- .github/
|   `-- workflows/
|       `-- sync-photos.yml
|-- js/
|   |-- app.js
|   |-- config.js
|   |-- data.js
|   |-- drive-photos.js
|   |-- map.js
|   |-- mosque.js
|   `-- utils.js
|-- photos/
|   |-- index.json
|   `-- <mosque-slug>/*.webp
|-- scripts/
|   `-- sync-photos.mjs
|-- index.html
|-- mosque.html
|-- sw.js
|-- style.css
`-- README.md
```

## How to run locally

Because the site fetches local files, serve the folder with a simple static server instead of opening `index.html` directly from disk.

Example options:

```bash
npx serve .
```

or

```bash
npx http-server .
```

Then open the local URL the server prints, usually `http://localhost:3000` or `http://127.0.0.1:8080`.

## How to deploy to GitHub Pages

This repo is already set up: **GitHub Pages publishes the default branch
`1.1`**, so pushing or merging to `1.1` deploys to production
(`https://raufnawaz.github.io/Awqaf/`) within a minute or two. Do feature work
on a branch and merge to `1.1` when ready. The nightly `sync-photos` Action
also commits to `1.1`, so merge `1.1` into long-lived branches before testing
photos locally.

For a fresh fork/copy:

1. Push this folder to a GitHub repository.
2. In GitHub, open `Settings` -> `Pages`.
3. Set the source to the branch you want to publish from and the root folder `/`.
4. Save the setting and wait for GitHub Pages to publish the site.

This project is plain static HTML/CSS/JS, so it does not need a build step.

## Where to change the spreadsheet ID and gid

Edit `js/config.js`.

The data source lives in one place:

- `APP_CONFIG.dataSource.spreadsheetId`
- `APP_CONFIG.dataSource.gid`
- `APP_CONFIG.dataSource.publishedCsvUrl`

If you have a public Google Sheet:

1. Paste its spreadsheet ID into `spreadsheetId`.
2. Set `gid` to the sheet tab you want.
3. Or use `publishedCsvUrl` for an explicit published CSV URL.

The current site uses the live `publishedCsvUrl`; there is no bundled offline CSV fallback.

## Google Drive photo folder

The site can load mosque photos directly from this Google Drive folder:

```text
https://drive.google.com/drive/folders/15Wj0hXX2HjQvyYDvx4I-XAtClrGSDElo
```

There is no manual download step. The browser asks the Apps Script for the Drive folder file list, caches that metadata in `localStorage`, builds an in-memory photo index once per page session, and attaches matching images to mosque rows in the background. The images themselves use right-sized Google Drive thumbnail URLs and a small service worker cache so switching between mosques does not repeatedly reload the same thumbnails.

Photo file names should use this format:

```text
MosqueName_M.jpg
MosqueName_I.jpg   (or MosqueName_I_#.jpg if uploading more than one)
MosqueName_O.jpg   (or MosqueName_O_#.jpg if uploading more than one)
```

Examples:

```text
Jamia Masjid Main Bazar Kahchu Pura Lahore_M.jpg
Jamia Masjid Main Bazar Kahchu Pura Lahore_I.jpg
Jamia Masjid Main Bazar Kahchu Pura Lahore_O.jpg
```

or, with more than one inside/outside photo:

```text
Jamia Masjid Main Bazar Kahchu Pura Lahore_M.jpg
Jamia Masjid Main Bazar Kahchu Pura Lahore_I_1.jpg
Jamia Masjid Main Bazar Kahchu Pura Lahore_I_2.jpg
Jamia Masjid Main Bazar Kahchu Pura Lahore_O_1.jpg
```

`_M` is the main/default preview photo. `_I` (or `_I_1`, `_I_2`, ...) are inside photos. `_O` (or `_O_1`, `_O_2`, ...) are outside photos — the `_#` is only needed when uploading more than one of the same type for a mosque, so the site can tell them apart and order them; without it, multiple same-named files are just auto-ordered by upload time. The `MosqueName` part should match the mosque name in the data, preferably the `Mosque Name` column.

As a fail-safe, the site still accepts the previous numbered format:

```text
MosqueName_0.jpg
MosqueName_1.jpg
MosqueName_2.jpg
```

For each mosque, the site shows the new `_M` / `_I_#` / `_O_#` photos first. Older numbered files are still accepted as fallback gallery photos, so a mixed set like `MosqueName_M.jpg` plus `MosqueName_1.jpg` will still display.

### Free setup with Apps Script

This is the recommended free workaround. It avoids a Google Cloud API key in the website.

1. Go to https://script.google.com/ and create a new project.
2. Paste this code:

```js
const FOLDER_ID = "15Wj0hXX2HjQvyYDvx4I-XAtClrGSDElo";
const CACHE_KEY = "awqaf-photo-list";
const CACHE_SECONDS = 300;
const CACHE_MAX_CHARS = 90000;

function doGet(e) {
  const callback = String(e.parameter.callback || "");
  const query = String(e.parameter.q || "");
  const payload = getPhotoPayload(query);
  const json = JSON.stringify(payload);

  if (/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function getPhotoPayload(query) {
  const normalizedQueries = normalizeQueryList(query);
  const shouldUseCache = normalizedQueries.length === 0;
  const cache = CacheService.getScriptCache();
  const cached = shouldUseCache ? cache.get(CACHE_KEY) : "";
  if (cached) return JSON.parse(cached);

  const folder = DriveApp.getFolderById(FOLDER_ID);
  const iterator = folder.getFiles();
  const files = [];

  while (iterator.hasNext()) {
    const file = iterator.next();
    const name = file.getName();
    const mimeType = file.getMimeType();

    if (!mimeType.startsWith("image/") && !/\.(avif|gif|heic|heif|jpe?g|png|webp|svg)$/i.test(name)) {
      continue;
    }

    const normalizedName = normalizePhotoSearchText(name);
    if (
      normalizedQueries.length &&
      !normalizedQueries.some((normalizedQuery) => normalizedName.includes(normalizedQuery))
    ) {
      continue;
    }

    files.push({
      id: file.getId(),
      name,
      mimeType,
      modifiedTime: file.getLastUpdated().toISOString(),
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    query,
    files,
  };

  const json = JSON.stringify(payload);
  if (shouldUseCache && json.length <= CACHE_MAX_CHARS) {
    try {
      cache.put(CACHE_KEY, json, CACHE_SECONDS);
    } catch (error) {
      console.warn("Photo list cache skipped:", error);
    }
  }

  return payload;
}

function normalizeQueryList(query) {
  return String(query || "")
    .split("|")
    .map(normalizePhotoSearchText)
    .filter(Boolean);
}

function normalizePhotoSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

3. Click **Deploy** -> **New deployment**.
4. Choose **Web app**.
5. Set **Execute as** to **Me**.
6. Set **Who has access** to **Anyone**.
7. Deploy, authorize it once, then copy the `/exec` web app URL.
8. Paste that URL into `APP_CONFIG.drivePhotos.appsScriptUrl` in `js/config.js`.

After that, you only upload new photos to the Drive folder. The website asks the Apps Script for the folder file list, caches the list briefly, then loads size-specific image thumbnails from Drive.

### Optional Google Drive API setup

The Google Drive API itself is available at no additional cost, but it uses Google Cloud API keys and quotas. To use that route instead:

1. Share the Drive folder so anyone with the link can view it. Uploaded files should inherit that access.
2. In Google Cloud, enable the Google Drive API.
3. Create an API key, restrict it to the Google Drive API and your website domain.
4. Paste the key into `APP_CONFIG.drivePhotos.apiKey` in `js/config.js`.

If both `appsScriptUrl` and `apiKey` are blank, or Drive cannot be listed, the site falls back to any photo URLs already present in the live CSV.

## Local photo sync (faster photos, same Drive workflow)

Hotlinking `drive.google.com/thumbnail` images works, but Drive is not an
image CDN: rate limits and variable latency make photos feel slow. To fix
that without changing how staff upload photos, a GitHub Action mirrors Drive
photos into the repo as pre-sized, same-origin WebP files:

```text
.github/workflows/sync-photos.yml   Runs the sync (manual trigger + nightly cron)
scripts/sync-photos.mjs             Diffs Drive against photos/index.json, downloads
                                     changed images, generates WebP thumbnails
photos/index.json                   Manifest: source of truth for what has been synced
photos/<mosque-slug>/*.webp         Generated thumbnails (small ~w400, large ~w1200)
```

Staff workflow is unchanged: keep uploading photos to the Drive folder using
the `_M` / `_I_#` / `_O_#` naming convention above. The Action periodically
diffs the Drive folder against `photos/index.json` (by Drive file id and
`modifiedTime`) and commits only what changed, so commits stay small.

The site (`js/drive-photos.js`) prefers these local files and only falls back
to a live Drive thumbnail for a photo the sync hasn't picked up yet. Nothing
about the matching or rendering code needs to know which source a photo came
from.

Two constraints this relies on, since the site deploys to GitHub Pages:

- **No Git LFS for served images.** GitHub Pages does not serve LFS objects
  (they render as broken pointer files), so the committed thumbnails must be
  plain files in the repo.
- **Only generated thumbnails are committed, not full-resolution originals.**
  Google Drive stays the permanent archive. Committing two small WebP sizes
  per photo instead of originals keeps the repository small and bounds
  GitHub Pages bandwidth usage.

To run the sync by hand, use the "Sync Drive Photos" workflow's "Run
workflow" button in the GitHub Actions tab, or run
`node scripts/sync-photos.mjs` locally with Node 18+ and `sharp` installed
(`npm install sharp`).

## Notes

- Marker clicks and result clicks open the in-page detail drawer.
- Each mosque also has a detail page at `mosque.html?id=...`.
- `sw.js` caches Drive thumbnail responses, local `photos/` thumbnails, and the `photos/index.json` manifest for faster repeat visits and shrine switching. It works on `http://localhost` and HTTPS deployments, not when opening files directly from disk.
- The Google Drive API key is visible in browser source, so restrict it in Google Cloud.
- Old local images, offline CSV snapshots, and import scripts are kept under ignored `junk/` storage only.
