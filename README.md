# Awqaf Mosque Map

This is a static single-page website inspired by the look and feel of the Sufi Shrines map, rebuilt around the `Adil Final` data. It uses Leaflet for the map, Papa Parse for CSV loading, and opens record details in an in-page drawer instead of navigating to a second page.

## File structure

```text
.
|-- js/
|   |-- app.js
|   |-- config.js
|   |-- data.js
|   |-- drive-photos.js
|   |-- map.js
|   |-- mosque.js
|   `-- utils.js
|-- index.html
|-- mosque.html
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

1. Push this folder to a GitHub repository.
2. In GitHub, open `Settings` -> `Pages`.
3. Set the source to the branch you want to publish from, usually `main`, and the root folder `/`.
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

There is no download step. On each page load, the browser lists the Drive folder, reads file names, and attaches matching images to the mosque rows.

Photo file names should use this format:

```text
MosqueName_#.jpg
```

Examples:

```text
Jamia Masjid Shah Hussain Gujrat_0.jpg
Jamia Masjid Shah Hussain Gujrat_1.jpg
Jamia Masjid Shah Hussain Gujrat_2.jpg
```

`_0` is the default/preview photo. Higher numbers show after it in the gallery. The `MosqueName` part should match the mosque name in the data, preferably the `Mosque Name` column.

### Free setup with Apps Script

This is the recommended free workaround. It avoids a Google Cloud API key in the website.

1. Go to https://script.google.com/ and create a new project.
2. Paste this code:

```js
const FOLDER_ID = "15Wj0hXX2HjQvyYDvx4I-XAtClrGSDElo";
const CACHE_KEY = "awqaf-photo-list";
const CACHE_SECONDS = 300;

function doGet(e) {
  const callback = String(e.parameter.callback || "");
  const payload = getPhotoPayload();
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

function getPhotoPayload() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY);
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

    files.push({
      id: file.getId(),
      name,
      mimeType,
      modifiedTime: file.getLastUpdated().toISOString(),
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    files,
  };

  cache.put(CACHE_KEY, JSON.stringify(payload), CACHE_SECONDS);
  return payload;
}
```

3. Click **Deploy** -> **New deployment**.
4. Choose **Web app**.
5. Set **Execute as** to **Me**.
6. Set **Who has access** to **Anyone**.
7. Deploy, authorize it once, then copy the `/exec` web app URL.
8. Paste that URL into `APP_CONFIG.drivePhotos.appsScriptUrl` in `js/config.js`.

After that, you only upload new photos to the Drive folder. The website asks the Apps Script for the folder file list, then loads image thumbnails from Drive.

### Optional Google Drive API setup

The Google Drive API itself is available at no additional cost, but it uses Google Cloud API keys and quotas. To use that route instead:

1. Share the Drive folder so anyone with the link can view it. Uploaded files should inherit that access.
2. In Google Cloud, enable the Google Drive API.
3. Create an API key, restrict it to the Google Drive API and your website domain.
4. Paste the key into `APP_CONFIG.drivePhotos.apiKey` in `js/config.js`.

If both `appsScriptUrl` and `apiKey` are blank, or Drive cannot be listed, the site falls back to any photo URLs already present in the live CSV.

## Notes

- Marker clicks and result clicks open the in-page detail drawer.
- Each mosque also has a detail page at `mosque.html?id=...`.
- The Google Drive API key is visible in browser source, so restrict it in Google Cloud.
- Old local images, offline CSV snapshots, and import scripts are kept under ignored `junk/` storage only.
