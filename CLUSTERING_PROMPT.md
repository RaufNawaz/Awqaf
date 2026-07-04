# Prompt for Claude Code — geographic marker clustering on the map

Paste everything below into Claude Code from the project root.

---

You are working in the Auqaf mosque directory static site (plain HTML/CSS/ES
modules, Leaflet loaded from CDN, no bundler). Read `CLAUDE.md` first. Add
**geographic marker clustering** to the map page so that when zoomed out, many
mosques in one region collapse into a single cluster badge showing a count, and
as the user zooms in the clusters break apart into sub-clusters and eventually
individual markers. Clicking a cluster should zoom to fit its members. It must
look polished and on-brand, not like a default demo.

The map lives in `js/map.js` (`createShrineMap()`), is driven from `js/app.js`,
and only exists on `index.html` (the detail page `mosque.html` uses a static
Google Maps iframe and needs no changes). There are ~300 mosques and the dense
districts (e.g. Lahore, Gujranwala) overlap heavily at province zoom — that's
the problem to solve.

## Approach: Leaflet.markercluster (CDN, no build step)

Use the standard **Leaflet.markercluster** plugin (v1.5.3). Load it from a CDN
exactly like Leaflet itself is loaded — do **not** add npm/bundler deps; keep
the site build-free.

In `index.html` `<head>`, after the existing Leaflet `<link>`/`<script>` tags
(order matters — the plugin extends `window.L`, so it must load after
`leaflet.js`), add:

```html
<link
  rel="stylesheet"
  href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"
/>
<script
  src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"
  defer
></script>
```

Only load `MarkerCluster.css` (positioning + animation, required). Do **not**
load `MarkerCluster.Default.css` — we'll style clusters ourselves in `style.css`
via a custom `iconCreateFunction` so they match the site's green theme instead
of the default blue.

`unpkg.com` is already in the `<head>` preconnect list, so no new preconnect is
needed.

**Load-order safety:** `js/app.js` (`waitForLibraries()`) currently waits for
`window.L` and `window.Papa`. Extend that guard to also wait for
`typeof window.L.markerClusterGroup === "function"` so there's no race between
the deferred plugin script and the module. Keep the existing timeout behavior.

## Changes in `js/map.js` (`createShrineMap()`)

1. **Replace the plain layer group with a cluster group.** Currently:

   ```js
   const markerLayer = L.layerGroup().addTo(map);
   ```

   Make it an `L.markerClusterGroup(...)`. Read `prefers-reduced-motion` once
   (there's already an `IS_COARSE_POINTER` matchMedia pattern near the top of
   the file you can mirror) and disable animation when it's set. Suggested
   options (tune to taste):

   ```js
   const markerLayer = L.markerClusterGroup({
     maxClusterRadius: 56,          // px; lower = clusters split sooner
     spiderfyOnMaxZoom: true,       // fan out co-located points at max zoom
     showCoverageOnHover: true,     // subtle hull on hover (styled, see below)
     zoomToBoundsOnClick: true,     // click cluster -> zoom to its members
     chunkedLoading: true,          // keep ~300 markers smooth
     removeOutsideVisibleBounds: true,
     animate: !prefersReducedMotion,
     iconCreateFunction: createClusterIcon,
     polygonOptions: {              // the hover coverage hull
       color: "#1f5e56",           // var(--mosque-accent)
       weight: 1.5,
       opacity: 0.5,
       fillColor: "#1f5e56",
       fillOpacity: 0.08,
     },
   }).addTo(map);
   ```

   Also consider `disableClusteringAtZoom` set to roughly `APP_CONFIG.map`'s
   `focusZoom` so that once the user is street-level, every point always shows
   individually. Expose the knobs (`maxClusterRadius`, `disableClusteringAtZoom`)
   through `APP_CONFIG.map` (e.g. a `cluster: { maxRadius, disableAtZoom }`
   block) rather than hardcoding, matching the config-driven convention.

2. **`render(rows)`:** `markerLayer.clearLayers()` still works. Build the markers
   into an array and add them in one bulk call for performance —
   `markerLayer.addLayers(markerArray)` instead of `marker.addTo(markerLayer)`
   per marker (bulk add + `chunkedLoading` is much faster for hundreds of
   points). Keep populating `markersById` exactly as now (selection/focus rely
   on it), and keep the existing per-marker tooltip, hover icon swap, and
   `onSelect(row.id)` click handler.

3. **Custom cluster icon — `createClusterIcon(cluster)`.** Return an
   `L.divIcon` with a size class based on `cluster.getChildCount()` so big
   regions read as bigger badges. Something like:

   ```js
   function createClusterIcon(cluster) {
     const count = cluster.getChildCount();
     const size = count < 10 ? "sm" : count < 50 ? "md" : "lg";
     const dimension = size === "sm" ? 40 : size === "md" ? 48 : 58;
     return L.divIcon({
       html: `<div class="auqaf-cluster auqaf-cluster-${size}"><span>${count}</span></div>`,
       className: "auqaf-cluster-wrap",
       iconSize: [dimension, dimension],
     });
   }
   ```

   (Add a screen-reader label, e.g. `aria-label="${count} mosques"`, on the
   inner div.)

4. **`focusRow(row)` must reveal a clustered marker.** When a point is selected
   from the directory or by deep link, its marker may currently be hidden inside
   a cluster, so flying to its coordinates would land on a cluster badge. Use the
   plugin's `markerLayer.zoomToShowLayer(marker, cb)` to expand/zoom until the
   marker is individually visible, then apply the existing sidebar-offset
   pan/`flyTo` logic (the `getVisiblePanelMetrics()` offset math) inside/after
   the callback. Preserve the current behavior when the marker is already
   un-clustered. Respect `prefers-reduced-motion` (skip the fly animation).

5. **`fitToRows(rows)`:** keep as-is (it fits the data bounds). Optionally use
   `markerLayer.getBounds()` when populated.

6. **`setSelected(nextSelectedId)`:** keep calling `setIcon` on each marker as
   now. Optional polish: after selection changes, call
   `markerLayer.refreshClusters()` and, in `createClusterIcon`, add a class
   (e.g. `auqaf-cluster-has-selected`) when the cluster contains the selected
   marker, so the parent cluster subtly reflects an active child. Only do this if
   it stays smooth.

Keep the returned API (`map, render, setSelected, fitToRows, focusRow,
invalidateSize`) unchanged so `js/app.js` needs no structural changes beyond the
`waitForLibraries` tweak.

## Styling in `style.css`

Add themed cluster styles near the existing marker styles (`.shrine-dot` etc.).
Match the site's system: green accent `var(--mosque-accent)`, the existing
shadow variables, `var(--font-ui)`. Aim for a circular badge with a soft outer
ring/halo, bold white count, gentle hover lift, and clear size tiers. Guidance:

- `.auqaf-cluster`: circular, `background` a subtle green gradient (mirror
  `.mosque-btn-primary`'s `linear-gradient(180deg, #2a7167, var(--mosque-accent))`),
  white bold numerals, centered, `box-shadow` for depth, a translucent white or
  accent ring via `border`/`box-shadow` spread.
- `.auqaf-cluster-sm/md/lg`: increasing diameter and font size.
- Hover: slight `transform: scale(1.06)` + stronger shadow; add a `transition`.
- Wrap `prefers-reduced-motion: reduce` around transitions/animations to disable
  them.
- The plugin's own `.leaflet-cluster-anim .leaflet-marker-icon` transition
  (from `MarkerCluster.css`) handles the split/merge motion; you can leave it or
  lightly tune it. The coverage hull is styled via `polygonOptions` above, not
  CSS.

Make sure clusters visually harmonize with the individual `.shrine-dot` markers
(same green family) so zooming from a cluster into individual pins feels like
one continuous system.

## Cache busting + finishing up

- This touches JS, CSS, and HTML. Bump the `?v=` version query string
  **everywhere** per `CLAUDE.md` "Cache busting": `grep -rn` the current value
  (e.g. `photos-20260625`) across `index.html`, `mosque.html`, all `js/*.js`
  imports, and the `PAGE_VERSION_QUERY` constants, and set them all to a new
  matching value. The service worker only caches Drive/`photos/` assets, so the
  CDN plugin files don't need SW changes.
- Keep the site dependency-free/build-free (CDN `<script>` only, no npm runtime
  dep).

## Manual test checklist (in addition to CLAUDE.md's)

1. Local HTTP server; open the map at the default (province) zoom — dense areas
   show cluster badges with counts, not overlapping pins.
2. Zoom in a few steps — clusters split into smaller clusters, then individual
   markers; zoom back out — they re-merge. Motion is smooth for ~300 points.
3. Click a cluster — the map zooms to fit its members. At max zoom, co-located
   points spiderfy.
4. Open the directory panel and select a mosque inside a dense region — the map
   expands the cluster and focuses the individual marker (with the sidebar
   offset), and the pop-up opens.
5. Deep link `index.html?id=<id>` for a clustered mosque resolves to the
   individual marker.
6. Selected-marker styling still applies once un-clustered; hover tooltips work.
7. `prefers-reduced-motion` disables cluster/fly animations.
8. Cluster badges match the green theme and read clearly on all base layers
   (streets, topo, satellite). No console errors; no broken default-blue styling
   leaking in.

## Summary to report back

Note the final clustering options you chose (`maxClusterRadius`,
`disableClusteringAtZoom`), whether you exposed them via `APP_CONFIG.map`, and
any perf observations with the full ~300-marker dataset.
