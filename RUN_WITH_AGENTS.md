# Kickoff prompt for Claude Code (parallel agents)

Read `CLAUDE.md` first, then read the spec files `CHANGES_PROMPT.md` and
`CLUSTERING_PROMPT.md` in the repo root. Implement everything they describe,
following CLAUDE.md's conventions (dependency-free/build-free, escape
CSV-derived text with `escapeHtml()`, and bump the `?v=` cache-busting version
string everywhere when JS changes).

(If I only want one feature, I'll say so — otherwise do all of it.)

## Work plan

1. Build a task list from the two spec files before writing code.

2. **Parallelize with subagents (Task tool) wherever the work is independent.**
   Launch independent agents in a single message so they run concurrently. Give
   each agent a tight, self-contained brief AND an explicit list of the files it
   is allowed to touch.

   - **Investigation agents (read-only — fully parallel, safe):**
     a. Fetch the published CSV (`APP_CONFIG.dataSource.publishedCsvUrl`), list
        the distinct `Zone` values, and produce the `DISTRICT_NAME_FIXES`
        correction map (misspelling → canonical Punjab district).
     b. Probe the Drive/Apps Script listing to determine whether `_I_`/`_O_`
        inside/outside files actually exist for sample mosques — i.e. decide if
        the "only main photo shows" issue is a code fix or a content gap.
     c. Confirm the Leaflet.markercluster v1.5.3 CDN URLs and the API used
        (`markerClusterGroup`, `zoomToShowLayer`, `refreshClusters`).

   - **Isolated implementation agents (parallel — these file sets don't
     overlap):**
     a. CI photo sync: create `scripts/sync-photos.mjs` + `.github/workflows/
        sync-photos.yml`.
     b. Detail-page edits confined to `js/mosque.js`.
     c. `DISTRICT_NAME_FIXES` + `applyDistrictNameFix()` in `js/data.js`.
     d. Docs: `README.md` and `PROJECT_HANDOFF.md`.

3. **Coordinate shared files single-threaded.** `js/config.js`, `js/app.js`,
   `index.html`, `style.css`, `js/drive-photos.js`, and `js/sw.js` are each
   touched by more than one feature. Never let two concurrent agents edit the
   same file. Either assign one agent to own each shared file and apply all of
   that file's pending edits in one pass, or make those edits yourself
   sequentially after the parallel agents report back.

4. **Integration pass (single-threaded, do last):** bump the `?v=` version
   query string everywhere (`grep -rn` the current value, set them all to a new
   matching value), bump the `sw.js` cache name if caching behavior changed,
   then run the manual test checklists from `CLAUDE.md` and each spec via a local
   HTTP server.

5. **Verify with a fresh subagent:** have it code-review the full diff and run
   the checklists (map renders + clusters split/merge on zoom, pop-up trimmed
   correctly, detail-page gallery shows inside/outside, no console errors, every
   `?v=` matches). Fix anything it flags.

## Rules for subagents

- Investigation agents are read-only; implementation agents get a fixed,
  non-overlapping file allowlist.
- No file may be assigned to two agents running at the same time.
- Each agent returns a short summary; you consolidate.

## Final report

District fixes applied; whether inside/outside photos were a code fix or a
content gap; clustering options chosen (`maxClusterRadius`,
`disableClusteringAtZoom`); final `photos/` folder size; and the version string
you set.
