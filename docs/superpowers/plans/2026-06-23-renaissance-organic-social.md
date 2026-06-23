# Renaissance Organic Social (Dash Social) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Renaissance Organic Social report — a single scrolling dashboard module sourced from a net-new Dash Social API connector (KPI scorecards, channel contribution, multi-series follower-growth & engagement trends, cross-channel top content).

**Architecture:** Same module pattern as Paid Search/Meta/LinkedIn: route → async RSC orchestrator (`safe()` per-section isolation) → `lib/organic-social/` data layer (pure tested transforms + thin fetchers) → `lib/dash-social/` HTTP connector (the only new infra) → presentational components reusing `KpiCard`/charts/`DataTable`.

**Tech Stack:** Next.js 15 RSC, TypeScript (strict), Drizzle/Neon Postgres, Recharts, Tailwind v4. Tests are standalone `tsx` scripts (`node:assert`), run via `npx tsx <file>`.

## Global Constraints

- All Dash Social calls are **server-side only**. Auth: `Authorization: Bearer ${process.env.DASH_API_TOKEN}` — single, brand-agnostic token; brand selected by `brandId`.
- Dash hosts: `dashboard.dashsocial.com` (`GET /reports/data`), `library-backend.dashsocial.com` (`PUT /brands/{brandId}/media/v2`), `auth.dashsocial.com` (`GET /api/self`).
- Reference implementation (model the connector on it, do not re-derive): `~/Documents/Projects/dash-social-connection/src/dashsocial/client.py` and `docs/dash-api-map.md`.
- No `any` in Dash response types.
- Each report section independently `safe()`-wrapped — one failed query never crashes the page; unconnected channel → empty state, not error.
- `sourceType: 'organic' | 'influencer'` threads through the data layer; top-content table renders a "Source Type" column (all `'organic'` in v1). LinkedIn is **top-content-only** in v1.
- Spec: `docs/superpowers/specs/2026-06-23-renaissance-organic-social-design.md`.

---

## Component map & file structure

| Area | Files |
|---|---|
| Spike | `scripts/dash-social-probe.ts` (throwaway) → produces `lib/organic-social/metrics.ts` + `lib/organic-social/__fixtures__/*.json` |
| Connector | `lib/dash-social/types.ts`, `lib/dash-social/client.ts`, `lib/dash-social/client.test.ts` |
| Schema/config | `lib/db/schema.ts` (edit), `drizzle/0010_*.sql` (generated) |
| Shared types | `lib/organic-social/types.ts` |
| Data layer | `lib/organic-social/base.ts`, `kpis.ts`(+test), `channels.ts`(+test), `trends.ts`(+test), `top-content.ts`(+test) |
| Chart | `components/charts/line-chart.tsx` |
| Components | `components/report-sections/organic-social/{index,kpi-grid,channel-contribution,trends,top-content}.tsx` |
| Wiring | 4 route files, `lib/constants.ts` |
| Go-live | Renaissance DB row (SQL) |

## Dependency graph & parallelization (for an agent fleet)

```
WAVE 0 (no deps — 5 agents in parallel)
  T1 Spike/probe ............ produces metrics.ts + fixtures
  T2 Connector (lib/dash-social)
  T3 Schema + config + migration 0010
  T4 Shared types (lib/organic-social/types.ts)
  T5 LineChart component

WAVE 1 (after its deps land)
  T6  base.ts ............... needs T2, T3, T4
  T7  kpi-grid.tsx .......... needs T4
  T8  channel-contribution.tsx  needs T4
  T9  trends.tsx ........... needs T4, T5
  T10 top-content.tsx ...... needs T4
     (T7–T10 are 4 parallel agents; they consume only TYPES from T4)

WAVE 2 (data fetchers — 4 parallel agents; each needs T1 fixtures + T6 base)
  T11 kpis.ts   T12 channels.ts   T13 trends.ts   T14 top-content.ts

WAVE 3 (integration — sequential-ish)
  T15 index.tsx orchestrator  needs T11–T14 + T7–T10
  T16 routes + nav/constants  needs T3 (ReportSlug) + T15 (export name)

WAVE 4
  T17 Renaissance DB row + live smoke test  needs T3 migration applied + all
```

**Interface contract that lets waves run blind:** every cross-task type is declared in **T4 `lib/organic-social/types.ts`** (consumed by components and fetchers) and **T2 `lib/dash-social/types.ts`** (consumed by base/fetchers). The confirmed Dash metric names live in **T1 `lib/organic-social/metrics.ts`**. An agent implementing T11 never reads T12; both import the same `metrics.ts` + `base.ts` + `types.ts`.

---

## Task 1: Dash Social spike — confirm open items, capture fixtures

**Files:**
- Create: `scripts/dash-social-probe.ts` (throwaway probe)
- Create: `lib/organic-social/metrics.ts` (committed output: confirmed metric names + denominators)
- Create: `lib/organic-social/__fixtures__/reports-total.json`, `reports-graph.json`, `media-v2.json` (captured real responses for transform tests)

**Interfaces:**
- Consumes: `DASH_API_TOKEN` (from `dash-social-connection/.env`), Renaissance `brand_id`.
- Produces:
  - `lib/organic-social/metrics.ts` (CONFIRMED 2026-06-23 — blended-safe set only):
    ```ts
    export const CHANNELS = ['INSTAGRAM', 'FACEBOOK', 'TWITTER'] as const
    export type DashChannel = (typeof CHANNELS)[number]
    // Only metrics valid on ALL of IG/FB/X — a multi-channel request 400s if any
    // metric is invalid for any channel. Per-channel-only metrics (PROFILE_VIEWS,
    // SHARES, SAVES, LIKES, REACTIONS, EFFECTIVENESS) are deferred (not blendable).
    export const METRICS = {
      totalFollowers: 'TOTAL_FOLLOWERS',
      netNewFollowers: 'NET_NEW_FOLLOWERS',
      impressions: 'IMPRESSIONS',
      engagements: 'TOTAL_ENGAGEMENTS',
    } as const
    export const ENGAGEMENT_RATE_BASIS = 'impressions' as const
    export const HAS_AGGREGATE_EFFECTIVENESS = false
    ```
  - Three fixture JSON files = verbatim API responses used by Tasks 11–14 tests.

  **STATUS: Task 1 is COMPLETE (controller-run).** `metrics.ts` + the three fixtures are committed; `scripts/dash-social-probe.ts` exists. Skip re-running; implementers of T11–T14 consume the committed `metrics.ts` and fixtures.

- [ ] **Step 1: Write the probe script**

```ts
// scripts/dash-social-probe.ts
// Run: npx tsx --env-file=../dash-social-connection/.env scripts/dash-social-probe.ts <brandId>
// Throwaway: confirms metric availability + captures fixtures. Delete after Task 1.
import { writeFileSync, mkdirSync } from 'node:fs'

const token = process.env.DASH_API_TOKEN
if (!token) throw new Error('DASH_API_TOKEN missing')
const brandId = Number(process.argv[2])
if (!brandId) throw new Error('usage: dash-social-probe.ts <brandId>')

const H = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }
const today = '2026-06-23', start = '2026-05-24' // ~30d

async function reports(params: Record<string, string>) {
  const u = new URL('https://dashboard.dashsocial.com/reports/data')
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v))
  const r = await fetch(u, { headers: H })
  return { status: r.status, body: await r.json().catch(() => null) }
}

mkdirSync('lib/organic-social/__fixtures__', { recursive: true })

// 1. Identify connected channels + which metrics return data.
const self = await (await fetch('https://auth.dashsocial.com/api/self', { headers: H })).json()
console.log('accessible_brands:', self.accessible_brands)

// 2. Probe candidate metric names on INSTAGRAM (confirm Comments/Shares/Saves/Likes ids).
for (const m of ['TOTAL_FOLLOWERS','NET_NEW_FOLLOWERS','IMPRESSIONS','TOTAL_ENGAGEMENTS','PROFILE_VIEWS','COMMENTS','SHARES','SAVES','LIKES','REACTIONS','ACCOUNTS_REACHED']) {
  const { status, body } = await reports({ channels: 'INSTAGRAM', brand_ids: String(brandId), metrics: m, report_type: 'TOTAL_METRIC', start_date: start, end_date: today, context_start_date: '2026-04-24', context_end_date: '2026-05-23' })
  console.log(`metric ${m}: ${status} ${status === 200 ? 'OK' : JSON.stringify(body).slice(0,120)}`)
}

// 3. Capture fixtures (the confirmed-good metric set after step 2).
const good = 'TOTAL_FOLLOWERS,NET_NEW_FOLLOWERS,IMPRESSIONS,TOTAL_ENGAGEMENTS,PROFILE_VIEWS'
const total = await reports({ channels: 'INSTAGRAM,FACEBOOK,TWITTER', brand_ids: String(brandId), metrics: good, report_type: 'TOTAL_METRIC', start_date: start, end_date: today, context_start_date: '2026-04-24', context_end_date: '2026-05-23' })
const graph = await reports({ channels: 'INSTAGRAM,FACEBOOK,TWITTER', brand_ids: String(brandId), metrics: 'TOTAL_FOLLOWERS,TOTAL_ENGAGEMENTS', report_type: 'GRAPH', time_scale: 'DAILY', start_date: start, end_date: today })
const media = await (await fetch(`https://library-backend.dashsocial.com/brands/${brandId}/media/v2`, { method: 'PUT', headers: H, body: JSON.stringify({ start_date: start, end_date: today, limit: 25 }) })).json()

writeFileSync('lib/organic-social/__fixtures__/reports-total.json', JSON.stringify(total.body, null, 2))
writeFileSync('lib/organic-social/__fixtures__/reports-graph.json', JSON.stringify(graph.body, null, 2))
writeFileSync('lib/organic-social/__fixtures__/media-v2.json', JSON.stringify(media, null, 2))
console.log('fixtures written')
```

- [ ] **Step 2: Run the probe**

Run: `npx tsx --env-file=../dash-social-connection/.env scripts/dash-social-probe.ts <Renaissance brandId>`
Expected: prints `200 OK` for the valid metrics, error JSON for invalid ones; writes 3 fixture files. (Get `brandId` from the `accessible_brands` / `brands` output — match by name.)

- [ ] **Step 3: Write `lib/organic-social/metrics.ts`**

Fill in the `<CONFIRM>` metric ids and the two flags from the probe output (use the metric names that returned `200`; set `ENGAGEMENT_RATE_BASIS`/`HAS_AGGREGATE_EFFECTIVENESS` from what the fixtures contain). Use the shape in the Interfaces block above. If a Comments/Shares/Saves/Likes metric is NOT available on `/reports/data`, drop it from `METRICS` and add a comment `// not on reports/data — derive from media/v2 aggregation in top-content`.

- [ ] **Step 4: Commit (script kept for re-probing; note it's throwaway)**

```bash
git add scripts/dash-social-probe.ts lib/organic-social/metrics.ts lib/organic-social/__fixtures__/
git commit -m "chore(organic-social): Dash Social spike — confirmed metrics + fixtures"
```

---

## Task 2: Dash Social connector — `lib/dash-social/`

**Files:**
- Create: `lib/dash-social/types.ts`
- Create: `lib/dash-social/client.ts`
- Test: `lib/dash-social/client.test.ts`

**Interfaces:**
- Consumes: nothing (pure HTTP client; token + brandId are call args).
- Produces:
  - Errors: `DashApiError`, `DashAuthError`, `DashRateLimitError`, `DashTimeoutError`.
  - `class DashSocialClient { constructor(opts: { token: string; fetchImpl?: typeof fetch; maxRetries?: number }); getReportsData<M = unknown>(p: ReportsDataParams): Promise<ReportsDataResponse<M>>; getMedia(p: { brandId: number; startDate: string; endDate: string; limit?: number }): Promise<MediaV2Response> }`
  - Types `ReportsDataParams`, `ReportsDataResponse<M>`, `ReportsChannelEntry<M>`, `TotalMetric`, `GraphMetric`, `MediaV2Response`, `MediaV2Post` in `types.ts`.

- [ ] **Step 1: Write `lib/dash-social/types.ts`**

```ts
// Shapes CONFIRMED against Task 1 fixtures (Renaissance brand 26952, 2026-06-23).
export interface ReportsDataParams {
  brandId: number
  channels: string[]          // e.g. ['INSTAGRAM','FACEBOOK','TWITTER']
  metrics: string[]           // UPPER_SNAKE ids from lib/organic-social/metrics.ts
  startDate: string           // ISO yyyy-mm-dd
  endDate: string
  reportType?: 'GRAPH' | 'TOTAL_METRIC'
  timeScale?: 'DAILY' | 'MONTHLY'
  contextStartDate?: string   // TOTAL_METRIC delta window
  contextEndDate?: string
}

// /reports/data is keyed by channel name AND a brand-id entry (data_type:'BRAND')
// that callers MUST skip. Each channel entry carries a `metrics` object whose
// value shape depends on report_type — hence the generic M.
export interface ReportsChannelEntry<M> {
  data_type: string           // 'CHANNEL' | 'BRAND'
  name?: string               // display, e.g. 'Instagram'
  metrics?: Record<string, M>
}
export interface ReportsDataResponse<M = unknown> {
  data: Record<string, ReportsChannelEntry<M>>
}
// TOTAL_METRIC: metrics[METRIC] = { value, context, context_change }.
// context_change is the prior-period delta as a FRACTION (e.g. -0.36 = -36%).
export interface TotalMetric { value: number | null; context: number | null; context_change: number | null }
// GRAPH: metrics[METRIC] = { [channelKey]: { [date]: value|null } } — doubly nested,
// inner key repeats the channel (e.g. metrics.TOTAL_FOLLOWERS.INSTAGRAM['2026-05-24']).
export type GraphMetric = Record<string, Record<string, number | null>>

// media/v2: { data: [...posts], paging }. Only the active per-platform sub-object
// is populated; stories/empties may have none.
export interface MediaV2Post {
  id: number
  source: string              // 'INSTAGRAM' | 'INSTAGRAM_STORY' | 'FACEBOOK' | 'LINKEDIN' | 'TWITTER' | ...
  type: string                // 'IMAGE' | 'VIDEO' | 'CAROUSEL' | ...
  source_created_at: string
  instagram?: Record<string, number | string | null> | null
  facebook?: Record<string, number | string | null> | null
  linkedin?: Record<string, number | string | null> | null
  twitter?: Record<string, number | string | null> | null
}
export interface MediaV2Response { data: MediaV2Post[]; paging?: { count: number; next: string | null; previous: string | null } }
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/dash-social/client.test.ts
// Run: npx tsx lib/dash-social/client.test.ts
import { strict as assert } from 'node:assert'
import { DashSocialClient, DashAuthError, DashRateLimitError } from './client'

// Fake fetch: returns scripted responses by call index.
function fakeFetch(responses: Array<{ status: number; headers?: Record<string,string>; body?: unknown }>) {
  let i = 0
  return async () => {
    const r = responses[Math.min(i++, responses.length - 1)]
    return new Response(r.body == null ? '' : JSON.stringify(r.body), {
      status: r.status, headers: r.headers,
    }) as unknown as Response
  }
}

// 1. happy path passes Bearer + parses JSON
{
  const c = new DashSocialClient({ token: 't', fetchImpl: fakeFetch([{ status: 200, body: { data: {} } }]) })
  const out = await c.getReportsData({ brandId: 1, channels: ['INSTAGRAM'], metrics: ['IMPRESSIONS'], startDate: '2026-05-01', endDate: '2026-05-31' })
  assert.deepEqual(out, { data: {} })
}
// 2. 401 -> DashAuthError
{
  const c = new DashSocialClient({ token: 't', fetchImpl: fakeFetch([{ status: 401, body: { error: 'nope' } }]) })
  await assert.rejects(() => c.getReportsData({ brandId: 1, channels: ['INSTAGRAM'], metrics: ['IMPRESSIONS'], startDate: 'a', endDate: 'b' }), DashAuthError)
}
// 3. 429 then 200 -> retried (maxRetries small, no real sleep)
{
  const c = new DashSocialClient({ token: 't', maxRetries: 2, fetchImpl: fakeFetch([{ status: 429, headers: { 'Retry-After': '0' } }, { status: 200, body: { data: {} } }]) })
  const out = await c.getReportsData({ brandId: 1, channels: ['INSTAGRAM'], metrics: ['X'], startDate: 'a', endDate: 'b' })
  assert.deepEqual(out, { data: {} })
}
// 4. persistent 429 -> DashRateLimitError
{
  const c = new DashSocialClient({ token: 't', maxRetries: 1, fetchImpl: fakeFetch([{ status: 429, headers: { 'Retry-After': '0' } }]) })
  await assert.rejects(() => c.getReportsData({ brandId: 1, channels: ['INSTAGRAM'], metrics: ['X'], startDate: 'a', endDate: 'b' }), DashRateLimitError)
}
console.log('dash-social client: all assertions passed')
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx lib/dash-social/client.test.ts`
Expected: FAIL — `Cannot find module './client'`.

- [ ] **Step 4: Write `lib/dash-social/client.ts`**

```ts
/**
 * Dash Social HTTP client — server-side only.
 * Modeled on dash-social-connection/src/dashsocial/client.py.
 * One Bearer token works across all hosts; brand selected per call by brandId.
 */
import type { ReportsDataParams, ReportsDataResponse, MediaV2Response } from './types'
export * from './types'

const DASHBOARD = 'https://dashboard.dashsocial.com'
const LIBRARY = 'https://library-backend.dashsocial.com'

export class DashApiError extends Error {}
export class DashAuthError extends DashApiError {}
export class DashRateLimitError extends DashApiError {}
export class DashTimeoutError extends DashApiError { constructor() { super('Dash Social request timed out') } }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class DashSocialClient {
  private token: string
  private fetchImpl: typeof fetch
  private maxRetries: number
  constructor(opts: { token: string; fetchImpl?: typeof fetch; maxRetries?: number }) {
    this.token = opts.token
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.maxRetries = opts.maxRetries ?? 3
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const headers = { Authorization: `Bearer ${this.token}`, Accept: 'application/json', 'Content-Type': 'application/json' }
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(url, {
        method, headers, body: body == null ? undefined : JSON.stringify(body),
        next: { revalidate: 3600 },
      } as RequestInit)
      if (res.status === 401 || res.status === 403) throw new DashAuthError(`${res.status} from ${url}`)
      if (res.status === 429) {
        if (attempt >= this.maxRetries) throw new DashRateLimitError(`429 persistent at ${url}`)
        const retry = Number(res.headers.get('Retry-After') ?? '2')
        await sleep(Math.min(retry, 10) * 1000)
        continue
      }
      if (res.status >= 500) {
        if (attempt >= this.maxRetries) throw new DashApiError(`${res.status} persistent at ${url}`)
        await sleep(Math.min(2 ** attempt, 8) * 1000)
        continue
      }
      if (!res.ok) throw new DashApiError(`${res.status} at ${url}`)
      return res.json() as Promise<T>
    }
  }

  getReportsData<M = unknown>(p: ReportsDataParams): Promise<ReportsDataResponse<M>> {
    const q = new URLSearchParams({
      brand_ids: String(p.brandId),
      channels: p.channels.join(','),
      metrics: p.metrics.join(','),
      report_type: p.reportType ?? 'TOTAL_METRIC',
      start_date: p.startDate,
      end_date: p.endDate,
    })
    if (p.timeScale) q.set('time_scale', p.timeScale)
    if (p.contextStartDate) q.set('context_start_date', p.contextStartDate)
    if (p.contextEndDate) q.set('context_end_date', p.contextEndDate)
    return this.request<ReportsDataResponse<M>>('GET', `${DASHBOARD}/reports/data?${q}`)
  }

  getMedia(p: { brandId: number; startDate: string; endDate: string; limit?: number }): Promise<MediaV2Response> {
    return this.request<MediaV2Response>('PUT', `${LIBRARY}/brands/${p.brandId}/media/v2`, {
      start_date: p.startDate, end_date: p.endDate, limit: p.limit ?? 50,
    })
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx lib/dash-social/client.test.ts`
Expected: PASS — `dash-social client: all assertions passed`.

- [ ] **Step 6: Commit**

```bash
git add lib/dash-social/
git commit -m "feat(dash-social): net-new Dash Social API connector"
```

---

## Task 3: Schema, config type, migration 0010

**Files:**
- Modify: `lib/db/schema.ts` (add `ReportSlug` member, `DashSocialConfig`, column)
- Create: `drizzle/0010_*.sql` (generated)

**Interfaces:**
- Produces: `ReportSlug` includes `'organic-social'`; `interface DashSocialConfig { brandId: number; channels?: string[] }`; `clients.dashSocialConfig` jsonb column.

- [ ] **Step 1: Add the report slug** — in `lib/db/schema.ts` `ReportSlug` union (after line 13), add:

```ts
  | 'organic-social'
```

- [ ] **Step 2: Add the config interface** — after `LinkedInConfig` (line 62):

```ts
export interface DashSocialConfig {
  /** Dash Social brand id (digits), e.g. 24350. Selects the brand for the shared DASH_API_TOKEN. */
  brandId: number
  /** Optional channel allowlist (lowercase 'instagram','facebook','twitter'); defaults to all reportable channels. */
  channels?: string[]
}
```

- [ ] **Step 3: Add the column** — after the `linkedinConfig` line (122):

```ts
  dashSocialConfig: jsonb('dash_social_config').$type<DashSocialConfig>(),
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0010_*.sql` adding `dash_social_config jsonb`. Inspect it — it must be an additive `ADD COLUMN` only.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): dash_social_config column + organic-social report slug (migration 0010)"
```

---

## Task 4: Shared types — `lib/organic-social/types.ts`

**Files:**
- Create: `lib/organic-social/types.ts`

**Interfaces:**
- Produces (consumed by every component + fetcher):

- [ ] **Step 1: Write the file**

```ts
// lib/organic-social/types.ts
export type SourceType = 'organic' | 'influencer'

export interface OrganicKpi {
  key: string; label: string; value: number
  prefix?: string; suffix?: string; delta?: number; tooltip?: string
}

/** One row of the per-channel contribution table. */
export interface ChannelRow {
  channel: string            // display: 'Instagram'
  followers: number
  netNewFollowers: number
  engagements: number
  engagementRate: number     // percent
}

/** A daily point for a single channel in a trend series. */
export interface TrendPoint { date: string; [channel: string]: string | number }
export interface TrendSeries {
  points: TrendPoint[]       // recharts-ready: one row per date, a key per channel
  channels: string[]         // display names, in legend order
}

export interface TopContentRow {
  id: number
  caption: string
  platform: string           // display: 'Instagram'
  sourceType: SourceType
  publishDate: string        // ISO date
  views: number              // views/impressions
  engagements: number
}
```

- [ ] **Step 2: Typecheck & commit**

Run: `npx tsc --noEmit` (expected: no new errors)

```bash
git add lib/organic-social/types.ts
git commit -m "feat(organic-social): shared data-layer types"
```

---

## Task 5: LineChart component — `components/charts/line-chart.tsx`

**Files:**
- Create: `components/charts/line-chart.tsx`

**Interfaces:**
- Produces: `<LineChart data={Record<string,string|number>[]} xKey={string} yKeys={{key,color?,label?}[]} height?={number} />` — mirrors `AreaChart` props exactly (drop-in), renders `<Line>` instead of filled `<Area>`.

- [ ] **Step 1: Write the component** (mirror `components/charts/area-chart.tsx`)

```tsx
'use client'
import { ResponsiveContainer, LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { CHART_COLORS } from '@/lib/constants'

interface LineChartProps {
  data: Record<string, string | number>[]
  xKey: string
  yKeys: { key: string; color?: string; label?: string }[]
  height?: number
}

export function LineChart({ data, xKey, yKeys, height = 300 }: LineChartProps) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey={xKey} tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} />
          <YAxis tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: '#272727', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#FFFFFF', fontSize: '13px' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {yKeys.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={s.color ?? CHART_COLORS.primary} strokeWidth={2} dot={false} />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/charts/line-chart.tsx
git commit -m "feat(charts): multi-series LineChart"
```

---

## Task 6: Data-layer base — `lib/organic-social/base.ts`

**Files:**
- Create: `lib/organic-social/base.ts`

**Interfaces:**
- Consumes: `DashSocialClient` (T2), `DashSocialConfig` (T3), `getClientBySlug` (`lib/db/queries`), `parseDateRange`/`deriveCompareRange` (`lib/ga4/client`).
- Produces:
  - `dashClientFor(slug: string): Promise<{ client: DashSocialClient; brandId: number; channels: string[] }>` — resolves config + token.
  - `resolveCompareIso(dateRange, compareRange): { start: string; end: string } | null`
  - `isoRange(dateRange): { start: string; end: string }`
  - `channelMetricEntries<M>(res: ReportsDataResponse<M>): Array<[string, Record<string, M>]>` — `[channelKey, metrics]` for CHANNEL entries only (skips the `data_type:'BRAND'` entry and any without `metrics`).
  - `CHANNEL_DISPLAY: Record<string,string>` (Dash enum → display, incl. `INSTAGRAM_STORY`→`Instagram`), `displayChannel(source)`, `dashChannelsFor(allowlist?)`.
  - re-export `num`, `pct` from `lib/supermetrics/format`.

- [ ] **Step 1: Write the file**

```ts
// lib/organic-social/base.ts
import { DashSocialClient } from '@/lib/dash-social/client'
import type { ReportsDataResponse } from '@/lib/dash-social/types'
import { getClientBySlug } from '@/lib/db/queries'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { CHANNELS } from './metrics'

export { num, pct } from '@/lib/supermetrics/format'

/** Dash source/channel enum -> display label. Story/variant sources fold to their base channel. */
export const CHANNEL_DISPLAY: Record<string, string> = {
  INSTAGRAM: 'Instagram', INSTAGRAM_STORY: 'Instagram', FACEBOOK: 'Facebook',
  TWITTER: 'X', LINKEDIN: 'LinkedIn', TIKTOK: 'TikTok', YOUTUBE: 'YouTube', PINTEREST: 'Pinterest',
}
export function displayChannel(source: string): string {
  return CHANNEL_DISPLAY[source] ?? source
}

/** Yield [channelKey, metrics] for CHANNEL entries only — skips the data_type:'BRAND' entry. */
export function channelMetricEntries<M>(res: ReportsDataResponse<M>): Array<[string, Record<string, M>]> {
  return Object.entries(res.data ?? {})
    .filter(([, e]) => e.data_type === 'CHANNEL' && e.metrics)
    .map(([ch, e]) => [ch, e.metrics as Record<string, M>])
}

/** Resolve the reportable Dash channels, honoring an optional lowercase allowlist. */
export function dashChannelsFor(allowlist?: string[]): string[] {
  if (!allowlist?.length) return [...CHANNELS]
  const up = allowlist.map((c) => c.toUpperCase())
  return CHANNELS.filter((c) => up.includes(c))
}

export async function dashClientFor(slug: string): Promise<{ client: DashSocialClient; brandId: number; channels: string[] }> {
  const c = await getClientBySlug(slug)
  const cfg = c?.dashSocialConfig
  if (!cfg) throw new Error(`dash_social_config missing for ${slug}`)
  const token = process.env.DASH_API_TOKEN
  if (!token) throw new Error('Missing env var DASH_API_TOKEN')
  return { client: new DashSocialClient({ token }), brandId: cfg.brandId, channels: dashChannelsFor(cfg.channels) }
}

export function resolveCompareIso(dateRange: string, compareRange: string | null): { start: string; end: string } | null {
  const r = deriveCompareRange(dateRange, compareRange)
  return r ? { start: r.startDate, end: r.endDate } : null
}

export function isoRange(dateRange: string): { start: string; end: string } {
  const { startDate, endDate } = parseDateRange(dateRange)
  return { start: startDate, end: endDate }
}
```

- [ ] **Step 2: Typecheck & commit**

Run: `npx tsc --noEmit`

```bash
git add lib/organic-social/base.ts
git commit -m "feat(organic-social): data-layer base (client resolver, channels, dates)"
```

---

## Task 7: KPI grid component — `components/report-sections/organic-social/kpi-grid.tsx`

**Files:**
- Create: `components/report-sections/organic-social/kpi-grid.tsx`

**Interfaces:**
- Consumes: `OrganicKpi` (T4), `KpiCard` (`components/charts/kpi-card`).
- Produces: `<OrganicKpiGrid kpis={OrganicKpi[]} />`.

- [ ] **Step 1: Write the component** (mirror `paid-search/kpi-grid.tsx`)

```tsx
import { KpiCard } from '@/components/charts/kpi-card'
import type { OrganicKpi } from '@/lib/organic-social/types'

export function OrganicKpiGrid({ kpis }: { kpis: OrganicKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {kpis.map((k) => (
        <KpiCard key={k.key} title={k.label} value={k.value} prefix={k.prefix} suffix={k.suffix} delta={k.delta} tooltip={k.tooltip} />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/report-sections/organic-social/kpi-grid.tsx
git commit -m "feat(organic-social): KPI grid component"
```

---

## Task 8: Channel contribution component — `channel-contribution.tsx`

**Files:**
- Create: `components/report-sections/organic-social/channel-contribution.tsx`

**Interfaces:**
- Consumes: `ChannelRow` (T4), `DataTable` (`components/charts/data-table`), `num`/`pct` (base).
- Produces: `<ChannelContribution rows={ChannelRow[]} />`.

- [ ] **Step 1: Write the component**

```tsx
import { DataTable } from '@/components/charts/data-table'
import { num, pct } from '@/lib/organic-social/base'
import type { ChannelRow } from '@/lib/organic-social/types'

export function ChannelContribution({ rows }: { rows: ChannelRow[] }) {
  const columns = [
    { key: 'channel', label: 'Channel' },
    { key: 'followers', label: 'Followers', align: 'right' as const, sortable: true, sortKey: 'followersRaw' },
    { key: 'netNew', label: 'Net New', align: 'right' as const, sortable: true, sortKey: 'netNewRaw' },
    { key: 'engagements', label: 'Engagements', align: 'right' as const, sortable: true, sortKey: 'engagementsRaw' },
    { key: 'engRate', label: 'Eng. Rate', align: 'right' as const },
  ]
  const display = rows.map((r) => ({
    channel: r.channel,
    followers: num(r.followers), followersRaw: r.followers,
    netNew: num(r.netNewFollowers), netNewRaw: r.netNewFollowers,
    engagements: num(r.engagements), engagementsRaw: r.engagements,
    engRate: pct(r.engagementRate),
  }))
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Channel Contribution</h2>
      <DataTable columns={columns} rows={display} defaultSort={{ key: 'followers', dir: 'desc' }} />
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/report-sections/organic-social/channel-contribution.tsx
git commit -m "feat(organic-social): channel contribution table"
```

---

## Task 9: Trends component — `trends.tsx`

**Files:**
- Create: `components/report-sections/organic-social/trends.tsx`

**Interfaces:**
- Consumes: `TrendSeries` (T4), `LineChart` (T5), `CHART_COLORS` (`lib/constants`).
- Produces: `<Trends followers={TrendSeries} engagement={TrendSeries} />`.

- [ ] **Step 1: Write the component**

```tsx
import { LineChart } from '@/components/charts/line-chart'
import { CHART_COLORS } from '@/lib/constants'
import type { TrendSeries } from '@/lib/organic-social/types'

const PALETTE = [CHART_COLORS.primary, CHART_COLORS.ga4 ?? '#39A0FF', '#FF8A3D', '#9B7BFF']

function Chart({ title, series }: { title: string; series: TrendSeries }) {
  const yKeys = series.channels.map((c, i) => ({ key: c, label: c, color: PALETTE[i % PALETTE.length] }))
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{title}</h2>
      <LineChart data={series.points} xKey="date" yKeys={yKeys} />
    </section>
  )
}

export function Trends({ followers, engagement }: { followers: TrendSeries; engagement: TrendSeries }) {
  return (
    <>
      <Chart title="Follower Growth" series={followers} />
      <Chart title="Engagement" series={engagement} />
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/report-sections/organic-social/trends.tsx
git commit -m "feat(organic-social): multi-series trend charts"
```

---

## Task 10: Top content component — `top-content.tsx`

**Files:**
- Create: `components/report-sections/organic-social/top-content.tsx`

**Interfaces:**
- Consumes: `TopContentRow` (T4), `DataTable`, `num` (base).
- Produces: `<TopContent rows={TopContentRow[]} />`.

- [ ] **Step 1: Write the component**

```tsx
import { DataTable } from '@/components/charts/data-table'
import { num } from '@/lib/organic-social/base'
import type { TopContentRow } from '@/lib/organic-social/types'

export function TopContent({ rows }: { rows: TopContentRow[] }) {
  const columns = [
    { key: 'caption', label: 'Post' },
    { key: 'platform', label: 'Platform' },
    { key: 'sourceType', label: 'Source Type' },
    { key: 'publishDate', label: 'Publish Date' },
    { key: 'views', label: 'Views / Impr.', align: 'right' as const, sortable: true, sortKey: 'viewsRaw' },
    { key: 'engagements', label: 'Engagements', align: 'right' as const, sortable: true, sortKey: 'engagementsRaw' },
  ]
  const display = rows.map((r) => ({
    caption: r.caption.length > 80 ? r.caption.slice(0, 77) + '…' : r.caption,
    platform: r.platform,
    sourceType: r.sourceType === 'organic' ? 'Organic' : 'Influencer',
    publishDate: r.publishDate,
    views: num(r.views), viewsRaw: r.views,
    engagements: num(r.engagements), engagementsRaw: r.engagements,
  }))
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Top Content</h2>
      <DataTable columns={columns} rows={display} defaultSort={{ key: 'engagements', dir: 'desc' }} />
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/report-sections/organic-social/top-content.tsx
git commit -m "feat(organic-social): top content table"
```

---

## Task 11: KPIs fetcher+transform — `lib/organic-social/kpis.ts`

**Files:**
- Create: `lib/organic-social/kpis.ts`
- Test: `lib/organic-social/kpis.test.ts`

**Interfaces:**
- Consumes: `dashClientFor`/`isoRange`/`resolveCompareIso` (T6), `METRICS` (T1), `ReportsDataResponse`/`TotalMetric` (T2), `OrganicKpi` (T4). Test fixture: `__fixtures__/reports-total.json`.
- Produces: `transformKpis(total: ReportsDataResponse<TotalMetric>): OrganicKpi[]` (pure) and `getOrganicKpis(slug, dateRange, compareRange): Promise<OrganicKpi[]>`.

KPI cards (5): Total Followers · Net New Followers · Views / Impressions · Total Engagements · Engagement Rate (derived = engagements ÷ impressions × 100). Deltas come from each metric's `context` (current vs context value). Profile Views/Comments/Shares/Saves/Likes are NOT in v1 (not blendable — see metrics.ts).

- [ ] **Step 1: Write the failing test**

```ts
// lib/organic-social/kpis.test.ts
// Run: npx tsx lib/organic-social/kpis.test.ts
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { transformKpis } from './kpis'
import type { ReportsDataResponse, TotalMetric } from '@/lib/dash-social/types'

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/reports-total.json', import.meta.url), 'utf8')) as ReportsDataResponse<TotalMetric>
const kpis = transformKpis(fixture)

// Total Followers sums across the three CHANNEL entries (skipping the BRAND entry).
const followers = kpis.find((k) => k.key === 'totalFollowers')
assert.ok(followers, 'totalFollowers KPI present')
// fixture: IG 29 + FB 4993 + X (see fixture) — must exceed the largest single channel.
assert.ok(followers!.value >= 4993, 'followers summed across channels, BRAND entry skipped')
// Five cards, in order; engagement rate is a derived percent.
assert.deepEqual(kpis.map((k) => k.key), ['totalFollowers', 'netNewFollowers', 'impressions', 'engagements', 'engagementRate'])
const er = kpis.find((k) => k.key === 'engagementRate')!
assert.equal(er.suffix, '%', 'engagementRate is a percent KPI')
console.log('organic kpis: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/organic-social/kpis.test.ts`
Expected: FAIL — `Cannot find module './kpis'`.

- [ ] **Step 3: Write `lib/organic-social/kpis.ts`**

```ts
import { dashClientFor, isoRange, resolveCompareIso, channelMetricEntries } from './base'
import { METRICS } from './metrics'
import type { ReportsDataResponse, TotalMetric } from '@/lib/dash-social/types'
import type { OrganicKpi } from './types'

/** Sum a metric's value + context across CHANNEL entries (BRAND entry skipped by channelMetricEntries). */
function sumMetric(res: ReportsDataResponse<TotalMetric>, metric: string): { value: number; context: number } {
  let value = 0, context = 0
  for (const [, metrics] of channelMetricEntries(res)) {
    const v = metrics[metric]
    if (v) { value += v.value ?? 0; context += v.context ?? 0 }
  }
  return { value, context }
}
function delta(cur: number, prev: number): number | undefined {
  if (!prev) return undefined
  return ((cur - prev) / prev) * 100
}

export function transformKpis(res: ReportsDataResponse<TotalMetric>): OrganicKpi[] {
  const followers = sumMetric(res, METRICS.totalFollowers)
  const netNew = sumMetric(res, METRICS.netNewFollowers)
  const impressions = sumMetric(res, METRICS.impressions)
  const engagements = sumMetric(res, METRICS.engagements)
  const engRate = impressions.value ? +((engagements.value / impressions.value) * 100).toFixed(1) : 0
  return [
    { key: 'totalFollowers', label: 'Total Followers', value: followers.value, delta: delta(followers.value, followers.context) },
    { key: 'netNewFollowers', label: 'Net New Followers', value: netNew.value, delta: delta(netNew.value, netNew.context) },
    { key: 'impressions', label: 'Views / Impressions', value: impressions.value },
    { key: 'engagements', label: 'Total Engagements', value: engagements.value, delta: delta(engagements.value, engagements.context) },
    { key: 'engagementRate', label: 'Engagement Rate', value: engRate, suffix: '%', tooltip: 'Engagements ÷ impressions' },
  ]
}

export async function getOrganicKpis(slug: string, dateRange: string, compareRange: string | null): Promise<OrganicKpi[]> {
  const { client, brandId, channels } = await dashClientFor(slug)
  const { start, end } = isoRange(dateRange)
  const ctx = resolveCompareIso(dateRange, compareRange)
  const res = await client.getReportsData<TotalMetric>({
    brandId, channels, reportType: 'TOTAL_METRIC',
    metrics: [METRICS.totalFollowers, METRICS.netNewFollowers, METRICS.impressions, METRICS.engagements],
    startDate: start, endDate: end,
    contextStartDate: ctx?.start, contextEndDate: ctx?.end,
  })
  return transformKpis(res)
}
```

> `channelMetricEntries` (added to base in T6) yields `[channelKey, metrics]` for CHANNEL entries only, skipping the `data_type:'BRAND'` entry. Deltas use the API's `context` (prior-period value); we compute the percent ourselves.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/organic-social/kpis.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/kpis.ts lib/organic-social/kpis.test.ts
git commit -m "feat(organic-social): KPI scorecards fetcher + transform"
```

---

## Task 12: Channel contribution fetcher+transform — `lib/organic-social/channels.ts`

**Files:**
- Create: `lib/organic-social/channels.ts`
- Test: `lib/organic-social/channels.test.ts`

**Interfaces:**
- Consumes: `dashClientFor`/`isoRange`/`displayChannel`/`channelMetricEntries` (T6), `METRICS` (T1), `ReportsDataResponse`/`TotalMetric` (T2), `ChannelRow` (T4). Fixture: `reports-total.json`.
- Produces: `transformChannels(res: ReportsDataResponse<TotalMetric>): ChannelRow[]` (pure), `getChannelRows(slug, dateRange): Promise<ChannelRow[]>`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/organic-social/channels.test.ts
// Run: npx tsx lib/organic-social/channels.test.ts
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { transformChannels } from './channels'
import type { ReportsDataResponse, TotalMetric } from '@/lib/dash-social/types'

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/reports-total.json', import.meta.url), 'utf8')) as ReportsDataResponse<TotalMetric>
const rows = transformChannels(fixture)
// 3 CHANNEL entries (IG/FB/X); the BRAND entry must NOT become a row.
assert.equal(rows.length, 3, 'one row per channel, BRAND entry skipped')
assert.ok(rows.every((r) => typeof r.followers === 'number'), 'numeric followers')
assert.ok(rows.some((r) => r.channel === 'Facebook' && r.followers === 4993), 'Facebook row mapped from fixture')
console.log('organic channels: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails** — `npx tsx lib/organic-social/channels.test.ts` → FAIL (no module).

- [ ] **Step 3: Write `lib/organic-social/channels.ts`**

```ts
import { dashClientFor, isoRange, displayChannel, channelMetricEntries } from './base'
import { METRICS } from './metrics'
import type { ReportsDataResponse, TotalMetric } from '@/lib/dash-social/types'
import type { ChannelRow } from './types'

const val = (v: TotalMetric | undefined): number => v?.value ?? 0

export function transformChannels(res: ReportsDataResponse<TotalMetric>): ChannelRow[] {
  return channelMetricEntries(res).map(([channel, metrics]) => {
    const engagements = val(metrics[METRICS.engagements])
    const impressions = val(metrics[METRICS.impressions])
    return {
      channel: displayChannel(channel),
      followers: val(metrics[METRICS.totalFollowers]),
      netNewFollowers: val(metrics[METRICS.netNewFollowers]),
      engagements,
      engagementRate: impressions ? +((engagements / impressions) * 100).toFixed(1) : 0,
    }
  })
}

export async function getChannelRows(slug: string, dateRange: string): Promise<ChannelRow[]> {
  const { client, brandId, channels } = await dashClientFor(slug)
  const { start, end } = isoRange(dateRange)
  const res = await client.getReportsData<TotalMetric>({
    brandId, channels, reportType: 'TOTAL_METRIC',
    metrics: [METRICS.totalFollowers, METRICS.netNewFollowers, METRICS.engagements, METRICS.impressions],
    startDate: start, endDate: end,
  })
  return transformChannels(res)
}
```

- [ ] **Step 4: Run test** — `npx tsx lib/organic-social/channels.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/channels.ts lib/organic-social/channels.test.ts
git commit -m "feat(organic-social): channel contribution fetcher + transform"
```

---

## Task 13: Trends fetcher+transform — `lib/organic-social/trends.ts`

**Files:**
- Create: `lib/organic-social/trends.ts`
- Test: `lib/organic-social/trends.test.ts`

**Interfaces:**
- Consumes: `dashClientFor`/`isoRange`/`displayChannel`/`channelMetricEntries` (T6), `METRICS` (T1), `ReportsDataResponse`/`GraphMetric` (T2), `TrendSeries`/`TrendPoint` (T4). Fixture: `reports-graph.json`.
- Produces: `transformTrend(res: ReportsDataResponse<GraphMetric>, metric): TrendSeries` (pure), `getTrends(slug, dateRange): Promise<{ followers: TrendSeries; engagement: TrendSeries }>`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/organic-social/trends.test.ts
// Run: npx tsx lib/organic-social/trends.test.ts
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { transformTrend } from './trends'
import { METRICS } from './metrics'
import type { ReportsDataResponse, GraphMetric } from '@/lib/dash-social/types'

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/reports-graph.json', import.meta.url), 'utf8')) as ReportsDataResponse<GraphMetric>
const series = transformTrend(fixture, METRICS.totalFollowers)
assert.ok(series.channels.includes('Instagram'), 'Instagram series present')
assert.ok(series.points.length >= 28, 'a point per day in the window')
// each point has a date plus a numeric value per channel (nulls coerced to 0)
const p = series.points[0]
assert.ok('date' in p, 'point has date')
assert.ok(series.channels.every((c) => typeof p[c] === 'number'), 'point has numeric per-channel values')
// points are date-sorted ascending
for (let i = 1; i < series.points.length; i++) assert.ok(String(series.points[i - 1].date) <= String(series.points[i].date), 'sorted by date')
console.log('organic trends: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (no module).

- [ ] **Step 3: Write `lib/organic-social/trends.ts`**

```ts
import { dashClientFor, isoRange, displayChannel, channelMetricEntries } from './base'
import { METRICS } from './metrics'
import type { ReportsDataResponse, GraphMetric } from '@/lib/dash-social/types'
import type { TrendSeries, TrendPoint } from './types'

/** GRAPH shape: data[channelKey].metrics[metric][channelKey] = { [date]: value|null }. */
export function transformTrend(res: ReportsDataResponse<GraphMetric>, metric: string): TrendSeries {
  const channels: string[] = []
  const byDate = new Map<string, TrendPoint>()
  for (const [channelKey, metrics] of channelMetricEntries(res)) {
    const daily = metrics[metric]?.[channelKey]   // inner key repeats the channel
    if (!daily) continue
    const label = displayChannel(channelKey)
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

export async function getTrends(slug: string, dateRange: string): Promise<{ followers: TrendSeries; engagement: TrendSeries }> {
  const { client, brandId, channels } = await dashClientFor(slug)
  const { start, end } = isoRange(dateRange)
  const res = await client.getReportsData<GraphMetric>({
    brandId, channels, reportType: 'GRAPH', timeScale: 'DAILY',
    metrics: [METRICS.totalFollowers, METRICS.engagements],
    startDate: start, endDate: end,
  })
  return { followers: transformTrend(res, METRICS.totalFollowers), engagement: transformTrend(res, METRICS.engagements) }
}
```

- [ ] **Step 4: Run test** — PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/trends.ts lib/organic-social/trends.test.ts
git commit -m "feat(organic-social): follower/engagement trend fetcher + transform"
```

---

## Task 14: Top content fetcher+transform — `lib/organic-social/top-content.ts`

**Files:**
- Create: `lib/organic-social/top-content.ts`
- Test: `lib/organic-social/top-content.test.ts`

**Interfaces:**
- Consumes: `dashClientFor`/`isoRange`/`displayChannel` (T6), `MediaV2Response`/`MediaV2Post` (T2), `TopContentRow` (T4). Fixture: `media-v2.json`.
- Produces: `transformTopContent(res: MediaV2Response, limit?): TopContentRow[]` (pure), `getTopContent(slug, dateRange): Promise<TopContentRow[]>`. **Includes LinkedIn** (top-content is the one surface where LinkedIn appears).

- [ ] **Step 1: Write the failing test**

```ts
// lib/organic-social/top-content.test.ts
// Run: npx tsx lib/organic-social/top-content.test.ts
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { transformTopContent } from './top-content'
import type { MediaV2Response } from '@/lib/dash-social/types'

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/media-v2.json', import.meta.url), 'utf8')) as MediaV2Response
const rows = transformTopContent(fixture, 10)
assert.ok(rows.length <= 10, 'respects limit')
assert.ok(rows.every((r) => r.sourceType === 'organic'), 'all organic in v1')
assert.ok(rows.every((r) => typeof r.engagements === 'number'), 'numeric engagements')
// sorted by engagements desc
for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].engagements >= rows[i].engagements, 'desc by engagements')
console.log('organic top-content: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (no module).

- [ ] **Step 3: Write `lib/organic-social/top-content.ts`**

```ts
import { dashClientFor, isoRange, displayChannel } from './base'
import type { MediaV2Response, MediaV2Post } from '@/lib/dash-social/types'
import type { TopContentRow } from './types'

const n = (v: unknown): number => (typeof v === 'number' ? v : 0)

/** Extract (caption, views, engagements) from whichever per-platform sub-object is populated. */
function metricsFor(post: MediaV2Post): { caption: string; views: number; engagements: number } {
  const ig = post.instagram, fb = post.facebook, li = post.linkedin, tw = post.twitter
  if (ig) return { caption: String(ig.caption ?? ''), views: n(ig.paid_and_organic_reach) || n(ig.impressions), engagements: n(ig.engagements_public) || n(ig.like_count) + n(ig.comments_count) }
  if (fb) return { caption: String(fb.message ?? ''), views: n(fb.organic_views) || n(fb.organic_reach), engagements: n(fb.organic_engagements) }
  if (li) return { caption: String(li.caption ?? ''), views: n(li.impressions), engagements: n(li.engagements) }
  if (tw) return { caption: String(tw.caption ?? tw.text ?? ''), views: n(tw.impressions), engagements: n(tw.engagements) }
  return { caption: '', views: 0, engagements: 0 }
}

export function transformTopContent(res: MediaV2Response, limit = 25): TopContentRow[] {
  return (res.data ?? [])
    .map((post): TopContentRow => {
      const m = metricsFor(post)
      return {
        id: post.id,
        caption: m.caption,
        platform: displayChannel(post.source),
        sourceType: 'organic',
        publishDate: (post.source_created_at ?? '').slice(0, 10),
        views: m.views,
        engagements: m.engagements,
      }
    })
    .sort((a, b) => b.engagements - a.engagements)
    .slice(0, limit)
}

export async function getTopContent(slug: string, dateRange: string): Promise<TopContentRow[]> {
  const { client, brandId } = await dashClientFor(slug)
  const { start, end } = isoRange(dateRange)
  const res = await client.getMedia({ brandId, startDate: start, endDate: end, limit: 100 })
  return transformTopContent(res, 25)
}
```

> Field names in `metricsFor` come from `dash-api-map.md`; **verify against `media-v2.json`** and adjust the per-platform keys if the live fixture differs. Twitter/X keys are unconfirmed in the map (no sample) — pin them from the fixture.

- [ ] **Step 4: Run test** — PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/top-content.ts lib/organic-social/top-content.test.ts
git commit -m "feat(organic-social): top content fetcher + transform (incl. LinkedIn)"
```

---

## Task 15: Orchestrator — `components/report-sections/organic-social/index.tsx`

**Files:**
- Create: `components/report-sections/organic-social/index.tsx`

**Interfaces:**
- Consumes: fetchers `getOrganicKpis`/`getChannelRows`/`getTrends`/`getTopContent` (T11–14), components `OrganicKpiGrid`/`ChannelContribution`/`Trends`/`TopContent` (T7–10), `DashTimeoutError` (T2).
- Produces: `export async function OrganicSocialReport({ clientSlug, dateRange?, compareRange? })`.

- [ ] **Step 1: Write the orchestrator** (mirror `paid-search/index.tsx` `safe()` pattern)

```tsx
import { getOrganicKpis } from '@/lib/organic-social/kpis'
import { getChannelRows } from '@/lib/organic-social/channels'
import { getTrends } from '@/lib/organic-social/trends'
import { getTopContent } from '@/lib/organic-social/top-content'
import { OrganicKpiGrid } from './kpi-grid'
import { ChannelContribution } from './channel-contribution'
import { Trends } from './trends'
import { TopContent } from './top-content'
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
  const [kpis, channels, trends, top] = await Promise.all([
    safe(getOrganicKpis(clientSlug, dateRange, effectiveCompare)),
    safe(getChannelRows(clientSlug, dateRange)),
    safe(getTrends(clientSlug, dateRange)),
    safe(getTopContent(clientSlug, dateRange)),
  ])
  return (
    <div className="space-y-8">
      {kpis.data ? <OrganicKpiGrid kpis={kpis.data} /> : <Fallback kind={kpis.error!} />}
      {channels.data ? <ChannelContribution rows={channels.data} /> : <Fallback kind={channels.error!} />}
      {trends.data ? <Trends followers={trends.data.followers} engagement={trends.data.engagement} /> : <Fallback kind={trends.error!} />}
      {top.data ? <TopContent rows={top.data} /> : <Fallback kind={top.error!} />}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck & commit**

Run: `npx tsc --noEmit`

```bash
git add components/report-sections/organic-social/index.tsx
git commit -m "feat(organic-social): report orchestrator"
```

---

## Task 16: Wire routes + nav/constants

**Files:**
- Modify: `lib/constants.ts` (`REPORT_NAMES`, `NAV_GROUPS`, `CHART_COLORS`, `ALL_REPORT_SLUGS`)
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx`
- Modify: `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx`
- Modify: `app/portal/[clientSlug]/reports/page.tsx`
- Modify: `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`

**Interfaces:**
- Consumes: `OrganicSocialReport` (T15), `'organic-social'` ReportSlug (T3).

- [ ] **Step 1: Constants** — in `lib/constants.ts`:
  - `REPORT_NAMES`: add `'organic-social': 'Organic Social',`
  - The **Reports** entry of `NAV_GROUPS` (`slugs: ['peec-ai', 'ga4', 'paid-media', ...]`): add `'organic-social'` (place after `'paid-media'`).
  - `ALL_REPORT_SLUGS`: add `'organic-social'`.
  - `CHART_COLORS`: confirm a `primary` exists and add an `organicSocial` color if the palette is keyed by slug (match existing convention; e.g. `'organic-social': '#FF8A3D'`).

- [ ] **Step 2: Wire all four route files** — in each, add the import and a switch case mirroring the `google-ads` case. Import:

```tsx
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
```

Case (in the same `switch (slug)` that has `case 'google-ads':`):

```tsx
    case 'organic-social':
      return <OrganicSocialReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
```

- [ ] **Step 3: Build to verify wiring**

Run: `npm run build`
Expected: clean build; `organic-social` resolves in all four routes.

- [ ] **Step 4: Commit**

```bash
git add lib/constants.ts app/dashboard app/portal
git commit -m "feat(organic-social): nav + route wiring"
```

---

## Task 17: Renaissance config row + live smoke test

**Files:**
- Apply migration; update the Renaissance `clients` row (Neon SQL editor or `scripts/`).

**Interfaces:**
- Consumes: migration `0010` (T3), `DashSocialConfig` (T3), Renaissance `brandId` (T1).

- [ ] **Step 1: Apply the migration (dev DB)**

Run: `npm run db:migrate`
Expected: `0010` applied; `clients.dash_social_config` exists.

- [ ] **Step 2: Set the Renaissance row** (Neon SQL editor)

```sql
UPDATE clients
SET dash_social_config = '{"brandId": <RENAISSANCE_BRAND_ID>}'::jsonb,
    enabled_reports = array_append(enabled_reports, 'organic-social')
WHERE slug = 'renaissance' AND NOT ('organic-social' = ANY(enabled_reports));
```

- [ ] **Step 3: Ensure `DASH_API_TOKEN` is in `.env.local`** (copy from `../dash-social-connection/.env`). Do not commit it.

- [ ] **Step 4: Live smoke test**

Run: `npm run dev`, open the Renaissance Organic Social report in the dashboard.
Expected: KPI scorecards populate with deltas; channel contribution lists IG/FB/X; both trend charts render a line per channel; top-content table lists posts (incl. LinkedIn) sorted by engagements. No section shows the error fallback. Confirm numbers are sane vs. the Dash UI.

- [ ] **Step 5: Run the full unit suite**

Run: `for f in lib/dash-social/client.test.ts lib/organic-social/*.test.ts; do npx tsx "$f"; done`
Expected: every file prints `all assertions passed`.

- [ ] **Step 6: Clean up the throwaway probe**

```bash
git rm scripts/dash-social-probe.ts
git commit -m "chore(organic-social): remove one-off Dash Social probe script"
```

---

## Self-review (completed)

- **Spec coverage:** KPI scorecards (T11) · channel contribution (T8/T12) · follower-growth + engagement multi-series trends (T5/T9/T13) · top content incl. LinkedIn with Source Type (T10/T14) · connector (T2) · config/migration/nav (T3/T16) · prior-period deltas (T11 via TOTAL_METRIC) · error isolation (T15 `safe()`) · influencer-ready `sourceType` (T4 types, T10/T14) · gates/open items resolved (T1 spike). ✓
- **Placeholder scan:** the only deferred values are the spike-confirmed metric ids in T1 `metrics.ts` (`<CONFIRM>`), which is T1's explicit deliverable, not a plan gap. Field-name verification notes in T11/T14 point at the captured fixtures.
- **Type consistency:** `OrganicKpi`, `ChannelRow`, `TrendSeries`/`TrendPoint`, `TopContentRow`, `SourceType` defined once in T4 and consumed unchanged in T7–T15; `DashSocialClient.getReportsData`/`getMedia` signatures match between T2 and T6/T11–14; `ReportsMetricValue` union (TOTAL vs GRAPH) used consistently.
```
