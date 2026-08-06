# Paid Media Overview — UI Iteration (by-channel restyle, blended trend, tooltip fix) — Design

**Status:** design for approval
**Branch:** `feat/paid-media-blended-leads` (same branch as PR #204 — this iterates the Overview UI)
**Author:** Paul (with Claude)
**Date:** 2026-08-06

## 1. Motivation

Three refinements to the Paid Media Overview shipped in PR #204:

1. **By-channel breakdown reads as a raw table.** Restyle it to match the
   organic-social pattern (per-channel sections of KPI cards), which is the
   house style elsewhere in the app.
2. **No graph.** Add a blended trend chart so the Overview shows movement over
   time, not just point-in-time totals.
3. **Tooltip bug (client-facing).** The `?` tooltip on the Overview's Clicks
   tile opens upward into the sticky page header and is occluded by it —
   illegible.

## 2. Scope

**In scope (same PR #204 branch):**
- **A.** By-channel breakdown → per-channel KPI-card sections (organic-social style), replacing the `<table>`.
- **B.** Blended **trend chart**: stacked area by channel, with a **Spend / Clicks** toggle.
- **C.** Tooltip z-index fix so `KpiCard` tooltips render above the sticky header.

**Out of scope / non-goals:**
- A Leads trend view (toggle is Spend + Clicks only; Leads stays on the tiles/cards).
- Daily granularity on the chart (weekly ISO buckets — see §3B).
- Changing the blended KPI tiles or the rollup logic from PR #204. (Note: the rollup
  *was* subsequently changed on this branch to exclude Meta from blended Spend/Clicks
  too — see the amendment in `2026-08-06-paid-media-blended-leads-design.md` §A. That
  change came from the blended-leads work, not this UI iteration.)

## 3. Design detail

### A. By-channel → organic-social-style sections

Replace the `<table>` in `components/report-sections/paid-media/overview/index.tsx`
with per-channel `<section>`s modeled on
`components/report-sections/organic-social/platform-headlines.tsx`
(`PlatformSection`): each configured/listed channel renders a heading + a grid
of `KpiCard`s.

- One section per channel in `o.channels` (order preserved: Paid Search, Meta, LinkedIn).
- Cards per channel: **Spend** (`asMoney(c.spend)`), **Clicks** (`asNum(c.clicks)`),
  **Leads** (`asNum(c.leads)` → Meta shows `—`).
- Heading style matches organic social: `text-sm font-extrabold uppercase tracking-widest text-text-muted`.
- Grid: `grid grid-cols-3 gap-3` (3 KPIs/channel; simple fixed 3-up — the
  organic-social `gridColsBase/Md` helpers solve a variable-KPI-count problem we
  don't have here, so we don't import them).
- The existing null→`—` helpers (`asMoney`/`asNum`) are reused verbatim.
- Keep the by-channel caption (Meta link-clicks note); no `(item N)` text.

### B. Blended trend — stacked area by channel, Spend/Clicks toggle

**Why daily fetch → weekly buckets:** Paid Search has a series fetcher; Meta and
LinkedIn do not. Rather than fight three Supermetrics sources' differing *weekly*
field formats, each channel is queried by **daily `YYYY-MM-DD`** (uniform across
sources) and bucketed to ISO weeks by one shared in-app function — guaranteeing
the three channels' buckets align. Alignment is keyed by **week string, never by
array index** (the codebase's `alignSeries` join-by-index bug is a known hazard —
CLAUDE.md open follow-ups).

**Per-channel daily series fetchers** (one shape, `{ date, spend, clicks }`):
```ts
export interface ChannelSeriesPoint { date: string; spend: number; clicks: number } // date = 'YYYY-MM-DD'
```
- `lib/paid-search/series.ts` `getPaidSearchSeries(slug, dateRange)` — `awQuery(['Date','Cost','Clicks'])`. clicks = all clicks.
- `lib/meta/series.ts` `getMetaSeries(slug, dateRange)` — `metaQuery(['Date','cost','inline_link_clicks'])`. clicks = **link clicks** (item 2 consistency).
- `lib/linkedin/series.ts` `getLinkedInSeries(slug, dateRange)` — `linkedinQuery(['date_day','spend','clicks'])`. clicks = all clicks.
  (Confirm each source's day field id in `lib/supermetrics/constants.ts` `SM_TIME_DIMENSION` during implementation; the field ids above are indicative.)

**Trend builder** `lib/paid-media/trend.ts`:
```ts
export type ChannelKey = 'paid-search' | 'meta' | 'linkedin'   // reuse from overview.ts
export interface TrendPoint {
  week: string   // ISO 'YYYY-Www' sort key
  label: string  // human label for the x-axis
  channels: Partial<Record<ChannelKey, { spend: number; clicks: number }>>
}
export interface PaidMediaTrend {
  points: TrendPoint[]
  channels: ChannelKey[]  // channels that contributed (configured & reported), in fixed order
}
export async function getPaidMediaTrend(clientSlug: string, dateRange: string): Promise<PaidMediaTrend>
```
Algorithm:
1. Read client config; fetch only configured channels' daily series via `Promise.allSettled` (mirrors `getPaidMediaOverview`).
2. **Best-effort:** a channel whose fetch rejects is omitted from `channels` and the stack (it contributes no band). One failed channel never blanks the graph. (Distinct from the KPI-tile blend, which is all-or-nothing — the trend is a secondary visual.)
3. Pure `bucketToWeeks(points: ChannelSeriesPoint[]): Map<weekKey, {spend,clicks}>` — group daily points by ISO week (`isoWeekKey('YYYY-MM-DD') → 'YYYY-Www'`), summing spend/clicks.
4. Pure `blendTrend(perChannel: Partial<Record<ChannelKey, Map<...>>>): TrendPoint[]` — union of week keys across channels, sorted ascending; each point carries each present channel's `{spend,clicks}` for that week (absent channel-week → omitted from `channels` map, treated as 0 by the chart).
5. Steps 3–4 are exported pure functions (no fetchers) so they're unit-testable without `lib/db`.

**Chart wrapper extension** — `components/charts/area-chart.tsx`, additive props (existing callers unaffected):
- `stacked?: boolean` → sets `stackId="1"` on every `<Area>` (+ solid-ish `fillOpacity`).
- `valueFormat?: 'currency-cents'` → axis/tooltip formats via `money()` (mirrors the existing `bar-chart.tsx` `valueFormat` pattern); default = `num`.

**UI component** `components/report-sections/paid-media/overview/trend.tsx` (`'use client'`):
- `PaidMediaTrend({ trend }: { trend: PaidMediaTrend })`.
- `useState` metric `'spend' | 'clicks'` (default `'spend'`), a two-button toggle styled like the Paid Search hero toggle.
- Builds chart `data = trend.points.map(p => ({ week: p.label, ...perChannelValueForMetric }))` and `yKeys = trend.channels.map(k => ({ key: label(k), color: CHART_COLORS[...], label: label(k) }))`.
- Renders `<AreaChart stacked data={data} xKey="week" yKeys={yKeys} valueFormat={metric==='spend' ? 'currency-cents' : undefined} />`.
- A caption: Clicks band for Meta is link clicks; Paid Search + LinkedIn are all clicks.
- If `trend.points` is empty (no data / all channels failed) → a "No trend data for this period" placeholder (no chart).

**Wiring in the Overview RSC** (`overview/index.tsx`):
- Fetch `getPaidMediaTrend` alongside `getPaidMediaOverview` (both awaited; the trend is best-effort so it won't throw except on `getClientBySlug`, which the section error boundary already covers).
- **Layout order:** blended KPI tiles → **trend chart** → by-channel sections.

### C. Tooltip z-index fix

`components/charts/kpi-card.tsx`: the tooltip div is `absolute bottom-full … z-10`.
The sticky header (`components/layout/sticky-report-header.tsx:63`) is `sticky top-0 z-30`.
Near the top of the page the upward tooltip is occluded by the header. **Fix:** raise
the tooltip's z-index above the header — `z-10` → `z-40`. Shared change, safe: the
tooltip is `pointer-events-none` and only paints on hover; floating above a sticky
header is the correct behavior everywhere. (Keeps the existing upward `bottom-full`
placement — only the stacking changes.)

## 4. Testing

- `lib/paid-media/trend.test.ts` (in the `lib/paid-media/**` vitest include):
  - `bucketToWeeks`: daily points across a week boundary land in the right ISO weeks; sums correct.
  - `blendTrend`: two channels with **different** week sets align by week key (not index) — a value that would be misaligned by index-join is caught; a week present in only one channel carries just that channel.
  - `getPaidMediaTrend` (mock the three series fetchers + `getClientBySlug`): configured channels only; a rejected channel is omitted from `channels` and never throws; Meta clicks come from link clicks.
- `components/charts/area-chart.test.tsx` (new or extend): `stacked` sets a shared `stackId` on the areas; `valueFormat='currency-cents'` routes through `money`.
- `components/report-sections/paid-media/overview/index.test.tsx` (extend): per-channel sections render (headings + Spend/Clicks/Leads cards; Meta Leads `—`); the trend component renders given a mocked trend; layout order tiles→trend→by-channel.
- `components/report-sections/paid-media/overview/trend.test.tsx` (new): Spend/Clicks toggle switches the plotted metric; empty trend → placeholder.
- Tooltip z-index: assert the tooltip element carries the `z-40` class (jsdom can't test paint order); mainly a manual check.
- Full suite + `check:rsc` (the trend client component must not receive function props from the RSC — pass the plain `PaidMediaTrend` object) + `tsc` green.

## 5. Files

| File | Change |
|---|---|
| `components/charts/kpi-card.tsx` | tooltip `z-10` → `z-40` |
| `components/charts/area-chart.tsx` | additive `stacked` + `valueFormat` props |
| `lib/paid-search/series.ts` (new) | `getPaidSearchSeries` daily `{date,spend,clicks}` |
| `lib/meta/series.ts` (new) | `getMetaSeries` (clicks = link clicks) |
| `lib/linkedin/series.ts` (new) | `getLinkedInSeries` |
| `lib/paid-media/trend.ts` (new) | `getPaidMediaTrend` + pure `bucketToWeeks`/`blendTrend` |
| `components/report-sections/paid-media/overview/trend.tsx` (new) | client trend component (toggle + stacked area) |
| `components/report-sections/paid-media/overview/index.tsx` | by-channel sections; render trend; fetch `getPaidMediaTrend` |
| tests | per §4 |

## 6. Flow

Same branch as PR #204 (`feat/paid-media-blended-leads`) — these are refinements
to the same not-yet-merged Overview work. The PR's Stage-1 review-record doc
covers the combined change.
