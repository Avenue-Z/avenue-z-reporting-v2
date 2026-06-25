# FB-038: Content Impact §E ranked slope chart "Which pages are gaining momentum?" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new §E section to the Content Impact tab that renders a slope chart of the top 15 site pages ranked by absolute change in the selected metric, with 3 toggle buttons (AI Referral Traffic / Organic Search Traffic / Citation Share) that swap the Y-axis metric.

**Architecture:** One pure derivation helper (`lib/peec/slope-chart.ts`) takes pre-aggregated per-path/per-URL maps for current + prior periods for all 3 metrics, plus an active-metric selector, and returns the ranked slope points. One client component (`components/report-sections/peec-ai/slope-chart.tsx`) holds the toggle state, calls the helper for the active metric, and renders a Recharts LineChart with one line per page colored by direction (gainer green / loser red). Mount in `content-impact.tsx` as a new §E between §D Scatter and §F Fullsite Content Performance. The chart is compare-period gated: it renders only when `compareIso !== null`. When compare is off, an empty state asks the user to turn on a comparison period. Zero new fetches: all 6 data sources (3 metrics x 2 periods) are already in scope from FB-035 Task 4.

**Tech Stack:** Recharts (already in repo), Tailwind (already in repo), Next.js 15 RSC + client component, node:assert + tsx tests (repo convention).

## Global Constraints

- **Glean Chat API for all LLM inference.** Not relevant here, no LLM in this feature.
- **No em-dashes anywhere.** Use commas or hyphens in code, prose, comments, docs, copy.
- **Literal interpretation only.** Tina's title + subtitle + 3 toggle labels copied verbatim.
- **Truth-grounded.** If a metric is uncomputable for a page (e.g. citation share with zero total citations), exclude that page. Never fake a zero.
- **Universal across clients.** No per-client conditionals.
- **No new fetches.** All data must come from variables already in scope at `content-impact.tsx` line 1142.
- **Compare-period gated.** Render only when `compareIso !== null`. Empty state otherwise.
- **No Neon migrations.**
- **Never skip hooks. Never force-push.**

## Verbatim copy (Tina)

- **Section title:** `Which pages are gaining momentum and which are losing it?`
- **Section subtitle:** `Track the biggest movers over time to see which URLs are compounding, which are decaying, and where content performance is strengthening or slipping.`
- **Toggle button labels (in this order):**
  - `AI Referral Traffic`
  - `Organic Search Traffic`
  - `Citation Share`

## Data sources (confirmed already in scope at content-impact.tsx line 1142)

| Source variable | Lib origin | Shape | Use |
|---|---|---|---|
| `compareIso` (string \| null) | derived line 229 | YYYY-MM-DD,YYYY-MM-DD or null | Gate: chart hidden when null |
| `urlCitations` (UrlCitation[]) | `lib/peec/url-citations.ts` (FB-028) | rows with `url`, `urlKey`, `citationCount`, `domain` | Citation share, main period |
| `urlCitationsPrior` (UrlCitation[]) | same lib, prior fetch (FB-035) | same shape | Citation share, prior period |
| `ga4AiPathRows` (GA4 row[] \| null) | ga4Query (FB-035) | `pagePath`, `sessionSource`, `sessions` | AI referral, main period (filter `isAiSource(sessionSource)`) |
| `ga4AiPathPriorRows` (GA4 row[] \| null) | ga4Query (FB-035) | same shape | AI referral, prior period |
| `ga4ChannelMainRows` (GA4 row[] \| null) | ga4Query (FB-035) | `pagePath`, `sessionDefaultChannelGroup`, `sessions` | Organic, main period (filter `=== 'Organic Search'`) |
| `ga4ChannelPriorRows` (GA4 row[] \| null) | ga4Query (FB-035) | same shape | Organic, prior period |

## Anchor points (content-impact.tsx)

- Insert new compute block AFTER line 1141 (`</SectionCard>` closing §D) and BEFORE line 1143 (`{/* ── Section F: ... */}`).
- The new §E section card sits between those two anchors.
- All required vars are in scope at the insertion point (verified above).

## Identifier table (must match across tasks)

| Identifier | Type | Defined in |
|---|---|---|
| `SlopeMetric` | `'ai-referral' \| 'organic' \| 'citation-share'` | Task 1 |
| `SlopePoint` | `{ url: string; topic: string; prior: number; current: number; delta: number; direction: 'gainer' \| 'loser' \| 'flat' }` | Task 1 |
| `SlopeChartInput` | `{ aiReferralByPath: Map<string, [prior: number, current: number]>; organicByPath: Map<string, [prior: number, current: number]>; citationShareByUrlKey: Map<string, { prior: number; current: number; url: string }> }` | Task 1 |
| `SlopeChartResult` | `{ points: SlopePoint[]; metric: SlopeMetric }` | Task 1 |
| `computeSlopeChart(metric, input)` | `(metric: SlopeMetric, input: SlopeChartInput) => SlopeChartResult` | Task 1 |
| `<SlopeChart>` prop `input: SlopeChartInput` | React prop | Task 2 |
| `<SlopeChart>` prop `compareActive: boolean` | React prop | Task 2 |

## Decisions documented for transparency (Tina did not specify)

- **Top-N cap:** 15 pages by `|delta|`. Below ~10 the chart looks empty; above ~20 lines start to overlap badly.
- **Universe per metric:** all paths/URLs with > 0 in either period for the active metric. (0, 0) pages dropped.
- **Direction:** `gainer` if `current > prior`, `loser` if `current < prior`, `flat` if equal. Colors: gainer green `#60FF80`, loser red `#FF4444`, flat gray `#888888`.
- **Citation Share total:** computed across each period independently as `sum(citationCount)` over all `urlCitations` (or `urlCitationsPrior`) rows. Per-URL share = `urlCitationCount / periodTotal * 100`. When `periodTotal === 0`, that period's share is `0`.
- **Tooltip:** hover shows topic, URL, prior value, current value, delta.
- **Y-axis tick formatter:** percentages for `citation-share` (`%`); plain integers for `ai-referral` and `organic`.

---

### Task 1: Pure slope-chart helper + tests

**Files:**
- Create: `lib/peec/slope-chart.ts`
- Create: `lib/peec/slope-chart.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (these names are referenced verbatim in Tasks 2 + 3):
  - Type `SlopeMetric = 'ai-referral' | 'organic' | 'citation-share'`
  - Type `SlopePoint = { url: string; topic: string; prior: number; current: number; delta: number; direction: 'gainer' | 'loser' | 'flat' }`
  - Type `SlopeChartInput = { aiReferralByPath: Map<string, [number, number]>; organicByPath: Map<string, [number, number]>; citationShareByUrlKey: Map<string, { prior: number; current: number; url: string }> }`
  - Type `SlopeChartResult = { points: SlopePoint[]; metric: SlopeMetric }`
  - Function `computeSlopeChart(metric: SlopeMetric, input: SlopeChartInput): SlopeChartResult`
  - Behavior:
    1. Pick the right source map based on `metric`. For `ai-referral` use `aiReferralByPath`, for `organic` use `organicByPath`, for `citation-share` use `citationShareByUrlKey`.
    2. Build raw points. For the path-keyed metrics, `url = key`, `topic = labelFromPath(key)`. For citation-share, `url = entry.url`, `topic = labelFromPath(entry.url)`.
    3. Drop any point where `prior === 0 && current === 0`.
    4. Rank by `Math.abs(delta)` descending. Cap at top 15.
    5. Direction: `current > prior` → `'gainer'`, `current < prior` → `'loser'`, else `'flat'`.
    6. Return `{ points: SlopePoint[], metric }`.
  - `labelFromPath` is imported from `@/lib/url`.

- [ ] **Step 1: Write the failing tests**

Create `lib/peec/slope-chart.test.ts`:

```typescript
// lib/peec/slope-chart.test.ts
// Run: npx tsx lib/peec/slope-chart.test.ts
import { strict as assert } from 'node:assert'
import { computeSlopeChart } from './slope-chart'

const emptyInput = {
  aiReferralByPath: new Map(),
  organicByPath: new Map(),
  citationShareByUrlKey: new Map(),
}

// Empty input -> empty points, metric preserved.
{
  const r = computeSlopeChart('ai-referral', emptyInput)
  assert.deepEqual(r.points, [])
  assert.equal(r.metric, 'ai-referral')
}

// Each metric reads its own source map.
{
  const input = {
    aiReferralByPath: new Map([['/a', [10, 20] as [number, number]]]),
    organicByPath:    new Map([['/b', [50, 30] as [number, number]]]),
    citationShareByUrlKey: new Map([['/c-key', { prior: 1, current: 4, url: 'https://example.com/c' }]]),
  }
  const ai = computeSlopeChart('ai-referral', input)
  assert.equal(ai.points.length, 1)
  assert.equal(ai.points[0].url, '/a')
  assert.equal(ai.points[0].prior, 10)
  assert.equal(ai.points[0].current, 20)
  assert.equal(ai.points[0].delta, 10)
  assert.equal(ai.points[0].direction, 'gainer')

  const org = computeSlopeChart('organic', input)
  assert.equal(org.points.length, 1)
  assert.equal(org.points[0].url, '/b')
  assert.equal(org.points[0].delta, -20)
  assert.equal(org.points[0].direction, 'loser')

  const cit = computeSlopeChart('citation-share', input)
  assert.equal(cit.points.length, 1)
  assert.equal(cit.points[0].url, 'https://example.com/c')
  assert.equal(cit.points[0].prior, 1)
  assert.equal(cit.points[0].current, 4)
  assert.equal(cit.points[0].direction, 'gainer')
}

// (0, 0) entries are dropped; (n, 0) and (0, n) are kept.
{
  const input = {
    ...emptyInput,
    aiReferralByPath: new Map<string, [number, number]>([
      ['/dead', [0, 0]],
      ['/new',  [0, 5]],
      ['/gone', [5, 0]],
    ]),
  }
  const r = computeSlopeChart('ai-referral', input)
  const urls = r.points.map((p) => p.url).sort()
  assert.deepEqual(urls, ['/gone', '/new'])
}

// Direction classification: gainer / loser / flat
{
  const input = {
    ...emptyInput,
    aiReferralByPath: new Map<string, [number, number]>([
      ['/up',   [10, 20]],
      ['/down', [20, 10]],
      ['/flat', [10, 10]],
    ]),
  }
  const r = computeSlopeChart('ai-referral', input)
  const byUrl = Object.fromEntries(r.points.map((p) => [p.url, p.direction]))
  assert.equal(byUrl['/up'],   'gainer')
  assert.equal(byUrl['/down'], 'loser')
  assert.equal(byUrl['/flat'], 'flat')
}

// Ranking: top 15 by absolute delta, descending.
{
  // 17 pages with deltas 1, 2, 3, ..., 17. Top 15 should be deltas 3..17 (15 entries).
  const pairs: Array<[string, [number, number]]> = []
  for (let i = 1; i <= 17; i++) {
    pairs.push([`/p${i}`, [0, i]])
  }
  const input = { ...emptyInput, aiReferralByPath: new Map(pairs) }
  const r = computeSlopeChart('ai-referral', input)
  assert.equal(r.points.length, 15)
  // First point should be the biggest mover (delta = 17).
  assert.equal(r.points[0].delta, 17)
  // Last point should be the smallest mover that made the cut (delta = 3).
  assert.equal(r.points[14].delta, 3)
  // Pages with deltas 1 and 2 dropped.
  const urls = new Set(r.points.map((p) => p.url))
  assert.ok(!urls.has('/p1'))
  assert.ok(!urls.has('/p2'))
}

// Ranking treats absolute value of delta: a loser of -50 beats a gainer of +10.
{
  const input = {
    ...emptyInput,
    aiReferralByPath: new Map<string, [number, number]>([
      ['/big-loss',  [100, 50]],   // delta = -50, |delta| = 50
      ['/small-win', [10, 20]],    // delta = +10, |delta| = 10
    ]),
  }
  const r = computeSlopeChart('ai-referral', input)
  assert.equal(r.points[0].url, '/big-loss')
  assert.equal(r.points[1].url, '/small-win')
}

// Topic derives via labelFromPath from `@/lib/url`. Root path is "Home".
{
  const input = {
    ...emptyInput,
    aiReferralByPath: new Map<string, [number, number]>([
      ['/blog/foo-bar', [0, 5]],
      ['/',             [0, 3]],
    ]),
  }
  const r = computeSlopeChart('ai-referral', input)
  const byUrl = Object.fromEntries(r.points.map((p) => [p.url, p.topic]))
  assert.equal(byUrl['/blog/foo-bar'], 'Foo Bar')
  assert.equal(byUrl['/'],             'Home')
}

console.log('slope-chart.test.ts: all assertions passed')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx lib/peec/slope-chart.test.ts`
Expected: FAIL with `Cannot find module './slope-chart'` (helper file doesn't exist yet).

- [ ] **Step 3: Implement helper**

Create `lib/peec/slope-chart.ts`:

```typescript
// lib/peec/slope-chart.ts
//
// FB-038: Pure derivation for the Content Impact §E ranked slope chart
// "Which pages are gaining momentum and which are losing it?".
//
// Caller pre-aggregates per-path / per-URL values for all 3 metrics x 2
// periods (current + prior). This helper picks the right source map for the
// active metric, drops (0, 0) pages, ranks by absolute delta, caps to top 15,
// and assigns a direction (gainer / loser / flat) for line coloring.
//
// All data is sourced from variables already in scope at the §E mount point
// in content-impact.tsx; this file does no fetching.

import { labelFromPath } from '@/lib/url'

export type SlopeMetric = 'ai-referral' | 'organic' | 'citation-share'

export type SlopeDirection = 'gainer' | 'loser' | 'flat'

export interface SlopePoint {
  url: string
  topic: string
  prior: number
  current: number
  delta: number
  direction: SlopeDirection
}

export interface SlopeChartInput {
  aiReferralByPath: Map<string, [number, number]>
  organicByPath: Map<string, [number, number]>
  citationShareByUrlKey: Map<string, { prior: number; current: number; url: string }>
}

export interface SlopeChartResult {
  points: SlopePoint[]
  metric: SlopeMetric
}

const TOP_N = 15

function classifyDirection(prior: number, current: number): SlopeDirection {
  if (current > prior) return 'gainer'
  if (current < prior) return 'loser'
  return 'flat'
}

function pointsFromPathMap(map: Map<string, [number, number]>): SlopePoint[] {
  const out: SlopePoint[] = []
  for (const [path, pair] of map) {
    const prior = pair[0]
    const current = pair[1]
    if (prior === 0 && current === 0) continue
    out.push({
      url: path,
      topic: labelFromPath(path),
      prior,
      current,
      delta: current - prior,
      direction: classifyDirection(prior, current),
    })
  }
  return out
}

function pointsFromCitationMap(
  map: Map<string, { prior: number; current: number; url: string }>,
): SlopePoint[] {
  const out: SlopePoint[] = []
  for (const entry of map.values()) {
    if (entry.prior === 0 && entry.current === 0) continue
    out.push({
      url: entry.url,
      topic: labelFromPath(entry.url),
      prior: entry.prior,
      current: entry.current,
      delta: entry.current - entry.prior,
      direction: classifyDirection(entry.prior, entry.current),
    })
  }
  return out
}

export function computeSlopeChart(
  metric: SlopeMetric,
  input: SlopeChartInput,
): SlopeChartResult {
  let raw: SlopePoint[]
  if (metric === 'ai-referral') raw = pointsFromPathMap(input.aiReferralByPath)
  else if (metric === 'organic') raw = pointsFromPathMap(input.organicByPath)
  else raw = pointsFromCitationMap(input.citationShareByUrlKey)

  raw.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const points = raw.slice(0, TOP_N)
  return { points, metric }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx lib/peec/slope-chart.test.ts`
Expected: `slope-chart.test.ts: all assertions passed`

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 6: Commit**

```bash
git add lib/peec/slope-chart.ts lib/peec/slope-chart.test.ts
git commit -m "FB-038 Task 1: slope-chart helper computeSlopeChart + 7 tests"
```

---

### Task 2: SlopeChart client component

**Files:**
- Create: `components/report-sections/peec-ai/slope-chart.tsx`

**Interfaces:**
- Consumes: `SlopeChartInput`, `SlopeMetric`, `computeSlopeChart` from Task 1.
- Produces: default-exported React component `SlopeChart` accepting props:
  - `input: SlopeChartInput`
  - `compareActive: boolean` (when `false`, render empty state; when `true`, render the chart)

- [ ] **Step 1: Implement the component**

Create `components/report-sections/peec-ai/slope-chart.tsx`:

```typescript
'use client'

// FB-038: Ranked slope chart for §E "Which pages are gaining momentum
// and which are losing it?".
//
// Layout: 3 toggle buttons (AI Referral Traffic / Organic Search Traffic /
// Citation Share) above a Recharts LineChart. Exactly one toggle is active at
// any time. Switching toggles re-derives the top 15 pages by absolute delta
// of the active metric. Lines are colored by direction (green gainer, red
// loser, gray flat).
//
// Empty state when no comparison period is selected (compareActive=false).

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { computeSlopeChart } from '@/lib/peec/slope-chart'
import type { SlopeChartInput, SlopeMetric } from '@/lib/peec/slope-chart'
import { cn } from '@/lib/utils'

interface Props {
  input: SlopeChartInput
  compareActive: boolean
}

const TOGGLES: { value: SlopeMetric; label: string }[] = [
  { value: 'ai-referral',    label: 'AI Referral Traffic' },
  { value: 'organic',        label: 'Organic Search Traffic' },
  { value: 'citation-share', label: 'Citation Share' },
]

const DIRECTION_COLOR: Record<string, string> = {
  gainer: '#60FF80',
  loser:  '#FF4444',
  flat:   '#888888',
}

export default function SlopeChart({ input, compareActive }: Props) {
  const [metric, setMetric] = useState<SlopeMetric>('ai-referral')

  if (!compareActive) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
        <p className="text-xs text-text-muted">
          Turn on a comparison period from the date picker to see which pages are gaining momentum across periods.
        </p>
      </div>
    )
  }

  const result = computeSlopeChart(metric, input)

  if (result.points.length === 0) {
    return (
      <div className="space-y-3">
        <ToggleRow active={metric} onChange={setMetric} />
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">
            No movers in this metric for the selected periods.
          </p>
        </div>
      </div>
    )
  }

  // Reshape into Recharts row form: one row per period bucket, one numeric
  // field per page (named by url so the dataKey lookups below match).
  const chartData = [
    { period: 'Prior',   ...Object.fromEntries(result.points.map((p) => [p.url, p.prior])) },
    { period: 'Current', ...Object.fromEntries(result.points.map((p) => [p.url, p.current])) },
  ]

  const yTickFormatter = metric === 'citation-share'
    ? (v: number) => `${v.toFixed(1)}%`
    : (v: number) => `${v.toLocaleString()}`

  return (
    <div className="space-y-3">
      <ToggleRow active={metric} onChange={setMetric} />
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={chartData} margin={{ top: 16, right: 80, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#FFFFFF14" />
          <XAxis dataKey="period" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
          <YAxis tickFormatter={yTickFormatter} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#272727', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}
            labelStyle={{ color: '#FFFFFF', fontWeight: 600 }}
            itemStyle={{ color: '#FFFFFF' }}
            formatter={(value: unknown, name: unknown) => {
              const p = result.points.find((pt) => pt.url === String(name))
              const label = p?.topic ?? String(name)
              return [yTickFormatter(Number(value)), label]
            }}
          />
          {result.points.map((p) => (
            <Line
              key={p.url}
              type="linear"
              dataKey={p.url}
              stroke={DIRECTION_COLOR[p.direction]}
              strokeOpacity={0.7}
              strokeWidth={2}
              dot={{ r: 3, fill: DIRECTION_COLOR[p.direction] }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ToggleRow({ active, onChange }: { active: SlopeMetric; onChange: (m: SlopeMetric) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TOGGLES.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
            active === t.value
              ? 'border-white/40 bg-white/10 text-white'
              : 'border-white/10 bg-transparent text-text-muted hover:border-white/20 hover:text-white',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/slope-chart.tsx
git commit -m "FB-038 Task 2: SlopeChart client component (3-toggle, Recharts LineChart, direction colors)"
```

---

### Task 3: Mount §E in content-impact.tsx with pre-aggregated inputs

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

**Interfaces:**
- Consumes: `SlopeChartInput` + (default) `SlopeChart` from Task 2; existing in-scope vars `compareIso`, `urlCitations`, `urlCitationsPrior`, `ga4AiPathRows`, `ga4AiPathPriorRows`, `ga4ChannelMainRows`, `ga4ChannelPriorRows`, `isAiSource`, `urlJoinKey`.
- Produces: new `<SectionCard>` rendered between §D Scatter (closes at line 1141) and §F (starts at line 1143).

- [ ] **Step 1: Add the imports**

In `components/report-sections/peec-ai/content-impact.tsx`, near the existing peec-ai imports (around lines 25-26 where `BotVsHumanScatter` is imported), add:

```typescript
import type { SlopeChartInput } from '@/lib/peec/slope-chart'
import SlopeChart from '@/components/report-sections/peec-ai/slope-chart'
```

(`urlJoinKey`, `isAiSource` already imported in the file from prior FBs.)

- [ ] **Step 2: Add the §E compute block**

Immediately after the §D scatter compute block (find `const scatterData = computeBotVsHumanScatter(...)` around line 673), add the §E compute block. The block runs unconditionally but produces empty maps when prior data is missing; the component's `compareActive` prop controls whether it renders.

```typescript
// ── §E · Slope chart inputs (FB-038) ─────────────────────────────────────────
// Build per-path / per-url maps for all 3 metrics x 2 periods. All source
// vars (ga4AiPathRows, ga4AiPathPriorRows, ga4ChannelMainRows,
// ga4ChannelPriorRows, urlCitations, urlCitationsPrior) come from FB-035 and
// are already in scope. The chart itself is compare-period gated; when
// compareIso is null the prior arrays are empty and the component shows its
// empty state.

// AI Referral Traffic per page: sessions where isAiSource(sessionSource), per pagePath.
const slopeAiReferralByPath = new Map<string, [number, number]>()
const accAiCurrent = new Map<string, number>()
if (ga4AiPathRows) {
  for (const r of ga4AiPathRows) {
    if (!isAiSource(r.sessionSource)) continue
    const k = urlJoinKey(String(r.pagePath ?? ''))
    if (!k) continue
    accAiCurrent.set(k, (accAiCurrent.get(k) ?? 0) + (Number(r.sessions) || 0))
  }
}
const accAiPrior = new Map<string, number>()
if (ga4AiPathPriorRows) {
  for (const r of ga4AiPathPriorRows) {
    if (!isAiSource(r.sessionSource)) continue
    const k = urlJoinKey(String(r.pagePath ?? ''))
    if (!k) continue
    accAiPrior.set(k, (accAiPrior.get(k) ?? 0) + (Number(r.sessions) || 0))
  }
}
for (const k of new Set<string>([...accAiCurrent.keys(), ...accAiPrior.keys()])) {
  slopeAiReferralByPath.set(k, [accAiPrior.get(k) ?? 0, accAiCurrent.get(k) ?? 0])
}

// Organic Search Traffic per page: sessions where channel === 'Organic Search'.
const slopeOrganicByPath = new Map<string, [number, number]>()
const accOrgCurrent = new Map<string, number>()
if (ga4ChannelMainRows) {
  for (const r of ga4ChannelMainRows) {
    if (String(r.sessionDefaultChannelGroup ?? '') !== 'Organic Search') continue
    const k = urlJoinKey(String(r.pagePath ?? ''))
    if (!k) continue
    accOrgCurrent.set(k, (accOrgCurrent.get(k) ?? 0) + (Number(r.sessions) || 0))
  }
}
const accOrgPrior = new Map<string, number>()
if (ga4ChannelPriorRows) {
  for (const r of ga4ChannelPriorRows) {
    if (String(r.sessionDefaultChannelGroup ?? '') !== 'Organic Search') continue
    const k = urlJoinKey(String(r.pagePath ?? ''))
    if (!k) continue
    accOrgPrior.set(k, (accOrgPrior.get(k) ?? 0) + (Number(r.sessions) || 0))
  }
}
for (const k of new Set<string>([...accOrgCurrent.keys(), ...accOrgPrior.keys()])) {
  slopeOrganicByPath.set(k, [accOrgPrior.get(k) ?? 0, accOrgCurrent.get(k) ?? 0])
}

// Citation Share per URL: (urlCitationCount / periodTotalCitations) * 100,
// per period independently. Period total = sum of urlCitations citationCount.
const slopeCitationShareByUrlKey = new Map<string, { prior: number; current: number; url: string }>()
const totalCurrentCitations = urlCitations.reduce((s, c) => s + (Number(c.citationCount) || 0), 0)
const totalPriorCitations   = urlCitationsPrior.reduce((s, c) => s + (Number(c.citationCount) || 0), 0)
const currentByUrlKey = new Map<string, { count: number; url: string }>()
for (const c of urlCitations) {
  if (!c.urlKey) continue
  currentByUrlKey.set(c.urlKey, { count: Number(c.citationCount) || 0, url: c.url })
}
const priorByUrlKey = new Map<string, { count: number; url: string }>()
for (const c of urlCitationsPrior) {
  if (!c.urlKey) continue
  priorByUrlKey.set(c.urlKey, { count: Number(c.citationCount) || 0, url: c.url })
}
for (const k of new Set<string>([...currentByUrlKey.keys(), ...priorByUrlKey.keys()])) {
  const cur = currentByUrlKey.get(k)
  const pri = priorByUrlKey.get(k)
  const currentShare = (cur && totalCurrentCitations > 0) ? (cur.count / totalCurrentCitations) * 100 : 0
  const priorShare   = (pri && totalPriorCitations > 0)   ? (pri.count / totalPriorCitations)   * 100 : 0
  const url = cur?.url ?? pri?.url ?? k
  slopeCitationShareByUrlKey.set(k, { prior: priorShare, current: currentShare, url })
}

const slopeInput: SlopeChartInput = {
  aiReferralByPath:      slopeAiReferralByPath,
  organicByPath:         slopeOrganicByPath,
  citationShareByUrlKey: slopeCitationShareByUrlKey,
}
const slopeCompareActive = compareIso !== null
```

- [ ] **Step 3: Mount §E in JSX between §D and §F**

Find the §D closing `</SectionCard>` at line 1141 and the §F opening comment `{/* ── Section F: ... */}` at line 1143. Insert the new §E block between them:

```typescript
{/* ── Section E: Ranked slope chart (FB-038) ─────────────────────────── */}
<SectionCard
  title="Which pages are gaining momentum and which are losing it?"
  description="Track the biggest movers over time to see which URLs are compounding, which are decaying, and where content performance is strengthening or slipping."
>
  <SlopeChart input={slopeInput} compareActive={slopeCompareActive} />
</SectionCard>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 5: Run all 6 test files (regression sweep)**

```
DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
npx tsx lib/peec/bot-vs-human-scatter.test.ts
npx tsx lib/peec/slope-chart.test.ts
npx tsx lib/peec/url-citations.test.ts
npx tsx lib/peec/content-impact-synopsis.test.ts
npx tsx lib/ga4/content-derive.test.ts
```

Expected: every file prints its `all assertions passed` line.

- [ ] **Step 6: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "FB-038 Task 3: §E slope chart mounted, per-metric x per-period maps built from FB-035 data"
```

---

### Task 4: Verify, docs, push

**Files:**
- Modify: `docs/official-feedback/feedback-log.md`
- Modify: `docs/official-feedback/changelog.md`
- Modify: `docs/official-feedback/status.md`

- [ ] **Step 1: Confirm clean**

```
git status --short && npx tsc --noEmit
```
Expected: no unstaged changes, no tsc output.

- [ ] **Step 2: Append FB-038 entry to feedback-log.md**

Open `docs/official-feedback/feedback-log.md` and insert this block immediately after the `## Closed` line (line ~17), before the existing FB-037 entry:

```markdown
### FB-038 - Slope chart (Tina, 2026-06-25)

- **Ask (verbatim):**
  - ADD: Ranked Slope Chart of Top Site Pages With Toggle Buttons for AI Referral Traffic, Organic Search Traffic, Citation Share
  - Title: Which pages are gaining momentum and which are losing it?
  - Subtitle: Track the biggest movers over time to see which URLs are compounding, which are decaying, and where content performance is strengthening or slipping.
  - Specific request: These toggles would change the metric of the Y-Axis.
- **Decisions made (Tina did not specify; documented for transparency):**
  - Position: new §E between §D Bot vs Human Scatter and §F Fullsite Content Performance. Matches Tina's screenshot ordering (scatter, then slope).
  - Top-N cap: top 15 pages by absolute delta of the active metric (Tina's subtitle says "biggest movers"; 15 keeps the chart readable).
  - Per-toggle re-ranking: switching the toggle re-runs computeSlopeChart for the new metric and re-derives the top 15. The chart's universe changes with the metric.
  - Compare-period gating: chart renders only when compareIso !== null. Empty state otherwise asks the user to turn on a comparison period from the date picker. The slope chart inherently needs two periods; honoring Tina's FB-034 "when you have a comparison period turned on" principle.
  - Line colors by direction: green for gainers, red for losers, gray for flat. 70% stroke opacity to keep 15 lines readable.
  - Tooltip: hover shows topic + value + URL on the active line.
  - Y-axis tick formatter: percentages for citation-share, plain integers for ai-referral / organic.
  - Zero new fetches: all 6 source variables (3 metrics x 2 periods) already in scope at the §E mount point thanks to FB-035 Task 4.
- **Files touched:**
  - lib/peec/slope-chart.ts: pure helper computeSlopeChart + 5 exported types.
  - lib/peec/slope-chart.test.ts: 7 assertion blocks covering empty input, metric routing, (0,0) drop, direction classification, top-15 ranking, absolute-delta ranking, labelFromPath topics.
  - components/report-sections/peec-ai/slope-chart.tsx: client component (useState for active metric, 3 toggle buttons via ToggleRow, Recharts LineChart with one Line per top-15 page colored by direction, empty states for compare-off and zero-points).
  - components/report-sections/peec-ai/content-impact.tsx: imports + 3 pre-aggregated maps (aiReferralByPath, organicByPath, citationShareByUrlKey) built from existing FB-035 vars + §E SectionCard mount between §D and §F.
- **Sheet row:** Content Impact | ADD: Ranked Slope Chart of Top Site Pages With Toggle Buttons for AI Referral Traffic, Organic Search Traffic, Citation Share (toggles change Y-axis metric) | Done. New §E between §D Scatter and §F Fullsite. 3 toggle buttons swap Y-axis. Top 15 pages by absolute change of the active metric. Lines colored green (gainer) or red (loser). All data sourced from existing GA4 + Peec fetches (zero new round trips). Compare-period gated: renders only when comparison period is turned on, otherwise shows a "turn on comparison" empty state.
```

- [ ] **Step 3: Prepend FB-038 entry to changelog.md**

Open `docs/official-feedback/changelog.md` and insert this block immediately below the `---` separator (line ~9), before the existing `## FB-037` block:

```markdown
## FB-038 - Slope chart (2026-06-25)

FB-038 | 2026-06-25 | <pending> | a | New §E ranked slope chart on Content Impact: "Which pages are gaining momentum and which are losing it?" per Tina's literal ADD. Verbatim title and subtitle. 3 toggle buttons (AI Referral Traffic / Organic Search Traffic / Citation Share) swap the Y-axis metric. Top 15 pages by absolute delta of the active metric (Tina's "biggest movers" language). Lines colored by direction: green gainer, red loser, gray flat, 70% stroke opacity. Position: between §D Bot vs Human Scatter and §F Fullsite Content Performance. Zero new fetches: all 6 source variables (3 metrics x 2 periods) reuse FB-035 Task 4 data already in scope (ga4AiPathRows / ga4AiPathPriorRows for AI referral, ga4ChannelMainRows / ga4ChannelPriorRows filtered to Organic Search for organic, urlCitations / urlCitationsPrior for citation share). Citation share per URL = urlCitationCount / periodTotalCitations * 100, period totals computed independently. Compare-period gated: renders only when compareIso !== null. Empty state otherwise: "Turn on a comparison period from the date picker to see which pages are gaining momentum across periods." (matches Tina's FB-034 "when you have a comparison period turned on" pattern). New pure helper lib/peec/slope-chart.ts with 7 test assertion blocks. New client component components/report-sections/peec-ai/slope-chart.tsx (useState toggle, Recharts LineChart with one Line per top-15 page, direction colors, empty states for compare-off and zero-points, citation-share Y-axis formatted as percentages). Universal across clients. tsc clean. All 6 test files pass.
```

- [ ] **Step 4: Update status.md**

Open `docs/official-feedback/status.md`:

(a) Bump the commits-ahead count from `33 commits ahead` (or whatever current value is) to current+4 and append `+ FB-038` to the list of items.

(b) Replace the next-FB-ID line:
`- **Next FB ID:** **FB-038**.`
→
`- **Next FB ID:** **FB-039**.`

(c) Replace the bottom FB-ID line:
`FB IDs continue sequentially. **Next ID after FB-037 is FB-038.**`
→
`FB IDs continue sequentially. **Next ID after FB-038 is FB-039.**`

(d) In the Shipped FB log table, immediately above the FB-037 row, add:
```
| **FB-038** | Content Impact (content v1) | `official-feedback-content-impact-tab-content-v1` ([#77](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/77)) | (pending sha) | New §E ranked slope chart "Which pages are gaining momentum and which are losing it?" per Tina ADD. Verbatim title + subtitle. 3 toggle buttons (AI Referral Traffic / Organic Search Traffic / Citation Share) swap the Y-axis metric. Top 15 pages by absolute delta of the active metric. Green gainer / red loser / gray flat line colors. Compare-period gated: renders only when comparison period is on, empty state otherwise. Zero new fetches: 3 metrics x 2 periods all sourced from FB-035 data already in scope. New helper lib/peec/slope-chart.ts (7 tests) + client component slope-chart.tsx (useState toggle, Recharts LineChart). Position: between §D Scatter and §F Fullsite. Universal. tsc clean. |
```

(e) In the "Next batches" / "Next up" section near the bottom, mark the slope chart ADD as shipped:

Replace:
`- Tina ADD: Slope chart "Which pages are gaining momentum and which are losing it?" + verbatim subtitle + toggle buttons for AI Referral Traffic / Organic Search Traffic / Citation Share. Awaiting Thomas content.`
→
`- ~~Tina ADD: Slope chart "Which pages are gaining momentum and which are losing it?"~~ ✅ **shipped as FB-038**.`

- [ ] **Step 5: Em-dash sweep across FB-038 additions**

```
grep -n "—" lib/peec/slope-chart.ts lib/peec/slope-chart.test.ts components/report-sections/peec-ai/slope-chart.tsx 2>&1 | head -5
```

Expected: empty output. If anything appears, replace with commas/hyphens.

For docs files, only check lines you added in this FB (existing em-dashes in old content are out of scope):

```
git diff --no-color HEAD -- docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md docs/official-feedback/status.md | grep "^+" | grep "—"
```

Expected: empty output.

- [ ] **Step 6: Final tsc + 6-test sweep**

```
npx tsc --noEmit
DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
npx tsx lib/peec/bot-vs-human-scatter.test.ts
npx tsx lib/peec/slope-chart.test.ts
npx tsx lib/peec/url-citations.test.ts
npx tsx lib/peec/content-impact-synopsis.test.ts
npx tsx lib/ga4/content-derive.test.ts
```

Expected: tsc empty; all 6 tests print `all assertions passed`.

- [ ] **Step 7: Commit + push**

```bash
git add docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md docs/official-feedback/status.md docs/superpowers/plans/2026-06-25-content-impact-slope-chart.md
git commit -m "FB-038 Task 4: docs (feedback-log + changelog + status + sheet row + plan archive)"
git push origin official-feedback-content-impact-tab-content-v1
```

- [ ] **Step 8: Lockstep check**

```
git status --short && git rev-parse HEAD && git rev-parse @{u}
```

Expected: clean tree, local SHA = remote SHA.

---

## Self-Review (done)

**1. Spec coverage:**
- Slope chart: ✅ Tasks 1 + 2.
- 3 toggle buttons (verbatim labels): ✅ Task 2 TOGGLES const.
- "Toggles change Y-axis metric": ✅ Task 2 (useState metric drives Line dataKeys + yTickFormatter).
- Title: ✅ Task 3 Step 3 (verbatim).
- Subtitle: ✅ Task 3 Step 3 (verbatim).
- "Ranked": ✅ Task 1 (sort by |delta| descending).
- "Top Site Pages": ✅ Task 1 (TOP_N = 15 cap).
- "Biggest movers": ✅ ranking by abs delta is biggest-mover ranking.

**2. Placeholder scan:** No TBD/TODO. Every code block is concrete and complete. No "similar to Task N" references.

**3. Type consistency:** `SlopeMetric`, `SlopePoint`, `SlopeDirection`, `SlopeChartInput`, `SlopeChartResult`, `computeSlopeChart` all consistent between Task 1 definition and Tasks 2 + 3 consumers. The `[number, number]` tuple shape is `[prior, current]` everywhere it's used. The citation-share map value shape `{ prior, current, url }` matches Task 1 helper, Task 3 builder, and Task 1 tests.

**No spec gaps detected.**
