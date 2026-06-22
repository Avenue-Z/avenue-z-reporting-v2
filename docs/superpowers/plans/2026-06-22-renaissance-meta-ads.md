# Renaissance Meta Advertising Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Renaissance Meta Advertising report — a single scrolling page (12 KPI scorecards, sortable Creative Performance table, state-level Geographic Performance) wired to live Meta data via Supermetrics.

**Architecture:** Mirrors the merged Paid Search module. Reuses the proven `smQuery` client (`DS_IDS.META`), `KpiCard`/`KpiGrid`, the upgraded serializable-column `DataTable`, `BarChart`, the date controls, and the per-section `safe()` error/timeout isolation. New `lib/meta/` data layer + `components/report-sections/meta-ads/`. Extracts shared formatters to `lib/supermetrics/format.ts`.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript strict, Drizzle + Neon, Recharts, Tailwind v4. Tests: `node:assert` run with `npx tsx` (DB-touching tests need `--env-file=.env.local`).

**Spec:** `docs/superpowers/specs/2026-06-22-renaissance-meta-ads-design.md`

## Global Constraints

- Supermetrics server-side only; `DS_IDS.META === 'FA'`. No `any` in response types.
- Meta is upper-funnel: **no ROAS / revenue / conversion framing**.
- Account id + key come from per-client config (`meta_config.metaAdAccountId`, `sm_api_key_env_var`) — never hardcoded.
- **Engagement Rate is derived**: `action_post_engagement / impressions × 100` (one decimal).
- **Share of Spend** (creative table) is computed: `row spend / total spend × 100` (one decimal).
- Trend/deltas use the **prior-period compare** (default `previous_period`), same as Paid Search.
- **Geo is state-only** (`Region`); no DMA.
- USD whole-dollar for Spend / cost cards / Cost-per-LPV; **CPC and CPM keep cents**; percentages + Frequency one decimal; zero renders `0`, never blank.
- Rows are keyed by Supermetrics **field id** (the `smQuery` client already maps `meta.query.fields` → field_id), so transforms read `r.cost`, `r.ad_name`, `r.Region`, etc.
- Commit after each task.

---

## Verified Meta (FA) field IDs (account `act_1480350426850960`)

| KPI / field | id |
|---|---|
| Spend | `cost` | 
| Impressions | `impressions` |
| Reach | `reach` |
| Frequency | `Frequency` |
| Link Clicks | `inline_link_clicks` |
| CTR | `CTR` |
| CPM | `CPM` |
| CPC | `CPC` |
| Landing Page Views | `landing_page_views` |
| Cost per LPV | `cost_per_landing_page_view` |
| Post Engagement | `action_post_engagement` |
| Ad name (dim) | `ad_name` |
| Campaign (dim) | `Campaignname` |
| Ad status (dim) | `adstatus` |
| Region/state (dim) | `Region` |

---

## Parallelization / dependency graph (for an agent fleet)

```
Wave 1 (parallel, no deps):   T1 schema+migration        T2 shared formatters (lib/supermetrics/format.ts)
Wave 2 (needs T1):            T3 meta base (metaQuery) + FROZEN result types
Wave 3 (needs T3; 7.x also T2):
   data fetch  ── T4 kpis      T5 creative      T6 geo
   presentational ── T7 creative-table (needs T3 types + T2 fmt + DataTable)   T8 geo-section (needs T3 types + T2 fmt + BarChart)
                     (5 tasks parallel; KPI grid reuses the existing <KpiGrid>)
Wave 4 (needs all T4–T8):     T9 orchestrator (index.tsx)
Wave 5 (needs T9):            T10 slug wiring/relabel/build      (T11 seed config needs only T1)
```

**Why it parallelizes:** T3 freezes the result types in `lib/meta/types.ts`. After T3 merges, the 3 data fetchers (T4–T6) and 2 presentational components (T7–T8) build against the same frozen types in disjoint files. T2 is independent of everything Meta. T9 is the only integration point.

**Reference pattern:** every Meta file has a direct Paid Search analogue already in the repo — implementers should read the analogue for style: `lib/paid-search/{kpis,campaigns,geo}.ts`, `components/report-sections/paid-search/{campaign-table,geo-section,index}.tsx`.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `lib/db/schema.ts` + `drizzle/0008_*.sql` | `meta_config` jsonb + `MetaConfig` type | T1 |
| `lib/supermetrics/format.ts` | shared `usd`/`num`/`pct` (extracted) | T2 |
| `lib/paid-search/base.ts` | re-export formatters from new module | T2 |
| `lib/meta/types.ts` | `CreativeRow`, `MetaGeoRow` (frozen) | T3 |
| `lib/meta/base.ts` | `metaQuery`, `resolveCompareIso` | T3 |
| `lib/meta/kpis.ts` | `transformMetaKpis` + `getMetaKpis` | T4 |
| `lib/meta/creative.ts` | `transformCreative` + `getCreativeRows` | T5 |
| `lib/meta/geo.ts` | `transformMetaGeo` + `getMetaGeoRows` | T6 |
| `components/report-sections/meta-ads/creative-table.tsx` | creative table | T7 |
| `components/report-sections/meta-ads/geo-section.tsx` | state geo bars | T8 |
| `components/report-sections/meta-ads/index.tsx` | async RSC orchestrator | T9 |
| 3 route files + `lib/constants.ts` + `ai-summaries` | repurpose `meta-ads` slug + nav | T10 |
| `scripts/seed.ts` | Renaissance `meta_config` + enable `meta-ads` | T11 |

---

## Task 1: DB schema + migration

**Files:** Modify `lib/db/schema.ts`; Create migration via `npm run db:generate`.

**Interfaces:**
- Produces: `MetaConfig` (`{ metaAdAccountId: string }`); `clients.metaConfig: MetaConfig | null`.

- [ ] **Step 1: Add type + column.** In `lib/db/schema.ts`, after the `PaidSearchConfig` interface add:

```ts
export interface MetaConfig {
  /** Meta ad account id incl. the act_ prefix, e.g. 'act_1480350426850960'. */
  metaAdAccountId: string
}
```

In the `clients` table, alongside `paidSearchConfig`, add:

```ts
  metaConfig: jsonb('meta_config').$type<MetaConfig>(),
```

- [ ] **Step 2: Generate migration.** Run: `npm run db:generate` → expect a new `drizzle/0008_*.sql` adding only `meta_config`. Do NOT run `db:migrate`.
- [ ] **Step 3: Typecheck.** Run: `npx tsc --noEmit` → no errors.
- [ ] **Step 4: Commit.**
```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): add meta_config to clients"
```

---

## Task 2: Shared formatter module

**Files:** Create `lib/supermetrics/format.ts`, `lib/supermetrics/format.test.ts`; Modify `lib/paid-search/base.ts`.

**Interfaces:**
- Produces: `usd(n: number): string` (whole-dollar `$1,235`), `num(n: number): string` (thousands sep), `pct(n: number): string` (one decimal + `%`).
- `lib/paid-search/base.ts` re-exports these (existing paid-search imports keep working).

- [ ] **Step 1: Write the failing test** `lib/supermetrics/format.test.ts`:

```ts
// Run: npx tsx lib/supermetrics/format.test.ts
import { strict as assert } from 'node:assert'
import { usd, num, pct } from './format'
assert.equal(usd(1234.7), '$1,235')
assert.equal(num(12345), '12,345')
assert.equal(pct(12.34), '12.3%')
console.log('ok')
```

- [ ] **Step 2: Run → fail** (`npx tsx lib/supermetrics/format.test.ts`).
- [ ] **Step 3: Implement** `lib/supermetrics/format.ts`:

```ts
export function usd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}
export function num(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}
export function pct(n: number): string {
  return n.toFixed(1) + '%'
}
```

- [ ] **Step 4: Re-point `lib/paid-search/base.ts`.** Delete its local `usd`/`num`/`pct` function definitions and replace with a re-export so existing importers are unchanged:

```ts
export { usd, num, pct } from '@/lib/supermetrics/format'
```

- [ ] **Step 5: Run tests** — `npx tsx lib/supermetrics/format.test.ts` (prints `ok`) and `npx tsx --env-file=.env.local lib/paid-search/base.test.ts` (still `ok`). Then `npx tsc --noEmit`.
- [ ] **Step 6: Commit.**
```bash
git add lib/supermetrics/format.ts lib/supermetrics/format.test.ts lib/paid-search/base.ts
git commit -m "refactor(supermetrics): extract shared usd/num/pct formatters"
```

---

## Task 3: Meta base + frozen result types

**Files:** Create `lib/meta/types.ts`, `lib/meta/base.ts`, `lib/meta/base.test.ts`.

**Interfaces:**
- Consumes: `smQuery`, `parseSmRows`, `DS_IDS` (`@/lib/supermetrics/client`); `MetaConfig` (`@/lib/db/schema`); `getClientBySlug` (`@/lib/db/queries`); `parseDateRange`, `deriveCompareRange` (`@/lib/ga4/client`).
- Produces (frozen — Wave 3 builds against these):
  - `lib/meta/types.ts`:
    ```ts
    export interface CreativeRow { ad: string; campaign: string; status: string; spend: number; impressions: number; reach: number; frequency: number; linkClicks: number; ctr: number; cpc: number; lpv: number; costPerLpv: number; engagements: number; shareOfSpend: number }
    export interface MetaGeoRow { region: string; spend: number; linkClicks: number; lpv: number; engagements: number }
    ```
  - `lib/meta/base.ts`:
    ```ts
    async function metaQuery(slug: string, fields: string[], dateRange: string, opts?: { filters?: string; settings?: Record<string,unknown>; maxRows?: number }): Promise<Record<string,string>[]>
    function resolveCompareIso(dateRange: string, compareRange: string | null): string | null
    ```

- [ ] **Step 1: Write `lib/meta/types.ts`** (exact contents above).

- [ ] **Step 2: Write the failing test** `lib/meta/base.test.ts`:

```ts
// Run: npx tsx --env-file=.env.local lib/meta/base.test.ts
import { strict as assert } from 'node:assert'
import { resolveCompareIso } from './base'
assert.equal(resolveCompareIso('2026-01-01,2026-01-31', null), null)
assert.equal(resolveCompareIso('2026-01-01,2026-01-31', 'previous_period'), '2025-12-01,2025-12-31')
console.log('ok')
```

- [ ] **Step 3: Run → fail.**
- [ ] **Step 4: Implement** `lib/meta/base.ts`:

```ts
import { smQuery, parseSmRows, DS_IDS } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'

export async function metaQuery(
  slug: string,
  fields: string[],
  dateRange: string,
  opts: { filters?: string; settings?: Record<string, unknown>; maxRows?: number } = {},
): Promise<Record<string, string>[]> {
  const client = await getClientBySlug(slug)
  const accountId = client?.metaConfig?.metaAdAccountId
  const envVar = client?.smApiKeyEnvVar
  if (!accountId || !envVar) throw new Error(`meta_config / sm_api_key_env_var missing for ${slug}`)
  const apiKey = process.env[envVar]
  if (!apiKey) throw new Error(`Missing env var ${envVar}`)
  const { startDate, endDate } = parseDateRange(dateRange)
  const result = await smQuery({
    apiKey, dsId: DS_IDS.META, dsAccounts: accountId,
    fields, dateRange: `${startDate},${endDate}`, filters: opts.filters, settings: opts.settings, maxRows: opts.maxRows,
  })
  return parseSmRows(result)
}

export function resolveCompareIso(dateRange: string, compareRange: string | null): string | null {
  const r = deriveCompareRange(dateRange, compareRange)
  return r ? `${r.startDate},${r.endDate}` : null
}
```

- [ ] **Step 5: Run → `ok`. Typecheck. Commit.**
```bash
git add lib/meta/types.ts lib/meta/base.ts lib/meta/base.test.ts
git commit -m "feat(meta): frozen result types + FA query base"
```

---

## Task 4: Meta KPI scorecards (data)

**Files:** Create `lib/meta/kpis.ts`, `lib/meta/kpis.test.ts`.

**Interfaces:**
- Consumes: `metaQuery`, `resolveCompareIso` (T3); `Kpi` (`@/lib/paid-search/types`).
- Produces: `transformMetaKpis(totals, compareTotals|null): Kpi[]` (pure; 12 cards); `getMetaKpis(slug, dateRange, compareRange): Promise<Kpi[]>`.

- [ ] **Step 1: Failing test** `lib/meta/kpis.test.ts`:

```ts
// Run: npx tsx --env-file=.env.local lib/meta/kpis.test.ts
import { strict as assert } from 'node:assert'
import { transformMetaKpis } from './kpis'
const totals = { cost: '5000', impressions: '200000', reach: '120000', Frequency: '1.67', inline_link_clicks: '3400', CTR: '1.7', CPM: '25', CPC: '1.47', landing_page_views: '2600', cost_per_landing_page_view: '1.92', action_post_engagement: '8000' }
const k = transformMetaKpis(totals, null)
assert.equal(k.length, 12)
assert.equal(k.find((c) => c.key === 'spend')!.value, 5000)
assert.equal(k.find((c) => c.key === 'reach')!.value, 120000)
// Engagement Rate derived = 8000 / 200000 * 100 = 4.0
assert.equal(k.find((c) => c.key === 'engRate')!.value, 4)
console.log('ok')
```

- [ ] **Step 2: Run → fail. Step 3: Implement** `lib/meta/kpis.ts`:

```ts
import { metaQuery, resolveCompareIso } from './base'
import type { Kpi } from '@/lib/paid-search/types'

function n(row: Record<string, string>, id: string): number { return Number(row[id] || 0) }
function delta(cur: number, prev: number | undefined): number | undefined {
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}

export function transformMetaKpis(totals: Record<string, string>, compare: Record<string, string> | null): Kpi[] {
  const engRate = (t: Record<string, string>) => (n(t, 'impressions') ? (n(t, 'action_post_engagement') / n(t, 'impressions')) * 100 : 0)
  const d = (id: string) => delta(n(totals, id), compare ? n(compare, id) : undefined)
  return [
    { key: 'spend', label: 'Spend', value: Math.round(n(totals, 'cost')), prefix: '$', delta: d('cost') },
    { key: 'impressions', label: 'Impressions', value: n(totals, 'impressions'), delta: d('impressions') },
    { key: 'reach', label: 'Reach', value: n(totals, 'reach'), delta: d('reach') },
    { key: 'frequency', label: 'Frequency', value: +n(totals, 'Frequency').toFixed(1), suffix: 'x' },
    { key: 'linkClicks', label: 'Link Clicks', value: n(totals, 'inline_link_clicks'), delta: d('inline_link_clicks') },
    { key: 'ctr', label: 'CTR', value: +n(totals, 'CTR').toFixed(1), suffix: '%' },
    { key: 'cpm', label: 'CPM', value: +n(totals, 'CPM').toFixed(2), prefix: '$' },
    { key: 'cpc', label: 'CPC', value: +n(totals, 'CPC').toFixed(2), prefix: '$' },
    { key: 'lpv', label: 'Landing Page Views', value: n(totals, 'landing_page_views'), delta: d('landing_page_views') },
    { key: 'costPerLpv', label: 'Cost / LPV', value: Math.round(n(totals, 'cost_per_landing_page_view')), prefix: '$' },
    { key: 'postEng', label: 'Post Engagement', value: n(totals, 'action_post_engagement'), delta: d('action_post_engagement') },
    { key: 'engRate', label: 'Engagement Rate', value: +engRate(totals).toFixed(1), suffix: '%', delta: delta(engRate(totals), compare ? engRate(compare) : undefined) },
  ]
}

export async function getMetaKpis(slug: string, dateRange: string, compareRange: string | null): Promise<Kpi[]> {
  const fields = ['cost', 'impressions', 'reach', 'Frequency', 'inline_link_clicks', 'CTR', 'CPM', 'CPC', 'landing_page_views', 'cost_per_landing_page_view', 'action_post_engagement']
  const compareIso = resolveCompareIso(dateRange, compareRange)
  const [main, cmp] = await Promise.all([
    metaQuery(slug, fields, dateRange).then((r) => r[0] ?? {}),
    compareIso ? metaQuery(slug, fields, compareIso).then((r) => r[0] ?? {}) : Promise.resolve(null),
  ])
  return transformMetaKpis(main, cmp)
}
```

- [ ] **Step 4: Run → `ok`. Step 5: Commit** `feat(meta): KPI scorecards with derived engagement rate`.

---

## Task 5: Creative Performance (data)

**Files:** Create `lib/meta/creative.ts`, `lib/meta/creative.test.ts`.

**Interfaces:**
- Consumes: `metaQuery` (T3); `CreativeRow` (T3 types).
- Produces: `transformCreative(rows): CreativeRow[]` (pure; computes shareOfSpend, sorts spend desc); `getCreativeRows(slug, dateRange): Promise<CreativeRow[]>`.

- [ ] **Step 1: Failing test** `lib/meta/creative.test.ts`:

```ts
// Run: npx tsx --env-file=.env.local lib/meta/creative.test.ts
import { strict as assert } from 'node:assert'
import { transformCreative } from './creative'
const rows = [
  { ad_name: 'Ad A', Campaignname: 'Awareness', adstatus: 'ACTIVE', cost: '300', impressions: '10000', reach: '8000', Frequency: '1.25', inline_link_clicks: '200', CTR: '2.0', CPC: '1.5', landing_page_views: '150', cost_per_landing_page_view: '2.0', action_post_engagement: '500' },
  { ad_name: 'Ad B', Campaignname: 'Traffic', adstatus: 'PAUSED', cost: '100', impressions: '5000', reach: '4000', Frequency: '1.25', inline_link_clicks: '80', CTR: '1.6', CPC: '1.25', landing_page_views: '60', cost_per_landing_page_view: '1.67', action_post_engagement: '180' },
]
const out = transformCreative(rows)
assert.equal(out[0].ad, 'Ad A')                 // sorted by spend desc
assert.equal(out[0].shareOfSpend, 75)           // 300 / 400 * 100
assert.equal(out[1].shareOfSpend, 25)
assert.equal(out[0].status, 'ACTIVE')
console.log('ok')
```

- [ ] **Step 2: Run → fail. Step 3: Implement** `lib/meta/creative.ts`:

```ts
import { metaQuery } from './base'
import type { CreativeRow } from './types'

export function transformCreative(rows: Record<string, string>[]): CreativeRow[] {
  const num = (r: Record<string, string>, id: string) => Number(r[id] || 0)
  const total = rows.reduce((s, r) => s + num(r, 'cost'), 0)
  return rows
    .map((r): CreativeRow => {
      const spend = num(r, 'cost')
      return {
        ad: r.ad_name, campaign: r.Campaignname, status: r.adstatus ?? '',
        spend, impressions: num(r, 'impressions'), reach: num(r, 'reach'),
        frequency: +num(r, 'Frequency').toFixed(1), linkClicks: num(r, 'inline_link_clicks'),
        ctr: +num(r, 'CTR').toFixed(1), cpc: +num(r, 'CPC').toFixed(2),
        lpv: num(r, 'landing_page_views'), costPerLpv: Math.round(num(r, 'cost_per_landing_page_view')),
        engagements: num(r, 'action_post_engagement'),
        shareOfSpend: total ? +((spend / total) * 100).toFixed(1) : 0,
      }
    })
    .sort((a, b) => b.spend - a.spend)
}

export async function getCreativeRows(slug: string, dateRange: string): Promise<CreativeRow[]> {
  const rows = await metaQuery(slug, [
    'ad_name', 'Campaignname', 'adstatus', 'cost', 'impressions', 'reach', 'Frequency',
    'inline_link_clicks', 'CTR', 'CPC', 'landing_page_views', 'cost_per_landing_page_view', 'action_post_engagement',
  ], dateRange, { maxRows: 200 })
  return transformCreative(rows)
}
```

- [ ] **Step 4: Run → `ok`. Step 5: Commit** `feat(meta): creative performance rows + share-of-spend`.

---

## Task 6: Geographic Performance (data)

**Files:** Create `lib/meta/geo.ts`, `lib/meta/geo.test.ts`.

**Interfaces:**
- Consumes: `metaQuery` (T3); `MetaGeoRow` (T3 types).
- Produces: `transformMetaGeo(rows): MetaGeoRow[]` (pure; sorts spend desc, top 15); `getMetaGeoRows(slug, dateRange): Promise<MetaGeoRow[]>`.

- [ ] **Step 1: Failing test** `lib/meta/geo.test.ts`:

```ts
// Run: npx tsx --env-file=.env.local lib/meta/geo.test.ts
import { strict as assert } from 'node:assert'
import { transformMetaGeo } from './geo'
const rows = [
  { Region: 'Ohio', cost: '200', inline_link_clicks: '40', landing_page_views: '30', action_post_engagement: '90' },
  { Region: 'Texas', cost: '500', inline_link_clicks: '120', landing_page_views: '80', action_post_engagement: '210' },
]
const out = transformMetaGeo(rows)
assert.equal(out[0].region, 'Texas')   // spend desc
assert.equal(out[0].spend, 500)
console.log('ok')
```

- [ ] **Step 2: Run → fail. Step 3: Implement** `lib/meta/geo.ts`:

```ts
import { metaQuery } from './base'
import type { MetaGeoRow } from './types'

export function transformMetaGeo(rows: Record<string, string>[]): MetaGeoRow[] {
  const num = (r: Record<string, string>, id: string) => Number(r[id] || 0)
  return rows
    .map((r): MetaGeoRow => ({
      region: r.Region, spend: num(r, 'cost'), linkClicks: num(r, 'inline_link_clicks'),
      lpv: num(r, 'landing_page_views'), engagements: num(r, 'action_post_engagement'),
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 15)
}

export async function getMetaGeoRows(slug: string, dateRange: string): Promise<MetaGeoRow[]> {
  const rows = await metaQuery(slug, ['Region', 'cost', 'inline_link_clicks', 'landing_page_views', 'action_post_engagement'], dateRange, { maxRows: 500 })
  return transformMetaGeo(rows)
}
```

- [ ] **Step 4: Run → `ok`. Step 5: Commit** `feat(meta): geographic rows by state`.

---

## Task 7: Creative table component

**Files:** Create `components/report-sections/meta-ads/creative-table.tsx`.

**Interfaces:** Consumes `CreativeRow` (T3), `DataTable` (`@/components/charts/data-table`), `usd`/`num`/`pct` (`@/lib/supermetrics/format`). Produces `<CreativeTable rows={CreativeRow[]} />`.

> Pattern reference: `components/report-sections/paid-search/campaign-table.tsx` (same serializable `sortKey` + shadow-field approach; columns must be plain data, NOT `sortValue` functions).

- [ ] **Step 1: Implement.**

```tsx
import { DataTable } from '@/components/charts/data-table'
import { usd, num, pct } from '@/lib/supermetrics/format'
import type { CreativeRow } from '@/lib/meta/types'

const columns = [
  { key: 'ad', label: 'Ad Name', align: 'left' as const, sortable: true },
  { key: 'campaign', label: 'Campaign', align: 'left' as const, sortable: true },
  { key: 'spend', label: 'Spend', align: 'right' as const, sortable: true, sortKey: '_spend' },
  { key: 'impressions', label: 'Impressions', align: 'right' as const, sortable: true, sortKey: '_impressions' },
  { key: 'reach', label: 'Reach', align: 'right' as const, sortable: true, sortKey: '_reach' },
  { key: 'frequency', label: 'Frequency', align: 'right' as const, sortable: true, sortKey: '_frequency' },
  { key: 'linkClicks', label: 'Link Clicks', align: 'right' as const, sortable: true, sortKey: '_linkClicks' },
  { key: 'ctr', label: 'CTR', align: 'right' as const, sortable: true, sortKey: '_ctr' },
  { key: 'cpc', label: 'CPC', align: 'right' as const, sortable: true, sortKey: '_cpc' },
  { key: 'lpv', label: 'LPV', align: 'right' as const, sortable: true, sortKey: '_lpv' },
  { key: 'costPerLpv', label: 'Cost / LPV', align: 'right' as const, sortable: true, sortKey: '_costPerLpv' },
  { key: 'engagements', label: 'Engagements', align: 'right' as const, sortable: true, sortKey: '_engagements' },
  { key: 'shareOfSpend', label: 'Share of Spend', align: 'right' as const, sortable: true, sortKey: '_shareOfSpend' },
  { key: 'status', label: 'Status', align: 'left' as const, sortable: true },
]

export function CreativeTable({ rows }: { rows: CreativeRow[] }) {
  const tableRows = rows.map((r) => ({
    ad: r.ad, campaign: r.campaign, status: r.status,
    spend: usd(r.spend), impressions: num(r.impressions), reach: num(r.reach),
    frequency: r.frequency.toFixed(1) + 'x', linkClicks: num(r.linkClicks),
    ctr: pct(r.ctr), cpc: '$' + r.cpc.toFixed(2), lpv: num(r.lpv), costPerLpv: usd(r.costPerLpv),
    engagements: num(r.engagements), shareOfSpend: pct(r.shareOfSpend),
    _spend: r.spend, _impressions: r.impressions, _reach: r.reach, _frequency: r.frequency,
    _linkClicks: r.linkClicks, _ctr: r.ctr, _cpc: r.cpc, _lpv: r.lpv, _costPerLpv: r.costPerLpv,
    _engagements: r.engagements, _shareOfSpend: r.shareOfSpend,
  }))
  return <DataTable columns={columns} rows={tableRows} defaultSort={{ key: 'spend', dir: 'desc' }} />
}
```

- [ ] **Step 2: Typecheck + lint** (`npx tsc --noEmit && npx eslint components/report-sections/meta-ads/creative-table.tsx`). **Step 3: Commit** `feat(meta): creative performance table`.

---

## Task 8: Geo section component

**Files:** Create `components/report-sections/meta-ads/geo-section.tsx`.

**Interfaces:** Consumes `MetaGeoRow` (T3), `BarChart` (`@/components/charts/bar-chart`), `CHART_COLORS` (`@/lib/constants`). Produces `<MetaGeoSection rows={MetaGeoRow[]} />`.

> Pattern reference: `components/report-sections/paid-search/geo-section.tsx` (read it for the exact `BarChart` prop shape — match it).

- [ ] **Step 1: Implement** (read `paid-search/geo-section.tsx` for `BarChart`'s exact props, then mirror it): top-10 `rows.slice(0,10)` ranked by spend, `xKey="region"`, a `leads`-style `yKeys=[{ key:'spend', label:'Spend', color: CHART_COLORS.metaAds }]`, plus small metric cards (top state, total states). No map. Match existing dark-theme classes.
- [ ] **Step 2: Typecheck + lint. Step 3: Commit** `feat(meta): geographic performance section`.

---

## Task 9: Orchestrator (RSC)

**Files:** Create `components/report-sections/meta-ads/index.tsx`.

**Interfaces:**
- Consumes: `getMetaKpis` (T4), `getCreativeRows` (T5), `getMetaGeoRows` (T6); `KpiGrid` (`@/components/report-sections/paid-search/kpi-grid`); `CreativeTable` (T7), `MetaGeoSection` (T8); `SmTimeoutError` (`@/lib/supermetrics/client`).
- Produces: `async function MetaAdsReport({ clientSlug, dateRange, compareRange }: { clientSlug: string; dateRange?: string; compareRange?: string | null }): Promise<JSX.Element>`.

> Pattern reference: `components/report-sections/paid-search/index.tsx` (copy the `safe()` + `Fallback` helpers verbatim; default `compareRange` to `previous_period`).

- [ ] **Step 1: Implement.**

```tsx
import { getMetaKpis } from '@/lib/meta/kpis'
import { getCreativeRows } from '@/lib/meta/creative'
import { getMetaGeoRows } from '@/lib/meta/geo'
import { KpiGrid } from '@/components/report-sections/paid-search/kpi-grid'
import { CreativeTable } from './creative-table'
import { MetaGeoSection } from './geo-section'
import { SmTimeoutError } from '@/lib/supermetrics/client'

async function safe<T>(p: Promise<T>): Promise<{ data?: T; error?: 'timeout' | 'error' }> {
  try { return { data: await p } }
  catch (e) { return { error: e instanceof SmTimeoutError ? 'timeout' : 'error' } }
}
function Fallback({ kind }: { kind: 'timeout' | 'error' }) {
  return <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted">
    {kind === 'timeout' ? 'Taking longer than usual — try a shorter date range.' : "Couldn't load this section."}
  </div>
}

export async function MetaAdsReport({ clientSlug, dateRange = 'last_30_days', compareRange = null }: { clientSlug: string; dateRange?: string; compareRange?: string | null }) {
  const compare = compareRange ?? 'previous_period'
  const [kpis, creative, geo] = await Promise.all([
    safe(getMetaKpis(clientSlug, dateRange, compare)),
    safe(getCreativeRows(clientSlug, dateRange)),
    safe(getMetaGeoRows(clientSlug, dateRange)),
  ])
  return (
    <div className="space-y-8">
      {kpis.data ? <KpiGrid kpis={kpis.data} /> : <Fallback kind={kpis.error!} />}
      {creative.data ? <CreativeTable rows={creative.data} /> : <Fallback kind={creative.error!} />}
      {geo.data ? <MetaGeoSection rows={geo.data} /> : <Fallback kind={geo.error!} />}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + lint. Step 3: Commit** `feat(meta): section orchestrator with per-section error states`.

---

## Task 10: Repurpose the `meta-ads` slug

**Files (modify):** `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx`, `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx`, `lib/constants.ts`, `components/report-sections/ai-summaries/index.tsx`.

- [ ] **Step 1:** In all three route files, replace the `MetaAdsReport` import to come from `@/components/report-sections/meta-ads` (it already imports a `MetaAdsReport` — confirm path) and change the `case 'meta-ads':` to pass `clientSlug` + `dateRange` + `compareRange`, matching how the sibling `case 'google-ads':` passes props in each file. Delete the old stub import if it differs.
- [ ] **Step 2:** In `lib/constants.ts`, change the `'meta-ads'` label to **'Meta Advertising'**.
- [ ] **Step 3:** In `lib/constants.ts`, add `'meta-ads'` to the `NAV_GROUPS` Reports group `slugs` (next to `'google-ads'`).
- [ ] **Step 4:** Leave `ai-summaries` `'meta-ads'` metadata key as-is. Delete the old stub `components/report-sections/meta-ads/index.tsx` ONLY if it's the demo stub — but T7–T9 created files in that same dir, so instead confirm the stub was replaced by T9's `index.tsx` (the orchestrator). Verify no leftover demo arrays remain: `grep -rn "DEMO_" components/report-sections/meta-ads/` → expect none.
- [ ] **Step 5:** `grep -rn "report-sections/meta-ads" --include="*.tsx" .` → only the 3 route files. Then `npx tsc --noEmit && npm run lint && npm run build` → clean.
- [ ] **Step 6: Commit** `feat(meta): repurpose meta-ads slug to Meta Advertising; wire routes + nav`.

> Note: the old `components/report-sections/meta-ads/` stub is a single `index.tsx`. T9 overwrites that `index.tsx` with the orchestrator, so there is no separate stub directory to delete — just ensure the demo content is gone.

---

## Task 11: Seed Renaissance Meta config (needs only T1)

**Files:** Modify `scripts/seed.ts`.

- [ ] **Step 1:** Add to the Renaissance client object: `metaConfig: { metaAdAccountId: 'act_1480350426850960' }`, and add `'meta-ads'` to its `enabledReports`. Add `metaConfig: null` to other seed clients + the `clientValues` insert mapping (mirror how `paidSearchConfig` is threaded through `seed.ts`).
- [ ] **Step 2:** `npx tsc --noEmit`. Do NOT run `db:seed` (ops step). 
- [ ] **Step 3: Commit** `chore(seed): Renaissance meta_config + enable meta-ads`.

> The dev DB row update (and prod) is an ops step done at integration time, like Paid Search: `meta_config = { metaAdAccountId: 'act_1480350426850960' }` + add `'meta-ads'` to `enabled_reports`.

---

## Self-review notes

- **Spec coverage:** KPI scorecards §6.1 → T4 + reused `KpiGrid`; Creative §6.2 → T5/T7; Geo §6.3 → T6/T8; slug §5.1 → T10; formatter extraction §5.2 → T2; data layer §5.3 → T3–T6; components §5.4 → T7–T9; config §5.5 → T1/T11; states §8 → T9. Engagement Rate derived (T4) and Share of Spend computed (T5) per §4/§7. Trend = prior-period compare (T9 default). Geo state-only (T6). All covered.
- **Type consistency:** all Wave-3 tasks import `CreativeRow`/`MetaGeoRow` from `lib/meta/types.ts` (T3) and `Kpi` from `lib/paid-search/types.ts`; fetchers share `metaQuery`/`resolveCompareIso` (T3); formatters from `lib/supermetrics/format.ts` (T2); `DataTable` uses serializable `sortKey` (no functions) per the merged Paid Search fix.
- **Live-data gotchas already de-risked by Paid Search:** field-id keying (smQuery handles it), synchronous response, `previous_period` default. First live query (during/after T4) confirms FA data volume for `act_1480350426850960`.
