# Organic Social design overhaul, Phase 1: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

Author: Thomas Chang. "I", "me" and "my" in this doc mean me.

**Goal:** Give the Organic Social tabs the Social Listening look, one new part version at a time, with every number
unchanged and no client seeing it until they are pinned.

**Architecture:** Each task is a new version of one part (for example `top-content@4`), added beside the old version in
`components/report-sections/organic-social/parts/registry.ts`, with the old version's file left untouched
(`components/report-sections/peec-ai/MAINTAINING.md`). A new version draws with the design kit
(`components/report-sections/organic-social/design/`, from Phase 0) and the shared line chart's `shaded` and `frameless`
options. A client gets it only when its `report_section_config[<key>].versions` pins it (`lib/report-sections/resolve.ts:44`).

**Tech Stack:** Next.js 16, React 19, Recharts 3.7, CSS modules, Vitest with jsdom.

**Spec:** `docs/superpowers/specs/2026-11-23-organic-social-design-overhaul.md` (approved in #484), sections 6 to 8, with
decisions 2, 5, (b), (d) and (f) as recommended there and in the #484 decisions comment.

## Global Constraints

- Every task is its own feature branch off `dev` and its own PR. No PR is built on another open PR (no stacking): a task
  starts only once everything it needs has merged to `dev`, then branches from the updated `dev`.
- **The order** (a task waits for every task named before its arrow):
  - #486 (the kit) before every task. #488 (line chart options) before Tasks 3, 4 and 6. #489 (the AEO `design` key,
    merged) before Task 10.
  - Task 1 (the parity helper) before Tasks 2 to 10: they all use it.
  - Task 2 (kit tiles) before Tasks 5, 8 and 10: their tiles need its options. Task 10's tiles use the tooltip and the
    "vs prior period" change line (`aeo-informed/tiles.tsx:31-36`).
  - Task 3 before Task 4: both draw through `ChannelTrendChart` (`trends.tsx:46`), and Task 3 adds its options.
  - Task 7 (the kit post card) before Task 8: the influencer cards are built on `post-card.tsx`.
  - Tasks 6 and 9 need only Task 1 (and #488 for Task 6).
- A new version only. The old version's file and golden stay untouched. Two shared tests change by one line or entry per
  new version, as they must: the `platform-headlines` version list (`parts/outline-parts.test.tsx:53`) and the export
  layout, where every registered `id@version` needs an entry, `own` or `block` (`parts/export-layout.ts:5-22`,
  checked by `parts/export-layout.test.ts:10`). Each task names both.
- Numbers unchanged: same getters, same requests, same locked months, same strings, proven by a value-equality test
  (Task 1) for every new version.
- Empty and error states kept: `NoData`, `ytd-failure`, the per-part `Suspense` fallback and `safe()`.
- Files only under `components/report-sections/organic-social/`, except the line chart options (#488, already open).
- Standard gates on each PR: `npx tsc --noEmit`, `npm test`, `npm run lint` on changed files, `npm run check:rsc`, and the
  per-PR review record (`docs/qa/<feature>-code-review.md`, spec section 6).
- Controls the artifact has no equivalent for (KPI rings, annotations and chart notes, channel toggles, the Top Content
  sort toolbar, the owned or influencer designation) keep how they work and take only the kit's colours, borders and
  pill and button styles (decision (d)).

## Pinning (spec section 6)

- **Staging:** APFM is pinned to each new version as its PR lands, by a guarded script on my go, so Jasmine sees the work
  as it goes.
- **Production:** a client is pinned only once every part on the tabs it shows has a new version, all at once, so no
  tab is half old and half new. Read-only check (2026-11-23): Akara Living, Joy of Life, PIMCO and Piper Aircraft hide
  Overview, so this batch covers every part on their tabs. APFM shows Overview, so Overview's three template parts are in
  this batch too (Tasks 2, 4 and 7). Renaissance shows Overview and also pins `ytd-review@4`, so it waits for the
  Renaissance step.
- **Who runs it:** each production write is a guarded script (dry run, client-only check, rollback, read-back), run by me
  or by the Claude Code session I am working in, only on my written go. The AEO Informed Social key
  (`aeoInformedSocial.design`) is written the same way, and only once #489 has reached `main`.
- No `section_templates` change: every task reuses an existing part id. Never run `scripts/seed.ts`.

## Review Focus

- **The kit's colour variables.** The kit reads its colours from `.root` (`design/kit.module.css`, the variables block at
  the top). Every new version wraps its own output in an element carrying `.root`, so it never depends on a page wrapper.
- **Visible strings the kit changes.** Four differences, all closed by Task 2 so no tile's text changes:
  - the shared tile has a hover tooltip (`components/charts/kpi-card.tsx:49`);
  - with no prior it shows a greyed dash and "vs prior period" (`:73`), where the kit's `Change` shows "n/a";
  - a zero change reads "0% vs prior period" after a dash glyph (`:67`), where the kit's has no dash;
  - a tile with no change line today (an unavailable tile, `outline-tiles.tsx:23`; the Influencer totals,
    `parts/influencer-posts.tsx:51-54`) would gain one, because the kit's `Kpi` always renders `Change`
    (`design/charts.tsx`).
- **The PDF export.** Each card stays one `data-export-block`; the line chart's fill does not animate in the export
  (#488).
- **The client view.** No staff control (chart note forms, designation toggles, hide buttons) renders for a client,
  exactly as in the old version.
- **A month with no data.** Each new version renders the same `NoData` text the old version does, never a blank card.

---

### Task 1: The value-equality test helper

**Files:**
- Create: `components/report-sections/organic-social/parts/version-parity.ts` (test-only helper)
- Test: `components/report-sections/organic-social/parts/version-parity.test.ts`

**Interfaces:**
- Produces: `visibleValues(container: HTMLElement): string[]`: for every element in document order, its own text (its
  direct text nodes, whitespace collapsed), then its `aria-label` and `title`. Own text, not leaf text: a tooltip span
  holds its definition beside a child arrow element, so a leaf-only rule misses every tooltip (measured in the trial
  below). `expectSameValues(oldEl: HTMLElement, newEl: HTMLElement): void` asserts the two lists are equal, and fails
  when either list is empty or contains only a fallback ("Couldn't load this section.", `NoData`'s text).

**How every parity test is written** (Tasks 2 to 10):
- **Render the real section, awaited, with non-empty data**, as `parts/outline-parts.test.tsx:62` does, never the part's
  Suspense fallback. Feed every getter the section calls: the Instagram Data block also reads the media request, and
  without it the block shows its error card (`selectOutlineRows`, `lib/organic-social/outline-headlines.ts`).
- **Vary the data:** a normal change, a zero change, a missing prior and an unavailable tile.
- **Three viewers:** staff (`INTERNAL_ADMIN`), client (`CLIENT_VIEWER`, the shared fixture's role,
  `parts/__fixtures__/organic-social-ctx.ts:9`) and the PDF export (`ExportModeProvider`).
- **Charts:** mock `ResponsiveContainer` to a fixed size (as `v1-render.golden.test.tsx:12`), or Recharts draws nothing in
  jsdom. Plotted values are geometry, not text, so also record the `data` and `yKeys` handed to the chart with a
  pass-through recorder (as `components/charts/line-chart.test.tsx:15` records `Line`) and assert they are equal.

**Trial (2026-11-23, throwaway, deleted):** `platform-headlines@2`'s Data block rendered with varied mocked data gave 36
values per view (titles, tooltip definitions, numbers, change lines, including the dash glyph before "0% vs prior period" and
before "vs prior period"), the same for staff, client and export, and a changed number was caught. With the media request unfed, every
view gave only "Couldn't load this section.", which a plain equality check would pass.

- [ ] **Step 1:** Tests: the same text in different markup is equal; a changed number, label or tooltip fails with the
  differing entries named; `aria-label`s count; an empty list or a fallback-only list fails.
- [ ] **Step 2:** Implement, run, commit `test(organic-social): a value-equality helper for new part versions`.

### Task 2: Kit tile options, and `platform-headlines@4`, `@5` and `@6`

**Files:** Modify `design/charts.tsx` (`Kpi`, `Change`) and `design/kit.module.css`; create `parts/outline-data-kit.tsx`
and `parts/platform-headlines-kit.tsx`; register the three versions in `parts/registry.ts`; update
`parts/outline-parts.test.tsx:53` and `parts/export-layout.ts` (all three `own`, like `@1` to `@3`); tests
`parts/outline-data-kit.test.tsx`, `parts/platform-headlines-kit.test.tsx`.

**Interfaces:**
- Produces: `Kpi` gains optional `tooltip?: string` (rendered with `HoverHint`, `components/charts/hover-hint.tsx`),
  `noPrior?: string` (the text shown instead of "n/a" when the change is null), `zeroDash?: boolean` (a zero change gets the same
  dash glyph before "0%" that `kpi-card.tsx:67` draws) and `noChange?: boolean` (no change line at all). All absent: Social Listening
  renders exactly as before, and its Phase 0 snapshots must not change.
- `platform-headlines@6` draws what `@1` draws (`parts/platform-headlines.tsx`, `headlinesV1`) with the kit's tiles: the
  Overview tiles, and Renaissance's platform tiles.
- `platform-headlines@4` draws what `@2` draws (`parts/outline-data.tsx`), `@5` what `@3` draws. Where `@2` and `@3` fall
  back to the v1 tiles, on Overview and on a channel no outline covers such as Piper's X (`outline-data.tsx:50-51`),
  `@4` and `@5` fall back to `@6`'s kit tiles, so no tab shows old-look tiles.

- [ ] **Step 1:** Failing tests: `expectSameValues` between `@1` and `@6`, `@2` and `@4`, `@3` and `@5`, written as
  Task 1 says, covering the fallback branch (Overview and an uncovered channel); the tooltip, no-prior, zero and
  unavailable texts equal the old tiles'.
- [ ] **Step 2:** Implement, run, confirm the Social Listening snapshots are unchanged, gates, commit.

### Task 3: `follower-graph@3`

Draws what `@2` draws (`parts/follower-graph.tsx`), in a kit card, with the line chart shaded and frameless (#488).
Annotations, chart notes and channel toggles work as in `@2` (decision (d)).

**How the options reach the chart:** `follower-graph` draws through `ChannelTrendChart` (`trends.tsx:46`), which calls
the shared `LineChart` without them (`:229`, `:277`) and is shared with `@1`, `@2`, `engagement-trend` and Renaissance's
`v1-render.golden.test.tsx`. So `ChannelTrendChart` gains the same two additive, default-off props, `shaded` and
`frameless`, passed through to `LineChart`. Not a fork. Every existing caller passes neither, and
`v1-render.golden.test.tsx` and the trends tests must stay byte-identical.

**Files:** `trends.tsx` (the two props), `parts/follower-graph.tsx` (the new version beside `@2`), `parts/registry.ts`,
`parts/export-layout.ts` (`follower-graph@3`: `own`), tests.

- [ ] Failing tests: `expectSameValues` against `@2`, written as Task 1 says, with annotations and notes on the fixture;
  the chart is shaded and frameless; the client view has no note controls; `ChannelTrendChart` without the props renders
  as before. Implement, gates, commit.

### Task 4: `engagement-trend@3` and `@4`

As Task 3, after it: `@3` from `@2` (the platform tabs) and `@4` from `@1` (Overview's template part,
`template.ts:5-9`), both in `parts/engagement-trend.tsx`, using `ChannelTrendChart`'s props from Task 3. Export layout:
both `own`.

### Task 5: `engagement-breakdown@2`

Draws what `@1` draws (`parts/engagement-breakdown.tsx`), with the kit's tiles from Task 2. Export layout: `block`,
like `@1`.

### Task 6: `ytd-review@5`

Draws what `@2` draws (`parts/ytd-review-sheet.tsx`). The columns use a new count-based column chart in the kit
(the kit's `YtdColumns` is sentiment-only, spec section 3); the line uses the shared `LineChart`, shaded and frameless
(decision 2, hybrid). Keeps `ytd-failure` and the year-to-date notes. It edits the kit (`design/charts.tsx`), so the
Social Listening snapshots must stay unchanged.

**What its parity test compares:** the axis ticks differ by design (the kit draws its own, Recharts draws its own), so
they are left out. Compared: each card's title, the values handed to each chart (the recorder), the notes, and the
column values as rendered labels. Export layout: `own`, like `@2`.

### Task 7: `top-content@4` and `@5`

`@4` draws what `@3` draws (`parts/top-content-outline.tsx`); `@5` what `@2` draws (`parts/top-content.tsx`, Overview's
template part and Renaissance's platform part). Both use the kit's post card frame and pill styles. The sort toolbar
and the owned or influencer designation keep how they work (decision (d)). Export layout: both `own`.

### Task 8: `influencer-posts@2`

Draws what `@1` draws (`parts/influencer-posts.tsx`), with the kit's tiles (the totals use `noChange`, as today they
have no change line) and the Task 7 card frame. Export layout: `own`.

### Task 9: `kpi-check-in@2`

Draws what `@1` draws (`parts/kpi-check-in.tsx`) inside a kit card. The rings keep their look and colours (decision (d);
the artifact has no rings). The start line and staff notes behave as in `@1`. Export layout: `own`.

### Task 10: AEO Informed Social with `design: "kit"`

Not on the parts system (`organic-social/index.tsx:107`), so it is gated by the setting key from #489. With
`design: "kit"` the tab draws its tiles with the kit and its graphs (Recharts directly, `aeo-informed/graphs.tsx:8`) with
the same fill and no inner box. Without it, the tab renders exactly as today (a byte-for-byte test, like Phase 0's).
With it, `expectSameValues` between today's tab and `design: "kit"`, written as Task 1 says (with the
`ResponsiveContainer` mock and the chart-data recorder).

### Later, in the Renaissance step (not in this plan's batch)

Renaissance's `ytd-review@4` (a new `@6`), and pinning Renaissance itself, once the tasks above are on staging and
Jasmine has seen them, with a read-only before and after capture of Renaissance's numbers. Overview's template parts
are no longer here: they moved into Tasks 2, 4 and 7.

`follower-graph@1` is the platform template's default (`template.ts:24`), but no production client renders it: all six
pin `follower-graph@2` on their platform tabs (read-only, 2026-11-23), and Overview has no follower graph
(`template.ts:5-9`). So it gets no new version unless a client without that pin appears.
