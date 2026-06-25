# Organic Social Iterations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a date picker, an AI Executive Synopsis, a follower-growth line graph, and clickable post links to the Organic Social report section.

**Architecture:** The Organic Social section is a React Server Component (`components/report-sections/organic-social/index.tsx`) that fetches headline KPIs, trend data, and top content from the Dash Social API (`lib/dash-social/`) via per-feature modules in `lib/organic-social/`. This plan extends those modules and components without altering the Dash client. The synopsis mirrors the AEO section's Glean-backed, cached pattern.

**Tech Stack:** Next.js 15 (App Router, RSC), TypeScript (strict), Recharts (via `components/charts/line-chart.tsx`), Dash Social API, Glean Chat API (`lib/glean.ts`), the `cached()` wrapper (`lib/cache.ts`).

## Global Constraints

- All Dash Social and Glean calls are **server-side only** — never in a Client Component.
- No `any` in TypeScript. Follow strict mode.
- Tests in this repo are standalone `tsx` assertion scripts using `node:assert` (see `lib/organic-social/top-content.test.ts`). Run with `npx tsx --env-file=.env.local <path>`. There is no vitest/jest. Importing `./base` transitively loads the DB client, which throws without env — so test **pure functions** that do not import `./base`, or keep the pure logic in a module that does not transitively import `./base`.
- Match existing file style: 2-space indent, no semicolons, single quotes.
- Chart colors come from `CHART_COLORS` in `lib/constants.ts` — do not hardcode hex except the existing fallback palette already in `trends.tsx`.
- Synopsis must use the existing `gleanChat` helper and `cached()` wrapper; do not call any other LLM provider.

---

## Parallelization & Interconnection Map

This plan is built for a parallel agent fleet. Tasks are grouped into four
independent **streams**; within a stream, tasks are sequential.

```
Stream A — Date picker (feature 1)      [fully independent]
  A1: add organic-social to picker gate (dashboard + portal pages)

Stream B — Post links (feature 4)       [independent; touches types.ts]
  B1: add `url` to TopContentRow + extract permalink in transform (TDD)
  B2: render clickable caption in top-content.tsx

Stream C — Follower graph (feature 3)   [independent until C-integration]
  C1: extract pure `buildTrendSeries` helper + test (refactor)
  C2: add getFollowerTrend in trends.ts
  C3: refactor trends.tsx into shared ChannelTrendChart + FollowerTrend

Stream D — Synopsis (feature 2)         [independent until D-integration]
  D1: lib/organic-social/synopsis.ts + buildContext test (TDD)
  D2: components/.../synopsis.tsx

INTEGRATION (feature 2 + 3 wiring)      [depends on C3 and D2]
  E1: wire index.tsx — render <OrganicSocialSynopsis> first and
      <FollowerTrend> after engagement, add both to the parallel fetch
```

**Shared-file contention (read before assigning agents):**

- **`components/report-sections/organic-social/index.tsx`** is the single
  integration point. Streams C and D both ultimately need it, so index.tsx is
  NOT edited inside C or D — it is edited only in **Task E1**, after C3 and D2
  land. Assign E1 to one agent once C and D report done. This avoids two agents
  editing index.tsx concurrently.
- **`lib/organic-social/types.ts`** — only Stream B (Task B1) edits it (adds
  `url`). No other task touches it. Safe.
- **`lib/organic-social/trends.ts`** — only Stream C (C1, C2) edits it.
- **`components/report-sections/organic-social/trends.tsx`** — only Stream C
  (C3) edits it. It currently exports `EngagementTrend`, consumed by index.tsx.
  C3 keeps that export name AND adds a `FollowerTrend` export so E1 can import
  both without breaking the existing import.
- The two page files in Stream A are touched by no other stream.

**Interface contracts between streams (so agents don't need each other's diffs):**

- After C2, `lib/organic-social/trends.ts` exports
  `getFollowerTrend(slug: string, dateRange: string): Promise<TrendSeries>`.
- After C3, `components/report-sections/organic-social/trends.tsx` exports both
  `EngagementTrend({ series }: { series: TrendSeries })` and
  `FollowerTrend({ series }: { series: TrendSeries })`.
- After D1, `lib/organic-social/synopsis.ts` exports
  `getOrganicSocialSynopsis(clientSlug, dateRange, headlines, trend, top): Promise<{ synopsis: string; actions: string[] }>`.
- After D2, `components/report-sections/organic-social/synopsis.tsx` exports an
  async RSC `OrganicSocialSynopsis(props)` (props defined in D2).
- E1 consumes all four of the above.

---

## Stream A — Date Picker

### Task A1: Show the date picker on the Organic Social section

**Files:**
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx` (header `GA4DatePicker` gate)
- Modify: `app/portal/[clientSlug]/reports/page.tsx` (header `GA4DatePicker` gate)

**Interfaces:**
- Consumes: existing `GA4DatePicker` (already imported in both files), existing `dateRange`/`compareRange` locals, existing `OrganicSocialReport` (already receives `dateRange`/`compareRange`).
- Produces: nothing for other tasks.

- [ ] **Step 1: Add `organic-social` to the picker gate in the dashboard page**

In `app/dashboard/[clientSlug]/reports/page.tsx`, find the Paid Media picker block (around the existing `activeSection === 'paid-media'` conditional inside `<StickyReportHeader>`) and add an organic-social block next to it:

```tsx
{activeSection === 'organic-social' && (
  <Suspense fallback={null}>
    <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />
  </Suspense>
)}
```

- [ ] **Step 2: Add the same block to the portal page**

In `app/portal/[clientSlug]/reports/page.tsx`, find the `activeSection === 'paid-media'` picker block inside `<StickyReportHeader>` and add the identical organic-social block immediately after it:

```tsx
{activeSection === 'organic-social' && (
  <Suspense fallback={null}>
    <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />
  </Suspense>
)}
```

Verify `Suspense` is already imported in the portal file; if not, add it to the existing `import { ... } from 'react'`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open `/dashboard/<clientSlug>/reports?section=organic-social`, confirm the date picker appears in the header and its sub-label shows the resolved window (e.g. "Jun 1 – Jun 30, 2026"). Change the range and confirm the section reloads with the new window. Repeat for the portal route.

- [ ] **Step 5: Commit**

```bash
git add "app/dashboard/[clientSlug]/reports/page.tsx" "app/portal/[clientSlug]/reports/page.tsx"
git commit -m "feat(organic-social): show date picker on the section"
```

---

## Stream B — Clickable Top-Post Links

### Task B1: Pull post permalinks from Dash into the transform

**Files:**
- Modify: `lib/organic-social/types.ts` (add `url` to `TopContentRow`)
- Modify: `lib/organic-social/top-content.ts` (extract permalink)
- Test: `lib/organic-social/top-content.test.ts` (extend)

**Interfaces:**
- Consumes: `MediaV2Post` from `lib/dash-social/types.ts`, existing `transformTopContent`.
- Produces: `TopContentRow.url: string | null`, consumed by Task B2.

- [ ] **Step 1: Add the failing test**

Append to `lib/organic-social/top-content.test.ts`, before the final `console.log`:

```ts
// URL extraction: every row exposes a `url` field; at least one Instagram
// post in the fixture carries its permalink.
assert.ok('url' in rows[0], 'row exposes url field')
const ig = rows.find((r) => r.platform === 'Instagram' && r.url)
assert.ok(ig && ig.url!.startsWith('https://www.instagram.com/'), 'instagram permalink extracted')
assert.ok(rows.every((r) => r.url === null || typeof r.url === 'string'), 'url is string | null')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --env-file=.env.local lib/organic-social/top-content.test.ts`
Expected: FAIL (`url` not present / property missing on `TopContentRow`).

- [ ] **Step 3: Add `url` to the type**

In `lib/organic-social/types.ts`, add a field to `TopContentRow`:

```ts
export interface TopContentRow {
  id: number
  caption: string
  platform: string           // display: 'Instagram'
  sourceType: SourceType
  publishDate: string        // ISO date
  views: number              // views/impressions
  engagements: number
  url: string | null         // permalink to the live post, when Dash returns one
}
```

- [ ] **Step 4: Extract the permalink in the transform**

In `lib/organic-social/top-content.ts`, update `metricsFor` to also return a `url`, and set it on the row. Replace the existing `metricsFor` and the row-building map:

```ts
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/** Extract (caption, views, engagements, url) from whichever per-platform sub-object is populated. */
function metricsFor(post: MediaV2Post): { caption: string; views: number; engagements: number; url: string | null } {
  const ig = post.instagram, fb = post.facebook, li = post.linkedin, tw = post.twitter
  if (ig) return { caption: String(ig.caption ?? ''), views: n(ig.paid_and_organic_reach) || n(ig.impressions), engagements: n(ig.engagements_public) || n(ig.like_count) + n(ig.comments_count), url: str(ig.url) }
  if (fb) return { caption: String(fb.message ?? ''), views: n(fb.organic_views) || n(fb.organic_reach), engagements: n(fb.organic_engagements), url: str(fb.url) }
  if (li) return { caption: String(li.caption ?? ''), views: n(li.impressions), engagements: n(li.engagements), url: str(li.linkedin_link) }
  if (tw) return { caption: String(tw.text ?? ''), views: n(tw.impressions), engagements: n(tw.engagements), url: str(tw.permalink_url) }
  return { caption: '', views: 0, engagements: 0, url: null }
}
```

Then in `transformTopContent`, add `url: m.url,` to the returned `TopContentRow` object (alongside `views` and `engagements`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --env-file=.env.local lib/organic-social/top-content.test.ts`
Expected: PASS (`organic top-content: all assertions passed`).

- [ ] **Step 6: Commit**

```bash
git add lib/organic-social/types.ts lib/organic-social/top-content.ts lib/organic-social/top-content.test.ts
git commit -m "feat(organic-social): extract post permalinks from Dash"
```

### Task B2: Render the caption as a link

**Files:**
- Modify: `components/report-sections/organic-social/top-content.tsx`

**Interfaces:**
- Consumes: `TopContentRow.url` (from B1).
- Produces: nothing for other tasks.

- [ ] **Step 1: Carry the url through `top5` and render it**

In `components/report-sections/organic-social/top-content.tsx`, the `top5` function builds the display rows fed to `DataTable`. The `DataTable` renders the `caption` column as text. Make the caption a link when a url exists.

First, include `url` in the mapped row inside `top5`:

```ts
function top5(rows: TopContentRow[], sortBy: SortBy) {
  return [...rows]
    .sort((a, b) => b[sortBy] - a[sortBy])
    .slice(0, 5)
    .map((r) => ({
      caption: r.url
        ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-brand-cyan hover:underline">
            {r.caption.length > 80 ? r.caption.slice(0, 77) + '…' : r.caption}
          </a>
        : (r.caption.length > 80 ? r.caption.slice(0, 77) + '…' : r.caption),
      sourceType: r.sourceType === 'organic' ? 'Organic' : 'Influencer',
      publishDate: r.publishDate,
      views: num(r.views), viewsRaw: r.views,
      engagements: num(r.engagements), engagementsRaw: r.engagements,
    }))
}
```

`DataTable` (`components/charts/data-table.tsx`) types `rows` as `Record<string, React.ReactNode>[]` and renders each cell as `{row[c.key]}`, so a JSX anchor in `caption` renders directly — no column-callback API is needed. `top-content.tsx` is already a `'use client'` component, so the anchor is fine. The `caption` column has no `sortable`/`sortKey`, so swapping its value from string to ReactNode does not affect sorting (sorting keys off `viewsRaw`/`engagementsRaw`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, open the Organic Social section, confirm post captions in the Top Content tables are clickable and open the live post in a new tab; posts without a URL render as plain text.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/organic-social/top-content.tsx
git commit -m "feat(organic-social): link top posts to live URLs"
```

---

## Stream C — Follower-Growth Line Graph

### Task C1: Extract a pure `buildTrendSeries` helper (refactor + test)

**Files:**
- Modify: `lib/organic-social/trends.ts` (extract helper, reuse in `getEngagementTrend`)
- Test: `lib/organic-social/trends-build.test.ts` (create)

**Interfaces:**
- Produces: `buildTrendSeries(perChannel: { label: string; daily: Record<string, number | null> | null }[]): TrendSeries` — consumed by C2 and tested here.

**Why a separate test file:** `trends.ts` imports `./base`, which transitively loads the DB client and throws without env. To keep the pure helper testable, the test imports the helper only — but since it lives in `trends.ts` (which imports `./base`), the test must avoid that. Therefore put `buildTrendSeries` in a new pure module `lib/organic-social/trend-series.ts` that imports only `./types`, and re-export/use it from `trends.ts`.

- [ ] **Step 1: Write the failing test**

Create `lib/organic-social/trends-build.test.ts`:

```ts
// Run: npx tsx lib/organic-social/trends-build.test.ts
import { strict as assert } from 'node:assert'
import { buildTrendSeries } from './trend-series'

const series = buildTrendSeries([
  { label: 'Instagram', daily: { '2026-06-02': 10, '2026-06-01': 5 } },
  { label: 'Facebook', daily: null },                       // dropped (no data)
  { label: 'X', daily: { '2026-06-01': 7, '2026-06-02': null } }, // null -> 0
])

assert.deepEqual(series.channels, ['Instagram', 'X'], 'drops channels with null daily, keeps order')
assert.deepEqual(series.points.map((p) => p.date), ['2026-06-01', '2026-06-02'], 'points sorted ascending by date')
assert.equal(series.points[0].Instagram, 5, 'fills value')
assert.equal(series.points[1].X, 0, 'null becomes 0')
console.log('trend-series: all assertions passed')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx lib/organic-social/trends-build.test.ts`
Expected: FAIL (cannot find module `./trend-series`).

- [ ] **Step 3: Create the pure helper**

Create `lib/organic-social/trend-series.ts`:

```ts
import type { TrendSeries, TrendPoint } from './types'

/** Merge per-channel daily maps into a recharts-ready TrendSeries.
 *  Channels whose `daily` is null are dropped; null day-values become 0. */
export function buildTrendSeries(
  perChannel: { label: string; daily: Record<string, number | null> | null }[],
): TrendSeries {
  const channels: string[] = []
  const byDate = new Map<string, TrendPoint>()
  for (const { label, daily } of perChannel) {
    if (!daily) continue
    channels.push(label)
    for (const [date, value] of Object.entries(daily)) {
      const row = byDate.get(date) ?? ({ date } as TrendPoint)
      row[label] = value ?? 0
      byDate.set(date, row)
    }
  }
  const points = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return { points, channels }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx lib/organic-social/trends-build.test.ts`
Expected: PASS (`trend-series: all assertions passed`).

- [ ] **Step 5: Reuse the helper in `getEngagementTrend`**

In `lib/organic-social/trends.ts`, add `import { buildTrendSeries } from './trend-series'` and replace the inline channel-merge block at the end of `getEngagementTrend` (the `const channels...` through `return { points, channels }`) with:

```ts
  return buildTrendSeries(perChannel)
```

Confirm `perChannel` entries are `{ label, daily }` shaped (they already are). Remove the now-unused `TrendPoint` import from `trends.ts` if it becomes unused.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → PASS.

```bash
git add lib/organic-social/trend-series.ts lib/organic-social/trends-build.test.ts lib/organic-social/trends.ts
git commit -m "refactor(organic-social): extract pure buildTrendSeries helper"
```

### Task C2: Add `getFollowerTrend`

**Files:**
- Modify: `lib/organic-social/trends.ts`

**Interfaces:**
- Consumes: `buildTrendSeries` (C1), `CHANNELS`, `CHANNEL_LABEL`, `CHANNEL_METRICS` (`./metrics`), `dashClientFor`, `isoRangeTz` (`./base`).
- Produces: `getFollowerTrend(slug: string, dateRange: string): Promise<TrendSeries>` — consumed by E1.

- [ ] **Step 1: Add the function**

In `lib/organic-social/trends.ts`, add after `getEngagementTrend`:

```ts
export async function getFollowerTrend(slug: string, dateRange: string): Promise<TrendSeries> {
  const { client, brandId } = await dashClientFor(slug)
  const { start, end } = isoRangeTz(dateRange)

  const perChannel = await Promise.all(
    CHANNELS.map(async (channel) => {
      const metric = CHANNEL_METRICS[channel].followers   // TOTAL_FOLLOWERS
      try {
        const res = await client.getReportsData<GraphMetric>({
          brandId,
          channels: [channel],
          reportType: 'GRAPH',
          timeScale: 'DAILY',
          metrics: [metric],
          startDate: start,
          endDate: end,
        })
        const daily = (res.data as GraphData).metrics?.[metric]?.ALL_CHANNELS
        return { label: CHANNEL_LABEL[channel], daily: daily ?? null }
      } catch {
        return { label: CHANNEL_LABEL[channel], daily: null }
      }
    }),
  )

  return buildTrendSeries(perChannel)
}
```

The `GraphData` type and `GraphMetric` import already exist at the top of `trends.ts`; reuse them. `CHANNEL_METRICS` is already imported there.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/organic-social/trends.ts
git commit -m "feat(organic-social): add cumulative follower trend fetch"
```

### Task C3: Shared chart component + `FollowerTrend`

**Files:**
- Modify: `components/report-sections/organic-social/trends.tsx`

**Interfaces:**
- Consumes: `TrendSeries` (`lib/organic-social/types`), `LineChart` (`components/charts/line-chart`), `CHART_COLORS`, `cn`.
- Produces: exports `EngagementTrend({ series })` (unchanged name) AND `FollowerTrend({ series })` — both consumed by `index.tsx` in E1.

- [ ] **Step 1: Refactor into a shared internal chart**

Rewrite `components/report-sections/organic-social/trends.tsx` so the toggle-legend chart is a shared internal component parameterized by title, and export two thin wrappers. Keep the `'use client'` directive and the existing palette/toggle behavior verbatim:

```tsx
'use client'

import { useState } from 'react'
import { LineChart } from '@/components/charts/line-chart'
import { CHART_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { TrendSeries } from '@/lib/organic-social/types'

const PALETTE = [CHART_COLORS.primary, CHART_COLORS.ga4 ?? '#39A0FF', '#FF8A3D', '#9B7BFF']

function ChannelTrendChart({ title, series }: { title: string; series: TrendSeries }) {
  const colorFor = (channel: string) => PALETTE[series.channels.indexOf(channel) % PALETTE.length]
  const [active, setActive] = useState<Set<string>>(() => new Set(series.channels))

  const toggle = (channel: string) =>
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(channel)) next.delete(channel)
      else next.add(channel)
      return next
    })

  const yKeys = series.channels
    .filter((c) => active.has(c))
    .map((c) => ({ key: c, label: c, color: colorFor(c) }))

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {series.channels.map((c) => {
          const on = active.has(c)
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                on
                  ? 'border-white/20 bg-white/[0.06] text-white'
                  : 'border-white/[0.08] text-text-muted hover:text-white',
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: on ? colorFor(c) : 'transparent', border: `1px solid ${colorFor(c)}` }}
              />
              {c}
            </button>
          )
        })}
      </div>
      <LineChart data={series.points} xKey="date" yKeys={yKeys} />
    </section>
  )
}

export function EngagementTrend({ series }: { series: TrendSeries }) {
  return <ChannelTrendChart title="Engagement Over Time" series={series} />
}

export function FollowerTrend({ series }: { series: TrendSeries }) {
  return <ChannelTrendChart title="Follower Growth" series={series} />
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`index.tsx` still imports `EngagementTrend`, which is unchanged.)

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/organic-social/trends.tsx
git commit -m "refactor(organic-social): share trend chart, add FollowerTrend"
```

---

## Stream D — Executive Synopsis

### Task D1: Synopsis data module

**Files:**
- Create: `lib/organic-social/synopsis.ts`
- Test: `lib/organic-social/synopsis-context.test.ts`

**Interfaces:**
- Consumes: `gleanChat` (`@/lib/glean`), `cached` (`@/lib/cache`), `PlatformHeadline` and `TrendSeries` and `PlatformTopContent` (`./types`).
- Produces:
  - `getOrganicSocialSynopsis(clientSlug: string | undefined, dateRange: string, headlines: PlatformHeadline[], trend: TrendSeries, top: PlatformTopContent[]): Promise<OverviewSynopsis>` where `OverviewSynopsis = { synopsis: string; actions: string[] }`.
  - An exported pure `buildSocialContext(args: { headlines: PlatformHeadline[]; trend: TrendSeries; top: PlatformTopContent[]; dateRange: string }): string` (tested in this task).
- Consumed by: D2 / E1.

**Pure-test note:** `synopsis.ts` imports `@/lib/cache` and `@/lib/glean`, which do NOT import the DB client, so this module is import-safe under `tsx` without env. The test asserts on `buildSocialContext` only and never calls `getOrganicSocialSynopsis` (which would hit Glean).

- [ ] **Step 1: Write the failing test**

Create `lib/organic-social/synopsis-context.test.ts`:

```ts
// Run: npx tsx lib/organic-social/synopsis-context.test.ts
import { strict as assert } from 'node:assert'
import { buildSocialContext } from './synopsis'
import type { PlatformHeadline } from './types'

const headlines: PlatformHeadline[] = [{
  channel: 'INSTAGRAM', label: 'Instagram', exposureLabel: 'Views',
  followers: 12400, netNewFollowers: 320, exposure: 88000, engagements: 5400,
  engagementRate: 4.2, deltas: { followers: 2.6 },
}]
const ctx = buildSocialContext({
  headlines,
  trend: { points: [], channels: ['Instagram'] },
  top: [{ platform: 'Instagram', rows: [] }],
  dateRange: 'last_30_days',
})

assert.ok(ctx.includes('Instagram'), 'names the channel')
assert.ok(ctx.includes('12,400') || ctx.includes('12400'), 'includes follower count')
assert.ok(ctx.includes('last_30_days'), 'includes the period')
console.log('synopsis-context: all assertions passed')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx lib/organic-social/synopsis-context.test.ts`
Expected: FAIL (cannot find module `./synopsis`).

- [ ] **Step 3: Implement the module**

Create `lib/organic-social/synopsis.ts`:

```ts
import { cached } from '@/lib/cache'
import { gleanChat } from '@/lib/glean'
import type { PlatformHeadline, TrendSeries, PlatformTopContent } from './types'

// Executive synopsis + recommended actions for the Organic Social section.
// Mirrors lib/peec/synopsis.ts: Glean-backed, cached per (clientSlug, dateRange)
// for one hour. Server-side only.

export type OverviewSynopsis = { synopsis: string; actions: string[] }

export function buildSocialContext(args: {
  headlines: PlatformHeadline[]
  trend: TrendSeries
  top: PlatformTopContent[]
  dateRange: string
}): string {
  const { headlines, trend, top, dateRange } = args
  const fmt = (n: number) => n.toLocaleString()
  const delta = (v?: number) => (v == null ? '' : ` (vs prior: ${v >= 0 ? '+' : ''}${v.toFixed(1)}%)`)

  const perPlatform = headlines.map((h) =>
    `- ${h.label}: ${fmt(h.followers)} followers${delta(h.deltas?.followers)}, ` +
    `${fmt(h.netNewFollowers)} net new${delta(h.deltas?.netNewFollowers)}, ` +
    `${fmt(h.exposure)} ${h.exposureLabel.toLowerCase()}${delta(h.deltas?.exposure)}, ` +
    `${fmt(h.engagements)} engagements${delta(h.deltas?.engagements)}, ` +
    `${h.engagementRate.toFixed(1)}% engagement rate${delta(h.deltas?.engagementRate)}`,
  ).join('\n')

  const topLines = top.flatMap((g) =>
    g.rows.slice(0, 3).map((r) => `- ${g.platform}: "${r.caption.slice(0, 80)}" — ${fmt(r.engagements)} engagements, ${fmt(r.views)} views`),
  ).join('\n')

  return `
Period: ${dateRange}
Channels tracked: ${trend.channels.join(', ') || 'n/a'}

Per-platform performance:
${perPlatform || 'n/a'}

Top performing posts:
${topLines || 'n/a'}
`.trim()
}

function extractJsonObject(raw: string): OverviewSynopsis {
  const tryParse = (s: string): OverviewSynopsis | null => {
    try {
      const obj = JSON.parse(s) as OverviewSynopsis
      if (typeof obj.synopsis === 'string' && Array.isArray(obj.actions)) return obj
      return null
    } catch {
      return null
    }
  }
  const direct = tryParse(raw.trim())
  if (direct) return direct
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced && fenced[1]) {
    const inner = tryParse(fenced[1].trim())
    if (inner) return inner
  }
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const span = tryParse(raw.slice(first, last + 1))
    if (span) return span
  }
  throw new Error('Glean response did not contain a parseable Organic Social synopsis object')
}

async function getOrganicSocialSynopsisImpl(
  clientSlug: string | undefined,
  dateRange: string,
  headlines: PlatformHeadline[],
  trend: TrendSeries,
  top: PlatformTopContent[],
): Promise<OverviewSynopsis> {
  const context = buildSocialContext({ headlines, trend, top, dateRange })

  const prompt = `You are an executive analyst writing a concise overview for a marketing leadership team. Use the data below to write a 2 to 3 paragraph synopsis of how the brand's organic social channels performed during the selected period, followed by 2 to 4 concrete recommended actions for the team.

Tone: executive, plain English, no jargon, no hype. Reference real numbers from the data. Do not fabricate metrics. If a value is "n/a", do not invent one. Do not use em-dashes; use periods and commas.

Output strictly valid JSON in this shape, with no markdown fences and no commentary before or after:
{
  "synopsis": "Two to three short paragraphs separated by \\n\\n. No bullets. No headings.",
  "actions": ["Short action statement 1", "Short action statement 2", "..."]
}

Data:
${context}`

  const raw = await gleanChat(prompt, { saveChat: false })
  return extractJsonObject(raw)
}

export const getOrganicSocialSynopsis = cached(
  'glean',
  'getOrganicSocialSynopsis',
  getOrganicSocialSynopsisImpl,
  {
    version: 'v1-glean',
    ttlSeconds: 3600,
    extractTags: ([clientSlug, dateRange]) => ({ client: clientSlug, dateRange }),
  },
)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx lib/organic-social/synopsis-context.test.ts`
Expected: PASS (`synopsis-context: all assertions passed`).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → PASS.

```bash
git add lib/organic-social/synopsis.ts lib/organic-social/synopsis-context.test.ts
git commit -m "feat(organic-social): Glean-backed executive synopsis module"
```

### Task D2: Synopsis component

**Files:**
- Create: `components/report-sections/organic-social/synopsis.tsx`

**Interfaces:**
- Consumes: `getOrganicSocialSynopsis` (D1), `PlatformHeadline`/`TrendSeries`/`PlatformTopContent` (`@/lib/organic-social/types`).
- Produces: `OrganicSocialSynopsis({ clientSlug, dateRange, headlines, trend, top })` async RSC — consumed by E1.

- [ ] **Step 1: Create the component (mirror AEO's visual verbatim)**

Create `components/report-sections/organic-social/synopsis.tsx`:

```tsx
import { Sparkles } from 'lucide-react'
import { getOrganicSocialSynopsis } from '@/lib/organic-social/synopsis'
import type { PlatformHeadline, TrendSeries, PlatformTopContent } from '@/lib/organic-social/types'

// Executive AI-generated synopsis + recommended actions at the top of the
// Organic Social section. RSC: fetches the synopsis server-side via Glean,
// cached per (clientSlug, dateRange) for one hour. Mirrors the AEO Overview
// synopsis (components/report-sections/peec-ai/overview-synopsis.tsx).

type Props = {
  clientSlug?: string
  dateRange?: string
  headlines: PlatformHeadline[]
  trend: TrendSeries
  top: PlatformTopContent[]
}

export async function OrganicSocialSynopsis({ clientSlug, dateRange, headlines, trend, top }: Props) {
  let result: Awaited<ReturnType<typeof getOrganicSocialSynopsis>> | null = null
  let errored = false
  try {
    result = await getOrganicSocialSynopsis(clientSlug, dateRange ?? 'last_30_days', headlines, trend, top)
  } catch (err) {
    console.error('[organic-social-synopsis] generation failed:', err)
    errored = true
  }

  return (
    <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6">
      <header className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60FF80]/10">
          <Sparkles className="h-4 w-4 text-[#60FF80]" />
        </span>
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Executive Synopsis</h3>
      </header>

      {errored && (
        <p className="text-sm text-text-muted">Synopsis is temporarily unavailable. Other metrics on this page are unaffected.</p>
      )}

      {!errored && result && (
        <div className="space-y-4">
          <div className="space-y-3 text-sm leading-relaxed text-white/90">
            {result.synopsis.split('\n\n').map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>

          {result.actions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-text-muted">Recommended actions</p>
              <ul className="space-y-1.5 text-sm text-white/90">
                {result.actions.map((action, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[#60FF80]">›</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → PASS.

```bash
git add components/report-sections/organic-social/synopsis.tsx
git commit -m "feat(organic-social): executive synopsis component"
```

---

## Integration

### Task E1: Wire synopsis + follower trend into the section

> **Depends on:** Task C3 (`FollowerTrend` export), Task C2 (`getFollowerTrend`), Task D2 (`OrganicSocialSynopsis`), Task D1 (`getOrganicSocialSynopsis`). Assign only after streams C and D report complete. This is the only task that edits `index.tsx`.

**Files:**
- Modify: `components/report-sections/organic-social/index.tsx`

**Interfaces:**
- Consumes: `getPlatformHeadlines`, `getEngagementTrend`, `getFollowerTrend`, `getTopContent`, `PlatformHeadlines`, `EngagementTrend`, `FollowerTrend`, `OrganicSocialSynopsis`.
- Produces: the assembled section.

- [ ] **Step 1: Update imports and fetch**

Rewrite `components/report-sections/organic-social/index.tsx`:

```tsx
import { getPlatformHeadlines } from '@/lib/organic-social/headlines'
import { getEngagementTrend, getFollowerTrend } from '@/lib/organic-social/trends'
import { getTopContent } from '@/lib/organic-social/top-content'
import { PlatformHeadlines } from './platform-headlines'
import { EngagementTrend, FollowerTrend } from './trends'
import { TopContent } from './top-content'
import { OrganicSocialSynopsis } from './synopsis'
import { DashTimeoutError } from '@/lib/dash-social/client'

async function safe<T>(p: Promise<T>): Promise<{ data?: T; error?: 'timeout' | 'error' }> {
  try { return { data: await p } }
  catch (e) { return { error: e instanceof DashTimeoutError ? 'timeout' : 'error' } }
}

function Fallback({ kind }: { kind: 'timeout' | 'error' }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted">
      {kind === 'timeout' ? 'Taking longer than usual — try a shorter date range.' : "Couldn't load this section."}
    </div>
  )
}

export async function OrganicSocialReport({
  clientSlug, dateRange = 'last_30_days', compareRange = null,
}: { clientSlug: string; dateRange?: string; compareRange?: string | null }) {
  const effectiveCompare = compareRange ?? 'previous_period'
  const [headlines, engagement, followers, top] = await Promise.all([
    safe(getPlatformHeadlines(clientSlug, dateRange, effectiveCompare)),
    safe(getEngagementTrend(clientSlug, dateRange)),
    safe(getFollowerTrend(clientSlug, dateRange)),
    safe(getTopContent(clientSlug, dateRange)),
  ])
  return (
    <div className="space-y-8">
      {headlines.data && engagement.data && top.data && (
        <OrganicSocialSynopsis
          clientSlug={clientSlug}
          dateRange={dateRange}
          headlines={headlines.data}
          trend={engagement.data}
          top={top.data}
        />
      )}
      {headlines.data ? <PlatformHeadlines headlines={headlines.data} /> : <Fallback kind={headlines.error!} />}
      {engagement.data ? <EngagementTrend series={engagement.data} /> : <Fallback kind={engagement.error!} />}
      {followers.data ? <FollowerTrend series={followers.data} /> : <Fallback kind={followers.error!} />}
      {top.data ? <TopContent groups={top.data} /> : <Fallback kind={top.error!} />}
    </div>
  )
}
```

Notes: the synopsis renders only when its source data loaded (headlines + engagement trend + top content) so it never feeds Glean partial garbage; its own internal try/catch still guards the Glean call. The follower trend gets its own fallback block, consistent with the others.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, open the Organic Social section:
- Executive Synopsis renders at the top with paragraphs + recommended actions.
- "Engagement Over Time" and "Follower Growth" both render with working per-channel toggles.
- Changing the date picker updates all blocks and the resolved window label.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/organic-social/index.tsx
git commit -m "feat(organic-social): render synopsis and follower growth"
```

---

## Final Verification

- [ ] **Lint:** `npm run lint` → no new errors.
- [ ] **Typecheck:** `npx tsc --noEmit` → PASS.
- [ ] **Unit tests:**
  - `npx tsx --env-file=.env.local lib/organic-social/top-content.test.ts`
  - `npx tsx lib/organic-social/trends-build.test.ts`
  - `npx tsx lib/organic-social/synopsis-context.test.ts`
  - All print `... all assertions passed`.
- [ ] **Build:** `npm run build` → succeeds.
- [ ] **Manual:** all four features verified on both `/dashboard/.../reports?section=organic-social` and the portal route.

## Self-Review Notes (spec coverage)

- Feature 1 (date picker + visible window) → Task A1 (picker already shows resolved window).
- Feature 2 (Executive Synopsis, AEO format, top) → Tasks D1, D2, E1.
- Feature 3 (follower-growth graph, cumulative, same toggle) → Tasks C1, C2, C3, E1.
- Feature 4 (clickable post links from Dash) → Tasks B1, B2.
- Out-of-scope items (manual URL entry, net-new view, other sections, standalone `[reportSlug]` page) are not implemented, per spec.
