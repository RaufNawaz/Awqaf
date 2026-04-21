# Awqaf Mosque Map

This is a static single-page website inspired by the look and feel of the Sufi Shrines map, rebuilt around the `Adil Final` data. It uses Leaflet for the map, Papa Parse for CSV loading, and opens record details in an in-page drawer instead of navigating to a second page.

## File structure

```text
.
|-- data/
|   |-- adil-final.csv
|-- js/
|   |-- app.js
|   |-- config.js
|   |-- data.js
|   |-- filters.js
|   |-- map.js
|   `-- utils.js
|-- index.html
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
- `APP_CONFIG.dataSource.fallbackCsvPath`

If you have a public Google Sheet:

1. Paste its spreadsheet ID into `spreadsheetId`.
2. Keep `gid` set to `2033055474` for the current `Adil Final` tab.
3. Leave `publishedCsvUrl` blank unless you prefer to use an explicit published CSV URL.

If the spreadsheet ID is blank, the app uses the bundled snapshot in `data/adil-final.csv`.

## Refresh the bundled snapshot from the workbook

If you want to update the fallback CSV from the uploaded Excel workbook, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-adil-final-snapshot.ps1
```

By default the script reads `.\Master Endline Sheet .xlsx` and rewrites `.\data\adil-final.csv`.

## Notes

- Everything stays on one page.
- Marker clicks and result clicks open the same in-page detail drawer.
- There are no shrine-specific routes and no second detail page.
- The bundled CSV snapshot exists because the uploaded workbook did not expose a Google Sheet ID. Once you add the live spreadsheet ID in `js/config.js`, the site will fetch the live sheet directly.
