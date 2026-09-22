# YTD Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No subagents and no background commands (standing rule, 2026-09-21).

**Goal:** The outline's "YTD Review" block on every platform tab of the three clients: a year-to-date follower growth graph and a year-to-date views graph, from the client's first reporting month (August 2026) through the month on screen. Renaissance is untouched.

**Where this lives (2026-09-22):** on PR 255 itself (`feat/organic-social-no-overview`). Every PR in the October set must stand alone and merge in any order. This block is a part on 255's outline tabs and reads 255's Data request (`getOutlineKpis`), so it belongs in 255, and it is written to need NOTHING from locked months (PR 256): it reads the range on screen from the part context and the client's own `reportingMonths` setting directly. Draft PR #259, which needed both 255 and 256, is closed. This replaces the 2026-09-21 version of this plan (same decisions, same copy, same edge handling; the month logic no longer calls 256's `resolveLockedRange`).

**Architecture:** One new unpublished part, `ytd-review@1`, pinned per client like 255's outline parts. The month on screen reuses the part context's own `dateRange` and `compareRange`, which are exactly what that tab's Data block sends. Each earlier month of the year (never before `firstMonth`) is the whole calendar month, compared the way locked months compares a finished month (the prior month, or the same month a year before when `comparison` is `previous-year`). For each month it calls `getOutlineKpis` and plots two tiles: Total Followers (a line) and Views (bars). With locked months, every point is that month's Data request, so it equals the tile and, once lock every number ships, locks with it.

**Tech Stack:** Next.js 16 (RSC), React 19, TypeScript, Vitest 3, the existing `ChartCard`, `LineChart`, `BarChart` components.

## Sources (the premise; the reviewer checks the plan against these)

- Jasmine's outlines as written up in PR 250's `docs/reporting-outline.md` ("The outlines"): every platform tab has six blocks in this order: Commentary, **YTD Review ("A year to date follower growth graph and a year to date views graph")**, Data, Follower Growth Graph, Engagement Graph, Top Performing Content.
- DFA question 3 (private, `DFA-as-sent-to-Jasmine.md:29`) and her answer ("We don't need"): no January to July numbers; year to date starts from the first saved month. The timeline is August 2026 onward.
- The team's year-to-date sheet (APFM "Monthly KPI Check-In", private `reference-reports/2026-09-21/`): "Follower Growth" (each month's follower total per platform) and "Views" (each month's views per platform).
- Locked months (PR 256) serves each platform tab with the chosen month's canonical range `custom:<first>,<last>` (the live month `custom:<first>,<last complete UTC day>`, team only) and its comparison: a finished month compares with the whole prior month, or the whole same month a year before under `previous-year` (`reporting-months.ts` `comparisonFor`, non-live branch). This plan does not import it; it matches it, and the full-set proof checks the match (Task 3).
- Standing rules: Renaissance untouched, client agnostic, every PR stands alone and merges in any order, no client figures in the repo.

## Before (pre-change snapshot, at base `94b1708`, PR 255)

- No YTD part exists (`grep -rni "ytd" lib components` returns nothing but unrelated text; confirm at build time).
- `lib/organic-social/outline-headlines.ts:60` `getOutlineKpis(slug, dateRange, compareRange, channel)` is React-cached and returns `{ kpis, noData }` with tiles keyed `followers`, `exposure`, and the rest.
- `components/report-sections/organic-social/parts/outline-data.tsx:13` the Data block calls `getOutlineKpis(ctx.clientSlug, ctx.dateRange, ctx.compareRange, channel)`.
- `components/report-sections/organic-social/ctx.ts` `OrganicSocialCtx` carries `clientSlug`, `dateRange`, `compareRange` (already defaulted), `channel`, `role`.
- `components/report-sections/organic-social/parts/registry.ts:5` `import { engagementBreakdownV1 }`; `:21-24` `OUTLINE_PARTS`.
- `lib/db/schema.ts:212` `clients.dashSocialConfig` (jsonb); `reportingMonths` inside it is written by locked months' rollout (PR 256); until then no client has it and this part renders nothing.

## Global Constraints

- Built on PR 255's branch; imports nothing from PR 256 (`reporting-months.ts`, `locked-range.ts`), PR 247, PR 252 or PR 254. Prove it: this branch alone on `organic-social-october` passes tests, tsc and `check:rsc`.
- New files only, plus `parts/registry.ts`: one import line directly after line 5 and one entry as the FIRST line inside `OUTLINE_PARTS` (directly after line 21). PR 252 edits lines 7-8 and 13-14; the outline fixes (also on 255) add an import after line 9 and the LAST entry inside `OUTLINE_PARTS`.
- Never edit: `getOutlineKpis`, `outline-layout.ts`, the chart components, any existing part.
- The part renders nothing on Overview (`ctx.channel` null), for a channel the outline does not cover, for a client without a valid `reportingMonths.firstMonth` (one `console.warn` per render, by slug), and when the range on screen is not one month starting on the 1st (only possible before locked months ships, when the team picks a preset).
- Year to date = the calendar year of the month on screen, from `firstMonth` at the earliest, through the month on screen. In January it shows January only. Never a month after the one on screen (so a client never sees more than locked months already shows them).
- Copy: block heading `YTD Review`; chart titles `Follower Growth, Year to Date` and `Views, Year to Date`; a month on screen that ends before its last day (the team's live month) is labelled with its short name plus ` (partial)`.
- A failed month request, or a failed client read, shows the block's `Fallback` card; a partial graph is never drawn and nothing escapes the part's Suspense boundary.
- A month whose Data block shows "No data for this period" (`noData`) is never plotted as zero: it is left off both graphs and named in one line under them (`No data for Aug`); if every month is `noData`, the block shows the `NoData` card.
- With fewer than two plotted months the follower graph is a `BarChart` (same data and keys), because `LineChart` draws no dot for a single point (`components/charts/line-chart.tsx`, `dot={false}`).
- No em or en dashes in added lines. Tests first. Every commit ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Decisions made overnight (flagged for my yes)

1. **Follower growth is the month's Total Followers tile** (a line through each month's total), matching the team's sheet, not net new followers per month.
2. **Views are the month's Views tile** (bars per month), matching the sheet.
3. **Year to date resets each January** (the outline says "year to date"); it never reaches before `firstMonth`.
4. **The live month appears for the team** as a partial point when the team has the live month on screen; clients never see it (locked months never serves it to them, and YTD never goes past the month on screen).
5. **Position:** first among the parts on each platform tab, directly under Commentary, as the outline orders the blocks.
6. **A visible `YTD Review` heading** above the two graphs (the outline's block name). Not in the outline's words as a heading.
7. **The team's live month is labelled `Oct (partial)`** so a partial month is never read as a whole one. Known gap, accepted: on a month's last evening (from 8 PM New York until midnight) locked months serves the still-live month with its whole-month range, so YTD labels it `Aug`, not `Aug (partial)`, for those hours; the numbers still match the Data block. Team only; the picker says "(in progress)" at the same moment.

## File Structure

| File | Responsibility |
|---|---|
| `lib/organic-social/ytd.ts` (new) | Pure: `ytdConfig`, `ytdMonths`, `ytdSeries` |
| `components/report-sections/organic-social/parts/ytd-review.tsx` (new) | The part: one request per month, two charts |
| `components/report-sections/organic-social/parts/registry.ts` | register `ytd-review@1` in `OUTLINE_PARTS` |
| tests beside each | |

---

### Task 0: Pre-change snapshot

**Files:** Test `components/report-sections/organic-social/parts/ytd-parity.test.ts` (new)

- [ ] **Step 1:** A test that every existing registry entry is present and the same object after the change: for each of `platform-headlines@1,2,3`, `engagement-trend@1`, `follower-graph@1`, `top-content@1,2`, `engagement-breakdown@1`, `lookup(ORGANIC_SOCIAL_PARTS, id, v)` is `toBe` the named export (written as "present and the same object", never an exact key list, because PR 252 and the outline fixes add versions). Run it and the existing render records, `npx vitest run components/report-sections/organic-social/parts` (the `*.golden.test.tsx` files pin today's rendered output): all PASS, and they stay unchanged through Task 2. Commit.

### Task 1: The months and the series (pure)

**Files:** Create `lib/organic-social/ytd.ts`; Test `lib/organic-social/ytd.test.ts`

**Interfaces produced:** `ytdConfig(value: unknown): YtdConfig | null`; `ytdMonths(dateRange: string, compareRange: string, cfg: YtdConfig): YtdMonth[] | null` (oldest first); `ytdSeries(months: YtdMonth[], built: Record<string, OutlineKpis | undefined>): { points: YtdPoint[]; noData: string[] }` (`OutlineKpis` from `outline-headlines.ts`).

- [ ] **Step 1: Failing tests** (dry run 2026-09-22 on 255 alone: 0 collected before the module exists, 11 of 11 pass after; tsc clean):

```ts
import { expect, test } from 'vitest'
import { ytdConfig, ytdMonths, ytdSeries } from './ytd'

const CFG = { firstMonth: '2026-08', comparison: 'previous-month' } as const
const keys = (ms: { key: string }[] | null) => ms?.map((m) => m.key)

test('ytdConfig reads firstMonth and comparison; anything malformed is null', () => {
  expect(ytdConfig({ firstMonth: '2026-08' })).toEqual({ firstMonth: '2026-08', comparison: 'previous-month' })
  expect(ytdConfig({ firstMonth: '2026-08', comparison: 'previous-year' })).toEqual({ firstMonth: '2026-08', comparison: 'previous-year' })
  expect(ytdConfig({ firstMonth: '2026-08', comparison: 'yearly' })!.comparison).toBe('previous-month')
  for (const bad of [undefined, null, [], 'x', {}, { firstMonth: '2026-13' }, { firstMonth: 202608 }]) expect(ytdConfig(bad)).toBeNull()
})
test('September on screen: August then September; August is whole and compared with July; September keeps its own request', () => {
  expect(ytdMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG)).toEqual([
    { key: '2026-08', dateRange: 'custom:2026-08-01,2026-08-31', compareRange: 'custom:2026-07-01,2026-07-31', partial: false },
    { key: '2026-09', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31', partial: false },
  ])
})
test('the live month (the team only) is partial and keeps its month-to-date request', () => {
  const r = ytdMonths('custom:2026-10-01,2026-10-19', 'custom:2026-09-01,2026-09-19', CFG)!
  expect(keys(r)).toEqual(['2026-08', '2026-09', '2026-10'])
  expect(r[2]).toEqual({ key: '2026-10', dateRange: 'custom:2026-10-01,2026-10-19', compareRange: 'custom:2026-09-01,2026-09-19', partial: true })
})
test('August on screen is August only; January resets the year; firstMonth is the floor', () => {
  expect(keys(ytdMonths('custom:2026-08-01,2026-08-31', 'custom:2026-07-01,2026-07-31', CFG))).toEqual(['2026-08'])
  expect(keys(ytdMonths('custom:2027-01-01,2027-01-31', 'custom:2026-12-01,2026-12-31', CFG))).toEqual(['2027-01'])
  expect(keys(ytdMonths('custom:2027-06-01,2027-06-30', 'x', { firstMonth: '2027-03', comparison: 'previous-month' }))).toEqual(['2027-03', '2027-04', '2027-05', '2027-06'])
  expect(keys(ytdMonths('custom:2026-07-01,2026-07-31', 'x', CFG))).toEqual([])
})
test('previous-year compares each earlier month with the same month a year before; a leap February ends on the 29th', () => {
  const r = ytdMonths('custom:2026-10-01,2026-10-31', 'custom:2025-10-01,2025-10-31', { firstMonth: '2026-08', comparison: 'previous-year' })!
  expect(r.map((m) => m.compareRange)).toEqual(['custom:2025-08-01,2025-08-31', 'custom:2025-09-01,2025-09-30', 'custom:2025-10-01,2025-10-31'])
  expect(ytdMonths('custom:2028-03-01,2028-03-31', 'x', { firstMonth: '2028-01', comparison: 'previous-month' })![1].dateRange).toBe('custom:2028-02-01,2028-02-29')
})
test('a range that is not one month starting on the 1st is null (the block shows nothing)', () => {
  for (const r of ['last_30_days', 'custom:2026-09-02,2026-09-30', 'custom:2026-09-01,2026-10-01', 'custom:2026-09-30,2026-09-01', 'custom:2026-02-01,2026-02-30', 'custom:2026-09-01'])
    expect(ytdMonths(r, 'x', CFG)).toBeNull()
})
test('December 2026 on screen (the team in January, after locked months serves the newest finished month) shows August to December', () => {
  expect(keys(ytdMonths('custom:2026-12-01,2026-12-31', 'custom:2026-11-01,2026-11-30', CFG))).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'])
})
test('December on screen gives twelve months, the most there can be', () => {
  expect(ytdMonths('custom:2027-12-01,2027-12-31', 'x', CFG)).toHaveLength(12)
})

const built = (followers: number, views: number, noData = false) =>
  ({ noData, kpis: { followers: { key: 'followers', label: 'F', format: 'number', value: followers }, exposure: { key: 'exposure', label: 'V', format: 'number', value: views } } }) as never

test("the series takes each month's Total Followers and Views tiles; the live month is labelled partial", () => {
  const months = ytdMonths('custom:2026-10-01,2026-10-19', 'custom:2026-09-01,2026-09-19', CFG)!
  const b = Object.fromEntries(months.map((m, i) => [m.key, built(100 + i, 10 * (i + 1))]))
  expect(ytdSeries(months, b)).toEqual({ noData: [], points: [
    { key: '2026-08', label: 'Aug', followers: 100, views: 10 },
    { key: '2026-09', label: 'Sep', followers: 101, views: 20 },
    { key: '2026-10', label: 'Oct (partial)', followers: 102, views: 30 },
  ] })
})
test('a no-data month is never plotted as zero; it is named instead', () => {
  const months = ytdMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG)!
  expect(ytdSeries(months, { '2026-08': built(0, 0, true), '2026-09': built(5, 7) })).toEqual({ noData: ['Aug'], points: [{ key: '2026-09', label: 'Sep', followers: 5, views: 7 }] })
})
test('a month with no built tiles at all throws (a wiring error, never a zero)', () => {
  const months = ytdMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG)!
  expect(() => ytdSeries(months, { '2026-08': built(1, 1) })).toThrow('YTD: no tiles for 2026-09')
})
```

- [ ] **Step 2: Run, see FAIL** (`npx vitest run lib/organic-social/ytd.test.ts`: the module does not exist).
- [ ] **Step 3: Implement** `lib/organic-social/ytd.ts`:

```ts
// YTD Review (Jasmine's outlines, block 2 of every platform tab): which months the year-to-date graphs
// show, the request for each, and the points. Pure. It reads only the range on screen and the client's
// own reportingMonths setting, so it needs nothing from locked months (PR 256).
import type { OutlineKpis } from './outline-headlines'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const CUSTOM_RE = /^custom:(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type YtdConfig = { firstMonth: string; comparison: 'previous-month' | 'previous-year' }
export type YtdMonth = { key: string; dateRange: string; compareRange: string; partial: boolean }
export type YtdPoint = { key: string; label: string; followers: number; views: number }

const pad = (n: number) => String(n).padStart(2, '0')
const isDay = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
const addMonths = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${pad((total % 12) + 1)}`
}
const lastOf = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${key}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}

/** The client's reportingMonths setting as YTD needs it, or null when it is absent or firstMonth is
 *  malformed. Same default as locked months: previous-month unless it is exactly previous-year. */
export function ytdConfig(value: unknown): YtdConfig | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (typeof v.firstMonth !== 'string' || !MONTH_RE.test(v.firstMonth)) return null
  return { firstMonth: v.firstMonth, comparison: v.comparison === 'previous-year' ? 'previous-year' : 'previous-month' }
}

/** The months from January of the month on screen (never before firstMonth) through the month on
 *  screen, oldest first. The month on screen keeps the exact range and comparison its Data block sends;
 *  every earlier month is the whole month, compared the way locked months compares a finished month.
 *  null when the range on screen is not one month starting on the 1st. At most 12 months. */
export function ytdMonths(dateRange: string, compareRange: string, cfg: YtdConfig): YtdMonth[] | null {
  const m = CUSTOM_RE.exec(dateRange)
  if (!m || !isDay(m[1]) || !isDay(m[2])) return null
  const [, start, end] = m
  const key = start.slice(0, 7)
  if (start !== `${key}-01` || end.slice(0, 7) !== key) return null
  const yearStart = `${key.slice(0, 4)}-01`
  const from = yearStart > cfg.firstMonth ? yearStart : cfg.firstMonth
  const out: YtdMonth[] = []
  for (let k = from; k < key; k = addMonths(k, 1)) {
    const ref = addMonths(k, cfg.comparison === 'previous-year' ? -12 : -1)
    out.push({ key: k, dateRange: `custom:${k}-01,${lastOf(k)}`, compareRange: `custom:${ref}-01,${lastOf(ref)}`, partial: false })
  }
  if (key >= cfg.firstMonth) out.push({ key, dateRange, compareRange, partial: end < lastOf(key) })
  return out
}

/** Each month's Total Followers and Views tiles (the Data block's own values). A month the Data block
 *  shows as "No data" is left off and named, never plotted as zero. */
export function ytdSeries(months: YtdMonth[], built: Record<string, OutlineKpis | undefined>): { points: YtdPoint[]; noData: string[] } {
  const points: YtdPoint[] = []
  const noData: string[] = []
  for (const m of months) {
    const b = built[m.key]
    const f = b?.kpis.followers
    const v = b?.kpis.exposure
    if (!b || !f || !v) throw new Error(`YTD: no tiles for ${m.key}`)
    const short = SHORT[Number(m.key.slice(5, 7)) - 1]
    const label = m.partial ? `${short} (partial)` : short
    if (b.noData) { noData.push(label); continue }
    points.push({ key: m.key, label, followers: f.value, views: v.value })
  }
  return { points, noData }
}
```

- [ ] **Step 4: Run PASS.** Step 5: **Commit** `feat(organic-social): YTD months and series (pure)`.

### Task 2: The part

**Files:** Create `components/report-sections/organic-social/parts/ytd-review.tsx`; modify `parts/registry.ts`; Test `parts/ytd-review.test.tsx`

- [ ] **Step 1: Failing tests** (mock `@/lib/organic-social/outline-headlines` `getOutlineKpis` and `@/lib/db/queries` `getClientBySlug`; await `YtdReviewSection` directly as the other part tests do; chart assertions read the element tree's props `data`, `xKey`, `yKeys`, since Recharts' `ResponsiveContainer` renders nothing measurable in jsdom):
  - a client with `reportingMonths: { firstMonth: '2026-08' }`, Instagram tab, ctx `dateRange 'custom:2026-09-01,2026-09-30'`, `compareRange 'custom:2026-08-01,2026-08-31'`: `getOutlineKpis` is called exactly with `('c', 'custom:2026-08-01,2026-08-31', 'custom:2026-07-01,2026-07-31', 'INSTAGRAM')` and `('c', 'custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM')`; the output has the heading `YTD Review`, both chart titles, a `LineChart` with followers and a `BarChart` with views over `Aug`, `Sep`;
  - ctx `dateRange 'custom:2026-10-01,2026-10-19'`, `compareRange 'custom:2026-09-01,2026-09-19'`: three points, the last labelled `Oct (partial)`, and October's call uses ctx's two ranges unchanged;
  - Overview (`channel` null), a channel with no outline rows, a client without `reportingMonths` (one `console.warn` `[organic-social] ytd-review pinned without reportingMonths slug=<slug>`), and ctx `dateRange 'last_30_days'`: renders nothing (`null`) and `getOutlineKpis` is never called;
  - one month's request rejects, or `getClientBySlug` rejects: the block's `Fallback` card, no chart, nothing thrown;
  - August on screen (one month): the follower chart is a `BarChart`, not a `LineChart`; two or more months: a `LineChart`;
  - a no-data month: left off, with `No data for Aug` under the charts; every month no-data: the `NoData` card;
  - parity through the real section on 255: render `OrganicSocialBody` (as `outline-composition.test.tsx` does) with `platform-headlines@2` and `ytd-review@1` pinned and a single-month ctx: the Data block's `getOutlineKpis` call equals the YTD part's last call, argument for argument;
  - the registry: `ytd-review@1` is unpublished; every existing part is the same object as before (Task 0).
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement** `ytd-review.tsx` (dry run 2026-09-22 on 255 alone with the registry lines below: tsc clean, `check:rsc` passed, the organic-social component tests green):

```tsx
import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { getOutlineKpis } from '@/lib/organic-social/outline-headlines'
import { OUTLINE_DATA_ROWS } from '@/lib/organic-social/outline-layout'
import { ytdConfig, ytdMonths, ytdSeries } from '@/lib/organic-social/ytd'
import { ChartCard } from '@/components/charts/chart-card'
import { LineChart } from '@/components/charts/line-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { TrendSkeleton } from '../skeletons'
import { NoData } from '../no-data'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

/** YTD Review (Jasmine's outlines, block 2 of every platform tab). Each point is the request that
 *  month's Data block sends (the month on screen reuses ctx's own range and comparison), so the graphs
 *  equal the Data tiles and lock with them. */
export async function YtdReviewSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, channel, dateRange, compareRange } = ctx
  if (!channel || !OUTLINE_DATA_ROWS.standard[channel]) return null
  let client: Awaited<ReturnType<typeof getClientBySlug>>
  try { client = await getClientBySlug(clientSlug) } catch { return <Fallback kind="error" /> }
  const cfg = ytdConfig((client?.dashSocialConfig as { reportingMonths?: unknown } | null | undefined)?.reportingMonths)
  if (!cfg) {
    console.warn(`[organic-social] ytd-review pinned without reportingMonths slug=${clientSlug}`)
    return null
  }
  const months = ytdMonths(dateRange, compareRange, cfg)
  if (!months || months.length === 0) return null
  const r = await safe(Promise.all(months.map((m) => getOutlineKpis(clientSlug, m.dateRange, m.compareRange, channel)))
    .then((all) => ytdSeries(months, Object.fromEntries(months.map((m, i) => [m.key, all[i]])))))
  if (!r.data) return <Fallback kind={r.error!} />
  if (r.data.points.length === 0) return <NoData />
  const data = r.data.points.map((p) => ({ month: p.label, followers: p.followers, views: p.views }))
  const followerKeys = [{ key: 'followers', label: 'Total Followers' }]
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">YTD Review</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Follower Growth, Year to Date">
          {data.length < 2
            ? <BarChart data={data} xKey="month" yKeys={followerKeys} />
            : <LineChart data={data} xKey="month" yKeys={followerKeys} />}
        </ChartCard>
        <ChartCard title="Views, Year to Date"><BarChart data={data} xKey="month" yKeys={[{ key: 'views', label: 'Views' }]} /></ChartCard>
      </div>
      {r.data.noData.length > 0 && <p className="text-xs text-text-muted">No data for {r.data.noData.join(', ')}</p>}
    </section>
  )
}

export const ytdReviewV1: PartImpl<OrganicSocialCtx> = {
  id: 'ytd-review',
  version: 1,
  published: false,
  defaultLabel: 'YTD Review',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <YtdReviewSection ctx={ctx} />
    </Suspense>
  ),
}
```

`registry.ts`: `import { ytdReviewV1 } from './ytd-review'` on a new line directly after line 5, and `'ytd-review': { 1: ytdReviewV1 },` as the first line inside `OUTLINE_PARTS`. `OUTLINE_DATA_ROWS.standard` covers the Kenect variant's channels too (Instagram).
- [ ] **Step 4: Run PASS**; the whole suite; tsc; `check:rsc` (the chart props are plain data).
- [ ] **Step 5: Commit** with the edge table:

| # | Category | What breaks | Where | Disposition |
|---|---|---|---|---|
| 1 | external failure | one month's Dash request fails | `safe(Promise.all(...))` | fix: the block's fallback card; no partial graph; test |
| 2 | external failure | the client read fails | part | fix: fallback card, nothing thrown; test |
| 3 | bounds | requests per tab | at most 12 (December), in parallel beside the other parts; each React-cached (the month on screen is the same call as the Data block, so it is shared) and, after lock every number, served from the lock table after the first capture. Dash's rate limit under 12 parallel calls is unverified; the client retries 429s (`lib/dash-social/client.ts`) | accept, watch on staging |
| 4 | input boundary | `reportingMonths` absent or malformed; a range that is not one month | `ytdConfig`, `ytdMonths` | fix: renders nothing (warned for the config); tests |
| 5 | input boundary | a no-data month | `ytdSeries` | fix: left off and named; test |
| 6 | state | a YTD point disagrees with that month's Data tile | the month on screen reuses ctx's ranges; earlier months match locked months' finished-month rule | fix: parity test on 255; the full-set proof checks earlier months against 256 (Task 3) |
| 7 | security | a client sees a month locked months hides | YTD never goes past the month on screen, and every earlier month has already opened (a month opens after the one before it) | fix by construction; test |

### Task 3: Prove it

- [ ] Full suite, tsc, `check:rsc`; Task 0 still passes.
- [ ] Stands alone: this branch by itself on `organic-social-october` passes tests, tsc and `check:rsc` (it already is: 255 is cut from `organic-social-october`).
- [ ] Renaissance drift check: RESULT no drift.
- [ ] Zero conflicts: `git merge-tree --write-tree` with 247, 250, 252, 253, 254 and 256; all merged in two orders off `origin/dev`, same tree, tests, tsc, `check:rsc` green.
- [ ] Earlier-month parity with locked months (in the full-set worktree only, never committed on a branch, because it needs 255 and 256 together): a scratch test that, for firstMonth `2026-08` and both comparisons, runs 256's real `resolveLockedRange` for the team and a client across Aug 2026 to Jan 2027 and asserts every `ytdMonths` entry's `dateRange` and `compareRange` equals the matching `MonthOption`'s. Record the result in the PR description. After the set is in `organic-social-october`, a follow-up PR commits that test (filed, not October).
- [ ] Nothing pushed without my go. The commits go on PR 255; no separate PR.

## Rollout (each step waits for my go; staging only)

1. After 255 is on staging: add `{ id: 'ytd-review', version: 1 }` to `extraParts` and put `'ytd-review'` first in `order` in each of the three clients' `report_section_config['organic-social:platform']` (the object 255's opt-in writes), with a host-guarded, snapshot-first script that edits the EXISTING key (the opt-in script only accepts clients without that key). The block shows nothing until the client has `reportingMonths` (256's rollout). Read back one resolved tab per client; drift check. The timeout fallback copy ("try a shorter date range") does not fit YTD; accepted for now, filed.

## Review record

**2026-09-21 review of the stacked version** (fresh adversarial review of `84b81ee`, one reviewer, read only; it ran 256's real `resolveLockedRange` in 12 cases and confirmed every YTD month's range and comparison equals what that month's Data block receives). Findings carried into this version: M1 (one-month YTD drew an empty follower card: `BarChart` under two points), M2 (no-data months plotted zeros: left off and named), M3 (a failed client read escaped: fallback card), m2 (Task 0 as presence and identity plus the golden render tests), m3 (parity by a test through the real section), m5 (heading and "(partial)" as Decisions 6 and 7), m6 (a new rollout script), m7 (request load and fallback copy stated). m4 (missing cases): later firstMonth, previous-year and element-prop assertions carried; the "January, team sees August to December" case restored after the 2026-09-22 audit as the December 2026 test. m1 (registry placement) holds: first line here, last line for the outline fixes.

**2026-09-22 standalone rewrite:** one fresh reviewer, read only. It merged 256 with this branch in a scratch worktree, ran the plan's `ytd.ts` against 256's real `resolveLockedRange` (team and client; every day 2026-07-25 to 2027-03-15 at four UTC hours; firstMonth 2026-08, 2026-11, 2027-01; comparison unset, previous-month, previous-year, bogus; opensOnDay unset, 4, 12, 28; both weekend rules; every offered month as the month on screen: 574,976 YTD entries) with 0 range or comparison mismatches and 0 months shown that the viewer is not offered. The plan's `ytd.test.ts` passed 10 of 10 (11 of 11 with the December case restored after the audit); the part on this branch alone passes tsc, `check:rsc` and the organic-social tests. One finding, the month-end label (Decision 7), accepted and stated.
