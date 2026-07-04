# Prompt for Claude Code — visual design improvements

Paste everything below into Claude Code from the project root.

---

Read `CLAUDE.md` first, then read `DESIGN_CRITIQUE.md` in the repo root — it
contains the full critique and a prioritized plan. Implement **Priority 1 and
Priority 2** from that plan, plus the trivial Priority 3 cleanup (merge the
duplicate `.mosque-gallery-media` rule). Follow CLAUDE.md's conventions:
dependency-free/build-free, keep the text-first render and full
`prefers-reduced-motion` coverage, and bump the `?v=cluster-20260701` version
string everywhere when any JS changes (grep the current value; set them all to a
new matching value like `design-20260701`).

Almost all of this is CSS in the single `style.css` file, so **do not run
multiple agents that edit `style.css` at the same time** — they will clobber
each other. Use parallelism only as described below. When editing, locate code
by **CSS selector / function name**, not by the line numbers in the critique
(they shift as you edit).

## Git workflow — do all of this on a new branch

Before making any changes, create and switch to a new branch off the current
one — do **not** commit to `main`:

```bash
git switch -c design-polish
```

Commit in logical chunks as you go (e.g. one commit for the type scale, one for
the contrast fix, one for tokens, one for icons) with clear messages. Keep
everything on `design-polish`. At the end, push the branch and open a PR (if a
remote + `gh` are available) so the work can be reviewed before it reaches
`main`; otherwise leave the branch ready with a clean `git status` and tell me
the branch name and how to review/merge it. If any subagents run in isolated
worktrees, make sure their commits land on this same branch.

## Phase A — parallel read-only audit agents (safe, no file writes)

Launch these together (Task tool, one message). Each returns a spec; you
consolidate before editing anything:

1. **Type-scale inventory.** Find every font-size declaration involved in the
   detail-page hierarchy and its responsive echoes (`.mosque-title`,
   `.mosque-title-compact`, `.mosque-lede`, `.mosque-section-heading h2`,
   `.mosque-sidebar-card h3`, plus the `@media (max-width:1024px|720px)`
   overrides). Return the current → proposed values (targets below).
2. **Spacing/units inventory.** List every ad-hoc px spacing value and every
   px font-size on the map/sidebar side (`style.css` ~lines 149–556 region), and
   propose (a) an 8px-based spacing token set and (b) px→rem conversions.
3. **Contrast + token audit.** Confirm `.mosque-fact dt` `#6a7b8e` is below
   4.5:1 and propose the replacement (`#647084` token or a dedicated `--label`).
   Draft the consolidated shared token set (accent, muted, border, shadow scale,
   radius scale, spacing scale) that both `:root` and `.mosque-body` can share.
4. **Icon set.** Produce a small, consistent inline-SVG icon set matching the
   existing chevron/arrow style (data-URI or inline `<svg>`): location pin,
   person/imam, calendar/built, women's-section, directions. Return ready-to-use
   markup + the CSS needed to size/tint them with `currentColor`.

## Phase B — implementation (coordinated)

Do the CSS in **one pass by a single owner of `style.css`**. The two small JS
edits touch different files (`js/app.js` and `js/mosque.js`) and may be done as
separate tasks, but they must not edit `style.css` concurrently with the CSS
owner — sequence them after the CSS structural work, or have the CSS owner add
all icon/style hooks first.

### Priority 1
- **Rebalance detail type scale** (use Phase A #1's spec). Targets:
  `.mosque-title` `4.4rem` → ~`3.2rem`; `.mosque-title-compact` `3rem` →
  ~`2.4rem`; `.mosque-section-heading h2` / `.mosque-sidebar-card h3` `2.45rem`
  → ~`2rem`; `.mosque-lede` `1.12rem` → ~`1.05rem`. Scale the `1024px`/`720px`
  overrides proportionally so mobile stays balanced.
- **Fix label contrast**: `.mosque-fact dt` `#6a7b8e` → `#647084` (or a
  `--label` token that clears 4.5:1). Re-verify the computed ratio.
- **Pop-up title underline**: make `.details-title-link` underline on
  hover/focus only (keep bold + color for affordance). Check `renderDetails()`
  in `js/app.js` doesn't depend on the underline.

### Priority 2
- **Unify tokens + 8px spacing scale** (Phase A #2/#3). Introduce one shared set
  and replace ad-hoc spacing. ⚠️ This is the riskiest change in a 1611-line file
  shared by two pages — do it incrementally and verify the map page AND detail
  page after each group. **Decision rule:** if you can't confirm no visual
  regressions, keep the two token sets as-is but still add the new
  spacing/radius tokens and the contrast fix — don't ship a half-migrated,
  drifting system.
- **Icon set** (Phase A #4): add icons to the fact list (`renderFactRows()` in
  `js/mosque.js`), the coordinate/address cards, and the action buttons; and to
  the map pop-up fact rows (`appendTextRow()` in `js/app.js`) if it reads well.
  Keep them decorative (`aria-hidden`) since each has a text label.
- **px → rem** for the map/sidebar type (Phase A #2).
- **Radius hierarchy**: controls ~6px, cards ~10–12px, media ~12px (via tokens),
  instead of a flat 8px everywhere.

### Priority 3 (quick)
- Merge the duplicate `.mosque-gallery-media` rule.

## Verification
- Serve locally (`python3 -m http.server 8765`) and check **both** pages: map +
  pop-up, and a detail page. Confirm type hierarchy reads better, labels are
  legible, icons align, nothing shifted or regressed, reduced-motion still
  disables animation, and no console errors.
- If you have browser/screenshot tooling, capture before/after of both pages.
- Spawn **one fresh review subagent** to diff the change, re-check the contrast
  math, and run an accessibility pass; fix what it flags.
- Confirm every `?v=` string matches after JS edits.

## Report
Summarize: the branch name, final type-scale values, whether the token
unification shipped or was deferred (and why), the contrast ratio after the
label fix, the icons added, and the PR link (or how to review/merge the branch).
