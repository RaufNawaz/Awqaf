# Design Critique: Auqaf Directory (map page + mosque detail page)

Context: civic/reference tool for the Punjab Auqaf department — an interactive
Leaflet map + directory (`index.html`) and per-mosque detail pages
(`mosque.html`). Stage: post-polish "final" version (commit `fae8e41`). This
critique is grounded in the actual `style.css` (1611 lines) and the render
structure in `js/app.js` / `js/mosque.js`. Contrast ratios below were computed
with the WCAG relative-luminance formula, not estimated.

## Overall impression

Polished and coherent — a modern, map-forward civic tool with a restrained
teal identity, a floating translucent panel, and tasteful motion. It doesn't
need rescuing. The biggest single opportunity is **tone alignment**: the detail
page wears a magazine-scale editorial hero (a 70px title) on top of
database-style fact lists, so the top of the page and the body feel like two
different products. Most other items are small consistency and accessibility
refinements.

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| Detail hero title is `4.4rem` (~70px); on a laptop the fold is mostly one mosque name, pushing the actual facts/photos far down. | 🟡 Moderate | Drop to ~`3.2rem` (and section headings `2.45rem` → ~`2rem`). Gets content up-page and reads more "official reference" than "magazine." |
| Map pop-up title is a bold **underlined** link colored `inherit` (dark). Underline is the only affordance, and a persistent underline on a 22px display title reads as heavy. | 🟡 Moderate | Remove the persistent underline; underline on hover/focus only. Optionally make the whole pop-up header row the click target to the detail page. |
| Directory list rows are ~38px tall (`padding: 10px 12px`, 13px text). Fine with a mouse, tight on touch. | 🟢 Minor | Raise to ~44px min-height on coarse pointers for comfortable tapping. |
| Empty pop-up state is a single line of muted text ("No mosque selected yet…"). | 🟢 Minor | Add a small pin/search glyph + a one-line hint pointing at the "Auqaf Directory" button, so the resting state guides first-time users. |

## Visual hierarchy

- **What draws the eye first (detail page):** the giant title — correct target,
  but overpowering relative to everything beneath it. The `2.45rem` section
  headings and `4.4rem` hero create a very large jump with little in between;
  the mid-scale (subheads, labels) is thin, so hierarchy is "huge → small" with
  a gap in the middle.
- **What draws the eye first (map page):** the map itself, then the floating
  panel — good for a map tool. The directory button competes politely from the
  top-left. This surface's hierarchy is well judged.
- **Emphasis:** the teal accent is used consistently for eyebrow/links/active
  states; the orange selected-marker is a smart complementary highlight. Good.
- **Fact lists** are text-only label/value stacks. They're readable but visually
  flat — nothing helps the eye jump to "Imam" vs "Built" vs "District."

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Design tokens | Two parallel systems: `:root` (map) and `.mosque-body` (detail) with separate `--shadow`/`--border`/muted values. Accent was unified (good) but shadows/borders still drift. | Consolidate to one shared token set (accent, muted, border, shadow scale) so the two pages can't diverge over time. |
| Units | Map-page/sidebar type is in **px** (12–25px); detail page is in **rem**. px text ignores the user's browser font-size setting. | Move to `rem` everywhere for consistency + user-scaling. |
| Spacing | Ad hoc values (11/12/14/18/20/22/24/26/28/34/36/42/44px). No base grid. | Adopt an 8px-based scale (4/8/12/16/24/32/40) as spacing tokens; snap paddings/margins to it for rhythm. |
| Radius | Everything is `8px` — tiny buttons, big cards, images, tooltips. Uniform, but flattens hierarchy. | Introduce a light scale: controls ~6px, cards ~10–12px, media ~12px. |
| CSS hygiene | `.mosque-gallery-media` is declared twice (lines 1374 and 1379); `appendLinkRow()`/`appendPhotosRow()` remain defined but unused. | Merge the duplicate rule; leave the dead JS or prune it in a cleanup pass. |

## Accessibility

Computed contrast (sRGB, on white unless noted):

- **Fact labels `.mosque-fact dt` `#6a7b8e` = 4.34:1** at ~13px → **fails** AA
  (needs 4.5:1 for text under 18.66px). 🔴 The one clear miss.
- Muted body `--muted #647084` = **5.0:1** → passes AA. ✅
- Accent `--accent #0f766e` = **5.48:1** → passes AA for links/eyebrow. ✅
  (Keep `--accent-strong #0b4f4a` for hover/small text to stay comfortable.)
- Link `--link #0b5f86` ≈ **5.9:1** → passes. ✅
- Cluster badge: white on teal gradient → high contrast. ✅

Recommendation: bump the fact-label color to the muted token (`#647084`, 5:1)
or a slightly darker label gray so every label clears 4.5:1.

- **Touch targets:** controls are good — zoom `40px`, toolbar `44px`, section
  tabs `48px`, buttons `50px`, coarse-pointer marker hit `34px`. Only the
  directory list rows (~38px) are a bit small (see Usability).
- **Focus states:** a global `:focus-visible` teal ring exists — good and often
  missing on sites like this. Keep it.
- **Motion:** thorough `prefers-reduced-motion` coverage. Excellent.

## What works well

- Cohesive teal civic palette with a well-chosen complementary orange for the
  selected marker; the single unified accent across both pages is a real
  strength.
- Performance-minded UI: placeholder gradient tones reserve image boxes so rows
  don't jump; text-first render. This is quietly excellent.
- Motion is considered and fully reduced-motion-safe (staggered list entrances,
  selected-marker pulse, scroll reveals).
- The floating, blurred map panel and the size-graded `.auqaf-cluster` badges
  look genuinely professional.
- Consistent shadow language and a global focus ring show attention to detail.

## Priority recommendations (the plan)

### Priority 1 — highest impact, low effort
1. **Rebalance the detail-page type scale.** `.mosque-title` `4.4rem` → ~`3.2rem`
   (compact `3rem` → ~`2.4rem`); `.mosque-section-heading h2` / sidebar `h3`
   `2.45rem` → ~`2rem`; nudge `.mosque-lede` `1.12rem` → ~`1.05rem`. Aligns the
   editorial hero with the reference-grade body and lifts content up-page.
   *(style.css ~941, 951, 965, 1045, 1163; responsive echoes at 1535, 1573.)*
2. **Fix the failing label contrast.** `.mosque-fact dt` `#6a7b8e` → `#647084`
   (or a dedicated `--label` token) to clear 4.5:1. *(style.css ~1185.)*
3. **De-emphasize the pop-up title underline.** Underline on hover/focus only;
   keep bold + accent for affordance. *(`.details-title-link`, style.css ~200;
   `renderDetails()` in js/app.js.)*

### Priority 2 — medium effort, strong polish
4. **Unify tokens + adopt an 8px spacing scale.** One shared set for
   accent/muted/border/shadow/radius/space; replace ad hoc px spacing with
   tokens. Reduces drift and tightens vertical rhythm. *(style.css `:root` ~1
   and `.mosque-body` ~801.)*
5. **Add a light, consistent icon set** to the fact list, coordinate card, and
   buttons (pin, person/imam, calendar/built, women's-section, directions).
   Inline SVGs matching the existing chevron style — no new dependency. Makes
   the utilitarian data scannable. *(`renderFactRows()` / location tools in
   js/mosque.js; `appendTextRow()` in js/app.js.)*
6. **Move sidebar/map type from px → rem** for user font-scaling and unit
   consistency. *(style.css ~149–556.)*
7. **Radius hierarchy** (controls 6px / cards 10–12px / media 12px) instead of a
   flat 8px everywhere.

### Priority 3 — nice-to-have
8. **Pop-up empty state**: small glyph + hint toward the directory button.
9. **Trim motion for repeat use**: shorten a few durations / stagger delays so
   the tool feels instant on the 2nd+ visit. *(nth-child delays ~1421–1439;
   fade-up durations 620–760ms.)*
10. **Cleanup**: merge the duplicate `.mosque-gallery-media` rule; decide whether
    to prune the now-unused `appendLinkRow`/`appendPhotosRow`.
11. **Directory rows → ~44px** min-height on coarse pointers.

### Guardrails
Any change is CSS/markup only, must stay dependency-free/build-free, keep the
text-first + reduced-motion patterns, and **bump the `?v=cluster-20260701`
version string everywhere** if JS changes (see CLAUDE.md "Cache busting").
