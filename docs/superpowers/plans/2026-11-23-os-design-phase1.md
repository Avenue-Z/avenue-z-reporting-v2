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

- Every task is its own feature branch off `dev` and its own PR, mergeable in any order once its prerequisites have
  merged. No PR is built on another open PR (no stacking).
- Prerequisites, all already open as standalone PRs: the kit (#486) for every task; the line chart options (#488) for
  tasks 3, 4 and 6; the AEO `design` key (#489) for task 10.
- A new version only. The old version's file, its golden and its tests stay untouched.
- Numbers unchanged: same getters, same requests, same locked months, same strings, proven by a value-equality test
  (Task 1) for every new version.
- Empty and error states kept: `NoData`, `ytd-failure`, the per-part `Suspense` fallback and `safe()`.
- Files only under `components/report-sections/organic-social/`, except the line chart options (#488, already open).
- Standard gates on each PR: `npx tsc --noEmit`, `npm test`, `npm run lint` on changed files, `npm run check:rsc`.
- Controls the artifact has no equivalent for (KPI rings, annotations and chart notes, channel toggles, the Top Content
  sort toolbar, the owned or influencer designation) keep how they work and take only the kit's colours, borders and
  pill and button styles (decision (d)).

## Pinning (spec section 6)

- **Staging:** APFM is pinned to each new version as its PR lands, by a guarded script on my go, so Jasmine sees the work
  as it goes.
- **Production:** a client is pinned only once every part on its tabs has a new version, all at once, by a guarded
  script on my written go (dry run, client-only check, rollback, read-back).
- No `section_templates` change: every task reuses an existing part id. Never run `scripts/seed.ts`.

## Review Focus

- **The kit's colour variables.** The kit reads its colours from `.root` (`design/kit.module.css`, the variables block at
  the top). Every new version wraps its own output in an element carrying `.root`, so it never depends on a page wrapper.
- **Visible strings the kit changes.** The kit's `Change` shows "n/a" and has no tooltip; the shared tile shows a greyed
  dash with "vs prior period" and a hover tooltip (`components/charts/kpi-card.tsx:49`, `:73`). Task 2 adds both to the
  kit, so no tile's text changes.
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
- Produces: `visibleValues(container: HTMLElement): string[]`, the rendered text of every number, label, legend entry,
  axis tick and `aria-label`, in document order, whitespace collapsed, with markup and class names ignored.
  `expectSameValues(oldEl: HTMLElement, newEl: HTMLElement): void` asserts the two lists are equal.

- [ ] **Step 1:** Tests: the same text in different markup is equal; a changed number or label fails with the
  differing entries named; `aria-label`s count.
- [ ] **Step 2:** Implement, run, commit `test(organic-social): a value-equality helper for new part versions`.

### Task 2: Kit tile options, and `platform-headlines@4` and `@5`

**Files:** Modify `design/charts.tsx` (`Kpi`, `Change`) and `design/kit.module.css`; create `parts/outline-data-kit.tsx`;
register both versions in `parts/registry.ts`; test `parts/outline-data-kit.test.tsx`.

**Interfaces:**
- Produces: `Kpi` gains optional `tooltip?: string` (rendered with `HoverHint`, `components/charts/hover-hint.tsx`) and
  `noPrior?: string`, the text shown instead of "n/a" when the change is null. Both absent: Social Listening renders
  exactly as before (its Phase 0 snapshots must not change).
- `platform-headlines@4` draws what `@2` draws (`parts/outline-data.tsx`), `@5` what `@3` draws, with the kit's tiles.

- [ ] **Step 1:** Failing tests: `expectSameValues` between `@2` and `@4`, and `@3` and `@5`, on the shared fixture
  (`parts/__fixtures__/organic-social-ctx.ts`, `parts/__mocks__/headlines.ts`); tooltips present; the no-prior text equals
  the old tile's.
- [ ] **Step 2:** Implement, run, confirm the Social Listening snapshots are unchanged, gates, commit.

### Task 3: `follower-graph@3`

Draws what `@2` draws (`parts/follower-graph.tsx`), in a kit card, through the shared `LineChart` with `shaded` and
`frameless` (#488). Annotations, chart notes and channel toggles work as in `@2` (decision (d)).

- [ ] Failing tests: `expectSameValues` against `@2`, with annotations and notes on the fixture; the chart is shaded and
  frameless; the client view has no note controls. Implement, gates, commit.

### Task 4: `engagement-trend@3`

As Task 3, from `@2` (`parts/engagement-trend.tsx`).

### Task 5: `engagement-breakdown@2`

Draws what `@1` draws (`parts/engagement-breakdown.tsx`), with the kit's tiles from Task 2.

### Task 6: `ytd-review@5`

Draws what `@2` draws (`parts/ytd-review-sheet.tsx`). The columns use a new count-based column chart in the kit
(the kit's `YtdColumns` is sentiment-only, spec section 3); the line uses the shared `LineChart`, shaded and frameless
(decision 2, hybrid). Keeps `ytd-failure` and the year-to-date notes.

### Task 7: `top-content@4`

Draws what `@3` draws (`parts/top-content-outline.tsx`) with the kit's post card frame and pill styles. The sort toolbar
and the owned or influencer designation keep how they work (decision (d)).

### Task 8: `influencer-posts@2`

Draws what `@1` draws (`parts/influencer-posts.tsx`), with the kit's tiles and the Task 7 card frame.

### Task 9: `kpi-check-in@2`

Draws what `@1` draws (`parts/kpi-check-in.tsx`) inside a kit card. The rings keep their look and colours (decision (d);
the artifact has no rings). The start line and staff notes behave as in `@1`.

### Task 10: AEO Informed Social with `design: "kit"`

Not on the parts system (`organic-social/index.tsx:107`), so it is gated by the setting key from #489. With
`design: "kit"` the tab draws its tiles with the kit and its graphs (Recharts directly, `aeo-informed/graphs.tsx:8`) with
the same fill and no inner box. Without it, the tab renders exactly as today (a byte-for-byte test, like Phase 0's).

### Later, in the Renaissance step (not in this plan's batch)

The template defaults every client's Overview renders and Renaissance's platform tabs use: `platform-headlines@1`,
`top-content@2`, `engagement-trend@1`, plus Renaissance's `ytd-review@4`. Planned once the tasks above are on staging
and Jasmine has seen them, with a read-only before and after capture of Renaissance's numbers.
