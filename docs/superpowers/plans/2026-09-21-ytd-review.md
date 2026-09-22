# YTD Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No subagents and no background commands (standing rule, 2026-09-21).

**Goal:** The outline's "YTD Review" block on every platform tab of the three clients: a year-to-date follower growth graph and a year-to-date views graph, from the client's first reporting month (August 2026) through the month on screen. Renaissance is untouched.

**Architecture:** One new unpublished part, `ytd-review@1`, pinned per client like PR 255's outline parts. For each month of the year so far that the viewer may see, it asks for exactly the request that month's Data block sends (`getOutlineKpis` with that month's canonical range and comparison), and plots two of its tiles: Total Followers (a line) and Views (bars). So every YTD point equals that month's Data tile by construction, and once lock every number ships, the points lock with the same keys as the tiles. No new Dash request shape and no change to any existing part.

**Tech Stack:** Next.js 16 (RSC), React 19, TypeScript, Vitest 3, the existing `ChartCard`, `LineChart`, `BarChart` components.

## Sources (the premise; the reviewer checks the plan against these)

- Jasmine's outlines as written up in PR 250's `docs/reporting-outline.md` ("The outlines"): every platform tab has six blocks in this order: Commentary, **YTD Review ("A year to date follower growth graph and a year to date views graph")**, Data, Follower Growth Graph, Engagement Graph, Top Performing Content. YTD Review is one of the two net-new builds.
- DFA question 3 (private, `DFA-as-sent-to-Jasmine.md:29`) and her answer ("We don't need", decision register): no January to July numbers; year to date starts from the first saved month. Standing confirmation: the timeline is August 2026 onward.
- The team's own year-to-date sheet (the APFM "Monthly KPI Check-In" sheet in the private `reference-reports/2026-09-21/`): two sections, "Follower Growth" (each month's follower total per platform) and "Views" (each month's views per platform). The two graphs mirror those two sections.
- Locked months (PR 256) decides which months a viewer may see and each month's canonical range and comparison; the outline Data block (PR 255) decides each month's request. Lock every number (its plan) locks those requests.
- Standing rules: Renaissance untouched, client agnostic, zero conflicts in any order, no client figures in the repo.

## Before (pre-change snapshot, at base `05fffa8` = PR 256 `97dce1e` merged with PR 255 `94b1708`, a local integration base)

- No YTD part exists (`grep -rn "ytd" lib components` returns nothing but unrelated text; confirm at build time).
- `lib/organic-social/outline-headlines.ts:60-86` `getOutlineKpis(slug, dateRange, compareRange, channel)` is React-cached and returns tiles keyed `followers`, `exposure`, ... for every outline channel (`PLATFORM_KPIS` keys, `metrics.ts`).
- `lib/organic-social/reporting-months.ts` `resolveLockedRange` gives the viewer's months newest first, each with canonical `dateRange` and `compareRange`; `components/report-sections/organic-social/index.tsx` (256) serves the section with the served month's range, so a Data block's request for month M is `getOutlineKpis(slug, M.dateRange, M.compareRange, channel)`.
- `components/report-sections/organic-social/parts/registry.ts:21-24` `OUTLINE_PARTS` holds the unpublished outline parts; PR 255's staging opt-in writes `report_section_config['organic-social:platform'] = { versions, extraParts: [engagement-breakdown@1], order: [...] }` (the private `~/.claude/organic-social-work/probes/outline-optin-staging.ts:17-22`).

## Global Constraints

- Build base: `organic-social-october` after PRs 255 and 256 have merged into it (until then, the local merge `05fffa8`). The PR targets `organic-social-october`.
- New files only, plus: `parts/registry.ts` gets one import line directly after line 5 (`import { engagementBreakdownV1 } from './engagement-breakdown'`) and one entry as the FIRST line inside `OUTLINE_PARTS` (directly after line 21). PR 252 edits lines 7-8 and 13-14; the outline-fixes plan adds an import after line 9 and an entry after line 23.
- Never edit: `getOutlineKpis`, `outline-layout.ts`, `reporting-months.ts`, `locked-range.ts`, the chart components, any existing part.
- The part renders nothing on Overview (`ctx.channel` null), for a channel the outline does not cover, and for a client without `reportingMonths` (logged once per render by slug).
- Year to date = the calendar year of the month on screen, from `firstMonth` at the earliest, through the month on screen. In January it shows January only.
- Copy: block heading `YTD Review`; chart titles `Follower Growth, Year to Date` and `Views, Year to Date`; the live month (team only) is labelled with its short name plus ` (partial)`.
- A failed month request, or a failed client read, shows the block's fallback card (the same `Fallback` as the other parts); a partial graph is never drawn and nothing escapes the part's Suspense boundary.
- A month whose Data block shows "No data for this period" (`noData`) is never plotted as zero: it is left off both graphs and named in one line under them (`No data for Aug`); if every month is `noData`, the block shows the same `NoData` card as the Data block.
- With fewer than two plotted months the follower graph is drawn as a `BarChart` (same data and keys), because `LineChart` draws no dot for a single point (`components/charts/line-chart.tsx`, `dot={false}`).
- No em or en dashes in added lines. Tests first. Every commit ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Decisions made overnight (flagged for my yes)

1. **Follower growth is the month's Total Followers tile** (a line through each month's total), matching the team's sheet, not net new followers per month.
2. **Views are the month's Views tile** (bars per month), matching the sheet.
3. **Year to date resets each January** (the outline says "year to date"); it never reaches before `firstMonth`.
4. **The live month appears for the team** as a partial point, because the team may pick it; clients never see it (their month list excludes it).
5. **Position:** first among the parts on each platform tab, directly under Commentary, as the outline orders the blocks.
6. **A visible `YTD Review` heading** above the two graphs (the outline's block name; Top Content already renders its own heading). Not in the outline's words as a heading.
7. **The team's live month is labelled `Oct (partial)`** so a partial month is never read as a whole one.

## File Structure

| File | Responsibility |
|---|---|
| `lib/organic-social/ytd.ts` (new) | Pure: `ytdMonths(locked, served)`, `ytdSeries(months, kpisByKey)` |
| `components/report-sections/organic-social/parts/ytd-review.tsx` (new) | The part: fetch per month, render two charts |
| `components/report-sections/organic-social/parts/registry.ts` | register `ytd-review@1` in `OUTLINE_PARTS` |
| tests beside each | |

---

### Task 0: Pre-change snapshot

**Files:** Test `components/report-sections/organic-social/parts/ytd-parity.test.ts` (new)

- [ ] **Step 1:** A test that every existing registry entry is present and the same object after the change: for each of `platform-headlines@1,2,3`, `engagement-trend@1`, `follower-graph@1`, `top-content@1,2`, `engagement-breakdown@1`, `lookup(ORGANIC_SOCIAL_PARTS, id, v)` is `toBe` the named export. (Written as "present and the same object", never as an exact key list, because PR 252 and the outline fixes add versions.) Run it and the existing render records, `npx vitest run components/report-sections/organic-social/parts` (the `*.golden.test.tsx` files pin today's rendered output): all PASS, and they must stay unchanged through Task 2. Commit.

### Task 1: The months and the series (pure)

**Files:** Create `lib/organic-social/ytd.ts`; Test `lib/organic-social/ytd.test.ts`

**Interfaces produced:** `ytdMonths(months: MonthOption[], served: MonthOption, firstMonth: string): MonthOption[]` (oldest first); `type YtdPoint = { key: string; label: string; followers: number; views: number }`; `ytdSeries(months: MonthOption[], built: Record<string, OutlineKpis>): { points: YtdPoint[]; noData: string[] }` (`OutlineKpis` from `outline-headlines.ts`; `noData` lists the short labels of the months left off).

- [ ] **Step 1: Failing tests**:

```ts
import { expect, test } from 'vitest'
import { resolveLockedRange } from './reporting-months'
import { ytdMonths, ytdSeries } from './ytd'

const C = (today: string, last: string) => ({ today, lastCompleteUtcDay: last, liveDayInProgress: false })
const CFG = { firstMonth: '2026-08' }

test('a client on 20 Oct 2026 viewing September: August and September, oldest first', () => {
  const r = resolveLockedRange(CFG, 'client', C('2026-10-20', '2026-10-19'), undefined)
  expect(ytdMonths(r.months, r.month!, '2026-08').map((m) => m.key)).toEqual(['2026-08', '2026-09'])
})
test('the team viewing the live month gets August, September and the partial October', () => {
  const r = resolveLockedRange(CFG, 'team', C('2026-10-20', '2026-10-19'), 'custom:2026-10-01,2026-10-19')
  expect(ytdMonths(r.months, r.month!, '2026-08').map((m) => m.key)).toEqual(['2026-08', '2026-09', '2026-10'])
})
test('viewing August shows August only; never a month after the one on screen', () => {
  const r = resolveLockedRange(CFG, 'team', C('2026-10-20', '2026-10-19'), 'custom:2026-08-01,2026-08-31')
  expect(ytdMonths(r.months, r.month!, '2026-08').map((m) => m.key)).toEqual(['2026-08'])
})
test('January resets the year; firstMonth is the floor', () => {
  const r = resolveLockedRange(CFG, 'client', C('2027-02-20', '2027-02-19'), undefined)
  expect(r.month!.key).toBe('2027-01')
  expect(ytdMonths(r.months, r.month!, '2026-08').map((m) => m.key)).toEqual(['2027-01'])
})
const built = (followers: number, views: number, noData = false) =>
  ({ noData, kpis: { followers: { key: 'followers', label: 'F', format: 'number', value: followers }, exposure: { key: 'exposure', label: 'V', format: 'number', value: views } } }) as never

test("the series takes each month's Total Followers and Views tiles; the live month is labelled partial", () => {
  const r = resolveLockedRange(CFG, 'team', C('2026-10-20', '2026-10-19'), 'custom:2026-10-01,2026-10-19')
  const months = ytdMonths(r.months, r.month!, '2026-08')
  const b = Object.fromEntries(months.map((m, i) => [m.key, built(100 + i, 10 * (i + 1))]))
  expect(ytdSeries(months, b)).toEqual({ noData: [], points: [
    { key: '2026-08', label: 'Aug', followers: 100, views: 10 },
    { key: '2026-09', label: 'Sep', followers: 101, views: 20 },
    { key: '2026-10', label: 'Oct (partial)', followers: 102, views: 30 },
  ] })
})
test('a no-data month is never plotted as zero; it is named instead', () => {
  const r = resolveLockedRange(CFG, 'client', C('2026-10-20', '2026-10-19'), undefined)
  const months = ytdMonths(r.months, r.month!, '2026-08')
  expect(ytdSeries(months, { '2026-08': built(0, 0, true), '2026-09': built(5, 7) })).toEqual({ noData: ['Aug'], points: [{ key: '2026-09', label: 'Sep', followers: 5, views: 7 }] })
})
test('a month with no built tiles at all throws (a wiring error, never a zero)', () => {
  const r = resolveLockedRange(CFG, 'client', C('2026-10-20', '2026-10-19'), undefined)
  const months = ytdMonths(r.months, r.month!, '2026-08')
  expect(() => ytdSeries(months, { '2026-08': built(1, 1) })).toThrow('YTD: no tiles for 2026-09')
})
test('the team in January (live) sees August to December; a later firstMonth is the floor; previous-year comparisons keep their own ranges', () => {
  const jan = resolveLockedRange(CFG, 'team', C('2027-01-10', '2027-01-09'), undefined)
  expect(ytdMonths(jan.months, jan.month!, '2026-08').map((m) => m.key)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'])
  const later = resolveLockedRange({ firstMonth: '2027-03' }, 'client', C('2027-06-20', '2027-06-19'), undefined)
  expect(ytdMonths(later.months, later.month!, '2027-03').map((m) => m.key)).toEqual(['2027-03', '2027-04', '2027-05'])
  const yearly = resolveLockedRange({ firstMonth: '2026-08', comparison: 'previous-year' }, 'client', C('2026-10-20', '2026-10-19'), undefined)
  expect(ytdMonths(yearly.months, yearly.month!, '2026-08').map((m) => m.compareRange)).toEqual(['custom:2025-08-01,2025-08-31', 'custom:2025-09-01,2025-09-30'])
})
```

- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement** `lib/organic-social/ytd.ts`:

```ts
// YTD Review (Jasmine's outlines): which months the year-to-date graphs show and their points. Pure.
import type { MonthOption } from './reporting-months'
import type { OutlineKpis } from './outline-headlines'

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export type YtdPoint = { key: string; label: string; followers: number; views: number }

/** The months of the served month's calendar year the viewer may see, from firstMonth at the
 *  earliest, up to and including the served month, oldest first. */
export function ytdMonths(months: MonthOption[], served: MonthOption, firstMonth: string): MonthOption[] {
  const yearStart = `${served.key.slice(0, 4)}-01`
  const from = yearStart > firstMonth ? yearStart : firstMonth
  return months.filter((m) => m.key >= from && m.key <= served.key).sort((a, b) => (a.key < b.key ? -1 : 1))
}

/** Each month's Total Followers and Views tiles (the Data block's own values). A month the Data
 *  block shows as "No data" is left off and named, never plotted as zero. */
export function ytdSeries(months: MonthOption[], built: Record<string, OutlineKpis | undefined>): { points: YtdPoint[]; noData: string[] } {
  const points: YtdPoint[] = []
  const noData: string[] = []
  for (const m of months) {
    const b = built[m.key]
    const f = b?.kpis.followers
    const v = b?.kpis.exposure
    if (!b || !f || !v) throw new Error(`YTD: no tiles for ${m.key}`)
    const short = SHORT[Number(m.key.slice(5, 7)) - 1]
    const label = m.live ? `${short} (partial)` : short
    if (b.noData) { noData.push(label); continue }
    points.push({ key: m.key, label, followers: f.value, views: v.value })
  }
  return { points, noData }
}
```

- [ ] **Step 4: Run PASS.** Step 5: **Commit** `feat(organic-social): YTD months and series (pure)`.

### Task 2: The part

**Files:** Create `components/report-sections/organic-social/parts/ytd-review.tsx`; modify `parts/registry.ts`; Test `parts/ytd-review.test.tsx`

- [ ] **Step 1: Failing tests** (mock `@/lib/organic-social/outline-headlines` `getOutlineKpis`, `@/lib/db/queries` `getClientBySlug`, fake timers at `2026-10-20T14:00:00Z`; await `YtdReviewSection` directly as the other part tests do):
  - opted-in client, CLIENT_VIEWER, Instagram tab, served September: `getOutlineKpis` is called exactly with `('c', 'custom:2026-08-01,2026-08-31', 'custom:2026-07-01,2026-07-31', 'INSTAGRAM')` and `('c', 'custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM')`, the same arguments each month's Data block sends; the output has the heading `YTD Review`, both chart titles, and a `LineChart` with followers and a `BarChart` with views over `Aug`, `Sep`;
  - INTERNAL_ADMIN on the live month: three points, the last labelled `Oct (partial)`;
  - Overview (`channel` null), a channel with no outline rows, or a client without `reportingMonths`: renders nothing (`null`), the last with one `console.warn` `[organic-social] ytd-review pinned without reportingMonths slug=<slug>`;
  - one month's request rejects, or `getClientBySlug` rejects: the block's `Fallback` card, no chart, nothing thrown;
  - a served August (one month): the follower chart is a `BarChart`, not a `LineChart`; with two or more months it is a `LineChart`;
  - a no-data month: left off, with `No data for Aug` under the charts; every month no-data: the `NoData` card;
  - chart assertions read the element tree's props (`data`, `xKey`, `yKeys`), since Recharts' `ResponsiveContainer` renders nothing measurable in jsdom;
  - parity through the real section: in a test that renders `OrganicSocialBody` (as `locked-months-parity.test.tsx` does) with `platform-headlines@2` and `ytd-review@1` pinned, the Data block's `getOutlineKpis` call for the served month equals the YTD part's last call, argument for argument;
  - the registry: `ytd-review@1` is unpublished; every existing part is the same object as before.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement** `ytd-review.tsx`:

```tsx
import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { getOutlineKpis } from '@/lib/organic-social/outline-headlines'
import { OUTLINE_DATA_ROWS } from '@/lib/organic-social/outline-layout'
import { requestClock } from '@/lib/organic-social/locked-range'
import { hasReportingMonths, parseReportingMonths, resolveLockedRange, viewerForRole } from '@/lib/organic-social/reporting-months'
import { ytdMonths, ytdSeries } from '@/lib/organic-social/ytd'
import { ChartCard } from '@/components/charts/chart-card'
import { LineChart } from '@/components/charts/line-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { TrendSkeleton } from '../skeletons'
import { NoData } from '../no-data'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

/** YTD Review (Jasmine's outlines, block 2 of every platform tab). Each point is the request that
 *  month's Data block sends, so the graphs equal the Data tiles and lock with them. */
export async function YtdReviewSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, channel, dateRange, role } = ctx
  if (!channel || !OUTLINE_DATA_ROWS.standard[channel]) return null
  let client: Awaited<ReturnType<typeof getClientBySlug>>
  try { client = await getClientBySlug(clientSlug) } catch { return <Fallback kind="error" /> }
  if (!hasReportingMonths(client)) {
    console.warn(`[organic-social] ytd-review pinned without reportingMonths slug=${clientSlug}`)
    return null
  }
  const rm = (client!.dashSocialConfig as { reportingMonths?: unknown }).reportingMonths
  const parsed = parseReportingMonths(rm)
  const locked = resolveLockedRange(rm, viewerForRole(role), requestClock(), dateRange)
  if (!parsed.ok || !locked.month) return null
  const months = ytdMonths(locked.months, locked.month, parsed.cfg.firstMonth)
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

`registry.ts`: `import { ytdReviewV1 } from './ytd-review'` on a new line directly after line 5, and `'ytd-review': { 1: ytdReviewV1 },` as the first line inside `OUTLINE_PARTS`. Check at build time: the section passes the served month's range as `ctx.dateRange` (256's `pctx`), and `resolveLockedRange` of that canonical string returns the same month (it is a fixed point, locked months spec 3.7); `OUTLINE_DATA_ROWS.standard` covers the Kenect variant's channels too (it does: Instagram).
- [ ] **Step 4: Run PASS**; the whole suite; tsc; `check:rsc` (the chart props are plain data).
- [ ] **Step 5: Commit** with the edge table:

| # | Category | What breaks | Where | Disposition |
|---|---|---|---|---|
| 1 | external failure | one month's Dash request fails | `safe(Promise.all(...))` | fix: the block's fallback card; no partial graph; test |
| 2 | bounds | requests per tab | at most 12 in December (one per month of the year), in parallel beside the other parts; each React-cached and, after lock every number, served from the lock table after the first capture. Dash's rate limit under 12 parallel calls is unverified; the client retries 429s (`client.ts:57-61`) | accept, watch on staging |
| 6 | external failure | the client read fails | part | fix: fallback card, nothing thrown; test |
| 7 | input boundary | a no-data month | `ytdSeries` | fix: left off and named; test |
| 3 | input boundary | a client pinned without `reportingMonths` or with malformed config | part | fix: renders nothing, warned; test |
| 4 | state | a YTD point disagrees with that month's Data tile | same request, same arguments | fix by construction; test asserts the arguments |
| 5 | security | a client sees the live month in YTD | `resolveLockedRange` with the viewer's role | fix: the client's month list excludes it; test |

### Task 3: Prove it

- [ ] Full suite, tsc, `check:rsc`; Task 0 still passes.
- [ ] Renaissance drift check: RESULT no drift.
- [ ] Zero conflicts: `git merge-tree --write-tree` with 247, 250, 252, 253, 254, and the outline-fixes and lock-every-number branches (255 and 256 are in the base); all merged in two orders off `origin/dev`, same tree, tests, tsc, `check:rsc` green.
- [ ] Nothing pushed without my go; then a PR into `organic-social-october` once 255 and 256 are in it.

## Rollout (each step waits for my go; staging only)

1. After this is on staging: add `{ id: 'ytd-review', version: 1 }` to `extraParts` and put `'ytd-review'` first in `order` in each of the three clients' `report_section_config['organic-social:platform']` (the object PR 255's opt-in writes), with a new host-guarded, snapshot-first script that edits the EXISTING key (PR 255's opt-in script only accepts clients without that key, so it cannot be reused); read back one resolved tab per client; drift check. The timeout fallback copy ("try a shorter date range") does not fit YTD; accepted for now, filed.

## Review record

Fresh adversarial review of `84b81ee` (one reviewer, read only; it ran the real `resolveLockedRange` in 12 cases, client and team, finished and live, January, a year boundary, previous-year, a later `firstMonth`, malformed config: every YTD month's range and comparison equals what that month's Data block receives, so the central claim holds). Every finding was checked and accepted.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| M1 | MAJOR | A one-month YTD (every go-live August view, every January) drew an empty follower card: `LineChart` has `dot={false}` | Fixed: fewer than two points draws a `BarChart`; test |
| M2 | MAJOR | A no-data month plotted zeros (`buildOutlineKpis` always returns every key); the plan's guard was unreachable | Fixed: `noData` months left off and named; all no-data shows `NoData`; test |
| M3 | MAJOR | A failed client read escaped the part and could take down the section | Fixed: try/catch to the fallback card; test |
| m1 | MINOR | Registry placement depended on the outline-fixes plan | Fixed there: its entry is the LAST line inside `OUTLINE_PARTS` |
| m2 | MINOR | Task 0 contradicted itself and could not see a render change | Fixed: presence and identity only, plus the existing golden render tests |
| m3 | MINOR | Parity proven by argument | Fixed: a test through `OrganicSocialBody` compares the Data block's call with the YTD's |
| m4 | MINOR | Missing cases (January live, later `firstMonth`, previous-year, element-prop assertions) | Fixed: tests added |
| m5 | MINOR | Heading and "(partial)" label not in the outline; skeleton type | Listed as Decisions 6 and 7; `TrendSkeleton` |
| m6 | MINOR | Wrong probe path; that script cannot edit an existing key | Fixed: private path; a new script for the rollout |
| m7 | MINOR | Request load and fallback copy | Stated (edge 2, rollout) |
