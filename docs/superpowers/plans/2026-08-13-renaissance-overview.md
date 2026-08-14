# Renaissance Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Renaissance an Overview page that combines four sections currently spread across four Avenue Z tabs onto one screen, matching `Executive Dashboard Demo.pdf`.

**Architecture:** A new report slug `executive-overview` with its own folder under `components/report-sections/executive-overview/`. Every component and every line of data reshaping is copied into that folder. Nothing is imported from another report section and no existing report component is modified. The page resolves its own date ranges rather than taking them from the route, fetches GA4 and Peec with `Promise.allSettled`, and renders an explicit needs-connection state where Renaissance has no data source.

**Tech Stack:** Next.js 16 App Router, React Server Components, TypeScript strict, Tailwind v4, Recharts, Drizzle + Neon Postgres.

**Spec:** `docs/superpowers/specs/2026-08-13-renaissance-overview-frankenstein-design.md`

## Global Constraints

- **Never modify any file under `components/report-sections/demand-overview/`, `components/report-sections/ga4/`, `components/report-sections/inbound-funnel/`, `components/report-sections/hubspot-performance/`, or `components/charts/`.** These are the copy sources. Read them, copy from them, never edit them.
- **No em dashes or en dashes** in any code comment, commit message, or copy. Use a period, comma, parentheses, or colon.
- **No AI-generated or AI-labelled commentary on this page.** The `AiBadge` and the engagement-gap callout are deleted from our copy of `new-returning.tsx`.
- **The orchestrator takes `{ clientSlug }` only.** It never accepts `dateRange` or `compareRange` as props.
- **`tsc` is not in CI.** Run `npx tsc --noEmit` locally before every commit.
- **`npm run check:rsc` runs on every PR.** A server component may not pass a function prop to a `'use client'` component.
- Commit after every task. Do not batch.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `components/report-sections/executive-overview/kpi-card.tsx` | Single KPI tile. Server component |
| `components/report-sections/executive-overview/needs-connection.tsx` | Block-scale "source not connected" card |
| `components/report-sections/executive-overview/demand-journey.tsx` | The 4-card funnel row, with a `connected` variant |
| `components/report-sections/executive-overview/sessions-trend-chart.tsx` | Sessions and users over time |
| `components/report-sections/executive-overview/new-returning.tsx` | New vs returning visitors |
| `components/report-sections/executive-overview/channel-tabs-chart.tsx` | Traffic by channel, two tabs plus drill-down |
| `components/report-sections/executive-overview/reshape.ts` | Pure functions turning raw GA4 rows into component props |
| `components/report-sections/executive-overview/stages.ts` | Pure builder for the four journey cards, including which are unconnected |
| `components/report-sections/executive-overview/index.tsx` | Orchestrator: fetches, reshapes, renders four blocks |

**Modified, additively only**

| File | Change |
|---|---|
| `lib/db/schema.ts` | one slug added to the `ReportSlug` union |
| `lib/constants.ts` | one entry each in `REPORT_NAMES`, `NAV_GROUPS`, `ALL_REPORT_SLUGS` |
| `app/dashboard/[clientSlug]/reports/page.tsx` | one `case` |
| `app/portal/[clientSlug]/reports/page.tsx` | one `case` |
| `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` | one `case` |
| `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx` | one `case` |
| `components/report-sections/report-generator/index.tsx` | one entry in `NON_CHANNEL_SLUGS` |
| `app/dashboard/settings/page.tsx` | one entry in the exclusion array |

---

## Task 1: Copy the four presentational components unchanged

Get the pieces in place with zero behavior change, so later tasks edit known-good copies.

**Files:**
- Create: `components/report-sections/executive-overview/kpi-card.tsx`
- Create: `components/report-sections/executive-overview/sessions-trend-chart.tsx`
- Create: `components/report-sections/executive-overview/new-returning.tsx`
- Create: `components/report-sections/executive-overview/channel-tabs-chart.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `KpiCard`, `SessionsTrendChart`, `NewReturning`, `ChannelTabsChart`, plus exported prop types `KpiCardProps`, `TrendRow`, `SessionsTrendChartProps`, `AudienceRow`, `NewReturningProps`, `ChannelVolumeRow`, `ChannelConvRow`, `SourceMediumEntry`, `ChannelTabsChartProps`

- [ ] **Step 1: Copy all four files verbatim**

```bash
cd /Users/thomaschangavenuez/Desktop/reporting-ren-add-overview
mkdir -p components/report-sections/executive-overview
cp components/charts/kpi-card.tsx                         components/report-sections/executive-overview/kpi-card.tsx
cp components/report-sections/ga4/sessions-trend-chart.tsx components/report-sections/executive-overview/sessions-trend-chart.tsx
cp components/report-sections/ga4/new-returning.tsx        components/report-sections/executive-overview/new-returning.tsx
cp components/report-sections/ga4/channel-tabs-chart.tsx   components/report-sections/executive-overview/channel-tabs-chart.tsx
```

- [ ] **Step 2: Export every prop type in the copies**

The originals leave several prop interfaces unexported, which prevents typing the reshaping against them. In each copy, add `export` to every `interface` and `type` declaration that does not already have it. Specifically:

In `executive-overview/kpi-card.tsx`, change `interface KpiCardProps {` to `export interface KpiCardProps {`.

In `executive-overview/sessions-trend-chart.tsx`, change `interface TrendRow {` to `export interface TrendRow {` and `interface SessionsTrendChartProps {` to `export interface SessionsTrendChartProps {`.

In `executive-overview/new-returning.tsx`, change `interface NewReturningProps {` to `export interface NewReturningProps {`. (`AudienceRow` is already exported.)

In `executive-overview/channel-tabs-chart.tsx`, change `interface SourceMediumEntry {` to `export interface SourceMediumEntry {` and `interface ChannelTabsChartProps {` to `export interface ChannelTabsChartProps {`.

- [ ] **Step 3: Verify the copies compile**

Run: `npx tsc --noEmit`
Expected: PASS with no errors. If an import path inside a copy is relative (`./` or `../`), rewrite it to the `@/` alias form pointing at the original location, for example `@/lib/constants` and `@/lib/utils`.

- [ ] **Step 4: Verify no original was touched**

Run: `git status --short`
Expected: exactly four new untracked files under `components/report-sections/executive-overview/`, and nothing else.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/executive-overview/
git commit -m "feat(exec-overview): copy the four presentational components

Verbatim copies with every prop type exported, which the originals do
not do. Exporting them lets the reshaping in a later task be typed
against the contracts it feeds, so tsc catches drift.

No original file is modified."
```

---

## Task 2: Strip the AI badge from our copy

**Files:**
- Modify: `components/report-sections/executive-overview/new-returning.tsx`

**Interfaces:**
- Consumes: `NewReturning` from Task 1
- Produces: same component, with no AI badge and no generated-sounding callout

- [ ] **Step 1: Delete the AiBadge component**

In `components/report-sections/executive-overview/new-returning.tsx`, delete the entire `function AiBadge() { ... }` declaration, including its returned JSX and the tooltip div inside it.

- [ ] **Step 2: Delete the callout that used it**

Find the block guarded by `{engagementGap !== null && (() => { ... })()}`. Delete the whole guarded expression, including the `<AiBadge />` usage inside it and the sentence templating that produces `gapWidening` / `gapNarrowing` copy. Also delete the now-unused `engagementGap`, `priorGap`, `gapWidening` and `gapNarrowing` locals if nothing else references them.

- [ ] **Step 3: Verify nothing references the deleted names**

Run: `grep -n "AiBadge\|engagementGap\|gapWidening\|gapNarrowing" components/report-sections/executive-overview/new-returning.tsx`
Expected: no output.

- [ ] **Step 4: Verify it compiles and the original is untouched**

Run: `npx tsc --noEmit && git diff --stat components/report-sections/ga4/new-returning.tsx`
Expected: tsc passes, and the diff against the original is empty.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/executive-overview/new-returning.tsx
git commit -m "feat(exec-overview): remove the AI badge and its callout

The badge told the reader the insight was generated by AI. It was
deterministic string templating with three fixed branches chosen by a
numeric comparison. It was also ungated by SHOW_AI_NARRATIVE, which is
false, so every sibling narrative block is off and this one would have
been the only client-facing surface showing AI-labelled copy.

Avenue Z's copy keeps rendering it. Only ours changes."
```

---

## Task 3: Build the needs-connection card

This is the behavior the whole design exists to protect, so it gets a real red-green cycle. The failure being guarded against is a card that renders a zero or a dash, which reads as real data meaning "none".

**Files:**
- Create: `components/report-sections/executive-overview/needs-connection.test.tsx`
- Create: `components/report-sections/executive-overview/needs-connection.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `NeedsConnection` taking `{ sourceName: string }`

- [ ] **Step 1: Write the failing test**

Create `components/report-sections/executive-overview/needs-connection.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NeedsConnection } from './needs-connection'

test('names the source that is not connected', () => {
  render(<NeedsConnection sourceName="CRM" />)
  expect(screen.getByText('CRM not connected')).toBeInTheDocument()
})

test('tells the reader what connecting would give them', () => {
  render(<NeedsConnection sourceName="CRM" />)
  expect(screen.getByText(/Connect CRM/)).toBeInTheDocument()
})

test('renders no number and no dash, which would read as real data', () => {
  const { container } = render(<NeedsConnection sourceName="CRM" />)
  const text = container.textContent ?? ''
  expect(text).not.toMatch(/\d/)
  expect(text).not.toContain('—')
  expect(text).not.toContain('$')
})

test('takes the label as a prop, so no vendor name is hardcoded', () => {
  render(<NeedsConnection sourceName="Analytics" />)
  expect(screen.getByText('Analytics not connected')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/report-sections/executive-overview/needs-connection.test.tsx`
Expected: FAIL, cannot resolve `./needs-connection`.

- [ ] **Step 3: Create the component**

```tsx
interface NeedsConnectionProps {
  sourceName: string
}

/**
 * Block-scale placeholder for a data source this client has not connected.
 * Deliberately renders no number: a zero or a dash here would read as real
 * data meaning "none", which is the failure this page exists to avoid.
 *
 * Adapted from components/report-sections/empty-state.tsx with the call to
 * action removed, since there is no auth route to send anyone to.
 *
 * sourceName is passed 'CRM' on this page. On-screen copy deliberately does
 * not name a vendor: the client is on one CRM today and may move to another,
 * and a client-facing report should not need editing when they do. Dropping it also drops the clientSlug and isPortal
 * props, neither of which a report section can obtain.
 */
export function NeedsConnection({ sourceName }: NeedsConnectionProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-bg-surface/50 px-8 py-12 text-center">
      <p className="text-lg font-bold text-white">{sourceName} not connected</p>
      <p className="mt-1 text-sm text-text-muted">
        Connect {sourceName} to see this data in the report.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/report-sections/executive-overview/needs-connection.test.tsx`
Expected: PASS, four tests green.

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/report-sections/executive-overview/needs-connection.tsx components/report-sections/executive-overview/needs-connection.test.tsx
git commit -m "feat(exec-overview): add the needs-connection card

Adapted from empty-state.tsx without its call to action, because there
is no auth route to send anyone to.

On-screen copy is vendor-neutral: the card reads CRM not connected. The
client is on one CRM today and may move to another, and a client-facing
report should not need editing when they do.

Tested for the thing that actually matters: it renders no digit, no
dash and no currency symbol. A zero or a dash here would read as real
data meaning none, which is the failure this whole page is organized
around avoiding."
```

---

## Task 4: Add the unconnected-card variant to the journey row

**Files:**
- Create: `components/report-sections/executive-overview/demand-journey.tsx`
- Create: `components/report-sections/executive-overview/demand-journey.test.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `DemandJourney` taking `{ stages: DemandStage[] }`, and an exported `DemandStage` where `metric` and `stats` are optional and a `connected?: boolean` field exists

- [ ] **Step 1: Copy the component**

```bash
cp components/report-sections/demand-overview/demand-journey.tsx \
   components/report-sections/executive-overview/demand-journey.tsx
```

- [ ] **Step 2: Write the failing test**

Create `components/report-sections/executive-overview/demand-journey.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DemandJourney } from './demand-journey'

const live: DemandStage = {
  key: 'ga4', source: 'Web Analytics', label: 'Site Sessions',
  metric: '89,234', subMetric: '2.1% conv. rate', delta: 15.4,
  color: '#4285F4',
  stats: [{ label: 'Active Users', value: '62,108' }],
}

const unconnected: DemandStage = {
  key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline',
  color: '#F5A623',
  connected: false,
}

test('a connected stage renders its metric', () => {
  render(<DemandJourney stages={[live]} />)
  expect(screen.getByText('89,234')).toBeInTheDocument()
})

test('an unconnected stage renders the needs-connection treatment instead of a metric', () => {
  render(<DemandJourney stages={[unconnected]} />)
  expect(screen.getByText(/Not connected/i)).toBeInTheDocument()
})

test('an unconnected stage still shows its source label, so the row reads as a funnel', () => {
  render(<DemandJourney stages={[unconnected]} />)
  expect(screen.getByText('Pipeline')).toBeInTheDocument()
})

test('an unconnected stage renders no delta, so no false arrow appears', () => {
  const { container } = render(<DemandJourney stages={[unconnected]} />)
  expect(container.textContent ?? '').not.toMatch(/%/)
})

test('all four stages render together in one row', () => {
  const stages = [live, { ...live, key: 'aeo', source: 'AEO' }, unconnected, { ...unconnected, key: 'inbound', source: 'Inbound Funnel' }]
  render(<DemandJourney stages={stages} />)
  expect(screen.getAllByText(/Not connected/i)).toHaveLength(2)
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run components/report-sections/executive-overview/demand-journey.test.tsx`
Expected: FAIL. The copy still requires `metric` and `stats`, so the unconnected fixture will not type-check, and nothing renders "Not connected".

- [ ] **Step 4: Loosen the type and add the variant flag**

In the copy, change the `DemandStage` interface so `metric` and `stats` are optional and a `connected` flag exists:

```ts
export interface DemandStage {
  key:         string
  source:      string
  label:       string
  metric?:     string
  subMetric?:  string
  delta?:      number
  color:       string
  connector?:  string
  heroLabel?:  string
  badge?:      string
  stats?:      { label: string; value: string }[]
  spark?:      { date: string; sessions: number }[]
  /** false renders the needs-connection treatment. Omitted or true renders normally. */
  connected?:  boolean
}

export interface DemandJourneyProps {
  stages: DemandStage[]
}
```

- [ ] **Step 5: Delete the built-in card header**

The wireframe shows a bare four-card panel. Delete the `<div className="mb-6">` block containing the "Full-Funnel View" eyebrow, the "Demand Journey" heading and the "From AI visibility to closed pipeline" subtitle. Keep the outer card frame and the flow row beneath it.

- [ ] **Step 6: Branch the hero metric slot**

Find the element rendering `{stage.metric}` in the large `text-3xl font-extrabold` slot. Replace it with:

```tsx
{stage.connected === false ? (
  <>
    <p className="text-sm font-bold text-white">Not connected</p>
    <p className="mt-1 text-xs text-text-muted">Connect a CRM to see this</p>
  </>
) : (
  <p className="text-3xl font-extrabold text-white">{stage.metric}</p>
)}
```

Match the surrounding element type and class names exactly as they appear in the copy; the snippet above shows the branch shape, not a replacement for the file's own wrapper.

- [ ] **Step 7: Make the stats guard null-safe**

Find `stage.stats.length` and change it to `stage.stats?.length`. This is required the moment `stats` is optional, independent of the variant, and `strict` will fail the build without it.

- [ ] **Step 8: Disable hover-expand on unconnected cards**

Find the `onMouseEnter` and `onMouseLeave` handlers on the card. Guard both so an unconnected card does not expand into an empty panel:

```tsx
onMouseEnter={() => { if (stage.connected !== false) setHov(stage.key) }}
onMouseLeave={() => { if (stage.connected !== false) setHov(null) }}
```

Use whatever state setter name the copy already uses.

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run components/report-sections/executive-overview/demand-journey.test.tsx`
Expected: PASS, five tests green.

- [ ] **Step 10: Verify types and that the original is untouched**

Run: `npx tsc --noEmit && git diff --stat components/report-sections/demand-overview/demand-journey.tsx`
Expected: tsc passes, diff against the original is empty.

- [ ] **Step 11: Commit**

```bash
git add components/report-sections/executive-overview/demand-journey.tsx components/report-sections/executive-overview/demand-journey.test.tsx
git commit -m "feat(exec-overview): journey row with an unconnected-card variant

metric and stats become optional and a connected flag is added. When
false the card shows a needs-connection treatment in place of the metric
and stat rows, keeping its frame, connector and source label so the
wireframe's single four-card row survives.

stage.stats.length becomes optional-chained, which strict requires the
moment stats is optional. Hover-expand is disabled on unconnected cards,
since expanding into an empty panel is worse than not expanding.

Also drops the built-in card header, which the wireframe does not show."
```

---

## Task 5: Extract the GA4 reshaping into pure functions

The source file does this inline under `Promise.all`, so every access assumes a resolved value. Ours runs under `allSettled`, so the copy must unwrap first. Pure functions make that explicit and testable.

**Files:**
- Create: `components/report-sections/executive-overview/reshape.ts`
- Test: `components/report-sections/executive-overview/reshape.test.ts`

**Interfaces:**
- Consumes: `TrendRow`, `AudienceRow`, `ChannelVolumeRow`, `ChannelConvRow`, `SourceMediumEntry` from Task 1
- Produces: `fmtNum`, `fmtPct`, `fmtDuration`, `fmtDate`, `fmtISODate`, `pct`, `buildTrendRows`, `buildAudienceRows`, `buildChannelData`

- [ ] **Step 1: Write the failing test**

Create `components/report-sections/executive-overview/reshape.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fmtNum, fmtPct, fmtDuration, pct, buildTrendRows, buildChannelData } from './reshape'

describe('formatters', () => {
  it('renders a dash for a missing number', () => {
    expect(fmtNum(null)).toBe('—')
    expect(fmtPct(undefined)).toBe('—')
  })
  it('formats a percentage from a GA4 decimal', () => {
    expect(fmtPct(0.0214)).toBe('2.1%')
  })
  it('formats a duration in minutes and seconds', () => {
    expect(fmtDuration(134)).toBe('2m 14s')
  })
  it('returns undefined for a delta with no prior value', () => {
    expect(pct(100, 0)).toBeUndefined()
    expect(pct(110, 100)).toBeCloseTo(10)
  })
})

describe('buildTrendRows', () => {
  it('returns an empty array when the current query failed', () => {
    expect(buildTrendRows(null, null)).toEqual([])
  })
  it('carries prior values onto each row when a compare set exists', () => {
    const cur = [{ date: '20260801', sessions: 10, activeUsers: 8, newUsers: 5 }]
    const cmp = [{ date: '20260701', sessions: 6, activeUsers: 5, newUsers: 3 }]
    const rows = buildTrendRows(cur, cmp)
    expect(rows).toHaveLength(1)
    expect(rows[0].sessions).toBe(10)
    expect(rows[0].prevSessions).toBe(6)
  })
  it('omits prior fields when there is no compare set', () => {
    const cur = [{ date: '20260801', sessions: 10, activeUsers: 8, newUsers: 5 }]
    expect(buildTrendRows(cur, null)[0].prevSessions).toBeUndefined()
  })
})

describe('buildChannelData', () => {
  it('returns empty structures when the query failed', () => {
    const out = buildChannelData(null, null, null)
    expect(out.volumeData).toEqual([])
    expect(out.convData).toEqual([])
  })
  it('computes share against the sum of returned rows', () => {
    const rows = [
      { sessionDefaultChannelGroup: 'Organic Search', sessions: 75, conversions: 3, sessionConversionRate: 0.04 },
      { sessionDefaultChannelGroup: 'Direct',         sessions: 25, conversions: 1, sessionConversionRate: 0.04 },
    ]
    const out = buildChannelData(rows, null, null)
    expect(out.volumeData[0].pct).toBe(75)
    expect(out.volumeData[1].pct).toBe(25)
  })
  it('excludes low-traffic rows from the conversion tab', () => {
    const rows = [
      { sessionDefaultChannelGroup: 'Organic Search', sessions: 100, conversions: 5, sessionConversionRate: 0.05 },
      { sessionDefaultChannelGroup: 'Referral',       sessions: 5,   conversions: 2, sessionConversionRate: 0.40 },
    ]
    const out = buildChannelData(rows, null, null)
    expect(out.convData.map(r => r.name)).toEqual(['Organic Search'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/report-sections/executive-overview/reshape.test.ts`
Expected: FAIL, cannot resolve `./reshape`.

- [ ] **Step 3: Write the reshaping module**

Create `components/report-sections/executive-overview/reshape.ts`. Copy the six formatters from `components/report-sections/ga4/index.tsx:33-76` verbatim, then port the four derivation blocks as pure functions that take already-unwrapped rows.

Port from these ranges in `components/report-sections/ga4/index.tsx`:

| Function | Port from |
|---|---|
| formatters | `:33-76` |
| `buildKpis` | `:261-314`, plus `KPI_METRICS` at `:78-87` |
| `buildTrendRows` | `:316-334` |
| `buildChannelData` | `:336-403`, as one block |
| `buildAudienceRows` | `:464-501` |

Three details the source will not hand you:

1. `returningUserCount` is computed inline in JSX at `:564` as active users minus new users, floored at zero. Lift it into `buildAudienceRows`'s return.
2. `buildChannelData` must port `:336-403` as a single unit. `channelConvData` depends on `channelColorMap`, which depends on `channelData`. Splitting them desynchronizes the two tabs' colors.
3. `compareDateLabel` is derived at `:537-539`, outside every range above, and feeds both charts' `compareLabel`. Port it as `buildCompareLabel(compare)`.

Every function must accept `null` for a failed query and return an empty structure rather than throwing. Signatures:

```ts
export type Ga4Row = Record<string, string | number | null | undefined>

export function buildTrendRows(current: Ga4Row[] | null, compare: Ga4Row[] | null): TrendRow[]
export function buildAudienceRows(rows: Ga4Row[] | null): { rows: AudienceRow[]; returningUserCount?: number }
export function buildChannelData(
  current: Ga4Row[] | null,
  compare: Ga4Row[] | null,
  sourceMedium: Ga4Row[] | null,
): { volumeData: ChannelVolumeRow[]; convData: ChannelConvRow[]; compareMap: Record<string, number>; sourceMediumMap: Record<string, SourceMediumEntry[]> }
export function buildCompareLabel(compare: { startDate: string; endDate: string } | null): string | undefined
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/report-sections/executive-overview/reshape.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Verify types and that no original changed**

Run: `npx tsc --noEmit && git status --short components/report-sections/ga4/`
Expected: tsc passes, and `git status` reports nothing under `ga4/`.

- [ ] **Step 6: Commit**

```bash
git add components/report-sections/executive-overview/reshape.ts components/report-sections/executive-overview/reshape.test.ts
git commit -m "feat(exec-overview): pure GA4 reshaping with null-safe inputs

Ported from the inline derivations in ga4/index.tsx. The source runs
under Promise.all so it dereferences results directly; this page runs
under allSettled, so every function takes already-unwrapped rows and
accepts null for a failed query, returning an empty structure rather
than throwing.

Carries the three things a naive copy drops: returningUserCount is
computed inline in JSX at the source, the channel block must move as one
unit or the two tabs' colors desynchronize, and compareDateLabel sits
outside every derivation range while feeding both charts."
```

---

## Task 6: Build the journey stages as a tested pure function

The orchestrator's one piece of real logic is deciding which cards are live and which are unconnected. That is worth a red-green cycle on its own, separately from the async component that calls it.

**Files:**
- Create: `components/report-sections/executive-overview/stages.test.ts`
- Create: `components/report-sections/executive-overview/stages.ts`

**Interfaces:**
- Consumes: `DemandStage` from Task 4, `fmtNum`, `fmtPct`, `pct` from Task 5
- Produces: `buildStages(input: StageInput): DemandStage[]`

- [ ] **Step 1: Write the failing test**

Create `components/report-sections/executive-overview/stages.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildStages } from './stages'

const totals = { sessions: 89234, activeUsers: 62108, newUsers: 34872, conversions: 1847, bounceRate: 0.384, sessionConversionRate: 0.021 }
const cmpTotals = { sessions: 77300 }
const peec = {
  weeklyVisibility: [{ visibility: 22.1 }, { visibility: 24.8 }],
  brandRankings: [{ name: 'Competitor', sov: 30, isYou: false }, { name: 'Renaissance', sov: 11.3, isYou: true }],
  trackedPrompts: [{}, {}, {}],
}

describe('buildStages', () => {
  it('always returns four stages in funnel order', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.map(x => x.key)).toEqual(['aeo', 'ga4', 'inbound', 'pipeline'])
  })

  it('marks the two CRM stages unconnected and gives them no metric', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    const crm = s.filter(x => x.key === 'inbound' || x.key === 'pipeline')
    expect(crm).toHaveLength(2)
    for (const stage of crm) {
      expect(stage.connected).toBe(false)
      expect(stage.metric).toBeUndefined()
      expect(stage.delta).toBeUndefined()
    }
  })

  it('never marks the GA4 or AEO stages unconnected', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.find(x => x.key === 'ga4')?.connected).not.toBe(false)
    expect(s.find(x => x.key === 'aeo')?.connected).not.toBe(false)
  })

  it('reads AI visibility from the latest week and the delta from the prior one', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    const aeo = s.find(x => x.key === 'aeo')!
    expect(aeo.metric).toBe('24.8%')
    expect(aeo.delta).toBeCloseTo(12.2, 0)
  })

  it('finds share of voice by the isYou flag, not by brand name', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.find(x => x.key === 'aeo')?.subMetric).toContain('11.3%')
  })

  it('leaves share of voice out when no brand is flagged isYou', () => {
    const noMatch = { ...peec, brandRankings: [{ name: 'Competitor', sov: 30, isYou: false }] }
    const s = buildStages({ totals, cmpTotals, peec: noMatch, trendRows: [] })
    expect(s.find(x => x.key === 'aeo')?.subMetric).toBeUndefined()
  })

  it('degrades to a dash when GA4 failed, rather than claiming zero', () => {
    const s = buildStages({ totals: null, cmpTotals: null, peec, trendRows: [] })
    expect(s.find(x => x.key === 'ga4')?.metric).toBe('—')
  })

  it('still returns four stages when every source failed', () => {
    const s = buildStages({ totals: null, cmpTotals: null, peec: null, trendRows: [] })
    expect(s).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/report-sections/executive-overview/stages.test.ts`
Expected: FAIL, cannot resolve `./stages`.

- [ ] **Step 3: Write the stage builder**

Create `components/report-sections/executive-overview/stages.ts`. It takes already-unwrapped data and returns exactly four stages. The two CRM stages carry `connected: false` and no metric, which is what makes the row render the needs-connection treatment.

```ts
import type { DemandStage } from './demand-journey'
import type { TrendRow } from './sessions-trend-chart'
import { fmtNum, fmtPct, pct } from './reshape'

export interface StageInput {
  totals: Record<string, unknown> | null
  cmpTotals: Record<string, unknown> | null
  peec: {
    weeklyVisibility?: { visibility: number }[]
    brandRankings?: { name: string; sov: number; isYou?: boolean }[]
    trackedPrompts?: unknown[]
  } | null
  trendRows: TrendRow[]
}

export function buildStages({ totals, cmpTotals, peec, trendRows }: StageInput): DemandStage[] {
  const weekly   = peec?.weeklyVisibility ?? []
  const latest   = weekly.at(-1)?.visibility ?? null
  const previous = weekly.at(-2)?.visibility ?? null
  // isYou is computed from clients.peec_your_brand. Matching on a literal brand
  // name here would blank share of voice for every client but the one hardcoded.
  const aeoSov   = peec?.brandRankings?.find((b) => b.isYou)?.sov ?? null

  return [
    {
      key: 'aeo', source: 'AEO', label: 'AI Visibility',
      metric: latest != null ? `${latest.toFixed(1)}%` : '—',
      subMetric: aeoSov != null ? `${aeoSov.toFixed(1)}% share of voice` : undefined,
      delta: latest != null && previous != null ? pct(latest, previous) : undefined,
      color: CHART_COLORS.primary,
      connector: 'drives\ndiscovery',
      heroLabel: 'visibility rate across tracked prompts',
      stats: [
        { label: 'Share of Voice',  value: aeoSov != null ? `${aeoSov.toFixed(1)}%` : '—' },
        { label: 'Tracked Brands',  value: peec?.brandRankings?.length?.toLocaleString() ?? '—' },
        { label: 'Tracked Prompts', value: peec?.trackedPrompts?.length?.toLocaleString() ?? '—' },
      ],
    },
    {
      key: 'ga4', source: 'Web Analytics', label: 'Site Sessions',
      metric: fmtNum(totals?.sessions as number),
      subMetric: `${fmtPct(totals?.sessionConversionRate as number)} conv. rate`,
      delta: pct(Number(totals?.sessions ?? 0), Number(cmpTotals?.sessions ?? 0)),
      color: CHART_COLORS.ga4,
      connector: 'converts\nto leads',
      heroLabel: 'sessions in the last 30 days',
      spark: trendRows.map((r) => ({ date: r.date, sessions: r.sessions })),
      stats: [
        { label: 'Active Users', value: fmtNum(totals?.activeUsers as number) },
        { label: 'New Users',    value: fmtNum(totals?.newUsers as number) },
        { label: 'Conversions',  value: fmtNum(totals?.conversions as number) },
        { label: 'Bounce Rate',  value: fmtPct(totals?.bounceRate as number) },
      ],
    },
    {
      key: 'inbound', source: 'Inbound Funnel', label: 'Online Contacts',
      color: CHART_COLORS.positive,
      connector: 'becomes\npipeline',
      connected: false,
    },
    {
      key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline',
      color: CHART_COLORS.warning,
      connected: false,
    },
  ]
}
```

If a `CHART_COLORS` key named above does not exist, substitute the nearest existing key. `lib/constants.ts` is shared and this task does not modify it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/report-sections/executive-overview/stages.test.ts`
Expected: PASS, eight tests green.

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/report-sections/executive-overview/stages.ts components/report-sections/executive-overview/stages.test.ts
git commit -m "feat(exec-overview): tested stage builder for the journey row

The orchestrator's only real logic is deciding which cards are live and
which are unconnected, so it lives in a pure function with its own
tests rather than inline in an async component nobody can run.

Covered: the two CRM stages always carry connected false with no metric
and no delta, the GA4 and AEO stages never do, share of voice is found
by the isYou flag rather than a brand-name match, and a failed GA4
fetch degrades to a dash instead of claiming zero."
```

---

## Task 7: Build the orchestrator

**Files:**
- Create: `components/report-sections/executive-overview/index.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1 to 6
- Produces: `ExecutiveOverviewReport` taking `{ clientSlug: string }`

- [ ] **Step 1: Write the component skeleton with internal range resolution**

```tsx
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { getPeecOverview } from '@/lib/peec/client'
import { getClientBySlug } from '@/lib/db/queries'
import { CHART_COLORS } from '@/lib/constants'
import { KpiCard } from './kpi-card'
import { NeedsConnection } from './needs-connection'
import { DemandJourney, type DemandStage } from './demand-journey'
import { SessionsTrendChart } from './sessions-trend-chart'
import { NewReturning } from './new-returning'
import { ChannelTabsChart } from './channel-tabs-chart'
import {
  fmtNum, fmtPct, fmtDuration, pct,
  buildTrendRows, buildAudienceRows, buildChannelData, buildCompareLabel,
} from './reshape'
import { buildStages } from './stages'

const KPI_METRICS = [
  'sessions', 'activeUsers', 'newUsers', 'bounceRate',
  'averageSessionDuration', 'screenPageViewsPerSession',
  'conversions', 'sessionConversionRate',
]

interface ExecutiveOverviewProps {
  clientSlug: string
}

export async function ExecutiveOverviewReport({ clientSlug }: ExecutiveOverviewProps) {
  const client = await getClientBySlug(clientSlug)

  // Ranges are resolved here, never taken from props. Every route passes
  // compareRange as null for a section with no date picker, and a default
  // parameter does not fire for null. Taking it from the caller renders every
  // delta on this page blank.
  const resolved = parseDateRange('last_30_days')
  const compare  = deriveCompareRange('last_30_days', 'previous_period')
  const mainIso  = `${resolved.startDate},${resolved.endDate}`
  const cmpIso   = compare ? `${compare.startDate},${compare.endDate}` : null

  return <div className="space-y-8">{/* blocks land here in later steps */}</div>
}
```

- [ ] **Step 2: Add the ten fetches under allSettled**

Insert after `cmpIso`:

```tsx
  const [
    totalsRes, cmpTotalsRes, trendRes, cmpTrendRes,
    channelRes, cmpChannelRes, channelSMRes,
    audienceRes, cmpAudienceRes, peecRes,
  ] = await Promise.allSettled([
    ga4Query({ clientSlug, dateRange: mainIso, metrics: KPI_METRICS }),
    cmpIso ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: KPI_METRICS }) : Promise.resolve(null),
    ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions', 'activeUsers', 'newUsers'], dimensions: ['date'], limit: 90 }),
    cmpIso ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: ['sessions', 'activeUsers', 'newUsers'], dimensions: ['date'], limit: 90 }) : Promise.resolve(null),
    ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions', 'conversions', 'sessionConversionRate'], dimensions: ['sessionDefaultChannelGroup'], limit: 10 }),
    cmpIso ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: ['sessions'], dimensions: ['sessionDefaultChannelGroup'], limit: 10 }) : Promise.resolve(null),
    ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions'], dimensions: ['sessionDefaultChannelGroup', 'sessionSource', 'sessionMedium'], limit: 150 }),
    ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions', 'engagementRate', 'averageSessionDuration'], dimensions: ['newVsReturning'] }),
    cmpIso ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: ['sessions', 'engagementRate', 'averageSessionDuration'], dimensions: ['newVsReturning'] }) : Promise.resolve(null),
    getPeecOverview(clientSlug, 'year_to_date'),
  ])

  const val = <T,>(r: PromiseSettledResult<T>): T | null =>
    r.status === 'fulfilled' ? r.value : null

  const totals      = val(totalsRes)?.rows?.[0] ?? null
  const cmpTotals   = val(cmpTotalsRes)?.rows?.[0] ?? null
  const trendRows   = buildTrendRows(val(trendRes)?.rows ?? null, val(cmpTrendRes)?.rows ?? null)
  const channel     = buildChannelData(val(channelRes)?.rows ?? null, val(cmpChannelRes)?.rows ?? null, val(channelSMRes)?.rows ?? null)
  const audience    = buildAudienceRows(val(audienceRes)?.rows ?? null)
  const cmpAudience = buildAudienceRows(val(cmpAudienceRes)?.rows ?? null)
  const peec        = val(peecRes)
  const cmpLabel    = buildCompareLabel(compare)
```

- [ ] **Step 3: Build the journey stages**

Insert after the unwrapping block. The logic lives in the tested builder from Task 6, so this is a single call.

```tsx
  const stages = buildStages({ totals, cmpTotals, peec, trendRows })
```

- [ ] **Step 4: Render the four blocks**

Replace the placeholder return with:

```tsx
  return (
    <div className="space-y-8">
      <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Last 30 days</p>

      <DemandJourney stages={stages} />

      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">Web Analytics</h2>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <KpiCard title="Sessions"             value={fmtNum(totals?.sessions as number)}                    delta={pct(Number(totals?.sessions ?? 0), Number(cmpTotals?.sessions ?? 0))} />
          <KpiCard title="Active Users"         value={fmtNum(totals?.activeUsers as number)}                 delta={pct(Number(totals?.activeUsers ?? 0), Number(cmpTotals?.activeUsers ?? 0))} />
          <KpiCard title="New Users"            value={fmtNum(totals?.newUsers as number)}                    delta={pct(Number(totals?.newUsers ?? 0), Number(cmpTotals?.newUsers ?? 0))} />
          <KpiCard title="Bounce Rate"          value={fmtPct(totals?.bounceRate as number)}                  delta={pct(Number(totals?.bounceRate ?? 0), Number(cmpTotals?.bounceRate ?? 0))} invertDelta />
          <KpiCard title="Avg Session Duration" value={fmtDuration(totals?.averageSessionDuration as number)} delta={pct(Number(totals?.averageSessionDuration ?? 0), Number(cmpTotals?.averageSessionDuration ?? 0))} />
          <KpiCard title="Pages / Session"      value={Number(totals?.screenPageViewsPerSession ?? 0).toFixed(1)} delta={pct(Number(totals?.screenPageViewsPerSession ?? 0), Number(cmpTotals?.screenPageViewsPerSession ?? 0))} />
          <KpiCard title="Conversions"          value={fmtNum(totals?.conversions as number)}                 delta={pct(Number(totals?.conversions ?? 0), Number(cmpTotals?.conversions ?? 0))} />
          <KpiCard title="Conversion Rate"      value={fmtPct(totals?.sessionConversionRate as number)}       delta={pct(Number(totals?.sessionConversionRate ?? 0), Number(cmpTotals?.sessionConversionRate ?? 0))} />
        </div>
        <SessionsTrendChart data={trendRows} compareLabel={cmpLabel} />
        <NewReturning rows={audience.rows} compareRows={cmpAudience.rows} returningUserCount={audience.returningUserCount} />
        <ChannelTabsChart volumeData={channel.volumeData} convData={channel.convData} compareMap={channel.compareMap} sourceMediumMap={channel.sourceMediumMap} />
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">Contact Creation</h2>
        <NeedsConnection sourceName="CRM" />
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">Pipeline Performance</h2>
        <NeedsConnection sourceName="CRM" />
      </section>
    </div>
  )
```

Note there is no page header here. The route already renders one; adding a second prints the client name twice.

- [ ] **Step 5: Verify types and the RSC boundary**

Run: `npx tsc --noEmit && npm run check:rsc`
Expected: both PASS. If `check:rsc` fails, a function is being passed to a `'use client'` component; remove it, since nothing on this page needs one.

- [ ] **Step 6: Verify no original changed**

Run: `git status --short | grep -v 'executive-overview'`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add components/report-sections/executive-overview/index.tsx
git commit -m "feat(exec-overview): orchestrator with ten fetches and four blocks

Takes clientSlug only and resolves both date ranges internally. Routes
pass compareRange as null for a section with no date picker and a
default parameter does not fire for null, so taking ranges from props
would render every delta on the page blank.

Nine GA4 queries plus one Peec call under allSettled, each unwrapped
before reshaping. Blocks three and four and two journey cards render
needs-connection rather than zeros.

No section header: the route renders one already."
```

---

## Task 8: Register the slug

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/constants.ts`

**Interfaces:**
- Consumes: nothing
- Produces: the slug `executive-overview` recognized by the type system, the nav and the portal sidebar

- [ ] **Step 1: Add to the ReportSlug union**

In `lib/db/schema.ts`, add `| 'executive-overview'` immediately after `| 'demand-overview'`.

- [ ] **Step 2: Add the display name**

In `lib/constants.ts`, inside `REPORT_NAMES`, add after the `'demand-overview'` line:

```ts
  'executive-overview': 'Overview',
```

- [ ] **Step 3: Add to NAV_GROUPS**

The invariant is `NAV_SLUG_ORDER[1] === 'executive-overview'`. Add it to the first group's slugs:

```ts
  {
    // No label. These sit above the Reports section.
    slugs: ['demand-overview', 'executive-overview'],
  },
```

- [ ] **Step 4: Add to ALL_REPORT_SLUGS**

This drives the portal sidebar, which is the surface Renaissance's client users load. Insert at index 1:

```ts
export const ALL_REPORT_SLUGS: string[] = [
  'demand-overview',
  'executive-overview',
  'peec-ai',
  'ga4',
  'paid-media',
  'inbound-funnel',
  'hubspot-performance',
  'organic-social',
  'request-a-report',
]
```

- [ ] **Step 5: Verify the invariant and that no client is affected**

Run:
```bash
npx tsx --env-file=.env.local -e "import('./lib/constants').then(c => { console.log('index 1:', c.NAV_SLUG_ORDER[1]); console.log('name:', c.REPORT_NAMES['executive-overview']) })"
```
Expected: `index 1: executive-overview` and `name: Overview`.

- [ ] **Step 6: Verify types**

Run: `npx tsc --noEmit`
Expected: PASS. No `Record<ReportSlug, ...>` exists in this codebase, so extending the union breaks no mapped type.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/constants.ts
git commit -m "feat(exec-overview): register the slug

Type union, display name, nav order and the portal slug list. Positioned
so NAV_SLUG_ORDER[1] is executive-overview, which makes it Renaissance's
landing section once enabled while leaving every other client untouched:
the default-section lookup skips a slug a client does not have, so
insertion position cannot change their result.

ALL_REPORT_SLUGS matters most here. It drives the portal sidebar, which
is what client users actually load, and appending would bury Overview
below three other sections for exactly that audience."
```

---

## Task 9: Wire all four dispatchers

`ENGINEERS.md:412` says there are two and names the wrong two. A missed case is invisible to `tsc` and reports green in the health sweep while rendering a blank page.

**Files:**
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx`
- Modify: `app/portal/[clientSlug]/reports/page.tsx`
- Modify: `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx`
- Modify: `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`

**Interfaces:**
- Consumes: `ExecutiveOverviewReport` from Task 7
- Produces: the page reachable on all four routes

- [ ] **Step 1: Add the import and case to the dashboard tab route**

In `app/dashboard/[clientSlug]/reports/page.tsx`, add the import alongside the other section imports:

```ts
import { ExecutiveOverviewReport } from '@/components/report-sections/executive-overview'
```

Then inside `getReportComponent`, immediately after the `case 'demand-overview':` block:

```tsx
    case 'executive-overview':
      return <ExecutiveOverviewReport clientSlug={clientSlug} />
```

- [ ] **Step 2: Repeat for the portal tab route**

Same import and same case in `app/portal/[clientSlug]/reports/page.tsx`. This is the route real client traffic uses and the health sweep never probes it.

- [ ] **Step 3: Repeat for the dashboard deep-link route**

Same import and same case in `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx`.

- [ ] **Step 4: Repeat for the portal deep-link route**

Same import and same case in `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`.

- [ ] **Step 5: Verify all four have it**

Run: `grep -rc "ExecutiveOverviewReport" app/dashboard/\[clientSlug\]/reports/page.tsx app/portal/\[clientSlug\]/reports/page.tsx app/dashboard/\[clientSlug\]/reports/\[reportSlug\]/page.tsx app/portal/\[clientSlug\]/reports/\[reportSlug\]/page.tsx`
Expected: `2` for each file, one import and one case.

- [ ] **Step 6: Verify types and the RSC boundary**

Run: `npx tsc --noEmit && npm run check:rsc`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard app/portal
git commit -m "feat(exec-overview): wire all four route dispatchers

ENGINEERS.md documents two and names the two deep-link routes. There are
four, and the two it omits are the ones users actually hit. A missed
case is invisible to tsc, which is not in CI anyway, and the health
sweep reports it green while the page renders blank.

Every case returns unconditionally and no dispatcher has fallthrough, so
this is purely additive for every other client."
```

---

## Task 10: Keep the page out of the channel and settings lists

**Files:**
- Modify: `components/report-sections/report-generator/index.tsx`
- Modify: `app/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: the registered slug from Task 8
- Produces: the page excluded from data-channel listings

- [ ] **Step 1: Exclude from the report generator's channel list**

In `components/report-sections/report-generator/index.tsx`, add `'executive-overview'` to the `NON_CHANNEL_SLUGS` set. Without this, Renaissance's Report Generator offers Overview as a live data channel, which it is not.

- [ ] **Step 2: Exclude from the settings platform list**

In `app/dashboard/settings/page.tsx`, add `'executive-overview'` to the exclusion array around line 170. Cosmetic only: without it the slug renders as an "Enabled Platform" chip on a page that lists every client.

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/report-generator/index.tsx app/dashboard/settings/page.tsx
git commit -m "feat(exec-overview): exclude from channel and platform listings

The report generator's list is single-gated, so without an entry it
offers Overview as a live data channel. The settings exclusion is
cosmetic but that page lists every client, so the chip would show up
outside Renaissance's own row."
```

---

## Task 11: Enable for Renaissance on dev and verify

Code first, then data. The portal landing page maps enabled reports raw and falls through to the bare slug when no display name exists, so enabling before deploying puts a card reading `executive-overview` on Renaissance's client-facing page.

**Files:**
- None. This task runs SQL against the dev database and verifies in a browser.

**Interfaces:**
- Consumes: everything from Tasks 1 to 10
- Produces: a rendering page

- [ ] **Step 1: Confirm the code is committed and typechecks**

Run: `git status --short && npx tsc --noEmit && npm test`
Expected: clean tree, tsc passes, tests pass.

- [ ] **Step 2: Enable the slug on dev only**

Run this against the dev database (`ep-still-tree`). It is idempotent and touches one row.

```sql
UPDATE clients
SET enabled_reports = array_append(enabled_reports, 'executive-overview')
WHERE slug = 'renaissance'
  AND NOT ('executive-overview' = ANY(enabled_reports));
```

Do not run `npm run db:seed`. It is stale against the live database in both directions and would un-hide a section for Avenue Z and strip three live sections from Renaissance.

- [ ] **Step 3: Start the dev server**

Run: `npm run dev`
Expected: ready within a few seconds. Client lookups are cached five minutes, so if the page does not appear immediately, wait rather than assuming the update failed.

- [ ] **Step 4: Verify the internal route**

Open `/dashboard/renaissance/reports?section=executive-overview` and confirm each:

- Header reads "RENAISSANCE" above "OVERVIEW", once. Two client names means the section rendered its own header.
- A "Last 30 days" label sits above the first block.
- Every one of the eight KPI cards shows a delta. A page of bare numbers means the ranges were taken from props instead of resolved internally.
- Traffic by Channel's By Conversion tab has rows. Empty means the channel query lost part of its metric list.
- The channel drill-down expands and has entries. Empty means the source/medium query was not issued.
- Share of voice shows a value on the AEO card. Blank means the brand lookup is not reading `isYou`.
- No "AI" badge and no generated-sounding sentence anywhere.
- Contact Creation and Pipeline Performance read "CRM not connected", never `$0`, never a dash, and never a vendor name.

- [ ] **Step 5: Verify the client-facing route**

Open `/portal/renaissance/reports?section=executive-overview`. The health sweep never probes this route and a blank page there would report green, so it must be checked by hand. Confirm the same list as Step 4.

- [ ] **Step 6: Verify no other client changed**

Open `/dashboard/avenue-z/reports?section=demand-overview` and confirm their Overview renders exactly as before. Then confirm Avenue Z's sidebar does not show a second "Overview" entry.

- [ ] **Step 7: Commit the verification note**

```bash
git commit --allow-empty -m "chore(exec-overview): verified on dev

Enabled for renaissance on the dev database and checked both surfaces.
Deltas render, the conversion tab and drill-down have rows, share of
voice resolves, both CRM blocks read CRM not connected, and no AI
badge appears. Avenue Z's pages are unchanged."
```

---

## Task 12: Mark the PR ready and hand off for review

**Files:**
- None.

**Interfaces:**
- Consumes: Tasks 1 to 11
- Produces: a reviewable PR

- [ ] **Step 1: Confirm the branch is synced**

Run: `git fetch origin && git status -sb | head -1 && git rev-list --left-right --count origin/dev...HEAD`
Expected: no divergence from the remote branch, and a count showing only our commits ahead of dev.

- [ ] **Step 2: Confirm the full check suite**

Run: `npx tsc --noEmit && npm run check:rsc && npm test && npm run lint`
Expected: all four pass. `tsc` is in no CI workflow, so this local run is the only type check that happens.

- [ ] **Step 3: Push and take the PR out of draft**

```bash
git push
gh pr ready 207
```

- [ ] **Step 4: Hand off**

Per the branch flow, this is reviewed by Paul and Thomas on PR #207 before it merges to `dev`. Do not merge. Two things the reviewers need from the spec:

- The enablement SQL must run separately on staging and production, after each deploy. Skipping it on staging means the page will not appear for whoever is reviewing, which reads as a broken build rather than a missing data step.
- Staging and production Peec and database credentials are not on the build machine, so the AEO card's first real render happens on a deploy.

---

## Self-Review

**TDD coverage.** Four tasks carry a real red-green-commit cycle: Task 3 (needs-connection), Task 4 (the unconnected card variant), Task 5 (GA4 reshaping) and Task 6 (stage assembly). Together those cover every piece of logic on this page.

Tasks 1 and 2 have no test and should not. Copying a file verbatim and deleting a component are not behaviors you can write a failing test for first; both are verified by `tsc` plus a diff proving no original changed.

Task 7 is the async orchestrator. It is deliberately thin: fetch, unwrap, call tested functions, render. Every decision it used to make now lives in `stages.ts` or `reshape.ts` behind tests. What remains is wiring, verified by the manual pass in Task 11.

Tasks 8 to 10 are registration. There is nothing to test beyond the type system and the runtime check in Task 8 Step 5.

**Spec coverage.** Every section maps to a task: the four blocks and their sources (Tasks 4, 6, 7), the copy boundary (Tasks 1 to 6), internal range resolution (Task 7 Step 1), the ten fetches (Task 7 Step 2), the reshaping and its three traps (Task 5 Step 3), needs-connection at both block and card scale (Tasks 3, 4, 6), page composition and the absent header (Task 7 Step 4), the period label (Task 7 Step 4), no AI commentary (Task 2), all twelve registration points (Tasks 8, 9, 10), enablement ordering (Task 11), and the verification list (Task 11 Steps 4 to 6).

**The open question is now closed.** The spec left it undecided whether tests ship with this PR. Running this plan under TDD answers it: they ship here. Tasks 3, 4, 5 and 6 each add a test file, and `npm test` runs on every PR.

**Type consistency.** `DemandStage` is defined once in Task 4 and consumed in Task 6's builder with `connected: false` on two stages. `buildStages` is declared with a signature in Task 6 Step 3 and called with exactly those four fields in Task 7 Step 3. `buildTrendRows`, `buildAudienceRows`, `buildChannelData` and `buildCompareLabel` are declared in Task 5 Step 3 and called with matching arguments in Task 7 Step 2. `ExecutiveOverviewReport` takes `{ clientSlug }` in Task 7 and is called with exactly that prop in all four dispatchers in Task 9. `NeedsConnection` takes `{ sourceName }` in Task 3 and is called with it twice in Task 7 Step 4.

**Placeholder scan.** No TBDs. Every code step carries the code. Where a snippet shows a branch shape rather than a full replacement (Task 4 Step 6), the step says so and names what to match against.
