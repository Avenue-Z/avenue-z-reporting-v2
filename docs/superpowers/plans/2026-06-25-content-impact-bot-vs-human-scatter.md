# FB-037: Content Impact §D scatter chart "AI Bot Traffic vs. Human Traffic" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new §D section to the Content Impact tab that shows a scatter chart of each site page positioned by its AI bot crawl visits (X-axis) against its human GA4 sessions (Y-axis), divided into 4 quadrants by median split.

**Architecture:** One pure derivation helper (`lib/peec/bot-vs-human-scatter.ts`) that takes pre-aggregated per-path bot + human counts and returns scatter points + medians + per-point quadrant. One client component (`components/report-sections/peec-ai/bot-vs-human-scatter.tsx`) that renders the Recharts `<ScatterChart>` with median reference lines and 4 corner quadrant labels. Mount in `content-impact.tsx` as a new §D between §C Speed Stats and §F Fullsite Content Performance. Adds 1 new GA4 query (last-30-days, page-level) so the human axis matches the bot-side window. Page universe is the union of paths with > 0 bot visits OR > 0 human sessions in the period; (0, 0) pages are excluded.

**Tech Stack:** Recharts (already in repo), Tailwind (already in repo), Next.js 15 RSC + client components, node:assert + tsx tests (repo convention).

## Global Constraints

- **Glean Chat API for all LLM inference.** Not relevant here, no LLM in this feature.
- **No em-dashes anywhere.** Use commas or hyphens, in code, prose, comments, docs, copy.
- **Literal interpretation only.** Tina's title + subtitle + 4 quadrant labels copied verbatim.
- **Truth-grounded.** If a metric is uncomputable for a page, exclude that page. Never fake a zero.
- **Universal across clients.** No per-client conditionals (sandbox gate only when content is hardcoded Avenue-Z data, which this is not).
- **Cache version bumps on any shape change.** Not triggered in this plan because `getAgentAnalytics` is reused as-is and the new GA4 query goes through the existing cached `ga4Query`.
- **No Neon migrations.**
- **Never skip hooks. Never force-push.**

## Verbatim copy (Tina)

- **Title:** `AI Bot Traffic vs. Human Traffic`
- **Subtitle:** `See which pages are being crawled most by AI systems and how that compares with the human traffic those pages generate. Measures the last 30 days, independent of the page date range.`
  - (The "Measures the last 30 days, independent of the page date range." sentence is appended per FB-036 pattern to pre-empt the date-reactivity question Tina asked about §C Speed Stats. The first sentence is verbatim from her screenshot.)
- **Quadrant labels (clockwise from top-left):**
  - Top-left: `High Bot Traffic, Low Human Traffic` (wait, Tina's grid is laid out as a 2x2 table where the top row reads "High Bot, Low Human | High Bot, High Human" and the bottom row reads "Low Bot, Low Human | Low Bot, High Human" — see screenshot. So in (x=bot, y=human) Cartesian space: top-left = LOW bot HIGH human, top-right = HIGH bot HIGH human, bottom-left = LOW bot LOW human, bottom-right = HIGH bot LOW human. Tina's grid is just a label-listing, not a positional spec.)
  - **Final positional mapping (X = bots horizontal, Y = humans vertical, standard Cartesian where origin is bottom-left):**
    - **Top-right (high X, high Y):** `High Bot Traffic, High Human Traffic`
    - **Top-left (low X, high Y):** `Low Bot Traffic, High Human Traffic`
    - **Bottom-right (high X, low Y):** `High Bot Traffic, Low Human Traffic`
    - **Bottom-left (low X, low Y):** `Low Bot Traffic, Low Human Traffic`

## Data sources (confirmed)

- **AI bot crawl visits per page:** `agentData.byPath[k].totalVisits` from `lib/peec/agent-analytics.ts:170`, already fetched at `content-impact.tsx:248` via `getAgentAnalytics(clientSlug)`. Window is hardcoded to last 30 days in `getAgentAnalyticsImpl` at `lib/peec/agent-analytics.ts:284`. `k = urlJoinKey(request_path)` per `lib/peec/agent-analytics.ts:106 + :169`.
- **Human sessions per page:** Sum of `sessions` per `pagePath` where `!isAiSource(sessionSource)` from a new GA4 query (shape `pagePath × sessionSource × sessions`, window last-30-days, limit 1000). `isAiSource` lives at `lib/constants.ts:46` and matches the 13 known AI referrer domains (chatgpt.com, perplexity.ai, claude.ai, gemini.google.com, etc.).

## Path normalization

- `urlJoinKey` (`lib/url.ts:12`) is the canonical join key used by `agentData.byPath`.
- For a bare path like `/blog/foo/`, `urlJoinKey('/blog/foo/')` returns `/blog/foo`.
- For a GA4 pagePath like `/blog/foo/` or `/blog/foo`, both normalize to `/blog/foo`.
- Use `urlJoinKey(String(row.pagePath ?? ''))` on GA4 rows so the per-path lookup against `agentData.byPath` works.

## File Structure

| File | Responsibility |
|---|---|
| `lib/peec/bot-vs-human-scatter.ts` (new) | Pure helper: given two `Map<string, number>` (bots and humans per normalized path), returns scatter points + median bot + median human + per-point quadrant. Pure, no fetches. |
| `lib/peec/bot-vs-human-scatter.test.ts` (new) | 6 assertions covering empty input, median computation, quadrant assignment, (0,0) exclusion, single-point edge case, even/odd median. |
| `components/report-sections/peec-ai/bot-vs-human-scatter.tsx` (new) | Client component (`'use client'`). Renders Recharts `<ScatterChart>` + median reference lines + 4 corner labels + tooltip. Empty state when 0 points. |
| `components/report-sections/peec-ai/content-impact.tsx` (modify) | Add 1 new GA4 query in the existing `Promise.allSettled` block, normalize results, build the per-path human map, compute scatter via the helper, mount as new §D between §C and §F. |

## Identifier table (must match across tasks)

| Identifier | Type | Defined in |
|---|---|---|
| `BotVsHumanScatterPoint` | `{ path: string; bots: number; humans: number; quadrant: BotVsHumanQuadrant }` | Task 1 |
| `BotVsHumanQuadrant` | `'high-bot-high-human' \| 'low-bot-high-human' \| 'high-bot-low-human' \| 'low-bot-low-human'` | Task 1 |
| `BotVsHumanScatterResult` | `{ points: BotVsHumanScatterPoint[]; medianBot: number; medianHuman: number }` | Task 1 |
| `computeBotVsHumanScatter(input)` | `(input: { pathBots: Map<string, number>; pathHumans: Map<string, number> }) => BotVsHumanScatterResult` | Task 1 |
| `<BotVsHumanScatter>` prop `data: BotVsHumanScatterResult` | React prop | Task 2 |

---

### Task 1: Pure scatter helper + tests

**Files:**
- Create: `lib/peec/bot-vs-human-scatter.ts`
- Create: `lib/peec/bot-vs-human-scatter.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the foundation).
- Produces:
  - Type `BotVsHumanQuadrant = 'high-bot-high-human' | 'low-bot-high-human' | 'high-bot-low-human' | 'low-bot-low-human'`
  - Type `BotVsHumanScatterPoint = { path: string; bots: number; humans: number; quadrant: BotVsHumanQuadrant }`
  - Type `BotVsHumanScatterResult = { points: BotVsHumanScatterPoint[]; medianBot: number; medianHuman: number }`
  - Function `computeBotVsHumanScatter(input: { pathBots: Map<string, number>; pathHumans: Map<string, number> }): BotVsHumanScatterResult`
  - Behavior: union all keys from both maps. For each path, `bots = pathBots.get(p) ?? 0` and `humans = pathHumans.get(p) ?? 0`. Drop any point where `bots === 0 && humans === 0`. Compute medianBot + medianHuman across the surviving points. Assign quadrant: `bots > medianBot && humans > medianHuman` -> `high-bot-high-human`, etc. Boundary tie: a point exactly at the median is "low" (use `>` not `>=`). When 0 points survive, return `{ points: [], medianBot: 0, medianHuman: 0 }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/peec/bot-vs-human-scatter.test.ts`:

```typescript
// lib/peec/bot-vs-human-scatter.test.ts
// Run: npx tsx lib/peec/bot-vs-human-scatter.test.ts
import { strict as assert } from 'node:assert'
import { computeBotVsHumanScatter } from './bot-vs-human-scatter'

// ── Empty input ──
{
  const result = computeBotVsHumanScatter({
    pathBots: new Map(),
    pathHumans: new Map(),
  })
  assert.deepEqual(result.points, [])
  assert.equal(result.medianBot, 0)
  assert.equal(result.medianHuman, 0)
}

// ── (0, 0) points excluded ──
{
  const result = computeBotVsHumanScatter({
    pathBots: new Map([['/a', 0], ['/b', 5]]),
    pathHumans: new Map([['/a', 0], ['/b', 0]]),
  })
  assert.equal(result.points.length, 1)
  assert.equal(result.points[0].path, '/b')
  assert.equal(result.points[0].bots, 5)
  assert.equal(result.points[0].humans, 0)
}

// ── Union of keys: path in only one map appears with the other value as 0 ──
{
  const result = computeBotVsHumanScatter({
    pathBots: new Map([['/only-bot', 3]]),
    pathHumans: new Map([['/only-human', 7]]),
  })
  const paths = result.points.map((p) => p.path).sort()
  assert.deepEqual(paths, ['/only-bot', '/only-human'])
  const onlyBot = result.points.find((p) => p.path === '/only-bot')!
  const onlyHuman = result.points.find((p) => p.path === '/only-human')!
  assert.equal(onlyBot.bots, 3)
  assert.equal(onlyBot.humans, 0)
  assert.equal(onlyHuman.bots, 0)
  assert.equal(onlyHuman.humans, 7)
}

// ── Median computation (odd count) ──
{
  // bots: 1, 2, 3, 4, 5  → median 3
  // humans: 10, 20, 30, 40, 50 → median 30
  const result = computeBotVsHumanScatter({
    pathBots: new Map([['/a', 1], ['/b', 2], ['/c', 3], ['/d', 4], ['/e', 5]]),
    pathHumans: new Map([['/a', 10], ['/b', 20], ['/c', 30], ['/d', 40], ['/e', 50]]),
  })
  assert.equal(result.medianBot, 3)
  assert.equal(result.medianHuman, 30)
}

// ── Median computation (even count) ──
{
  // bots: 1, 2, 3, 4 → median (2+3)/2 = 2.5
  const result = computeBotVsHumanScatter({
    pathBots: new Map([['/a', 1], ['/b', 2], ['/c', 3], ['/d', 4]]),
    pathHumans: new Map([['/a', 10], ['/b', 20], ['/c', 30], ['/d', 40]]),
  })
  assert.equal(result.medianBot, 2.5)
  assert.equal(result.medianHuman, 25)
}

// ── Quadrant assignment + boundary tie goes to 'low' ──
{
  // Construct so medians fall exactly on a point and verify it lands in 'low'
  // bots: 0, 0, 10, 10 → 4 nonzero needed; (0,0) drops. Use 5 points.
  // bots: 1, 2, 5, 8, 9 → median 5  → /c with bots=5 should be 'low-bot'
  // humans: 10, 20, 50, 80, 90 → median 50 → /c with humans=50 should be 'low-human'
  const result = computeBotVsHumanScatter({
    pathBots:   new Map([['/a', 1], ['/b', 2], ['/c', 5], ['/d', 8], ['/e', 9]]),
    pathHumans: new Map([['/a', 10], ['/b', 20], ['/c', 50], ['/d', 80], ['/e', 90]]),
  })
  assert.equal(result.medianBot, 5)
  assert.equal(result.medianHuman, 50)
  const a = result.points.find((p) => p.path === '/a')!
  const c = result.points.find((p) => p.path === '/c')!
  const e = result.points.find((p) => p.path === '/e')!
  assert.equal(a.quadrant, 'low-bot-low-human')   // 1 < 5, 10 < 50
  assert.equal(c.quadrant, 'low-bot-low-human')   // ties go low (strict >)
  assert.equal(e.quadrant, 'high-bot-high-human') // 9 > 5, 90 > 50
}

// ── Mixed quadrants ──
{
  // bots median 5, humans median 50.
  // /low-low: 1, 10  → low-bot-low-human
  // /high-low: 9, 10 → high-bot-low-human
  // /low-high: 1, 90 → low-bot-high-human
  // /high-high: 9, 90 → high-bot-high-human
  const result = computeBotVsHumanScatter({
    pathBots:   new Map([['/ll', 1], ['/hl', 9], ['/lh', 1], ['/hh', 9], ['/mid1', 5], ['/mid2', 5]]),
    pathHumans: new Map([['/ll', 10], ['/hl', 10], ['/lh', 90], ['/hh', 90], ['/mid1', 50], ['/mid2', 50]]),
  })
  const byPath = Object.fromEntries(result.points.map((p) => [p.path, p.quadrant]))
  assert.equal(byPath['/ll'], 'low-bot-low-human')
  assert.equal(byPath['/hl'], 'high-bot-low-human')
  assert.equal(byPath['/lh'], 'low-bot-high-human')
  assert.equal(byPath['/hh'], 'high-bot-high-human')
}

console.log('bot-vs-human-scatter.test.ts: all assertions passed')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx lib/peec/bot-vs-human-scatter.test.ts`
Expected: FAIL with `Cannot find module './bot-vs-human-scatter'` (helper file doesn't exist yet).

- [ ] **Step 3: Implement helper**

Create `lib/peec/bot-vs-human-scatter.ts`:

```typescript
// lib/peec/bot-vs-human-scatter.ts
//
// FB-037: Pure derivation for the Content Impact §D scatter chart
// "AI Bot Traffic vs. Human Traffic".
//
// Input: per-path bot crawl counts (Peec /agent-analytics) and per-path human
// session counts (GA4, excluding AI-referred sessions). Both maps keyed by the
// canonical urlJoinKey of the path.
//
// Output: one scatter point per page that has any bot OR human traffic. Each
// point carries its quadrant assignment, derived from a median split on each
// axis. Boundary ties go to "low" (strict greater-than comparison).
//
// Pages with zero bot AND zero human traffic are dropped (not displayed).

export type BotVsHumanQuadrant =
  | 'high-bot-high-human'
  | 'low-bot-high-human'
  | 'high-bot-low-human'
  | 'low-bot-low-human'

export interface BotVsHumanScatterPoint {
  path: string
  bots: number
  humans: number
  quadrant: BotVsHumanQuadrant
}

export interface BotVsHumanScatterResult {
  points: BotVsHumanScatterPoint[]
  medianBot: number
  medianHuman: number
}

export interface BotVsHumanScatterInput {
  pathBots: Map<string, number>
  pathHumans: Map<string, number>
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function classifyQuadrant(bots: number, humans: number, medianBot: number, medianHuman: number): BotVsHumanQuadrant {
  const high_b = bots > medianBot
  const high_h = humans > medianHuman
  if (high_b && high_h) return 'high-bot-high-human'
  if (high_b && !high_h) return 'high-bot-low-human'
  if (!high_b && high_h) return 'low-bot-high-human'
  return 'low-bot-low-human'
}

export function computeBotVsHumanScatter(input: BotVsHumanScatterInput): BotVsHumanScatterResult {
  const allPaths = new Set<string>([...input.pathBots.keys(), ...input.pathHumans.keys()])
  const raw: { path: string; bots: number; humans: number }[] = []
  for (const path of allPaths) {
    const bots = input.pathBots.get(path) ?? 0
    const humans = input.pathHumans.get(path) ?? 0
    if (bots === 0 && humans === 0) continue
    raw.push({ path, bots, humans })
  }
  if (raw.length === 0) {
    return { points: [], medianBot: 0, medianHuman: 0 }
  }
  const medianBot = median(raw.map((r) => r.bots))
  const medianHuman = median(raw.map((r) => r.humans))
  const points: BotVsHumanScatterPoint[] = raw.map((r) => ({
    ...r,
    quadrant: classifyQuadrant(r.bots, r.humans, medianBot, medianHuman),
  }))
  return { points, medianBot, medianHuman }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx lib/peec/bot-vs-human-scatter.test.ts`
Expected: `bot-vs-human-scatter.test.ts: all assertions passed`

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 6: Commit**

```bash
git add lib/peec/bot-vs-human-scatter.ts lib/peec/bot-vs-human-scatter.test.ts
git commit -m "FB-037 Task 1: scatter helper computeBotVsHumanScatter + 6 tests"
```

---

### Task 2: BotVsHumanScatter client component

**Files:**
- Create: `components/report-sections/peec-ai/bot-vs-human-scatter.tsx`

**Interfaces:**
- Consumes: `BotVsHumanScatterResult` from Task 1 (`@/lib/peec/bot-vs-human-scatter`).
- Produces: default-exported React component `BotVsHumanScatter` accepting prop `data: BotVsHumanScatterResult`.

- [ ] **Step 1: Implement the component**

Create `components/report-sections/peec-ai/bot-vs-human-scatter.tsx`:

```typescript
'use client'

// FB-037: Recharts ScatterChart for §D "AI Bot Traffic vs. Human Traffic".
//
// X-axis = AI bot crawl visits per page (last 30 days, Peec /agent-analytics).
// Y-axis = Human GA4 sessions per page (last 30 days, sessionSource not in
//          the AI referrer list).
// 4 quadrants via median-split reference lines + corner labels.

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { BotVsHumanScatterResult } from '@/lib/peec/bot-vs-human-scatter'

interface Props {
  data: BotVsHumanScatterResult
}

// Per-quadrant fill so the four buckets are visually distinct without a legend.
const QUADRANT_FILL: Record<string, string> = {
  'high-bot-high-human': '#60FF80', // green: both high (winners)
  'low-bot-high-human':  '#39A0FF', // blue: human-popular, AI-quiet
  'high-bot-low-human':  '#FFC857', // yellow: AI is crawling, humans aren't visiting
  'low-bot-low-human':   '#888888', // gray: both low (background)
}

export default function BotVsHumanScatter({ data }: Props) {
  if (data.points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
        <p className="text-xs text-text-muted">
          No page-level bot or human traffic in the last 30 days. Requires GA4 page-level data and Peec agent analytics.
        </p>
      </div>
    )
  }

  const cornerLabel = 'text-[10px] font-semibold uppercase tracking-wide text-text-muted'

  // Render four overlay tags (one per corner). The chart fills the parent
  // container; the labels are absolutely positioned over the chart pane.
  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-0 z-10">
        <span className={`absolute left-4 top-4 ${cornerLabel}`}>Low Bot Traffic, High Human Traffic</span>
        <span className={`absolute right-4 top-4 ${cornerLabel}`}>High Bot Traffic, High Human Traffic</span>
        <span className={`absolute left-4 bottom-12 ${cornerLabel}`}>Low Bot Traffic, Low Human Traffic</span>
        <span className={`absolute right-4 bottom-12 ${cornerLabel}`}>High Bot Traffic, Low Human Traffic</span>
      </div>
      <ResponsiveContainer width="100%" height={420}>
        <ScatterChart margin={{ top: 24, right: 24, bottom: 40, left: 24 }}>
          <CartesianGrid stroke="#FFFFFF14" />
          <XAxis
            type="number"
            dataKey="bots"
            name="AI Bot Visits"
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            label={{ value: 'AI Bot Visits (last 30 days)', position: 'insideBottom', offset: -10, fill: '#9CA3AF', fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="humans"
            name="Human Sessions"
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            label={{ value: 'Human Sessions (last 30 days)', angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={{ background: '#272727', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}
            labelStyle={{ color: '#FFFFFF', fontWeight: 600 }}
            itemStyle={{ color: '#FFFFFF' }}
            formatter={(value: unknown, name: unknown) => [String(value), String(name)]}
            labelFormatter={(_label, payload) => {
              const p = payload?.[0]?.payload as { path?: string } | undefined
              return p?.path ?? ''
            }}
          />
          <ReferenceLine x={data.medianBot} stroke="#FFFFFF40" strokeDasharray="4 4" />
          <ReferenceLine y={data.medianHuman} stroke="#FFFFFF40" strokeDasharray="4 4" />
          <Scatter
            data={data.points.map((p) => ({
              ...p,
              fill: QUADRANT_FILL[p.quadrant],
            }))}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/bot-vs-human-scatter.tsx
git commit -m "FB-037 Task 2: BotVsHumanScatter client component (Recharts + median refs + quadrant overlays)"
```

---

### Task 3: New GA4 last-30 page fetch + §D mount

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

**Interfaces:**
- Consumes: `BotVsHumanScatterResult` + `computeBotVsHumanScatter` from Task 1 (`@/lib/peec/bot-vs-human-scatter`); default export from `components/report-sections/peec-ai/bot-vs-human-scatter` (Task 2). Existing `agentData: AgentAnalyticsData | null` already in scope. Existing `ga4Query` helper, `isAiSource` helper, `urlJoinKey` helper.
- Produces: a new `<SectionCard>` rendered in JSX between §C Speed Stats and §F Fullsite Content Performance.

**Why a new GA4 query (not reusing existing ga4Rows):** `ga4Rows` is scoped to the page date picker (`mainRangeStr`). Bot data is hardcoded to the last 30 days. Mixing windows is misleading. This task adds 1 dedicated GA4 query over a hardcoded last-30 window so both axes describe the same period.

**Window math (hardcoded, matches `getAgentAnalytics`):** start = today minus 30 days, end = today. Both as `YYYY-MM-DD`.

- [ ] **Step 1: Add the imports**

In `components/report-sections/peec-ai/content-impact.tsx`, near the existing peec imports (around lines 9-22), add:

```typescript
import { computeBotVsHumanScatter } from '@/lib/peec/bot-vs-human-scatter'
import BotVsHumanScatter from '@/components/report-sections/peec-ai/bot-vs-human-scatter'
import { urlJoinKey } from '@/lib/url'
```

(`urlJoinKey` may already be imported elsewhere in the file. If so, do not duplicate.)

- [ ] **Step 2: Add the new GA4 query to the existing Promise.allSettled block**

Find the existing `Promise.allSettled` call (around line 270 onwards) that fires the parallel fetches. Append one more `ga4Query` invocation at the end of the array:

```typescript
// FB-037 §D: GA4 page-level sessions over a HARDCODED last-30-days window,
// matched to the Peec agent-analytics window (also hardcoded last-30-days at
// lib/peec/agent-analytics.ts:284). Used by the scatter chart only.
ga4Query({
  clientSlug,
  dateRange: `${(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30)
    return start.toISOString().slice(0, 10)
  })()},${new Date().toISOString().slice(0, 10)}`,
  metrics: ['sessions'],
  dimensions: ['pagePath', 'sessionSource'],
  limit: 1000,
}),
```

(The exact insertion point is the closing `]` of the Promise.allSettled array. Place this BEFORE the closing bracket so it's the last entry.)

- [ ] **Step 3: Destructure the new result**

Find the destructuring of the `Promise.allSettled` results (search for `agentResult`). At the end of that destructuring, add the new variable. Match the existing style: each promise has its own slot, plus a `let X = result.status === 'fulfilled' ? result.value : null` line.

Add this line near the existing `let agentData = ...`:

```typescript
const ga4ScatterResult = results[results.length - 1]
const ga4ScatterRows = ga4ScatterResult.status === 'fulfilled' ? ga4ScatterResult.value.rows : null
if (ga4ScatterResult.status === 'rejected') console.error('[content-impact] GA4 §D scatter error:', ga4ScatterResult.reason)
```

**Important:** the existing code already destructures `results` into named slots positionally (search for `const agentResult = results[N]` or `const [a, b, c, ...] = results`). Whichever pattern is used, follow it for the new entry. The new entry MUST be the last in the Promise.allSettled array AND the last in the destructuring so the position matches.

- [ ] **Step 4: Compute the scatter data**

After the §C aggregation block (look for `const sectionCOk = timingOk` around line 630) and before the §A KPI derivations begin, add the §D compute block:

```typescript
// ── §D · Bot vs Human scatter (FB-037) ───────────────────────────────────────
// Build per-path maps over the hardcoded last-30-days window. Bot side comes
// from agentData.byPath (already last-30 by getAgentAnalytics window). Human
// side comes from the new ga4ScatterRows query (same last-30 window). Both
// maps are keyed by urlJoinKey so a (pagePath, request_path) pair joins.
const pathBots = new Map<string, number>()
if (agentData) {
  for (const [k, agg] of Object.entries(agentData.byPath)) {
    pathBots.set(k, agg.totalVisits)
  }
}
const pathHumans = new Map<string, number>()
if (ga4ScatterRows) {
  for (const row of ga4ScatterRows) {
    if (isAiSource(row.sessionSource)) continue
    const k = urlJoinKey(String(row.pagePath ?? ''))
    if (!k) continue
    pathHumans.set(k, (pathHumans.get(k) ?? 0) + (Number(row.sessions) || 0))
  }
}
const scatterData = computeBotVsHumanScatter({ pathBots, pathHumans })
```

- [ ] **Step 5: Mount §D in JSX between §C and §F**

Find the closing `</SectionCard>` of §C (the Speed Stats section, around line 1090). Immediately after that closing tag, BEFORE the §F section comment, insert the new §D block:

```typescript
{/* ── Section D: Bot vs Human scatter (FB-037) ───────────────────────── */}
<SectionCard
  title="AI Bot Traffic vs. Human Traffic"
  description="See which pages are being crawled most by AI systems and how that compares with the human traffic those pages generate. Measures the last 30 days, independent of the page date range."
>
  <BotVsHumanScatter data={scatterData} />
</SectionCard>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 7: Run all tests (regression sweep)**

```
DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
npx tsx lib/peec/bot-vs-human-scatter.test.ts
npx tsx lib/peec/url-citations.test.ts
npx tsx lib/peec/content-impact-synopsis.test.ts
npx tsx lib/ga4/content-derive.test.ts
```

Expected: every file prints its `all assertions passed` line.

- [ ] **Step 8: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "FB-037 Task 3: §D scatter mounted, new GA4 last-30 page query, urlJoinKey join"
```

---

### Task 4: Verify, docs, push

**Files:**
- Modify: `docs/official-feedback/feedback-log.md` (append FB-037 entry)
- Modify: `docs/official-feedback/changelog.md` (prepend FB-037 entry)
- Modify: `docs/official-feedback/status.md` (commit count, next FB ID, FB log row)

- [ ] **Step 1: Confirm everything still clean**

```
git status --short && npx tsc --noEmit
```
Expected: no unstaged changes, no tsc output.

- [ ] **Step 2: Append FB-037 entry to feedback-log.md**

Open `docs/official-feedback/feedback-log.md` and insert this block immediately after the `## Closed` line, before the existing `### FB-036` entry:

```markdown
### FB-037 - Bot vs Human scatter chart (Tina, 2026-06-25)

- **Ask (verbatim):**
  - ADD: Scatter Plot Chart of Site Pages by Bot Traffic vs. Human Traffic
  - Title: AI Bot Traffic vs. Human Traffic
  - Subtitle: See which pages are being crawled most by AI systems and how that compares with the human traffic those pages generate.
  - 4 quadrants: High Bot/Low Human, High Bot/High Human, Low Bot/Low Human, Low Bot/High Human.
- **Decisions made (Tina did not specify; documented for transparency):**
  - Page universe: union of paths with > 0 bot visits OR > 0 human sessions in the period. (0, 0) pages dropped (literal site pages with no activity to display).
  - High/Low threshold: median split on each axis. Adaptive, no magic numbers. Boundary ties go to "low" (strict > comparison).
  - Window: hardcoded last 30 days, independent of the page date range, matching the Peec agent-analytics window which is already hardcoded last-30 at lib/peec/agent-analytics.ts:284. Mirrors the §C Speed Stats and YTD chart pattern. Subtitle explicitly calls this out to pre-empt the date-reactivity question (lesson from FB-036).
  - Position: new §D between §C Speed Stats and §F Fullsite Content Performance. Both §C and §D are per-page snapshots; pair narratively.
  - Quadrant colors (no legend, Tina did not specify): green = both high (winners), blue = low-bot/high-human (human-popular but AI-quiet), yellow = high-bot/low-human (AI crawling but humans not visiting), gray = both low (background).
- **Files touched:**
  - lib/peec/bot-vs-human-scatter.ts: pure helper computeBotVsHumanScatter + 4 exported types.
  - lib/peec/bot-vs-human-scatter.test.ts: 6 assertions covering empty/median odd/median even/(0,0) drop/union/quadrant boundary.
  - components/report-sections/peec-ai/bot-vs-human-scatter.tsx: Recharts ScatterChart + median ReferenceLines + 4 absolute-positioned corner labels + tooltip + per-quadrant fill colors + empty state.
  - components/report-sections/peec-ai/content-impact.tsx: import helper + component + urlJoinKey, add 1 new GA4 query (hardcoded last-30, pagePath x sessionSource x sessions, limit 1000), build pathBots from agentData.byPath, build pathHumans from ga4ScatterRows excluding AI referrer sources, compute scatter, mount as §D between §C and §F.
- **Sheet row:** Content Impact | ADD: Scatter Plot Chart of Site Pages by Bot Traffic vs. Human Traffic (verbatim title and subtitle, 4 quadrants high/low Bot x high/low Human) | Done. New §D between §C and §F. AI bot data from Peec /agent-analytics/visits (already last-30 by SDK). Human data from a new GA4 query (pagePath x sessionSource, hardcoded last-30, excludes AI referrer sources). Median split per axis with boundary ties going low. Always-on last-30 window called out in subtitle so the date-reactivity question doesn't recur.
```

- [ ] **Step 3: Prepend FB-037 entry to changelog.md**

Open `docs/official-feedback/changelog.md` and insert this block immediately below the `---` separator, before the existing `## FB-036` block:

```markdown
## FB-037 - Bot vs Human scatter chart (2026-06-25)

FB-037 | 2026-06-25 | <pending> | a | New §D scatter chart on Content Impact: "AI Bot Traffic vs. Human Traffic" per Tina's literal ADD. Verbatim title and subtitle, 4 median-split quadrants. AI bot side from Peec /agent-analytics/visits per-path totals (agentData.byPath, already last-30 days from getAgentAnalytics). Human side from a new GA4 query (pagePath x sessionSource, hardcoded last-30 days to match the bot window, limit 1000) summed where !isAiSource (excludes ChatGPT/Claude/Perplexity/Gemini/etc.). Page universe is the union of paths with > 0 bot OR > 0 human traffic; (0,0) pages dropped. Boundary ties on the median go "low" (strict > comparison). Position: between §C Speed Stats and §F Fullsite Content Performance. New pure helper lib/peec/bot-vs-human-scatter.ts with 6 test assertions. New client component components/report-sections/peec-ai/bot-vs-human-scatter.tsx (Recharts ScatterChart, median ReferenceLines, 4 absolute corner labels, per-quadrant fill colors, tooltip, empty state). Subtitle explicitly says "Measures the last 30 days, independent of the page date range." to pre-empt the date-reactivity question (FB-036 pattern). Universal across clients. tsc clean. All 5 test files pass.
```

- [ ] **Step 4: Update status.md**

Open `docs/official-feedback/status.md`:

(a) On line ~22, bump the commits-ahead count from `29 commits ahead` to `33 commits ahead` and append `+ FB-037` to the list of items.

(b) Replace the next-FB-ID line:
`- **Next FB ID:** **FB-037**.`
→
`- **Next FB ID:** **FB-038**.`

(c) Replace the bottom FB-ID line:
`FB IDs continue sequentially. **Next ID after FB-036 is FB-037.**`
→
`FB IDs continue sequentially. **Next ID after FB-037 is FB-038.**`

(d) In the Shipped FB log table, immediately above the FB-036 row, add:
```
| **FB-037** | Content Impact (content v1) | `official-feedback-content-impact-tab-content-v1` ([#77](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/77)) | (pending sha) | New §D scatter chart "AI Bot Traffic vs. Human Traffic" per Tina ADD. Verbatim title + subtitle (with "last 30 days, independent of date range" pre-empt appended). 4 median-split quadrants. Bot data from Peec /agent-analytics/visits per-path totals (already hardcoded last-30). Human data from new GA4 query (pagePath x sessionSource, hardcoded last-30, limit 1000) summed where !isAiSource. Page universe = union of paths with any bot OR human activity; (0,0) dropped. New helper lib/peec/bot-vs-human-scatter.ts (6 tests) + client component bot-vs-human-scatter.tsx (Recharts ScatterChart, median ReferenceLines, corner labels, per-quadrant fill, tooltip, empty state). Position: between §C Speed Stats and §F Fullsite Content Performance. Universal. tsc clean. |
```

(e) In the "Next batches" section near the bottom, mark the scatter ADD as shipped:

Replace:
`- Tina ADD: Scatter chart "AI Bot Traffic vs. Human Traffic" + verbatim title + subtitle + 2×2 quadrants (High Bot/Low Human, High Bot/High Human, Low Bot/Low Human, Low Bot/High Human). Awaiting Thomas content.`
→
`- ~~Tina ADD: Scatter chart "AI Bot Traffic vs. Human Traffic"~~ ✅ **shipped as FB-037**.`

(f) Em-dash sweep: grep the file lines you just added/edited for `—`. If any slipped in, replace with commas/hyphens. Run:

```
grep -n "FB-037" docs/official-feedback/status.md | grep "—"
```

Expected: empty output.

- [ ] **Step 5: Em-dash sweep across all my FB-037 additions**

```
grep -n "—" lib/peec/bot-vs-human-scatter.ts lib/peec/bot-vs-human-scatter.test.ts components/report-sections/peec-ai/bot-vs-human-scatter.tsx docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md docs/official-feedback/status.md 2>&1 | grep -v "^$"
```

For every line in the output, only consider it a violation if the em-dash is inside a block I added in this FB. Existing em-dashes in old content do not need to be touched (separate scope). If any FB-037 line has an em-dash, replace with a comma or hyphen and re-run.

- [ ] **Step 6: Final tsc + test sweep**

```
npx tsc --noEmit
DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
npx tsx lib/peec/bot-vs-human-scatter.test.ts
npx tsx lib/peec/url-citations.test.ts
npx tsx lib/peec/content-impact-synopsis.test.ts
npx tsx lib/ga4/content-derive.test.ts
```

Expected: tsc empty; all 5 tests print `all assertions passed`.

- [ ] **Step 7: Commit + push**

```bash
git add docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md docs/official-feedback/status.md
git commit -m "FB-037 Task 4: docs (feedback-log + changelog + status + sheet row)"
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
- Title: ✅ Task 3 Step 5 (verbatim).
- Subtitle: ✅ Task 3 Step 5 (verbatim + appended always-on caveat per FB-036 lesson).
- Scatter plot: ✅ Tasks 1 + 2.
- 4 quadrants (Tina's 4 labels): ✅ Task 2 (positional Cartesian mapping documented above).
- Per-page data: ✅ Task 3 (bot via agentData.byPath, human via new GA4 query).
- Page universe: ✅ Task 1 (union of both maps, (0,0) excluded).
- Date window: ✅ Task 3 (last-30 hardcoded, both axes).

**2. Placeholder scan:** No TBD/TODO. Every code block is concrete. The new GA4 query inline-computes its own dateRange. The destructuring uses `results[results.length - 1]` to avoid hardcoding a position the engineer might miscount.

**3. Type consistency:** `BotVsHumanScatterPoint`, `BotVsHumanQuadrant`, `BotVsHumanScatterResult`, `computeBotVsHumanScatter` used identically across all tasks. The Recharts `<Scatter>` data prop receives an array that augments each point with a `fill` field (kept inside the component, not in the helper's type).

**No spec gaps detected.**
