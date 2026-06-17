# Renaissance Paid Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Renaissance Paid Search report — a single scrolling Google Ads lead-gen page (hero combo chart, KPI scorecards, campaign table, leads & conversions, geo, search terms) wired to live Supermetrics data.

**Architecture:** Re-establish a server-side Supermetrics `smQuery` async client; build a `lib/paid-search/` data layer of pure transforms (testable against real sample rows) plus thin fetch wrappers; render via an async RSC that fans out queries with `Promise.all` and reuses the existing KpiCard plus two new chart/table primitives. Repurpose the dormant `google-ads` report slug.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript (strict), Drizzle ORM + Neon, Recharts, Tailwind v4. Tests: `node:assert` scripts run with `npx tsx`.

**Spec:** `docs/superpowers/specs/2026-06-17-renaissance-paid-search-design.md`
**Decisions:** `docs/superpowers/specs/2026-06-17-renaissance-paid-search-prd-decisions.md`

## Global Constraints

- All Supermetrics calls are **server-side only**. Never import the client into a Client Component.
- `ds_id` for Google Ads is **`'AW'`**. LinkedIn is `'LIA'` (not `'LI'`). Never hardcode ids in components — use `DS_IDS`.
- **Leads = sum of the configured form-fill actions only** (category "Submit lead form"). Exclude `Calls from ads` and `Local actions - Directions`. Never use raw `Conversions` as Leads.
- The 14-action list and account id come from **per-client `paid_search_config`**, never hardcoded.
- Currency **USD**, whole-dollar rounding for cost/CPL; percentages to **one decimal**. Zero values render `0`, never blank. **Totals round the sum, not the sum of rounded values.**
- No `any` in Supermetrics response types.
- Tests are colocated `*.test.ts`, run with `npx tsx <path>`, using `import { strict as assert } from 'node:assert'`. A failing test throws; a passing run exits 0 with no output.
- Commit after each task (frequent commits).

---

## Parallelization / dependency graph (for an agent fleet)

Tasks are grouped into waves. **Within a wave, tasks are independent and can run on separate agents in parallel.** A wave starts only after the prior wave's tasks it depends on are merged.

```
Wave 1 (parallel, no deps):     T1 schema   T2 smQuery   T3 combo-chart   T4 data-table upgrade
Wave 2 (needs T1+T2):           T5 paid-search shared base + ALL result types
Wave 3 (needs T5; 7.x also T3/T4):
   data fetch  ── T6a kpis   T6b hero   T6c campaign+reconcile   T6d leads   T6e geo   T6f search-terms
   presentational ── T7a hero  T7b kpi-grid  T7c campaign-table  T7d leads-section  T7e geo  T7f search-terms
                     (12 tasks parallel: 6 consume awQuery, 6 consume frozen types from T5)
Wave 4 (needs all T6 + T7):     T8 section orchestrator (index.tsx)
Wave 5 (needs T8):              T9 slug wiring/relabel      (T10 seed config needs only T1)
```

**Why this works:** T5 freezes every result type in `lib/paid-search/types.ts`. Once T5 is merged, the data-fetch tasks (T6) and presentational tasks (T7) build against the *same frozen types* without touching each other's files — no shared-file contention. Each T7 component imports only its type + a chart primitive. T8 is the only integration point.

**Gates (external, do not block coding):** B1 = Supermetrics app API key; B2 = authoritative 14-action→category map. Code is built and tested with mocked fetch + a placeholder config; live data and acceptance criterion §10 need B1/B2.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `lib/db/schema.ts` | add `smApiKeyEnvVar`, `paidSearchConfig` cols + `PaidSearchConfig` type | T1 |
| `drizzle/<gen>.sql` | migration for the two columns | T1 |
| `lib/supermetrics/constants.ts` | `DS_IDS` | T2 |
| `lib/supermetrics/types.ts` | request/response/error types | T2 |
| `lib/supermetrics/client.ts` | `smQuery` async submit→poll, timeout, rate-limit | T2 |
| `components/charts/combo-chart.tsx` | bars + dashed secondary-axis line | T3 |
| `components/charts/data-table.tsx` | + sorting, totals row, row deltas (additive) | T4 |
| `lib/paid-search/types.ts` | all result types (frozen contract) | T5 |
| `lib/paid-search/base.ts` | `awQuery`, date/compare, week buckets, `scopeLeads`, fmt | T5 |
| `lib/paid-search/kpis.ts` | `getPaidSearchKpis` + `transformKpis` | T6a |
| `lib/paid-search/hero.ts` | `getHeroSeries` + `transformHero` | T6b |
| `lib/paid-search/campaigns.ts` | `getCampaignRows` + `reconcileCampaigns` | T6c |
| `lib/paid-search/leads.ts` | `getLeadBreakdown` + `transformLeads` | T6d |
| `lib/paid-search/geo.ts` | `getGeoRows` + `transformGeo` | T6e |
| `lib/paid-search/search-terms.ts` | `getSearchTermRows` + `transformSearchTerms` | T6f |
| `components/report-sections/paid-search/hero.tsx` | hero chart + metric toggle | T7a |
| `components/report-sections/paid-search/kpi-grid.tsx` | KPI scorecard grid | T7b |
| `components/report-sections/paid-search/campaign-table.tsx` | campaign table | T7c |
| `components/report-sections/paid-search/leads-section.tsx` | leads & conversions | T7d |
| `components/report-sections/paid-search/geo-section.tsx` | ranked geo bars | T7e |
| `components/report-sections/paid-search/search-terms.tsx` | search terms table | T7f |
| `components/report-sections/paid-search/index.tsx` | async RSC orchestrator | T8 |
| `app/dashboard/.../[reportSlug]/page.tsx` + 2 portal routes; `lib/constants.ts`; `components/report-sections/ai-summaries/index.tsx` | repurpose `google-ads` slug + relabel | T9 |
| `scripts/seed.ts` | Renaissance `paid_search_config` + `smApiKeyEnvVar` | T10 |

---

## Task 1: DB schema + migration

**Files:**
- Modify: `lib/db/schema.ts` (add `PaidSearchConfig` type near `PRConfig` ~line 35; add two columns in `clients` ~line 98)
- Create: migration via `npm run db:generate`

**Interfaces:**
- Produces: `PaidSearchConfig` (`{ googleAdsAccountId: string; leadActions: Array<{ name: string; category: 'employer'|'broker'|'contact' }> }`); `clients.smApiKeyEnvVar: text | null`; `clients.paidSearchConfig: PaidSearchConfig | null`.

- [ ] **Step 1: Add the type and columns**

In `lib/db/schema.ts`, after the `PRConfig` interface add:

```ts
export type LeadCategory = 'employer' | 'broker' | 'contact'

export interface PaidSearchConfig {
  /** Google Ads account id, digits only, e.g. '4136001852'. */
  googleAdsAccountId: string
  /** Canonical conversion actions. Category is NOT name-derivable, so it is explicit. */
  leadActions: Array<{ name: string; category: LeadCategory }>
}
```

In the `clients` table definition, add alongside the other optional columns:

```ts
  smApiKeyEnvVar: text('sm_api_key_env_var'),
  paidSearchConfig: jsonb('paid_search_config').$type<PaidSearchConfig>(),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new file under `drizzle/` adding `sm_api_key_env_var` and `paid_search_config` to `clients`. (Do NOT run `db:migrate` here — that needs the live DB and is an ops step.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): add sm_api_key_env_var + paid_search_config to clients"
```

---

## Task 2: Supermetrics client (smQuery)

**Files:**
- Create: `lib/supermetrics/constants.ts`, `lib/supermetrics/types.ts`, `lib/supermetrics/client.ts`
- Test: `lib/supermetrics/client.test.ts`

> These paths currently hold deprecated stubs (`export {}`). Overwrite them.

**Interfaces:**
- Produces:
  - `DS_IDS` const: `{ GA4:'GAWA', GOOGLE_ADS:'AW', META:'FA', LINKEDIN:'LIA' }`.
  - `class SmQueryError extends Error`, `class SmTimeoutError extends Error`.
  - `interface SmQueryParams { apiKey: string; dsId: string; dsAccounts: string; fields: string[]; dateRange: string /* 'YYYY-MM-DD,YYYY-MM-DD' */; filters?: string; settings?: Record<string, unknown>; maxRows?: number }`
  - `interface SmResult { header: string[]; rows: string[][] }`
  - `async function smQuery(p: SmQueryParams, opts?: { pollMs?: number; maxPolls?: number; fetchImpl?: typeof fetch }): Promise<SmResult>`
  - `function parseSmRows(result: SmResult): Record<string,string>[]` — maps each row to `{ fieldId: value }` by header order.

- [ ] **Step 1: Constants + types**

`lib/supermetrics/constants.ts`:

```ts
/** Supermetrics data-source ids. Verified live: AW, FA, LIA. */
export const DS_IDS = {
  GA4: 'GAWA',
  GOOGLE_ADS: 'AW',
  META: 'FA',
  LINKEDIN: 'LIA',
} as const
export type DsId = (typeof DS_IDS)[keyof typeof DS_IDS]
```

`lib/supermetrics/types.ts`:

```ts
export class SmQueryError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'SmQueryError'
  }
}
export class SmTimeoutError extends Error {
  constructor(message = 'Supermetrics query timed out') {
    super(message)
    this.name = 'SmTimeoutError'
  }
}
export interface SmQueryParams {
  apiKey: string
  dsId: string
  dsAccounts: string
  fields: string[]
  dateRange: string // 'YYYY-MM-DD,YYYY-MM-DD'
  filters?: string
  settings?: Record<string, unknown>
  maxRows?: number
}
export interface SmResult {
  header: string[]
  rows: string[][]
}
```

- [ ] **Step 2: Write the failing test**

`lib/supermetrics/client.test.ts`:

```ts
// Run: npx tsx lib/supermetrics/client.test.ts
import { strict as assert } from 'node:assert'
import { smQuery, parseSmRows } from './client'
import { SmTimeoutError } from './types'

// A fake fetch that returns a schedule id, then "completed" with rows.
function fakeFetch(seq: Array<{ status: number; body: unknown }>): typeof fetch {
  let i = 0
  return (async () => {
    const step = seq[Math.min(i++, seq.length - 1)]
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      headers: { get: () => null },
      json: async () => step.body,
    } as unknown as Response
  }) as unknown as typeof fetch
}

async function main() {
  // Happy path: submit returns schedule_id, poll returns completed.
  const fetchImpl = fakeFetch([
    { status: 200, body: { data: { schedule_id: 'abc' } } },
    { status: 200, body: { data: { status: 'completed', data: [['Date', 'Cost'], ['2026-01-01', '10']] } } },
  ])
  const res = await smQuery(
    { apiKey: 'k', dsId: 'AW', dsAccounts: '4136001852', fields: ['Date', 'Cost'], dateRange: '2026-01-01,2026-01-31' },
    { pollMs: 1, maxPolls: 3, fetchImpl },
  )
  assert.deepEqual(res.header, ['Date', 'Cost'])
  assert.deepEqual(parseSmRows(res), [{ Date: '2026-01-01', Cost: '10' }])

  // Timeout: never completes within maxPolls.
  const slow = fakeFetch([
    { status: 200, body: { data: { schedule_id: 'abc' } } },
    { status: 200, body: { data: { status: 'pending' } } },
  ])
  await assert.rejects(
    smQuery({ apiKey: 'k', dsId: 'AW', dsAccounts: '1', fields: ['Date'], dateRange: 'x' }, { pollMs: 1, maxPolls: 2, fetchImpl: slow }),
    (e: unknown) => e instanceof SmTimeoutError,
  )
  console.log('ok')
}
main()
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx lib/supermetrics/client.test.ts`
Expected: FAIL — `Cannot find module './client'` (or export not found).

- [ ] **Step 4: Implement `client.ts`**

`lib/supermetrics/client.ts`:

```ts
/**
 * Supermetrics enterprise API client — server-side only.
 * Async submit → poll. Per-client API key passed in by caller (read from the
 * env var named in clients.smApiKeyEnvVar).
 */
import { DS_IDS } from './constants'
import { SmQueryError, SmTimeoutError, type SmQueryParams, type SmResult } from './types'

export { DS_IDS }
export * from './types'

const BASE = 'https://api.supermetrics.com/enterprise/v2'

async function call(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, init)
  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After') ?? '2')
    await new Promise((r) => setTimeout(r, Math.min(retry, 10) * 1000))
    return call(url, init, fetchImpl)
  }
  if (!res.ok) throw new SmQueryError(`Supermetrics ${res.status}`, res.status)
  return res.json()
}

export async function smQuery(
  p: SmQueryParams,
  opts: { pollMs?: number; maxPolls?: number; fetchImpl?: typeof fetch } = {},
): Promise<SmResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const pollMs = opts.pollMs ?? 1500
  const maxPolls = opts.maxPolls ?? 40 // ~60s ceiling
  const headers = { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' }

  const submit = (await call(`${BASE}/query/data/json`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ds_id: p.dsId,
      ds_accounts: [p.dsAccounts],
      fields: p.fields,
      date_range_type: 'custom',
      start_date: p.dateRange.split(',')[0],
      end_date: p.dateRange.split(',')[1],
      max_rows: p.maxRows ?? 10000,
      ...(p.filters ? { filter: p.filters } : {}),
      ...(p.settings ? { settings: p.settings } : {}),
    }),
  }, fetchImpl)) as { data?: { schedule_id?: string } }

  const scheduleId = submit.data?.schedule_id
  if (!scheduleId) throw new SmQueryError('No schedule_id from submit')

  for (let i = 0; i < maxPolls; i++) {
    const out = (await call(`${BASE}/query/data/json/${scheduleId}`, { headers }, fetchImpl)) as {
      data?: { status?: string; data?: string[][] }
    }
    const status = out.data?.status
    if (status === 'completed') {
      const rows = out.data?.data ?? []
      return { header: rows[0] ?? [], rows: rows.slice(1) }
    }
    if (status === 'failed') throw new SmQueryError('Supermetrics query failed')
    await new Promise((r) => setTimeout(r, pollMs))
  }
  throw new SmTimeoutError()
}

export function parseSmRows(result: SmResult): Record<string, string>[] {
  return result.rows.map((row) => Object.fromEntries(result.header.map((h, i) => [h, row[i]])))
}
```

> Note: confirm the exact submit/poll request shape against Supermetrics async docs during B1; the test mocks the contract, so adjusting field names later only touches this file.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx lib/supermetrics/client.test.ts`
Expected: prints `ok`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/supermetrics/
git commit -m "feat(supermetrics): re-establish smQuery async client with timeout + rate-limit"
```

---

## Task 3: Combo chart primitive

**Files:**
- Create: `components/charts/combo-chart.tsx`

**Interfaces:**
- Produces: `ComboChart` (client component).
  ```ts
  interface ComboChartProps {
    data: Array<Record<string, number | string>>
    xKey: string
    bar: { key: string; color: string; label: string }
    line: { key: string; color: string; label: string } // dashed, secondary axis
    valueFormatter?: (n: number) => string
  }
  ```

- [ ] **Step 1: Implement (presentational; verified by typecheck + lint)**

`components/charts/combo-chart.tsx`:

```tsx
'use client'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface ComboChartProps {
  data: Array<Record<string, number | string>>
  xKey: string
  bar: { key: string; color: string; label: string }
  line: { key: string; color: string; label: string }
  valueFormatter?: (n: number) => string
}

export function ComboChart({ data, xKey, bar, line, valueFormatter }: ComboChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: '#8A8A8A', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tick={{ fill: '#8A8A8A', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fill: '#8A8A8A', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
            formatter={(v: number) => (valueFormatter ? valueFormatter(v) : v)}
          />
          <Bar yAxisId="left" dataKey={bar.key} name={bar.label} fill={bar.color} radius={[3, 3, 0, 0]} />
          <Line yAxisId="right" dataKey={line.key} name={line.label} stroke={line.color} strokeDasharray="5 4" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/charts/combo-chart.tsx
git commit -m "feat(charts): add ComboChart (bars + dashed secondary-axis line)"
```

---

## Task 4: DataTable upgrade (sorting, totals, deltas)

**Files:**
- Modify: `components/charts/data-table.tsx`
- Test: `components/charts/data-table-sort.test.ts`

**Interfaces:**
- Consumes: existing `Column { key; label; align? }`, `rows`.
- Produces (additive, backward-compatible):
  ```ts
  interface Column { key: string; label: string; align?: 'left'|'right'; sortable?: boolean; sortValue?: (row: Record<string, React.ReactNode>) => number | string }
  interface DataTableProps { columns: Column[]; rows: ...[]; defaultSort?: { key: string; dir: 'asc'|'desc' }; totalsRow?: Record<string, React.ReactNode> }
  export function sortRows(rows, key, dir, sortValue): rows  // exported pure helper for testing
  ```
  Existing callers (no new props) must render identically.

- [ ] **Step 1: Write the failing test (pure sort helper)**

`components/charts/data-table-sort.test.ts`:

```ts
// Run: npx tsx components/charts/data-table-sort.test.ts
import { strict as assert } from 'node:assert'
import { sortRows } from './data-table'

const rows = [{ c: 1 }, { c: 3 }, { c: 2 }] as unknown as Record<string, React.ReactNode>[]
assert.deepEqual(sortRows(rows, 'c', 'desc', (r) => Number(r.c)).map((r) => r.c), [3, 2, 1])
assert.deepEqual(sortRows(rows, 'c', 'asc', (r) => Number(r.c)).map((r) => r.c), [1, 2, 3])
console.log('ok')
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx components/charts/data-table-sort.test.ts`
Expected: FAIL — `sortRows` not exported.

- [ ] **Step 3: Implement the upgrade**

Rewrite `components/charts/data-table.tsx` (make it a Client Component for interactive sort; keep the same visual classes):

```tsx
'use client'
import { useState } from 'react'

interface Column {
  key: string
  label: string
  align?: 'left' | 'right'
  sortable?: boolean
  sortValue?: (row: Record<string, React.ReactNode>) => number | string
}
interface DataTableProps {
  columns: Column[]
  rows: Record<string, React.ReactNode>[]
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  totalsRow?: Record<string, React.ReactNode>
}

export function sortRows(
  rows: Record<string, React.ReactNode>[],
  key: string,
  dir: 'asc' | 'desc',
  sortValue: (row: Record<string, React.ReactNode>) => number | string,
) {
  const sorted = [...rows].sort((a, b) => {
    const av = sortValue(a), bv = sortValue(b)
    if (av < bv) return -1
    if (av > bv) return 1
    return 0
  })
  return dir === 'desc' ? sorted.reverse() : sorted
}

export function DataTable({ columns, rows, defaultSort, totalsRow }: DataTableProps) {
  const [sort, setSort] = useState(defaultSort ?? null)
  const col = sort ? columns.find((c) => c.key === sort.key) : undefined
  const display = sort && col?.sortValue ? sortRows(rows, sort.key, sort.dir, col.sortValue) : rows

  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={c.sortable ? () => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' })) : undefined}
                className={`px-5 py-3 text-[11px] font-extrabold uppercase tracking-widest text-text-muted ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.sortable ? 'cursor-pointer select-none hover:text-white' : ''}`}
              >
                {c.label}{sort?.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {display.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.04] transition-colors hover:bg-bg-subtle/50">
              {columns.map((c) => (
                <td key={c.key} className={`px-5 py-3 text-white ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{row[c.key]}</td>
              ))}
            </tr>
          ))}
          {totalsRow && (
            <tr className="border-t border-white/[0.12] font-semibold">
              {columns.map((c) => (
                <td key={c.key} className={`px-5 py-3 text-white ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{totalsRow[c.key]}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx components/charts/data-table-sort.test.ts`
Expected: prints `ok`.

- [ ] **Step 5: Typecheck + lint, then commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add components/charts/data-table.tsx components/charts/data-table-sort.test.ts
git commit -m "feat(charts): DataTable sorting + totals row (additive, backward-compatible)"
```

---

## Task 5: Paid-search shared base + frozen result types

**Files:**
- Create: `lib/paid-search/types.ts`, `lib/paid-search/base.ts`
- Test: `lib/paid-search/base.test.ts`

**Interfaces:**
- Consumes: `smQuery`, `parseSmRows`, `DS_IDS` (T2); `PaidSearchConfig`, `LeadCategory` (T1); `getClientBySlug` (`@/lib/db/queries`).
- Produces (frozen — Wave 3 builds against these):
  - `lib/paid-search/types.ts`:
    ```ts
    export interface Kpi { key: string; label: string; value: number; prefix?: string; suffix?: string; delta?: number; tooltip?: string }
    export interface HeroPoint { week: string; cost: number; clicks: number; impressions: number; leads: number }
    export interface CampaignRow { campaign: string; cost: number; clicks: number; impressions: number; ctr: number; cpc: number; leads: number; cpl: number; convRate: number }
    export interface LeadActionRow { name: string; category: LeadCategory; count: number }
    export interface LeadBreakdown { byAction: LeadActionRow[]; categoryTotals: Record<LeadCategory, number>; weekly: Array<{ week: string; leads: number }>; totalLeads: number }
    export interface GeoRow { region: string; leads: number; clicks: number; cost: number }
    export interface SearchTermRow { term: string; clicks: number; impressions: number; ctr: number; cost: number; leads: number; cpl: number }
    ```
  - `lib/paid-search/base.ts`:
    ```ts
    async function awQuery(slug: string, fields: string[], dateRange: string, opts?: { filters?: string; settings?: Record<string,unknown>; maxRows?: number }): Promise<Record<string,string>[]>
    function resolveDates(dateRange: string, compareRange: string | null): { mainIso: string; compareIso: string | null }  // reuse GA4's parsing pattern
    function isLeadAction(name: string, cfg: PaidSearchConfig): boolean
    function categoryOf(name: string, cfg: PaidSearchConfig): LeadCategory | null
    function usd(n: number): string      // whole-dollar
    function pct(n: number): string      // one decimal + '%'
    function num(n: number): string      // thousands sep
    ```

- [ ] **Step 1: Write `types.ts`** (exact contents from the Produces block above).

- [ ] **Step 2: Write the failing test for base helpers**

`lib/paid-search/base.test.ts`:

```ts
// Run: npx tsx lib/paid-search/base.test.ts
import { strict as assert } from 'node:assert'
import { isLeadAction, categoryOf, usd, pct } from './base'

const cfg = {
  googleAdsAccountId: '4136001852',
  leadActions: [
    { name: 'employer_dental_lead', category: 'employer' as const },
    { name: 'contact_broker_lead', category: 'broker' as const }, // NOT name-derivable
  ],
}
assert.equal(isLeadAction('employer_dental_lead', cfg), true)
assert.equal(isLeadAction('Calls from ads', cfg), false)           // excluded
assert.equal(categoryOf('contact_broker_lead', cfg), 'broker')      // explicit map, not prefix
assert.equal(usd(1234.7), '$1,235')
assert.equal(pct(12.34), '12.3%')
console.log('ok')
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx tsx lib/paid-search/base.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement `base.ts`**

```ts
import { smQuery, parseSmRows, DS_IDS } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'
import type { PaidSearchConfig, LeadCategory } from '@/lib/db/schema'

export async function awQuery(
  slug: string,
  fields: string[],
  dateRange: string,
  opts: { filters?: string; settings?: Record<string, unknown>; maxRows?: number } = {},
): Promise<Record<string, string>[]> {
  const client = await getClientBySlug(slug)
  const cfg = client?.paidSearchConfig
  const envVar = client?.smApiKeyEnvVar
  if (!cfg || !envVar) throw new Error(`paid_search_config / sm_api_key_env_var missing for ${slug}`)
  const apiKey = process.env[envVar]
  if (!apiKey) throw new Error(`Missing env var ${envVar}`)
  const result = await smQuery({
    apiKey, dsId: DS_IDS.GOOGLE_ADS, dsAccounts: cfg.googleAdsAccountId,
    fields, dateRange, filters: opts.filters, settings: opts.settings, maxRows: opts.maxRows,
  })
  return parseSmRows(result)
}

export function isLeadAction(name: string, cfg: PaidSearchConfig): boolean {
  return cfg.leadActions.some((a) => a.name === name)
}
export function categoryOf(name: string, cfg: PaidSearchConfig): LeadCategory | null {
  return cfg.leadActions.find((a) => a.name === name)?.category ?? null
}
export function usd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}
export function pct(n: number): string {
  return n.toFixed(1) + '%'
}
export function num(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** Reuse GA4's date parsing so presets/compare behave identically. */
export { parseDateRange as resolveMain, deriveCompareRange } from '@/lib/ga4/client'
```

> The `resolveDates` interface is satisfied by re-exporting GA4's `parseDateRange` + `deriveCompareRange`; T6 tasks call those. If GA4's exports differ, wrap them here — keep the names above stable.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx lib/paid-search/base.test.ts` → `ok`.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`

```bash
git add lib/paid-search/types.ts lib/paid-search/base.ts lib/paid-search/base.test.ts
git commit -m "feat(paid-search): frozen result types + shared query/format base"
```

---

## Task 6c: Campaign rows + reconciliation (the tricky one — do first among T6)

**Files:**
- Create: `lib/paid-search/campaigns.ts`
- Test: `lib/paid-search/campaigns.test.ts`

**Interfaces:**
- Consumes: `awQuery`, `isLeadAction` (T5); `CampaignRow` (T5 types); `PaidSearchConfig` (T1).
- Produces:
  - `function transformCampaigns(metricRows: Record<string,string>[], leadRows: Record<string,string>[], cfg: PaidSearchConfig): CampaignRow[]` (pure; default sort by cost desc).
  - `function campaignTotals(rows: CampaignRow[]): { cost; clicks; impressions; leads }` (sums raw values — caller rounds the sum).
  - `async function getCampaignRows(slug, dateRange): Promise<CampaignRow[]>`.

**Why two queries:** cost/clicks/impressions come from a campaign-segmented query; **scoped leads** come from a `Campaignname × ConversionTypeName` query filtered to form-fill actions. Joining on campaign name guarantees the totals row reconciles with the scoped Leads KPI.

- [ ] **Step 1: Write the failing test (real sample rows)**

`lib/paid-search/campaigns.test.ts`:

```ts
// Run: npx tsx lib/paid-search/campaigns.test.ts
import { strict as assert } from 'node:assert'
import { transformCampaigns, campaignTotals } from './campaigns'

const cfg = {
  googleAdsAccountId: '4136001852',
  leadActions: [
    { name: 'contact_individual_lead', category: 'contact' as const },
    { name: 'contact_employee_lead', category: 'contact' as const },
    { name: 'broker_group_lead', category: 'broker' as const },
  ],
}
// Campaign-segmented metrics (from live probe).
const metricRows = [
  { Campaignname: 'REN | AVZ | SEM | Non-Brand | Brokers | Select Geos', Cost: '8824.99', Clicks: '2663', Impressions: '47412' },
  { Campaignname: 'REN | AVZ | SEM | Brand | All Users | Select Geos', Cost: '3283.43', Clicks: '5886', Impressions: '16805' },
]
// Campaign x conversion-action (includes a non-lead 'Calls from ads' to be excluded).
const leadRows = [
  { Campaignname: 'REN | AVZ | SEM | Brand | All Users | Select Geos', ConversionTypeName: 'Calls from ads', Conversions: '13' },
  { Campaignname: 'REN | AVZ | SEM | Brand | All Users | Select Geos', ConversionTypeName: 'contact_individual_lead', Conversions: '10' },
  { Campaignname: 'REN | AVZ | SEM | Non-Brand | Brokers | Select Geos', ConversionTypeName: 'contact_employee_lead', Conversions: '4' },
  { Campaignname: 'REN | AVZ | SEM | Non-Brand | Brokers | Select Geos', ConversionTypeName: 'broker_group_lead', Conversions: '1' },
]
const rows = transformCampaigns(metricRows, leadRows, cfg)
// Brokers campaign: 5 scoped leads (4 + 1), Calls excluded.
const brokers = rows.find((r) => r.campaign.includes('Brokers'))!
assert.equal(brokers.leads, 5)
assert.equal(brokers.cpl, Math.round((8824.99 / 5)))
// Brand campaign: 10 scoped leads (Calls from ads excluded).
const brand = rows.find((r) => r.campaign.includes('Brand'))!
assert.equal(brand.leads, 10)
// Default sort: cost desc → Brokers first.
assert.equal(rows[0].campaign.includes('Brokers'), true)
// Totals reconcile: sum of scoped leads = 15.
assert.equal(campaignTotals(rows).leads, 15)
console.log('ok')
```

- [ ] **Step 2: Run to verify it fails** → `npx tsx lib/paid-search/campaigns.test.ts` (module not found).

- [ ] **Step 3: Implement `campaigns.ts`**

```ts
import { awQuery, isLeadAction } from './base'
import type { CampaignRow } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformCampaigns(
  metricRows: Record<string, string>[],
  leadRows: Record<string, string>[],
  cfg: PaidSearchConfig,
): CampaignRow[] {
  const leadsByCampaign = new Map<string, number>()
  for (const r of leadRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    const k = r.Campaignname
    leadsByCampaign.set(k, (leadsByCampaign.get(k) ?? 0) + Number(r.Conversions || 0))
  }
  const rows = metricRows.map((r): CampaignRow => {
    const cost = Number(r.Cost || 0)
    const clicks = Number(r.Clicks || 0)
    const impressions = Number(r.Impressions || 0)
    const leads = leadsByCampaign.get(r.Campaignname) ?? 0
    return {
      campaign: r.Campaignname,
      cost, clicks, impressions,
      ctr: impressions ? (clicks / impressions) * 100 : 0,
      cpc: clicks ? cost / clicks : 0,
      leads,
      cpl: leads ? Math.round(cost / leads) : 0,
      convRate: clicks ? (leads / clicks) * 100 : 0,
    }
  })
  return rows.sort((a, b) => b.cost - a.cost)
}

export function campaignTotals(rows: CampaignRow[]) {
  return rows.reduce(
    (t, r) => ({ cost: t.cost + r.cost, clicks: t.clicks + r.clicks, impressions: t.impressions + r.impressions, leads: t.leads + r.leads }),
    { cost: 0, clicks: 0, impressions: 0, leads: 0 },
  )
}

export async function getCampaignRows(slug: string, dateRange: string): Promise<CampaignRow[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [metricRows, leadRows] = await Promise.all([
    awQuery(slug, ['Campaignname', 'Cost', 'Clicks', 'Impressions'], dateRange),
    awQuery(slug, ['Campaignname', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformCampaigns(metricRows, leadRows, cfg)
}
```

- [ ] **Step 4: Run test to verify it passes** → `ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/paid-search/campaigns.ts lib/paid-search/campaigns.test.ts
git commit -m "feat(paid-search): campaign rows with scoped-lead reconciliation"
```

---

## Task 6d: Leads breakdown + weekly leads

**Files:** Create `lib/paid-search/leads.ts`; Test `lib/paid-search/leads.test.ts`.

**Interfaces:**
- Consumes: `awQuery`, `isLeadAction`, `categoryOf` (T5); `LeadBreakdown`, `LeadActionRow` (T5 types); `PaidSearchConfig`.
- Produces: `transformLeads(actionRows, weeklyRows, cfg): LeadBreakdown` (pure; renders all configured actions, absent → 0); `getLeadBreakdown(slug, dateRange): Promise<LeadBreakdown>`.

- [ ] **Step 1: Write the failing test**

`lib/paid-search/leads.test.ts`:

```ts
// Run: npx tsx lib/paid-search/leads.test.ts
import { strict as assert } from 'node:assert'
import { transformLeads } from './leads'

const cfg = {
  googleAdsAccountId: '4136001852',
  leadActions: [
    { name: 'employer_dental_lead', category: 'employer' as const },
    { name: 'employer_vision_lead', category: 'employer' as const }, // absent in data → must show 0
    { name: 'broker_group_lead', category: 'broker' as const },
    { name: 'contact_individual_lead', category: 'contact' as const },
  ],
}
const actionRows = [
  { ConversionTypeName: 'contact_individual_lead', Conversions: '14' },
  { ConversionTypeName: 'broker_group_lead', Conversions: '3' },
  { ConversionTypeName: 'employer_dental_lead', Conversions: '3' },
  { ConversionTypeName: 'Calls from ads', Conversions: '13' }, // excluded
]
const weeklyRows = [
  { Weekiso: '2026-W01', ConversionTypeName: 'contact_individual_lead', Conversions: '2' },
  { Weekiso: '2026-W01', ConversionTypeName: 'Calls from ads', Conversions: '5' }, // excluded
]
const b = transformLeads(actionRows, weeklyRows, cfg)
assert.equal(b.totalLeads, 20)                 // 14+3+3, calls excluded
assert.equal(b.categoryTotals.employer, 3)     // dental 3 + vision 0
assert.equal(b.categoryTotals.contact, 14)
assert.equal(b.byAction.find((a) => a.name === 'employer_vision_lead')!.count, 0) // absent → 0
assert.equal(b.weekly[0].leads, 2)             // calls excluded from weekly
console.log('ok')
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `leads.ts`**

```ts
import { awQuery, isLeadAction, categoryOf } from './base'
import type { LeadBreakdown, LeadActionRow } from './types'
import type { PaidSearchConfig, LeadCategory } from '@/lib/db/schema'

export function transformLeads(
  actionRows: Record<string, string>[],
  weeklyRows: Record<string, string>[],
  cfg: PaidSearchConfig,
): LeadBreakdown {
  const counts = new Map<string, number>()
  for (const r of actionRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    counts.set(r.ConversionTypeName, (counts.get(r.ConversionTypeName) ?? 0) + Number(r.Conversions || 0))
  }
  const byAction: LeadActionRow[] = cfg.leadActions.map((a) => ({ name: a.name, category: a.category, count: counts.get(a.name) ?? 0 }))
  const categoryTotals: Record<LeadCategory, number> = { employer: 0, broker: 0, contact: 0 }
  for (const a of byAction) categoryTotals[a.category] += a.count
  const totalLeads = byAction.reduce((s, a) => s + a.count, 0)

  const weekMap = new Map<string, number>()
  for (const r of weeklyRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    weekMap.set(r.Weekiso, (weekMap.get(r.Weekiso) ?? 0) + Number(r.Conversions || 0))
  }
  const weekly = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, leads]) => ({ week, leads }))

  return { byAction, categoryTotals, weekly, totalLeads }
}

export async function getLeadBreakdown(slug: string, dateRange: string): Promise<LeadBreakdown> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [actionRows, weeklyRows] = await Promise.all([
    awQuery(slug, ['ConversionTypeName', 'Conversions'], dateRange),
    awQuery(slug, ['Weekiso', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformLeads(actionRows, weeklyRows, cfg)
}
```

- [ ] **Step 4: Run test → `ok`. Step 5: Commit** `feat(paid-search): lead action/category breakdown + weekly leads`.

---

## Task 6a: KPI totals

**Files:** Create `lib/paid-search/kpis.ts`; Test `lib/paid-search/kpis.test.ts`.

**Interfaces:** Consumes `awQuery`, `isLeadAction`, `pct/usd/num` (T5), `Kpi` type. Produces `transformKpis(totalsRow, actionRows, compareTotalsRow|null, compareActionRows|null, cfg): Kpi[]`; `getPaidSearchKpis(slug, dateRange, compareRange): Promise<Kpi[]>`.

- [ ] **Step 1: Failing test** — assert the 8 cards exist, Leads = sum of form-fill actions (not raw Conversions), Cost/Lead = round(cost/leads), and a delta computes vs compare. Use the account totals (`Cost 18915`, `Clicks 10409`) and the action rows from Task 6d's fixture; `leads` must equal the scoped sum, and `convRate = leads/clicks*100`.

```ts
// Run: npx tsx lib/paid-search/kpis.test.ts
import { strict as assert } from 'node:assert'
import { transformKpis } from './kpis'
const cfg = { googleAdsAccountId: '4136001852', leadActions: [{ name: 'contact_individual_lead', category: 'contact' as const }] }
const totals = { Cost: '18915.79', Clicks: '10409', Impressions: '113718', Ctr: '9.15', CPC: '1.81' }
const actions = [{ ConversionTypeName: 'contact_individual_lead', Conversions: '14' }, { ConversionTypeName: 'Calls from ads', Conversions: '13' }]
const kpis = transformKpis(totals, actions, null, null, cfg)
const leads = kpis.find((k) => k.key === 'leads')!
assert.equal(leads.value, 14)                               // calls excluded
assert.equal(kpis.find((k) => k.key === 'cpl')!.value, Math.round(18915.79 / 14))
assert.equal(kpis.length, 8)
console.log('ok')
```

- [ ] **Step 2: Run → fails. Step 3: Implement**

```ts
import { awQuery, isLeadAction } from './base'
import type { Kpi } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

function scopedLeads(actionRows: Record<string, string>[], cfg: PaidSearchConfig): number {
  return actionRows.filter((r) => isLeadAction(r.ConversionTypeName, cfg)).reduce((s, r) => s + Number(r.Conversions || 0), 0)
}
function delta(cur: number, prev: number | undefined): number | undefined {
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}

export function transformKpis(
  totals: Record<string, string>,
  actionRows: Record<string, string>[],
  compareTotals: Record<string, string> | null,
  compareActionRows: Record<string, string>[] | null,
  cfg: PaidSearchConfig,
): Kpi[] {
  const cost = Number(totals.Cost || 0), clicks = Number(totals.Clicks || 0), impressions = Number(totals.Impressions || 0)
  const leads = scopedLeads(actionRows, cfg)
  const cLeads = compareActionRows ? scopedLeads(compareActionRows, cfg) : undefined
  const cCost = compareTotals ? Number(compareTotals.Cost || 0) : undefined
  return [
    { key: 'cost', label: 'Cost', value: Math.round(cost), prefix: '$', delta: delta(cost, cCost) },
    { key: 'clicks', label: 'Clicks', value: clicks, delta: delta(clicks, compareTotals ? Number(compareTotals.Clicks || 0) : undefined) },
    { key: 'impressions', label: 'Impressions', value: impressions },
    { key: 'ctr', label: 'CTR', value: impressions ? +((clicks / impressions) * 100).toFixed(1) : 0, suffix: '%' },
    { key: 'cpc', label: 'Avg. CPC', value: clicks ? +(cost / clicks).toFixed(2) : 0, prefix: '$' },
    { key: 'leads', label: 'Leads', value: leads, delta: delta(leads, cLeads) },
    { key: 'cpl', label: 'Cost / Lead', value: leads ? Math.round(cost / leads) : 0, prefix: '$' },
    { key: 'convRate', label: 'Conversion Rate', value: clicks ? +((leads / clicks) * 100).toFixed(1) : 0, suffix: '%' },
  ]
}

export async function getPaidSearchKpis(slug: string, dateRange: string, compareRange: string | null): Promise<Kpi[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [totals, actionRows, cTotals, cActions] = await Promise.all([
    awQuery(slug, ['Cost', 'Clicks', 'Impressions'], dateRange).then((r) => r[0] ?? {}),
    awQuery(slug, ['ConversionTypeName', 'Conversions'], dateRange),
    compareRange ? awQuery(slug, ['Cost', 'Clicks', 'Impressions'], compareRange).then((r) => r[0] ?? {}) : Promise.resolve(null),
    compareRange ? awQuery(slug, ['ConversionTypeName', 'Conversions'], compareRange) : Promise.resolve(null),
  ])
  return transformKpis(totals, actionRows, cTotals, cActions, cfg)
}
```

- [ ] **Step 4: Run → `ok`. Step 5: Commit** `feat(paid-search): KPI scorecards with scoped leads + deltas`.

---

## Task 6b: Hero weekly series

**Files:** Create `lib/paid-search/hero.ts`; Test `lib/paid-search/hero.test.ts`.

**Interfaces:** Consumes `awQuery`, `isLeadAction`, `HeroPoint`. Produces `transformHero(metricWeekRows, leadWeekRows, cfg): HeroPoint[]` (weekly YTD, leads scoped, zero-lead weeks present as 0); `getHeroSeries(slug, dateRange): Promise<HeroPoint[]>`.

- [ ] **Step 1: Failing test** — given week metric rows (`Weekiso`, `Cost`, `Clicks`, `Impressions`) and week×action lead rows, assert each `HeroPoint` has scoped `leads`, a week with metrics but no leads yields `leads: 0`, and output is sorted by week ascending.

```ts
// Run: npx tsx lib/paid-search/hero.test.ts
import { strict as assert } from 'node:assert'
import { transformHero } from './hero'
const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }
const metrics = [{ Weekiso: '2026-W02', Cost: '500', Clicks: '40', Impressions: '900' }, { Weekiso: '2026-W01', Cost: '300', Clicks: '20', Impressions: '600' }]
const leadWeeks = [{ Weekiso: '2026-W02', ConversionTypeName: 'broker_group_lead', Conversions: '2' }, { Weekiso: '2026-W02', ConversionTypeName: 'Calls from ads', Conversions: '9' }]
const pts = transformHero(metrics, leadWeeks, cfg)
assert.deepEqual(pts.map((p) => p.week), ['2026-W01', '2026-W02'])  // sorted asc
assert.equal(pts[0].leads, 0)                                       // W01 had no leads
assert.equal(pts[1].leads, 2)                                       // calls excluded
console.log('ok')
```

- [ ] **Step 2: Run → fails. Step 3: Implement**

```ts
import { awQuery, isLeadAction } from './base'
import type { HeroPoint } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformHero(
  metricWeekRows: Record<string, string>[],
  leadWeekRows: Record<string, string>[],
  cfg: PaidSearchConfig,
): HeroPoint[] {
  const leads = new Map<string, number>()
  for (const r of leadWeekRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    leads.set(r.Weekiso, (leads.get(r.Weekiso) ?? 0) + Number(r.Conversions || 0))
  }
  return metricWeekRows
    .map((r): HeroPoint => ({
      week: r.Weekiso,
      cost: Number(r.Cost || 0),
      clicks: Number(r.Clicks || 0),
      impressions: Number(r.Impressions || 0),
      leads: leads.get(r.Weekiso) ?? 0,
    }))
    .sort((a, b) => a.week.localeCompare(b.week))
}

export async function getHeroSeries(slug: string, dateRange: string): Promise<HeroPoint[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [m, l] = await Promise.all([
    awQuery(slug, ['Weekiso', 'Cost', 'Clicks', 'Impressions'], dateRange),
    awQuery(slug, ['Weekiso', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformHero(m, l, cfg)
}
```

- [ ] **Step 4: Run → `ok`. Step 5: Commit** `feat(paid-search): weekly hero series`.

---

## Task 6e: Geo rows

**Files:** Create `lib/paid-search/geo.ts`; Test `lib/paid-search/geo.test.ts`.

**Interfaces:** Consumes `awQuery`, `isLeadAction`, `GeoRow`. Produces `transformGeo(metricRows, leadRows, cfg): GeoRow[]` (ranked by scoped leads desc); `getGeoRows(slug, dateRange): Promise<GeoRow[]>`.

- [ ] **Step 1: Failing test** — `Region`-segmented metric rows + `Region × ConversionTypeName` lead rows; assert per-region scoped leads, calls excluded, sorted by leads desc.

```ts
// Run: npx tsx lib/paid-search/geo.test.ts
import { strict as assert } from 'node:assert'
import { transformGeo } from './geo'
const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }
const metrics = [{ Region: 'Texas', Clicks: '100', Cost: '400' }, { Region: 'Ohio', Clicks: '50', Cost: '200' }]
const leads = [{ Region: 'Ohio', ConversionTypeName: 'broker_group_lead', Conversions: '5' }, { Region: 'Texas', ConversionTypeName: 'broker_group_lead', Conversions: '2' }]
const rows = transformGeo(metrics, leads, cfg)
assert.equal(rows[0].region, 'Ohio')   // 5 leads ranks first
assert.equal(rows[0].leads, 5)
console.log('ok')
```

- [ ] **Step 2: Run → fails. Step 3: Implement** (same join pattern as campaigns, keyed on `Region`; fields `['Region','Clicks','Cost']` and `['Region','ConversionTypeName','Conversions']`; sort by `leads` desc). **Step 4: Run → ok. Step 5: Commit** `feat(paid-search): geo rows ranked by scoped leads`.

```ts
import { awQuery, isLeadAction } from './base'
import type { GeoRow } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformGeo(metricRows: Record<string, string>[], leadRows: Record<string, string>[], cfg: PaidSearchConfig): GeoRow[] {
  const leads = new Map<string, number>()
  for (const r of leadRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    leads.set(r.Region, (leads.get(r.Region) ?? 0) + Number(r.Conversions || 0))
  }
  return metricRows
    .map((r): GeoRow => ({ region: r.Region, clicks: Number(r.Clicks || 0), cost: Number(r.Cost || 0), leads: leads.get(r.Region) ?? 0 }))
    .sort((a, b) => b.leads - a.leads)
}

export async function getGeoRows(slug: string, dateRange: string): Promise<GeoRow[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [m, l] = await Promise.all([
    awQuery(slug, ['Region', 'Clicks', 'Cost'], dateRange),
    awQuery(slug, ['Region', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformGeo(m, l, cfg)
}
```

---

## Task 6f: Search-term rows

**Files:** Create `lib/paid-search/search-terms.ts`; Test `lib/paid-search/search-terms.test.ts`.

**Interfaces:** Consumes `awQuery`, `isLeadAction`, `SearchTermRow`. Produces `transformSearchTerms(metricRows, leadRows, cfg): SearchTermRow[]` (sort by leads desc, then cost desc); `getSearchTermRows(slug, dateRange): Promise<SearchTermRow[]>`.

- [ ] **Step 1: Failing test** — `Searchterm`-segmented metrics + `Searchterm × ConversionTypeName` leads; assert CPL = round(cost/leads), 0-lead terms have cpl 0, and tie-break sort (equal leads → higher cost first).

```ts
// Run: npx tsx lib/paid-search/search-terms.test.ts
import { strict as assert } from 'node:assert'
import { transformSearchTerms } from './search-terms'
const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }
const metrics = [
  { Searchterm: 'dental insurance', Clicks: '80', Impressions: '1000', Cost: '300' },
  { Searchterm: 'broker benefits', Clicks: '40', Impressions: '500', Cost: '500' },
]
const leads = [
  { Searchterm: 'dental insurance', ConversionTypeName: 'broker_group_lead', Conversions: '2' },
  { Searchterm: 'broker benefits', ConversionTypeName: 'broker_group_lead', Conversions: '2' },
]
const rows = transformSearchTerms(metrics, leads, cfg)
assert.equal(rows[0].term, 'broker benefits') // equal leads(2) → higher cost(500) first
assert.equal(rows[0].cpl, 250)
console.log('ok')
```

- [ ] **Step 2: Run → fails. Step 3: Implement** (join on `Searchterm`; fields `['Searchterm','Clicks','Impressions','Cost']` and `['Searchterm','ConversionTypeName','Conversions']`; sort `leads desc, cost desc`). **Step 4: Run → ok. Step 5: Commit** `feat(paid-search): search-term rows`.

```ts
import { awQuery, isLeadAction } from './base'
import type { SearchTermRow } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformSearchTerms(metricRows: Record<string, string>[], leadRows: Record<string, string>[], cfg: PaidSearchConfig): SearchTermRow[] {
  const leads = new Map<string, number>()
  for (const r of leadRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    leads.set(r.Searchterm, (leads.get(r.Searchterm) ?? 0) + Number(r.Conversions || 0))
  }
  return metricRows
    .map((r): SearchTermRow => {
      const clicks = Number(r.Clicks || 0), impressions = Number(r.Impressions || 0), cost = Number(r.Cost || 0)
      const l = leads.get(r.Searchterm) ?? 0
      return { term: r.Searchterm, clicks, impressions, cost, leads: l, ctr: impressions ? +((clicks / impressions) * 100).toFixed(1) : 0, cpl: l ? Math.round(cost / l) : 0 }
    })
    .sort((a, b) => b.leads - a.leads || b.cost - a.cost)
}

export async function getSearchTermRows(slug: string, dateRange: string): Promise<SearchTermRow[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [m, l] = await Promise.all([
    awQuery(slug, ['Searchterm', 'Clicks', 'Impressions', 'Cost'], dateRange),
    awQuery(slug, ['Searchterm', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformSearchTerms(m, l, cfg)
}
```

---

## Tasks 7a–7f: Presentational section components

These are **client components** that consume the frozen types (T5) plus a chart/table primitive. They contain no data fetching, so they are pure render and verified by typecheck + lint. Build in parallel (Wave 3) with T6.

### Task 7a: Hero (`components/report-sections/paid-search/hero.tsx`)
**Consumes:** `HeroPoint` (T5), `ComboChart` (T3). **Produces:** `<Hero points={HeroPoint[]} />` with a Cost/Clicks/Impressions/Leads toggle switching the bar metric (`leads` always the dashed line).

- [ ] **Step 1: Implement**

```tsx
'use client'
import { useState } from 'react'
import { ComboChart } from '@/components/charts/combo-chart'
import { CHART_COLORS } from '@/lib/constants'
import type { HeroPoint } from '@/lib/paid-search/types'

const METRICS = [
  { key: 'cost', label: 'Cost' }, { key: 'clicks', label: 'Clicks' },
  { key: 'impressions', label: 'Impressions' }, { key: 'leads', label: 'Leads' },
] as const

export function Hero({ points }: { points: HeroPoint[] }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('cost')
  return (
    <section className="space-y-3">
      <div className="flex gap-2">
        {METRICS.map((m) => (
          <button key={m.key} onClick={() => setMetric(m.key)}
            className={`rounded-md px-3 py-1 text-xs ${metric === m.key ? 'bg-white/10 text-white' : 'text-text-muted hover:text-white'}`}>
            {m.label}
          </button>
        ))}
      </div>
      <ComboChart data={points} xKey="week"
        bar={{ key: metric, color: CHART_COLORS.googleAds, label: METRICS.find((m) => m.key === metric)!.label }}
        line={{ key: 'leads', color: CHART_COLORS.primary, label: 'Leads' }} />
    </section>
  )
}
```

- [ ] **Step 2: Typecheck + lint. Step 3: Commit** `feat(paid-search): hero chart component`.

### Task 7b: KPI grid (`kpi-grid.tsx`)
**Consumes:** `Kpi` (T5), `KpiCard` (`@/components/charts/kpi-card`). **Produces:** `<KpiGrid kpis={Kpi[]} />`.

- [ ] **Step 1: Implement** — map each `Kpi` to `<KpiCard title={k.label} value={k.value} prefix={k.prefix} suffix={k.suffix} delta={k.delta} tooltip={k.tooltip} />` inside `grid grid-cols-2 gap-3 md:grid-cols-4`. **Step 2: Typecheck+lint. Step 3: Commit.**

### Task 7c: Campaign table (`campaign-table.tsx`)
**Consumes:** `CampaignRow` (T5), `DataTable` + `sortRows` (T4), `usd/num/pct` (T5), `campaignTotals` (T6c). **Produces:** `<CampaignTable rows={CampaignRow[]} />`.

- [ ] **Step 1: Implement** — columns Campaign/Cost/Clicks/Impressions/CTR/Avg.CPC/Leads/CPL/Conv Rate, all `sortable` with numeric `sortValue`, `defaultSort={{ key:'cost', dir:'desc' }}`, `totalsRow` from `campaignTotals(rows)` (format with `usd/num/pct`; CPL in totals = `usd(round(totalCost/totalLeads))`). **Step 2: Typecheck+lint. Step 3: Commit.**

### Task 7d: Leads & Conversions (`leads-section.tsx`)
**Consumes:** `LeadBreakdown` (T5), `ComboChart` (T3), `DataTable` (T4). **Produces:** `<LeadsSection data={LeadBreakdown} />` — weekly leads line (ComboChart with `bar=leads`,`line=leads` or a simple line), the by-action table grouped with Employer/Broker/Contact subtitle rows + `categoryTotals`, and a share-of-leads display (`count / totalLeads`). No per-category CPL.

- [ ] **Step 1: Implement** (group `data.byAction` by `category`, render a labeled block per category with its rows and `categoryTotals[category]`; show `(share%)` = `pct(count/totalLeads*100)`). **Step 2: Typecheck+lint. Step 3: Commit.**

### Task 7e: Geo (`geo-section.tsx`)
**Consumes:** `GeoRow` (T5), `BarChart` (`@/components/charts/bar-chart`). **Produces:** `<GeoSection rows={GeoRow[]} />` — ranked horizontal bars (top N by leads) + metric cards. No map.

- [ ] **Step 1: Implement** — take `rows.slice(0, 10)`, feed `BarChart` with `region`/`leads`. **Step 2: Typecheck+lint. Step 3: Commit.**

### Task 7f: Search terms (`search-terms.tsx`)
**Consumes:** `SearchTermRow` (T5), `DataTable` (T4), `usd/pct` (T5). **Produces:** `<SearchTermsTable rows={SearchTermRow[]} />` — columns Search Term/Clicks/Impressions/CTR/Cost/Leads/CPL, `defaultSort` leads desc.

- [ ] **Step 1: Implement. Step 2: Typecheck+lint. Step 3: Commit.**

---

## Task 8: Section orchestrator (RSC)

**Files:** Create `components/report-sections/paid-search/index.tsx`.

**Interfaces:**
- Consumes: all `get*` data fns (T6a–f), all `7.x` components, `SmTimeoutError`/`SmQueryError` (T2).
- Produces: `async function PaidSearchReport({ clientSlug, dateRange, compareRange }: { clientSlug: string; dateRange?: string; compareRange?: string | null }): Promise<JSX.Element>`.

- [ ] **Step 1: Implement**

```tsx
import { getPaidSearchKpis } from '@/lib/paid-search/kpis'
import { getHeroSeries } from '@/lib/paid-search/hero'
import { getCampaignRows } from '@/lib/paid-search/campaigns'
import { getLeadBreakdown } from '@/lib/paid-search/leads'
import { getGeoRows } from '@/lib/paid-search/geo'
import { getSearchTermRows } from '@/lib/paid-search/search-terms'
import { Hero } from './hero'
import { KpiGrid } from './kpi-grid'
import { CampaignTable } from './campaign-table'
import { LeadsSection } from './leads-section'
import { GeoSection } from './geo-section'
import { SearchTermsTable } from './search-terms'
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

export async function PaidSearchReport({ clientSlug, dateRange = 'last_30_days', compareRange = null }: { clientSlug: string; dateRange?: string; compareRange?: string | null }) {
  const [kpis, hero, campaigns, leads, geo, terms] = await Promise.all([
    safe(getPaidSearchKpis(clientSlug, dateRange, compareRange)),
    safe(getHeroSeries(clientSlug, dateRange)),
    safe(getCampaignRows(clientSlug, dateRange)),
    safe(getLeadBreakdown(clientSlug, dateRange)),
    safe(getGeoRows(clientSlug, dateRange)),
    safe(getSearchTermRows(clientSlug, dateRange)),
  ])
  return (
    <div className="space-y-8">
      {hero.data ? <Hero points={hero.data} /> : <Fallback kind={hero.error!} />}
      {kpis.data ? <KpiGrid kpis={kpis.data} /> : <Fallback kind={kpis.error!} />}
      {campaigns.data ? <CampaignTable rows={campaigns.data} /> : <Fallback kind={campaigns.error!} />}
      {leads.data ? <LeadsSection data={leads.data} /> : <Fallback kind={leads.error!} />}
      {geo.data ? <GeoSection rows={geo.data} /> : <Fallback kind={geo.error!} />}
      {terms.data ? <SearchTermsTable rows={terms.data} /> : <Fallback kind={terms.error!} />}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + lint** (`npx tsc --noEmit && npm run lint`). **Step 3: Commit** `feat(paid-search): section orchestrator with per-section timeout/error states`.

---

## Task 9: Repurpose the `google-ads` slug

**Files (modify):**
- `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx:10,47`
- `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx:12,59`
- `app/portal/[clientSlug]/reports/page.tsx:11,62`
- `lib/constants.ts:56`
- `components/report-sections/ai-summaries/index.tsx:24`

- [ ] **Step 1:** In all three route files, replace the `GoogleAdsReport` import with `import { PaidSearchReport } from '@/components/report-sections/paid-search'` and change the `case 'google-ads':` body to render `<PaidSearchReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />` (match each file's existing prop-passing for the other report cases).
- [ ] **Step 2:** In `lib/constants.ts:56` change the `'google-ads'` label from `'Google Ads'` to `'Paid Search'`.
- [ ] **Step 3:** Leave the `ai-summaries` `'google-ads'` metadata key as-is (slug unchanged) but update its display label if it renders one. Verify no other code imports `GoogleAdsReport`: `grep -rn "GoogleAdsReport" --include="*.tsx" .` → only the (now-updated) routes.
- [ ] **Step 4:** Delete the dead stub `components/report-sections/google-ads/` (no longer imported).
- [ ] **Step 5:** Typecheck + lint + build: `npx tsc --noEmit && npm run lint && npm run build`. Expected: builds clean.
- [ ] **Step 6: Commit** `feat(paid-search): repurpose google-ads slug to Paid Search; remove stub`.

---

## Task 10: Seed Renaissance config (needs only T1; gate on B2 for the real map)

**Files:** Modify `scripts/seed.ts` (Renaissance row, ~line 81).

- [ ] **Step 1:** Add to the Renaissance client object:

```ts
smApiKeyEnvVar: 'SUPERMETRICS_API_KEY_RENAISSANCE',
paidSearchConfig: {
  googleAdsAccountId: '4136001852',
  // PLACEHOLDER pending B2 (Amir's authoritative map). Observed YTD names below;
  // categories are a best guess and MUST be confirmed before acceptance (§10).
  leadActions: [
    { name: 'employer_dental_lead', category: 'employer' },
    { name: 'employer_accident_lead', category: 'employer' },
    { name: 'employer_vision_lead', category: 'employer' },
    { name: 'broker_group_lead', category: 'broker' },
    { name: 'contact_broker_lead', category: 'broker' },
    { name: 'contact_individual_lead', category: 'contact' },
    { name: 'contact_employee_lead', category: 'contact' },
    { name: 'contact_provider_lead', category: 'contact' },
  ],
},
```

Add `'google-ads'` to Renaissance's `enabledReports`.

- [ ] **Step 2:** Typecheck: `npx tsc --noEmit`. (Do NOT run `db:seed` — ops step, needs live DB + the real key from B1.)
- [ ] **Step 3: Commit** `chore(seed): Renaissance paid_search_config (placeholder map pending Amir)`.

> ⚠️ This config is a **placeholder**. Acceptance criterion §10 ("all 14 actions grouped correctly") is **not met** until B2 replaces this with the authoritative 14-action→category map.

---

## Self-review notes

- **Spec coverage:** Hero §6.1→T6b/T7a; KPIs §6.2→T6a/T7b; campaign table + reconciliation §6.3/§6.7→T6c/T7c; leads & conversions §6.4→T6d/T7d; geo §6.5→T6e/T7e; search terms §6.6→T6f/T7f; slug §5.1→T9; client §5.2→T2; config §5.5→T1/T10; primitives §5.3→T3/T4; states §8→T8. `last_4_weeks` preset (§6) and benchmark sub-line (§9) are non-blocking product confirms — not built until confirmed; flagged here so they aren't silently dropped.
- **Gates:** B1 (API key) blocks live data end-to-end (T2/T5 tested with mock fetch); B2 (action map) blocks §10 (T10 ships a flagged placeholder).
- **Type consistency:** all T6/T7 tasks import result types from `lib/paid-search/types.ts` (T5); fetchers share `awQuery`/`isLeadAction`/`categoryOf` from `lib/paid-search/base.ts` (T5); `sortRows`/`DataTable` (T4) and `ComboChart` (T3) signatures match their consumers.
