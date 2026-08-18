# Paid Media Overview UI Iteration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Paid Media Overview's by-channel breakdown as organic-social-style KPI-card sections, add a blended stacked-area trend chart (Spend/Clicks toggle), and fix the KpiCard tooltip being occluded by the sticky header.

**Architecture:** Trend data comes from new **daily** per-channel series (`{date,spend,clicks}`, uniform `Date` field across sources), bucketed to weeks by **Monday date** and aligned across channels **by week key, never array index**. A cohesive `lib/paid-media/trend.ts` holds the fetchers + pure bucket/blend helpers. The shared `AreaChart` gains additive `stacked`/`valueFormat` props; a client `PaidMediaTrend` component owns the toggle.

**Tech Stack:** Next.js 16 (RSC), TypeScript strict, Recharts (via `components/charts/area-chart.tsx`), vitest + @testing-library/react, Supermetrics Data API (server-side).

**Companion spec:** `docs/superpowers/specs/2026-08-06-paid-media-overview-ui-iteration-design.md`.

## Global Constraints

- **Reuse `money()`** from `lib/paid-media/format.ts`; never touch `lib/supermetrics/format.ts` or `usd()`.
- **Align series by week key, never by array index** (the codebase's `alignSeries` join-by-index bug is a known hazard).
- **Trend is best-effort:** a configured channel whose series fetch rejects is omitted from the stack; the graph never blanks on one channel. (Distinct from the all-or-nothing KPI-tile blend — deliberate.)
- **Meta clicks = link clicks** (`inline_link_clicks`); Paid Search + LinkedIn = all clicks. Consistent with the KPI blend.
- **Day field is `'Date'` for all sources** (`lib/supermetrics/constants.ts` `SM_TIME_DIMENSION`), returning `'YYYY-MM-DD'`.
- **Channel colors:** Paid Search = `CHART_COLORS.googleAds`, Meta = `CHART_COLORS.metaAds`, LinkedIn = `CHART_COLORS.linkedin`.
- **RSC boundary:** `npm run check:rsc` stays green — the trend client component receives the plain `PaidMediaTrend` object; `AreaChart` receives only data + string `valueFormat` (no function props).
- **CI:** `npx vitest run`, `npx tsx scripts/check-rsc-props.ts`, `npx tsc --noEmit` all green before merge.
- **Branch:** `feat/paid-media-blended-leads` (PR #204). Commit per task.
- Reuse `ChannelKey` (`'paid-search' | 'meta' | 'linkedin'`) exported from `lib/paid-media/overview.ts`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `components/charts/kpi-card.tsx` | tooltip `z-10` → `z-40` | 1 |
| `components/charts/area-chart.tsx` | additive `stacked` + `valueFormat` props | 2 |
| `lib/paid-media/trend.ts` (new) | series fetchers + pure `weekStart`/`bucketToWeeks`/`blendTrend` + `getPaidMediaTrend` | 3, 4 |
| `lib/paid-media/trend.test.ts` (new) | pure-logic + rollup tests | 3, 4 |
| `components/report-sections/paid-media/overview/trend.tsx` (new) | client trend component (toggle + stacked area) | 5 |
| `components/report-sections/paid-media/overview/trend.test.tsx` (new) | toggle + props + empty-state | 5 |
| `components/report-sections/paid-media/overview/index.tsx` | by-channel card sections + wire trend | 6 |
| `components/report-sections/paid-media/overview/index.test.tsx` | sections + trend render + order | 6 |

**Note vs spec:** the spec listed three `lib/{channel}/series.ts` files; this plan consolidates all trend code into one cohesive `lib/paid-media/trend.ts` (fetchers call each channel's existing `base`), which is fewer files and easier to test with mocked bases. Same behavior.

---

## Task 1: Tooltip z-index fix

**Files:**
- Modify: `components/charts/kpi-card.tsx`
- Modify: `vitest.config.ts` (pin the new test — see Step 1b)
- Test: `components/charts/kpi-card.test.tsx` (new)

**Interfaces:** none new.

**Note:** `components/charts/` has **no** vitest glob — its suites are pinned individually (only `line-chart.test.tsx` today; the rest are `npx tsx` assertion scripts). The new test MUST be pinned explicitly or it won't run.

- [ ] **Step 1: Write the failing test** `components/charts/kpi-card.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { KpiCard } from './kpi-card'

describe('KpiCard tooltip stacking', () => {
  test('tooltip floats above the sticky header (z-40, not z-10)', () => {
    const { container } = render(<KpiCard title="Clicks" value="1,234" tooltip="Blended across channels" />)
    // The sticky report header is z-30; the tooltip must sit above it.
    const tip = container.querySelector('.z-40')
    expect(tip).not.toBeNull()
    expect(tip?.textContent).toContain('Blended across channels')
    expect(container.querySelector('.z-10')).toBeNull()
  })
})
```

- [ ] **Step 1b: Pin the test in `vitest.config.ts`.** Add to the `include` array, next to the existing `'components/charts/line-chart.test.tsx'` pin:
```ts
'components/charts/kpi-card.test.tsx',
```

- [ ] **Step 2: Run, verify it fails.** `npx vitest run components/charts/kpi-card.test.tsx` → FAIL (tooltip is `z-10`). It must actually run 1 test — if it says "no tests found", the pin in Step 1b is missing.

- [ ] **Step 3: Implement.** In `components/charts/kpi-card.tsx`, in the tooltip `<div className="... z-10 ...">`, change `z-10` to `z-40`. No other change.

- [ ] **Step 4: Run, verify pass.** `npx vitest run components/charts/kpi-card.test.tsx` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add components/charts/kpi-card.tsx components/charts/kpi-card.test.tsx vitest.config.ts
git commit -m "fix(charts): KpiCard tooltip floats above the sticky header (z-40)"
```

---

## Task 2: `AreaChart` — additive `stacked` + `valueFormat`

**Files:**
- Modify: `components/charts/area-chart.tsx`

**Interfaces:**
- Produces: `AreaChart` accepts `stacked?: boolean` and `valueFormat?: 'currency-cents'`.

No standalone unit test: `AreaChart` renders Recharts inside a `ResponsiveContainer`, which produces no measurable layout under jsdom (the whole codebase mocks chart components in tests rather than rendering them). This change is additive and type-checked here, and exercised via Task 5's trend-component test (which mocks `AreaChart` and asserts the props passed to it). Verify with `tsc`.

- [ ] **Step 1: Implement.** In `components/charts/area-chart.tsx`:
  1. Add the import: `import { money } from '@/lib/paid-media/format'`.
  2. Extend the props interface:
     ```ts
     interface AreaChartProps {
       data: Record<string, string | number>[]
       xKey: string
       yKeys: { key: string; color?: string; label?: string }[]
       height?: number
       /** Stack the areas (blended contribution view). */
       stacked?: boolean
       /** 'currency-cents' formats the Y axis + tooltip via money(); default = raw number. */
       valueFormat?: 'currency-cents'
     }
     ```
  3. Destructure the new props: `export function AreaChart({ data, xKey, yKeys, height = 300, stacked, valueFormat }: AreaChartProps) {`.
  4. Compute a formatter once: `const fmt = valueFormat === 'currency-cents' ? (v: number | string) => money(Number(v)) : undefined`.
  5. On `<YAxis …>` add `tickFormatter={fmt}`.
  6. On `<Tooltip …>` add `formatter={fmt}`.
  7. On each `<Area …>` add `stackId={stacked ? '1' : undefined}`.

- [ ] **Step 2: Typecheck.** `npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit.**
```bash
git add components/charts/area-chart.tsx
git commit -m "feat(charts): AreaChart supports stacked areas + currency-cents value format"
```

---

## Task 3: Trend pure logic — types, `weekStart`, `bucketToWeeks`, `blendTrend`

**Files:**
- Create: `lib/paid-media/trend.ts` (pure parts first)
- Test: `lib/paid-media/trend.test.ts` (in `lib/paid-media/**` include)

**Interfaces:**
- Consumes: `ChannelKey` from `./overview`.
- Produces:
  ```ts
  export interface ChannelSeriesPoint { date: string; spend: number; clicks: number } // date = 'YYYY-MM-DD'
  export interface TrendPoint { week: string; label: string; channels: Partial<Record<ChannelKey, { spend: number; clicks: number }>> }
  export interface PaidMediaTrend { points: TrendPoint[]; channels: ChannelKey[] }
  export function weekStart(date: string): string
  export function bucketToWeeks(points: ChannelSeriesPoint[]): Map<string, { spend: number; clicks: number }>
  export function blendTrend(perChannel: Array<{ key: ChannelKey; weeks: Map<string, { spend: number; clicks: number }> }>): TrendPoint[]
  ```

- [ ] **Step 1: Write failing tests** `lib/paid-media/trend.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { weekStart, bucketToWeeks, blendTrend } from './trend'
import type { ChannelSeriesPoint } from './trend'

describe('weekStart (Monday, UTC)', () => {
  test('maps every day of a week to that week Monday', () => {
    expect(weekStart('2026-08-03')).toBe('2026-08-03') // Monday
    expect(weekStart('2026-08-06')).toBe('2026-08-03') // Thursday → same Monday
    expect(weekStart('2026-08-09')).toBe('2026-08-03') // Sunday → same Monday
    expect(weekStart('2026-08-10')).toBe('2026-08-10') // next Monday
  })
})

describe('bucketToWeeks', () => {
  test('sums daily points into their Monday-keyed weeks', () => {
    const pts: ChannelSeriesPoint[] = [
      { date: '2026-08-06', spend: 100, clicks: 10 },
      { date: '2026-08-07', spend: 50, clicks: 5 },
      { date: '2026-08-10', spend: 200, clicks: 20 },
    ]
    const m = bucketToWeeks(pts)
    expect(m.get('2026-08-03')).toEqual({ spend: 150, clicks: 15 })
    expect(m.get('2026-08-10')).toEqual({ spend: 200, clicks: 20 })
  })
})

describe('blendTrend (align by week key, not index)', () => {
  test('two channels with different week sets align on the shared week', () => {
    // Paid Search has weeks W1 (Aug 3) + W2 (Aug 10); Meta has ONLY W2 (Aug 10).
    // An index-join would pair Meta's single week with W1 and corrupt the total.
    const ps = new Map([
      ['2026-08-03', { spend: 100, clicks: 10 }],
      ['2026-08-10', { spend: 300, clicks: 30 }],
    ])
    const meta = new Map([['2026-08-10', { spend: 50, clicks: 5 }]])
    const points = blendTrend([
      { key: 'paid-search', weeks: ps },
      { key: 'meta', weeks: meta },
    ])
    expect(points.map((p) => p.week)).toEqual(['2026-08-03', '2026-08-10']) // sorted union
    // W1: paid-search only (Meta absent, NOT mis-joined here).
    expect(points[0].channels['paid-search']).toEqual({ spend: 100, clicks: 10 })
    expect(points[0].channels.meta).toBeUndefined()
    // W2: both channels, on the same week key.
    expect(points[1].channels['paid-search']).toEqual({ spend: 300, clicks: 30 })
    expect(points[1].channels.meta).toEqual({ spend: 50, clicks: 5 })
    expect(points[1].label).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, verify it fails.** `npx vitest run lib/paid-media/trend.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** the pure section of `lib/paid-media/trend.ts`:

```ts
import type { ChannelKey } from './overview'

export interface ChannelSeriesPoint { date: string; spend: number; clicks: number } // 'YYYY-MM-DD'
export interface TrendPoint { week: string; label: string; channels: Partial<Record<ChannelKey, { spend: number; clicks: number }>> }
export interface PaidMediaTrend { points: TrendPoint[]; channels: ChannelKey[] }

/** Monday (UTC) of the week containing `date`, as 'YYYY-MM-DD'. */
export function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  const day = d.getUTCDay() // 0=Sun … 6=Sat
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().slice(0, 10)
}

function weekLabel(weekKey: string): string {
  return new Date(weekKey + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function bucketToWeeks(points: ChannelSeriesPoint[]): Map<string, { spend: number; clicks: number }> {
  const weeks = new Map<string, { spend: number; clicks: number }>()
  for (const p of points) {
    if (!p.date) continue
    const key = weekStart(p.date)
    const acc = weeks.get(key) ?? { spend: 0, clicks: 0 }
    acc.spend += p.spend
    acc.clicks += p.clicks
    weeks.set(key, acc)
  }
  return weeks
}

export function blendTrend(perChannel: Array<{ key: ChannelKey; weeks: Map<string, { spend: number; clicks: number }> }>): TrendPoint[] {
  const allWeeks = new Set<string>()
  for (const c of perChannel) for (const w of c.weeks.keys()) allWeeks.add(w)
  return [...allWeeks]
    .sort((a, b) => a.localeCompare(b))
    .map((week) => {
      const channels: TrendPoint['channels'] = {}
      for (const c of perChannel) {
        const v = c.weeks.get(week)
        if (v) channels[c.key] = v
      }
      return { week, label: weekLabel(week), channels }
    })
}
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run lib/paid-media/trend.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/paid-media/trend.ts lib/paid-media/trend.test.ts
git commit -m "feat(paid-media): trend week-bucketing + date-keyed blend (pure)"
```

---

## Task 4: Series fetchers + `getPaidMediaTrend`

**Files:**
- Modify: `lib/paid-media/trend.ts` (append fetchers + rollup)
- Test: `lib/paid-media/trend.test.ts` (append)

**Interfaces:**
- Consumes: `awQuery` (`@/lib/paid-search/base`), `metaQuery` (`@/lib/meta/base`), `linkedinQuery` (`@/lib/linkedin/base`) — each `(slug, fields, dateRange) => Promise<Record<string,string>[]>`; `getClientBySlug` (`@/lib/db/queries`).
- Produces: `getPaidMediaTrend(clientSlug, dateRange): Promise<PaidMediaTrend>`.

- [ ] **Step 1: Append failing tests** to `lib/paid-media/trend.test.ts`:

```ts
import { vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'

vi.mock('@/lib/paid-search/base', () => ({ awQuery: vi.fn() }))
vi.mock('@/lib/meta/base', () => ({ metaQuery: vi.fn() }))
vi.mock('@/lib/linkedin/base', () => ({ linkedinQuery: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))

import { getPaidMediaTrend } from './trend'
import { awQuery } from '@/lib/paid-search/base'
import { metaQuery } from '@/lib/meta/base'
import { linkedinQuery } from '@/lib/linkedin/base'
import { getClientBySlug } from '@/lib/db/queries'

const aw = awQuery as Mock, meta = metaQuery as Mock, li = linkedinQuery as Mock, client = getClientBySlug as Mock

beforeEach(() => { aw.mockReset(); meta.mockReset(); li.mockReset(); client.mockReset() })

describe('getPaidMediaTrend', () => {
  test('blends configured channels; Meta clicks come from link clicks', async () => {
    client.mockResolvedValue({ paidSearchConfig: {}, metaConfig: {}, linkedinConfig: null })
    aw.mockResolvedValue([{ Date: '2026-08-06', Cost: '100', Clicks: '10' }])
    meta.mockResolvedValue([{ Date: '2026-08-06', cost: '50', inline_link_clicks: '4' }])

    const t = await getPaidMediaTrend('acme', 'last_30_days')
    expect(t.channels).toEqual(['paid-search', 'meta']) // LinkedIn not configured → absent
    expect(li).not.toHaveBeenCalled()
    const wk = t.points.find((p) => p.week === '2026-08-03')!
    expect(wk.channels['paid-search']).toEqual({ spend: 100, clicks: 10 })
    expect(wk.channels.meta).toEqual({ spend: 50, clicks: 4 }) // 4 = inline_link_clicks
  })

  test('a configured channel that fails is omitted (best-effort), never throws', async () => {
    client.mockResolvedValue({ paidSearchConfig: {}, metaConfig: {}, linkedinConfig: {} })
    aw.mockResolvedValue([{ Date: '2026-08-06', Cost: '100', Clicks: '10' }])
    meta.mockRejectedValue(new Error('meta series failed'))
    li.mockResolvedValue([{ Date: '2026-08-06', spend: '30', clicks: '3' }])

    const t = await getPaidMediaTrend('acme', 'last_30_days')
    expect(t.channels).toEqual(['paid-search', 'linkedin']) // meta dropped
    expect(t.points[0].channels.meta).toBeUndefined()
    expect(t.points[0].channels.linkedin).toEqual({ spend: 30, clicks: 3 })
  })
})
```

- [ ] **Step 2: Run, verify it fails.** `npx vitest run lib/paid-media/trend.test.ts` → FAIL (`getPaidMediaTrend` not exported).

- [ ] **Step 3: Implement** — append to `lib/paid-media/trend.ts`:

```ts
import { awQuery } from '@/lib/paid-search/base'
import { metaQuery } from '@/lib/meta/base'
import { linkedinQuery } from '@/lib/linkedin/base'
import { getClientBySlug } from '@/lib/db/queries'

const toPoints = (rows: Record<string, string>[], spendKey: string, clicksKey: string): ChannelSeriesPoint[] =>
  rows.map((r) => ({ date: r.Date, spend: Number(r[spendKey] || 0), clicks: Number(r[clicksKey] || 0) })).filter((p) => p.date)

async function getPaidSearchSeries(slug: string, dateRange: string): Promise<ChannelSeriesPoint[]> {
  return toPoints(await awQuery(slug, ['Date', 'Cost', 'Clicks'], dateRange), 'Cost', 'Clicks')
}
async function getMetaSeries(slug: string, dateRange: string): Promise<ChannelSeriesPoint[]> {
  // Meta clicks = link clicks (inline_link_clicks) — consistent with the KPI blend.
  return toPoints(await metaQuery(slug, ['Date', 'cost', 'inline_link_clicks'], dateRange), 'cost', 'inline_link_clicks')
}
async function getLinkedInSeries(slug: string, dateRange: string): Promise<ChannelSeriesPoint[]> {
  return toPoints(await linkedinQuery(slug, ['Date', 'spend', 'clicks'], dateRange), 'spend', 'clicks')
}

export async function getPaidMediaTrend(clientSlug: string, dateRange: string): Promise<PaidMediaTrend> {
  const client = await getClientBySlug(clientSlug)
  const order: ChannelKey[] = ['paid-search', 'meta', 'linkedin']
  const configured: Record<ChannelKey, boolean> = {
    'paid-search': !!client?.paidSearchConfig,
    meta: !!client?.metaConfig,
    linkedin: !!client?.linkedinConfig,
  }
  const settled = await Promise.allSettled([
    configured['paid-search'] ? getPaidSearchSeries(clientSlug, dateRange) : Promise.resolve(null),
    configured.meta ? getMetaSeries(clientSlug, dateRange) : Promise.resolve(null),
    configured.linkedin ? getLinkedInSeries(clientSlug, dateRange) : Promise.resolve(null),
  ])
  const perChannel = order
    .map((key, i) => {
      const res = settled[i]
      if (res.status !== 'fulfilled' || res.value == null) return null
      return { key, weeks: bucketToWeeks(res.value) }
    })
    .filter((c): c is { key: ChannelKey; weeks: Map<string, { spend: number; clicks: number }> } => c !== null)

  return { points: blendTrend(perChannel), channels: perChannel.map((c) => c.key) }
}
```

- [ ] **Step 4: Run tests + typecheck.** `npx vitest run lib/paid-media/trend.test.ts` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit.**
```bash
git add lib/paid-media/trend.ts lib/paid-media/trend.test.ts
git commit -m "feat(paid-media): getPaidMediaTrend — daily per-channel series, best-effort blend"
```

---

## Task 5: `PaidMediaTrend` client component (toggle + stacked area)

**Files:**
- Create: `components/report-sections/paid-media/overview/trend.tsx`
- Test: `components/report-sections/paid-media/overview/trend.test.tsx`

**Interfaces:**
- Consumes: `PaidMediaTrend` (Task 3/4), `AreaChart` (Task 2), `CHART_COLORS`.
- Produces: `PaidMediaTrend` component (default export or named `PaidMediaTrendChart`) taking `{ trend: PaidMediaTrend }`.

- [ ] **Step 1: Write the failing test** `components/report-sections/paid-media/overview/trend.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import type { PaidMediaTrend as Trend } from '@/lib/paid-media/trend'

// AreaChart renders Recharts (no layout under jsdom) — mock it and record the props it receives.
let lastProps: { valueFormat?: string; stacked?: boolean; data?: unknown[]; yKeys?: { key: string }[] } = {}
vi.mock('@/components/charts/area-chart', () => ({
  AreaChart: (p: typeof lastProps) => { lastProps = p; return <div data-testid="area" /> },
}))

import { PaidMediaTrendChart } from './trend'

const trend: Trend = {
  channels: ['paid-search', 'meta'],
  points: [
    { week: '2026-08-03', label: 'Aug 3', channels: { 'paid-search': { spend: 100, clicks: 10 }, meta: { spend: 50, clicks: 4 } } },
  ],
}

describe('PaidMediaTrendChart', () => {
  test('defaults to Spend (cents format) and toggles to Clicks', () => {
    render(<PaidMediaTrendChart trend={trend} />)
    expect(lastProps.valueFormat).toBe('currency-cents')
    expect(lastProps.stacked).toBe(true)
    // Spend value plotted for Paid Search.
    expect((lastProps.data as Record<string, number>[])[0]['Paid Search']).toBe(100)

    fireEvent.click(screen.getByRole('button', { name: /clicks/i }))
    expect(lastProps.valueFormat).toBeUndefined() // clicks → raw number
    expect((lastProps.data as Record<string, number>[])[0]['Paid Search']).toBe(10)
  })

  test('empty trend → placeholder, no chart', () => {
    render(<PaidMediaTrendChart trend={{ channels: [], points: [] }} />)
    expect(screen.queryByTestId('area')).not.toBeInTheDocument()
    expect(screen.getByText(/no trend data/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, verify it fails.** `npx vitest run components/report-sections/paid-media/overview/trend.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement** `components/report-sections/paid-media/overview/trend.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { AreaChart } from '@/components/charts/area-chart'
import { CHART_COLORS } from '@/lib/constants'
import type { ChannelKey } from '@/lib/paid-media/overview'
import type { PaidMediaTrend } from '@/lib/paid-media/trend'

const CHANNEL_META: Record<ChannelKey, { label: string; color: string }> = {
  'paid-search': { label: 'Paid Search', color: CHART_COLORS.googleAds },
  meta: { label: 'Meta', color: CHART_COLORS.metaAds },
  linkedin: { label: 'LinkedIn', color: CHART_COLORS.linkedin },
}

export function PaidMediaTrendChart({ trend }: { trend: PaidMediaTrend }) {
  const [metric, setMetric] = useState<'spend' | 'clicks'>('spend')

  if (trend.points.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-center text-sm text-text-muted">
        No trend data for this period.
      </div>
    )
  }

  const data = trend.points.map((p) => {
    const row: Record<string, string | number> = { week: p.label }
    for (const key of trend.channels) row[CHANNEL_META[key].label] = p.channels[key]?.[metric] ?? 0
    return row
  })
  const yKeys = trend.channels.map((key) => ({ key: CHANNEL_META[key].label, color: CHANNEL_META[key].color, label: CHANNEL_META[key].label }))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">Trend</p>
        <div className="flex gap-1">
          {(['spend', 'clicks'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={
                metric === m
                  ? 'rounded-md bg-white/10 px-3 py-1 text-xs font-semibold text-white'
                  : 'rounded-md px-3 py-1 text-xs text-text-muted transition-colors hover:bg-white/10 hover:text-white'
              }
            >
              {m === 'spend' ? 'Spend' : 'Clicks'}
            </button>
          ))}
        </div>
      </div>
      <AreaChart
        stacked
        data={data}
        xKey="week"
        yKeys={yKeys}
        valueFormat={metric === 'spend' ? 'currency-cents' : undefined}
      />
      <p className="text-xs text-text-muted">
        Stacked by channel. Clicks are link clicks for Meta and all clicks for Paid Search and LinkedIn.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run tests + RSC + typecheck.** `npx vitest run components/report-sections/paid-media/overview/trend.test.tsx` → PASS; `npx tsx scripts/check-rsc-props.ts` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit.**
```bash
git add components/report-sections/paid-media/overview/trend.tsx components/report-sections/paid-media/overview/trend.test.tsx
git commit -m "feat(paid-media): blended trend component (Spend/Clicks toggle, stacked area)"
```

---

## Task 6: Overview assembly — by-channel card sections + wire the trend

**Files:**
- Modify: `components/report-sections/paid-media/overview/index.tsx`
- Test: `components/report-sections/paid-media/overview/index.test.tsx`

**Interfaces:**
- Consumes: `getPaidMediaTrend` + `PaidMediaTrendChart`; existing `getPaidMediaOverview`, `asMoney`, `asNum`, `KpiCard`.

- [ ] **Step 1: Extend the test** `components/report-sections/paid-media/overview/index.test.tsx`. Add a mock for the trend (its lib imports channel bases → next-auth), and assertions:

```tsx
vi.mock('@/lib/paid-media/trend', () => ({ getPaidMediaTrend: vi.fn() }))
// Mock the trend CHART component so Recharts doesn't load.
vi.mock('./trend', () => ({ PaidMediaTrendChart: () => <div data-testid="trend" /> }))
import { getPaidMediaTrend } from '@/lib/paid-media/trend'
;(getPaidMediaTrend as Mock).mockResolvedValue({ channels: [], points: [] })
```
In the existing missing-channel test, after render, assert the by-channel restyle + trend:
```tsx
// By-channel is now per-channel card sections, not a table.
expect(screen.queryByRole('table')).not.toBeInTheDocument()
// Each channel renders as a heading section.
expect(screen.getByRole('heading', { name: 'Paid Search' })).toBeInTheDocument()
expect(screen.getByRole('heading', { name: 'Meta Advertising' })).toBeInTheDocument()
// The trend chart is mounted between the tiles and the by-channel sections.
expect(screen.getByTestId('trend')).toBeInTheDocument()
```
(Keep the existing blended-tile + caption assertions; ensure the mocked `getPaidMediaOverview` object is unchanged from the prior task.)

- [ ] **Step 2: Run, verify it fails.** `npx vitest run components/report-sections/paid-media/overview/index.test.tsx` → FAIL (table still present / no trend).

- [ ] **Step 3: Implement** in `components/report-sections/paid-media/overview/index.tsx`:
  1. Add imports:
     ```ts
     import { getPaidMediaTrend } from '@/lib/paid-media/trend'
     import { PaidMediaTrendChart } from './trend'
     ```
  2. Fetch the trend alongside the overview:
     ```ts
     const [o, trend] = await Promise.all([
       getPaidMediaOverview(clientSlug, dateRange),
       getPaidMediaTrend(clientSlug, dateRange),
     ])
     ```
  3. Insert `<PaidMediaTrendChart trend={trend} />` immediately after the top-line caption `<p>` and before the By-Channel block.
  4. Replace the entire By-Channel `<div>…<table>…</table>…</div>` block with per-channel card sections (organic-social style). Keep the "By Channel" label and the trailing caption:
     ```tsx
     <div className="space-y-6">
       <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">By Channel</p>
       {o.channels.map((c) => (
         <section key={c.key} className="space-y-3">
           <h3 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{c.label}</h3>
           <div className="grid grid-cols-3 gap-3">
             <KpiCard title="Spend" value={asMoney(c.spend)} />
             <KpiCard title="Clicks" value={asNum(c.clicks)} />
             <KpiCard title="Leads" value={asNum(c.leads)} />
           </div>
         </section>
       ))}
       <p className="text-xs text-text-muted">
         Clicks are link clicks for Meta and all clicks for Paid Search and LinkedIn. Leads are shown
         per channel where available. Meta lead conversions are not available, so Meta shows &lsquo;—&rsquo;.
       </p>
     </div>
     ```

- [ ] **Step 4: Run tests + RSC + typecheck.** `npx vitest run components/report-sections/paid-media/overview/index.test.tsx` → PASS; `npx tsx scripts/check-rsc-props.ts` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit.**
```bash
git add components/report-sections/paid-media/overview/index.tsx components/report-sections/paid-media/overview/index.test.tsx
git commit -m "feat(paid-media): Overview by-channel card sections + blended trend chart"
```

---

## Final verification (before pushing to PR #204)

- [ ] `npx vitest run` → all green.
- [ ] `npx tsx scripts/check-rsc-props.ts` → passes.
- [ ] `npx tsc --noEmit` → clean.
- [ ] Manual: Overview shows blended tiles → stacked trend (toggle Spend/Clicks) → per-channel card sections (no table); the `?` tooltip on Clicks is legible above the header; a client with no LinkedIn shows 2 bands / 2 channel sections.

## Self-review (spec coverage)

- Spec §A (by-channel card sections) → Task 6. §B data layer (daily series + week-bucket + date-keyed blend + best-effort) → Tasks 3, 4; §B chart (stacked area + toggle) → Tasks 2, 5; §B wiring/layout → Task 6. §C (tooltip z-index) → Task 1. §4 tests → each task's tests (trend alignment = Task 3; best-effort = Task 4). Non-goals (Leads trend, daily granularity) not implemented, by design.
- Type consistency: `ChannelKey` from `overview.ts` used in `trend.ts` (Tasks 3/4) and `trend.tsx` (Task 5); `PaidMediaTrend`/`ChannelSeriesPoint`/`TrendPoint` defined in Task 3, consumed by Tasks 4/5/6; `AreaChart` `stacked`/`valueFormat` (Task 2) consumed by Task 5. Names align.
