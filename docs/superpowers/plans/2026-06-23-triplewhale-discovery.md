# TripleWhale Discovery + Dimension Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard builder's TripleWhale leaf discovery-driven — pick any real numeric column of `pixel_joined_tvf` (`SUM(column)`) and filter it by any dimension (e.g. `channel = facebook-ads`), with values discovered live per shop.

**Architecture:** A new discovery client (`DESCRIBE pixel_joined_tvf` → numeric metrics + string dimensions; `SELECT DISTINCT` → values) is exposed via two auth-gated, cached server actions. The TripleWhale query builder becomes generic (`SUM(<sanitized column>)` + `AND <col> = '<escaped value>'`), keeping the existing `TW_METRIC_SQL` as a back-compat alias map for the NL path. The builder's `LeafBuilder` TripleWhale branch loads discovery and renders a searchable metric picker plus add/remove filter rows.

**Tech Stack:** Next.js RSC + server actions, TypeScript strict, TripleWhale Orcabase SQL API (`twSql`), `tsx` + `node:assert` for pure tests. No new dependencies.

## Global Constraints

- TypeScript strict; **no `any`** in new files.
- All TripleWhale calls are **server-side only**; the discovery client (`lib/triplewhale/discovery.ts`) is imported as a value only by the server actions — client components use `import type` only.
- **SQL safety:** every interpolated column must pass `isSafeColumn` (`^[a-z0-9_]+$`); every value must pass `escapeSqlValue` (`'` → `''`). Enforced in the query/discovery layer.
- Reuse: `twSql` (`@/lib/triplewhale/client`), `TwQueryError` (same), `auth` (`@/auth`), `canEditDashboard` (`@/lib/dashboard/permissions`), `getClientBySlug` (`@/lib/db/queries`), `parseDateRange` (`@/lib/ga4/client`), `unstable_cache` + `keyHash` (already in `app/actions/dashboard.ts`), `SearchCombobox`/`ComboOption` (`./search-combobox`).
- Keep `TW_METRIC_SQL` as the curated alias map (incl. the `channel_reported_conversion_value` revenue fix) — do not delete; the NL path and existing saved blocks depend on it.
- `filters` is **optional** on both the binding and the draft (so the untouched `manual-block-form.tsx` and existing tests keep compiling).
- Pure-logic tests env-free: `npx tsx <file>.test.ts`, `node:assert` strict, final `console.log('ok')`. UI + thin server actions: no unit test — verified by `tsc` (+ final build).
- Commit per task with the message shown; stage only the task's files.

---

## Inter-Component Dependency Map

```
  T1 discovery.ts        T2 queries.ts            T3 types.ts + persistence.ts
  (DESCRIBE/DISTINCT)    (SUM/filters/sanitize)   (TripleWhaleBinding.filters?)
       │                      │                          │
       │                      └──────────┐    ┌──────────┘
       │                                 ▼    ▼
       │                          T4 adapters/triplewhale.ts
       │                          (buildMetricSql(metric, filters))
       ▼                                                  │
  T5 app/actions/dashboard.ts        T6 build-config.ts   │
  (getTwFields, getTwDimensionValues)(LeafDraft.filters?) │
       │                                  │               │
       └──────────────┬───────────────────┘              │
                      ▼   (+ T1 TwFields type)            │
              T7 leaf-builder.tsx (TripleWhale branch)    │
              (needs T1 type, T5 actions, T6 draft)       │
```

**Edges = imports/consumes.** T4 needs T2 + T3. T5 needs T1. T6 needs T3. T7 needs T1 (type), T5, T6. T4 is independent of the UI chain (adapter is the render path).

### Parallelization waves

| Wave | Tasks (parallel) | Unblocked by |
|---|---|---|
| 0 | **T1 discovery**, **T2 queries**, **T3 types+persistence** | nothing — 3 disjoint |
| 1 | **T4 adapter**, **T5 actions**, **T6 build-config** | wave 0 (T4←T2,T3 · T5←T1 · T6←T3) |
| 2 | **T7 leaf-builder** | T1, T5, T6 |

All tasks touch disjoint files, so each wave's tasks run in parallel; commit serially to avoid git-index races.

---

## File Structure

```
lib/triplewhale/
  discovery.ts                 # NEW: isNumericType, parseColumns, twFields, twDistinctValues, PIXEL_TVF
  discovery.test.ts            # NEW
  queries.ts                   # MODIFY: TwFilter, isSafeColumn, escapeSqlValue, generic buildMetricSql(metric, filters?)
  queries.test.ts              # MODIFY
lib/dashboard/
  types.ts                     # MODIFY: TripleWhaleBinding.filters?
  persistence.ts               # MODIFY: validate filters in the triplewhale leaf branch
  persistence.test.ts          # MODIFY
  adapters/triplewhale.ts      # MODIFY: pass b.filters; drop isTwMetric gate
app/actions/
  dashboard.ts                 # MODIFY: getTwFields, getTwDimensionValues
components/dashboard/add-block/
  build-config.ts              # MODIFY: LeafDraft triplewhale filters?; leafToBinding carries cleaned filters
  build-config.test.ts         # MODIFY
  leaf-builder.tsx             # MODIFY: discovery-driven TripleWhale branch + filter rows
```

---

## Task 1: TripleWhale discovery client (`lib/triplewhale/discovery.ts`)

**Files:** Create `lib/triplewhale/discovery.ts`, `lib/triplewhale/discovery.test.ts`.

**Interfaces:**
- Consumes: `twSql` (`@/lib/triplewhale/client`) — `twSql(args: { apiKey, shopId, query, startDate, endDate }, opts?: { fetchImpl?: typeof fetch }): Promise<Record<string, unknown>[]>`.
- Produces: `TwField` (`{ value: string; label: string }`), `TwFields` (`{ metrics: TwField[]; dimensions: TwField[] }`); `isNumericType(type): boolean`; `parseColumns(describeRows): TwFields`; `twFields(apiKey, shopId, range, opts?): Promise<TwFields>`; `twDistinctValues(apiKey, shopId, column, range, opts?): Promise<string[]>`; `PIXEL_TVF` (string).

- [ ] **Step 1: Write the failing test** — create `lib/triplewhale/discovery.test.ts`:

```ts
// Run: npx tsx lib/triplewhale/discovery.test.ts
import { strict as assert } from 'node:assert'
import { isNumericType, parseColumns, twFields, twDistinctValues } from './discovery'

// numeric ClickHouse types (Nullable unwrapped); strings/dates are not numeric
assert.equal(isNumericType('Nullable(Float64)'), true)
assert.equal(isNumericType('Float64'), true)
assert.equal(isNumericType('Nullable(Int64)'), true)
assert.equal(isNumericType('UInt32'), true)
assert.equal(isNumericType('Nullable(Decimal(38, 9))'), true)
assert.equal(isNumericType('Nullable(String)'), false)
assert.equal(isNumericType('Nullable(Date)'), false)

// parseColumns splits numeric -> metrics, string -> dimensions; humanizes labels
{
  const f = parseColumns([
    { name: 'spend', type: 'Nullable(Float64)' },
    { name: 'channel', type: 'Nullable(String)' },
    { name: 'event_date', type: 'Nullable(Date)' },
    { name: 'clicks', type: 'Nullable(Int64)' },
  ])
  assert.deepEqual(f.metrics.map((m) => m.value), ['spend', 'clicks'])
  assert.deepEqual(f.dimensions.map((d) => d.value), ['channel'])
  assert.equal(f.metrics[0].label, 'Spend')
}

const fake = (body: unknown): typeof fetch =>
  (async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body }) as unknown as Response) as unknown as typeof fetch

async function main() {
  const range = { startDate: '2026-06-01', endDate: '2026-06-23' }
  const fields = await twFields('k', 'shop', range, {
    fetchImpl: fake([{ name: 'spend', type: 'Nullable(Float64)' }, { name: 'channel', type: 'Nullable(String)' }]),
  })
  assert.deepEqual(fields.metrics.map((m) => m.value), ['spend'])
  assert.deepEqual(fields.dimensions.map((d) => d.value), ['channel'])

  const vals = await twDistinctValues('k', 'shop', 'channel', range, {
    fetchImpl: fake([{ value: 'facebook-ads' }, { value: 'google-ads' }, { value: null }]),
  })
  assert.deepEqual(vals, ['facebook-ads', 'google-ads'])

  // unsafe column rejected
  await assert.rejects(twDistinctValues('k', 'shop', 'bad; DROP', range, { fetchImpl: fake([]) }))
  console.log('ok')
}
main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/triplewhale/discovery.test.ts`
Expected: FAIL with `Cannot find module './discovery'`

- [ ] **Step 3: Write the implementation** — create `lib/triplewhale/discovery.ts`:

```ts
/**
 * TripleWhale live discovery — server-side only. Lists the queryable columns of
 * pixel_joined_tvf (numeric -> metrics, string -> dimensions) and a dimension's
 * distinct values, for the dashboard builder. Verified via DESCRIBE + SELECT DISTINCT.
 */
import { twSql } from './client'

export interface TwField { value: string; label: string }
export interface TwFields { metrics: TwField[]; dimensions: TwField[] }

/** pixel_joined_tvf with the standard args used across TW queries. */
export const PIXEL_TVF = `pixel_joined_tvf(
  subscription_filter      = NULL,
  include_custom_ad_spend  = true,
  sales_platform_filter    = NULL,
  use_click_date           = false
)`

const COLUMN_RE = /^[a-z0-9_]+$/i

/** ClickHouse numeric types, after unwrapping Nullable(...). */
export function isNumericType(type: string): boolean {
  const inner = type.replace(/^Nullable\((.*)\)$/, '$1')
  return /^(?:U?Int(?:8|16|32|64|128|256)|Float(?:32|64)|Decimal)/i.test(inner)
}

function humanize(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Split DESCRIBE rows into numeric metric columns and string dimension columns. */
export function parseColumns(describeRows: unknown): TwFields {
  const rows = Array.isArray(describeRows) ? (describeRows as { name?: unknown; type?: unknown }[]) : []
  const metrics: TwField[] = []
  const dimensions: TwField[] = []
  for (const r of rows) {
    if (typeof r.name !== 'string' || typeof r.type !== 'string') continue
    const field: TwField = { value: r.name, label: humanize(r.name) }
    if (isNumericType(r.type)) metrics.push(field)
    else if (/String/i.test(r.type)) dimensions.push(field)
  }
  return { metrics, dimensions }
}

type Range = { startDate: string; endDate: string }
type Opts = { fetchImpl?: typeof fetch }

export async function twFields(apiKey: string, shopId: string, range: Range, opts: Opts = {}): Promise<TwFields> {
  const rows = await twSql({ apiKey, shopId, query: `DESCRIBE ${PIXEL_TVF}`, startDate: range.startDate, endDate: range.endDate }, opts)
  return parseColumns(rows)
}

export async function twDistinctValues(apiKey: string, shopId: string, column: string, range: Range, opts: Opts = {}): Promise<string[]> {
  if (!COLUMN_RE.test(column)) throw new Error(`unsafe column: ${column}`)
  const query = `SELECT DISTINCT ${column} AS value
FROM ${PIXEL_TVF}
WHERE event_date BETWEEN @startDate AND @endDate AND ${column} IS NOT NULL
ORDER BY value
LIMIT 200`
  const rows = await twSql({ apiKey, shopId, query, startDate: range.startDate, endDate: range.endDate }, opts)
  return rows.map((r) => r.value).filter((v): v is string => typeof v === 'string' && v.length > 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/triplewhale/discovery.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/triplewhale/discovery.ts lib/triplewhale/discovery.test.ts
git commit -m "feat(triplewhale): column + distinct-value discovery client"
```

---

## Task 2: Generic SUM + filters in the query builder (`lib/triplewhale/queries.ts`)

**Files:** Modify `lib/triplewhale/queries.ts`, `lib/triplewhale/queries.test.ts`.

**Interfaces:**
- Consumes: `TwQueryError` (`@/lib/triplewhale/client`); existing `TW_METRIC_SQL`, `TwMetric` (this file).
- Produces: `TwFilter` (`{ column: string; value: string }`); `isSafeColumn(c): boolean`; `escapeSqlValue(v): string`; `buildMetricSql(metric: string, filters?: TwFilter[]): string` (signature widened from `TwMetric`).

- [ ] **Step 1: Add the failing test** — append to `lib/triplewhale/queries.test.ts` before its final `console.log('ok')`:

```ts
import { isSafeColumn, escapeSqlValue, buildMetricSql as build2 } from './queries'

// curated alias resolves to its expression
assert.ok(build2('revenue').includes('SUM(channel_reported_conversion_value) AS value'))
// raw (non-curated) column -> SUM(column)
assert.ok(build2('channel_reported_conversion_value').includes('SUM(channel_reported_conversion_value) AS value'))
// filters append safely, with '-escaping
{
  const sql = build2('spend', [{ column: 'channel', value: "O'Brien" }])
  assert.ok(sql.includes("AND channel = 'O''Brien'"))
}
// unsafe metric / filter column throw
assert.throws(() => build2('a; DROP TABLE x'))
assert.throws(() => build2('spend', [{ column: 'bad col', value: 'x' }]))
// helpers
assert.equal(isSafeColumn('channel_reported_conversion_value'), true)
assert.equal(isSafeColumn('bad col'), false)
assert.equal(escapeSqlValue("a'b"), "a''b")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/triplewhale/queries.test.ts`
Expected: FAIL (`isSafeColumn`/`escapeSqlValue` not exported; `build2` is `buildMetricSql` which currently rejects extra args / non-`TwMetric`)

- [ ] **Step 3: Implement** — in `lib/triplewhale/queries.ts`, add the import at the top, and replace the existing `buildMetricSql` function with the generic version plus the new exports:

```ts
import { TwQueryError } from './client'

export interface TwFilter { column: string; value: string }

const COLUMN_RE = /^[a-z0-9_]+$/i
export function isSafeColumn(c: string): boolean {
  return COLUMN_RE.test(c)
}
export function escapeSqlValue(v: string): string {
  return v.replace(/'/g, "''")
}

/**
 * Single-row aggregate query for one metric, optionally filtered by dimensions.
 * `metric` is a curated alias (TW_METRIC_SQL) or a raw numeric column -> SUM(column).
 * `@startDate`/`@endDate` substitute server-side from `period`.
 */
export function buildMetricSql(metric: string, filters: TwFilter[] = []): string {
  const expr = TW_METRIC_SQL[metric as TwMetric] ?? (isSafeColumn(metric) ? `SUM(${metric})` : null)
  if (expr === null) throw new TwQueryError(`unsafe TripleWhale metric: ${metric}`)
  const filterSql = filters
    .map((f) => {
      if (!isSafeColumn(f.column)) throw new TwQueryError(`unsafe TripleWhale filter column: ${f.column}`)
      return `\n  AND ${f.column} = '${escapeSqlValue(f.value)}'`
    })
    .join('')
  return `SELECT ${expr} AS value
FROM pixel_joined_tvf(
  subscription_filter      = NULL,
  include_custom_ad_spend  = true,
  sales_platform_filter    = NULL,
  use_click_date           = false
)
WHERE event_date BETWEEN @startDate AND @endDate
  AND attribution_window = '7_days'
  AND model = 'Triple Attribution'${filterSql}`
}
```

(Leave `TwMetric`, `TW_METRIC_SQL`, and `isTwMetric` unchanged — `TW_METRIC_SQL` is the alias map.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/triplewhale/queries.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/triplewhale/queries.ts lib/triplewhale/queries.test.ts
git commit -m "feat(triplewhale): generic SUM(column) + dimension filters in query builder"
```

---

## Task 3: Binding `filters` type + validation (`lib/dashboard/types.ts`, `persistence.ts`)

**Files:** Modify `lib/dashboard/types.ts`, `lib/dashboard/persistence.ts`, `lib/dashboard/persistence.test.ts`.

**Interfaces:**
- Produces: `TripleWhaleBinding.filters?: { column: string; value: string }[]`; `parseBlockConfig` accepts/validates that field (existing signature: `parseBlockConfig(v: unknown, path?): { ok: true; block: PersistedBlock } | { ok: false; error: string }`).

- [ ] **Step 1: Add the failing test** — append to `lib/dashboard/persistence.test.ts` before its final `console.log('ok')` (the file already imports `parseBlockConfig`; if not, add `import { parseBlockConfig } from './persistence'`):

```ts
// triplewhale binding round-trips optional filters
{
  const r = parseBlockConfig({
    id: 'b1', name: 'X', format: 'number', range: null,
    binding: { source: 'triplewhale', metric: 'spend', filters: [{ column: 'channel', value: 'facebook-ads' }] },
  })
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'triplewhale') {
    assert.deepEqual(r.block.binding.filters, [{ column: 'channel', value: 'facebook-ads' }])
  }
}
// malformed filter entry is rejected
{
  const r = parseBlockConfig({
    id: 'b1', name: 'X', format: 'number', range: null,
    binding: { source: 'triplewhale', metric: 'spend', filters: [{ column: 'channel' }] },
  })
  assert.equal(r.ok, false)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: FAIL (filters dropped / not validated; second case currently parses as ok)

- [ ] **Step 3a: Widen the type** — in `lib/dashboard/types.ts`, change `TripleWhaleBinding`:

```ts
export interface TripleWhaleBinding {
  source: 'triplewhale'
  metric: string
  account?: string
  filters?: { column: string; value: string }[]
}
```

- [ ] **Step 3b: Validate in persistence** — in `lib/dashboard/persistence.ts`, replace the triplewhale branch of `parseLeaf` with:

```ts
  if (v.source === 'triplewhale') {
    if (!isNonEmptyStr(v.metric)) return { ok: false, error: `${path}.metric: expected non-empty string` }
    if (v.account !== undefined && !isStr(v.account)) return { ok: false, error: `${path}.account: expected string` }
    const b: TripleWhaleBinding = { source: 'triplewhale', metric: v.metric }
    if (v.account !== undefined) b.account = v.account
    if (v.filters !== undefined) {
      if (!Array.isArray(v.filters)) return { ok: false, error: `${path}.filters: expected array` }
      const filters: { column: string; value: string }[] = []
      for (const f of v.filters) {
        if (!isObj(f) || !isNonEmptyStr(f.column) || !isStr(f.value)) {
          return { ok: false, error: `${path}.filters: expected {column,value}[]` }
        }
        filters.push({ column: f.column, value: f.value })
      }
      b.filters = filters
    }
    return { ok: true, value: b }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/types.ts lib/dashboard/persistence.ts lib/dashboard/persistence.test.ts
git commit -m "feat(dashboard): TripleWhale binding filters (type + validation)"
```

---

## Task 4: Adapter passes filters (`lib/dashboard/adapters/triplewhale.ts`)

**Files:** Modify `lib/dashboard/adapters/triplewhale.ts`.

**Interfaces:**
- Consumes: `buildMetricSql(metric: string, filters?: TwFilter[])` (T2); `TripleWhaleBinding.filters` (T3).

**Note:** thin render-path change — verified by the tsc gate (no unit test; the query building is covered by T2, discovery by T1).

- [ ] **Step 1: Edit the adapter** — in `lib/dashboard/adapters/triplewhale.ts`:
  1. Remove `isTwMetric` from the import from `@/lib/triplewhale/queries` (keep `buildMetricSql`). The import becomes:
     ```ts
     import { twSql, twValue, TwQueryError } from '@/lib/triplewhale/client'
     import { buildMetricSql } from '@/lib/triplewhale/queries'
     ```
  2. Delete the guard line:
     ```ts
     if (!isTwMetric(b.metric)) throw new TwQueryError(`Unknown TripleWhale metric: ${b.metric}`)
     ```
  3. Change the query construction to pass filters:
     ```ts
     const query = buildMetricSql(b.metric, b.filters)
     ```

  (`TwQueryError` stays imported — it is still referenced elsewhere in the file. If `tsc` reports it as unused after the edit, remove it from the import.)

- [ ] **Step 2: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "adapters/triplewhale" || echo "adapter ok"`
Expected: `adapter ok`

- [ ] **Step 3: Commit**

```bash
git add lib/dashboard/adapters/triplewhale.ts
git commit -m "feat(dashboard): TripleWhale adapter passes dimension filters"
```

---

## Task 5: Discovery server actions (`app/actions/dashboard.ts`)

**Files:** Modify `app/actions/dashboard.ts`.

**Interfaces:**
- Consumes: `twFields`, `twDistinctValues`, `TwFields` (T1, `@/lib/triplewhale/discovery`); `parseDateRange` (`@/lib/ga4/client`); existing `auth`, `canEditDashboard`, `getClientBySlug`, `unstable_cache`, `keyHash` (already in this file).
- Produces: `getTwFields(slug): Promise<{ ok: true; fields: TwFields } | { ok: false; error: string }>`; `getTwDimensionValues(slug, column): Promise<{ ok: true; values: string[] } | { ok: false; error: string }>`.

**Note:** thin auth + cache + discovery dispatch; verified by the tsc gate (parsing covered by T1). `'use server'` requires every export to be an async function — return result objects inline, no exported types.

- [ ] **Step 1: Add imports** — in `app/actions/dashboard.ts`, add:

```ts
import { parseDateRange } from '@/lib/ga4/client'
import { twFields, twDistinctValues, type TwFields } from '@/lib/triplewhale/discovery'
```

- [ ] **Step 2: Add the actions** — append to `app/actions/dashboard.ts`:

```ts
/** Live TripleWhale field discovery (numeric metrics + string dimensions) for a client's shop. */
export async function getTwFields(
  slug: string,
): Promise<{ ok: true; fields: TwFields } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  const shopId = (await getClientBySlug(slug))?.triplewhaleShopId
  if (!apiKey || !shopId) return { ok: false, error: 'disconnected' }
  const { startDate, endDate } = parseDateRange('last_30_days')
  try {
    const fields = await unstable_cache(
      () => twFields(apiKey, shopId, { startDate, endDate }),
      ['tw-fields', shopId, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, fields }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'discovery failed' }
  }
}

/** Live distinct values for a TripleWhale dimension column, for a client's shop. */
export async function getTwDimensionValues(
  slug: string,
  column: string,
): Promise<{ ok: true; values: string[] } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  const shopId = (await getClientBySlug(slug))?.triplewhaleShopId
  if (!apiKey || !shopId) return { ok: false, error: 'disconnected' }
  const { startDate, endDate } = parseDateRange('last_30_days')
  try {
    const values = await unstable_cache(
      () => twDistinctValues(apiKey, shopId, column, { startDate, endDate }),
      ['tw-dim', shopId, column, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, values }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'discovery failed' }
  }
}
```

- [ ] **Step 3: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "app/actions/dashboard" || echo "actions ok"`
Expected: `actions ok`

- [ ] **Step 4: Commit**

```bash
git add app/actions/dashboard.ts
git commit -m "feat(dashboard): getTwFields/getTwDimensionValues discovery actions"
```

---

## Task 6: Draft carries filters (`components/dashboard/add-block/build-config.ts`)

**Files:** Modify `components/dashboard/add-block/build-config.ts`, `components/dashboard/add-block/build-config.test.ts`.

**Interfaces:**
- Consumes: `TripleWhaleBinding.filters` (T3, via `LeafBinding` from `@/lib/dashboard/types`).
- Produces: `LeafDraft` triplewhale variant gains optional `filters?: { column: string; value: string }[]`; `leafToBinding` carries cleaned filters (drops rows with empty column/value).

- [ ] **Step 1: Add the failing test** — append to `components/dashboard/add-block/build-config.test.ts` before its final `console.log('ok')`:

```ts
import { leafToBinding as leafToBinding2 } from './build-config'

// triplewhale carries non-empty filters
{
  const b = leafToBinding2({ source: 'triplewhale', metric: 'spend', filters: [{ column: 'channel', value: 'facebook-ads' }] })
  if (b.source === 'triplewhale') assert.deepEqual(b.filters, [{ column: 'channel', value: 'facebook-ads' }])
}
// empty/incomplete filter rows are dropped (no filters key)
{
  const b = leafToBinding2({ source: 'triplewhale', metric: 'spend', filters: [{ column: '', value: '' }, { column: 'channel', value: '' }] })
  if (b.source === 'triplewhale') assert.equal(b.filters, undefined)
}
// no filters provided -> no filters key
{
  const b = leafToBinding2({ source: 'triplewhale', metric: 'spend' })
  if (b.source === 'triplewhale') assert.equal(b.filters, undefined)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: FAIL (`filters` not on the draft type / not carried)

- [ ] **Step 3: Implement** — in `components/dashboard/add-block/build-config.ts`:
  1. Change the triplewhale variant of `LeafDraft`:
     ```ts
     export type LeafDraft =
       | { source: 'supermetrics'; dsId: string; metricField: string; account: string }
       | { source: 'triplewhale'; metric: string; filters?: { column: string; value: string }[] }
     ```
  2. Replace `leafToBinding` with:
     ```ts
     export function leafToBinding(d: LeafDraft): LeafBinding {
       if (d.source === 'supermetrics') {
         return { source: 'supermetrics', dsId: d.dsId, metricField: d.metricField, account: d.account }
       }
       const filters = (d.filters ?? []).filter((f) => f.column !== '' && f.value !== '')
       return { source: 'triplewhale', metric: d.metric, ...(filters.length ? { filters } : {}) }
     }
     ```

  (`isLeafComplete` is unchanged — triplewhale completeness still only requires a non-empty `metric`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts
git commit -m "feat(dashboard): manual draft carries TripleWhale filters"
```

---

## Task 7: Discovery-driven TripleWhale leaf UI (`components/dashboard/add-block/leaf-builder.tsx`)

**Files:** Modify `components/dashboard/add-block/leaf-builder.tsx`.

**Interfaces:**
- Consumes: `getTwFields`, `getTwDimensionValues` (T5, `@/app/actions/dashboard`); `TwFields` (T1, type-only, `@/lib/triplewhale/discovery`); `LeafDraft` with `filters?` (T6, `./build-config`); `SearchCombobox`, `ComboOption` (`./search-combobox`).
- Produces: the TripleWhale branch of `LeafBuilder` is discovery-driven (searchable metric + add/remove dimension filter rows).

**Note:** UI — verified by `tsc` + the full pure-test suite + manual. All hooks unconditional; the TripleWhale branch is a child component (`TwLeafFields`) that owns its own hooks, so `LeafBuilder`'s existing Supermetrics effect is untouched.

- [ ] **Step 1: Remove the static TripleWhale enum imports** — in `leaf-builder.tsx`:
  1. Delete `import { TW_METRIC_SQL } from '@/lib/triplewhale/queries'`.
  2. Delete the `TW_OPTIONS` constant and the `humanize` helper (both become unused).
  3. Add imports:
     ```ts
     import { getTwFields, getTwDimensionValues } from '@/app/actions/dashboard'
     import type { TwFields } from '@/lib/triplewhale/discovery'
     ```

- [ ] **Step 2: Replace the TripleWhale branch** — in `LeafBuilder`, replace the existing `if (source === 'triplewhale') { ... }` block with:

```tsx
  if (source === 'triplewhale') {
    const tw = value.source === 'triplewhale' ? value : { source: 'triplewhale' as const, metric: '' }
    const filters = tw.filters ?? []
    return (
      <TwLeafFields
        metric={tw.metric}
        filters={filters}
        slug={slug}
        onChange={(next) => onChange({ source: 'triplewhale', metric: next.metric, ...(next.filters.length ? { filters: next.filters } : {}) })}
      />
    )
  }
```

- [ ] **Step 3: Add the TripleWhale sub-components** — append to `leaf-builder.tsx` (after the `Field` helper):

```tsx
function TwLeafFields({
  metric,
  filters,
  slug,
  onChange,
}: {
  metric: string
  filters: { column: string; value: string }[]
  slug: string
  onChange: (next: { metric: string; filters: { column: string; value: string }[] }) => void
}) {
  const [fields, setFields] = useState<TwFields>({ metrics: [], dimensions: [] })
  const [err, setErr] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()

  useEffect(() => {
    setErr(null)
    startLoad(async () => {
      const r = await getTwFields(slug)
      if (r.ok) setFields(r.fields)
      else { setErr(r.error); setFields({ metrics: [], dimensions: [] }) }
    })
  }, [slug])

  const setMetric = (m: string) => onChange({ metric: m, filters })
  const setFilter = (i: number, f: { column: string; value: string }) =>
    onChange({ metric, filters: filters.map((x, j) => (j === i ? f : x)) })
  const addFilter = () => onChange({ metric, filters: [...filters, { column: '', value: '' }] })
  const removeFilter = (i: number) => onChange({ metric, filters: filters.filter((_, j) => j !== i) })

  return (
    <div className="flex flex-col gap-3">
      <Field label="Metric">
        {err ? (
          <input className={ctrl} value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="column id (e.g. spend)" />
        ) : (
          <SearchCombobox value={metric} options={fields.metrics} loading={loading} placeholder="Select metric" onChange={setMetric} />
        )}
      </Field>
      {err && <p className="text-xs text-[#FF6666]">Discovery unavailable ({err}). Enter column ids manually.</p>}

      {filters.map((f, i) => (
        <TwFilterRow
          key={i}
          filter={f}
          dimensions={fields.dimensions}
          slug={slug}
          disabled={err !== null}
          onChange={(nf) => setFilter(i, nf)}
          onRemove={() => removeFilter(i)}
        />
      ))}

      <button
        type="button"
        onClick={addFilter}
        className="self-start rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
      >
        + Add filter
      </button>
    </div>
  )
}

function TwFilterRow({
  filter,
  dimensions,
  slug,
  disabled,
  onChange,
  onRemove,
}: {
  filter: { column: string; value: string }
  dimensions: ComboOption[]
  slug: string
  disabled: boolean
  onChange: (f: { column: string; value: string }) => void
  onRemove: () => void
}) {
  const [values, setValues] = useState<ComboOption[]>([])
  const [loading, startLoad] = useTransition()

  useEffect(() => {
    if (filter.column === '') { setValues([]); return }
    startLoad(async () => {
      const r = await getTwDimensionValues(slug, filter.column)
      setValues(r.ok ? r.values.map((v) => ({ value: v, label: v })) : [])
    })
  }, [filter.column, slug])

  return (
    <div className="flex items-center gap-2">
      <SearchCombobox
        value={filter.column}
        options={dimensions}
        disabled={disabled}
        placeholder="Dimension"
        onChange={(column) => onChange({ column, value: '' })}
      />
      <SearchCombobox
        value={filter.value}
        options={values}
        disabled={disabled || filter.column === ''}
        loading={loading}
        placeholder="Value"
        onChange={(v) => onChange({ column: filter.column, value: v })}
      />
      <button type="button" onClick={onRemove} className="text-text-muted hover:text-white" aria-label="Remove filter">✕</button>
    </div>
  )
}
```

(`ctrl`, `Field`, `SearchCombobox`, `ComboOption`, `useState`, `useEffect`, `useTransition` are already in this file.)

- [ ] **Step 4: Type-check + full pure-test suite**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "components/dashboard/add-block|lib/triplewhale|app/actions/dashboard" || echo "no new type errors"
npx tsx lib/triplewhale/discovery.test.ts
npx tsx lib/triplewhale/queries.test.ts
npx tsx components/dashboard/add-block/build-config.test.ts
npx tsx lib/dashboard/persistence.test.ts
```
Expected: `no new type errors`, and all four tests print `ok`.

- [ ] **Step 5: Production build (de-risk the preview)**

Run: `npm run build 2>&1 | tail -5`
Expected: build completes; the `configurable-dashboard` route compiles.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/add-block/leaf-builder.tsx
git commit -m "feat(dashboard): discovery-driven TripleWhale leaf with dimension filters"
```

---

## Self-Review

**Spec coverage** (against `2026-06-23-triplewhale-discovery-design.md`):
- Discovery via `DESCRIBE` → numeric metrics + string dimensions → T1 (`parseColumns`, `isNumericType`, `twFields`). ✅
- Distinct dimension values (`SELECT DISTINCT … LIMIT 200`, null-filtered, column-sanitized) → T1 (`twDistinctValues`). ✅
- Auth-gated, cached actions (`getTwFields`, `getTwDimensionValues`; `disconnected` when no key/shop) → T5. ✅
- Generic `SUM(column)` with curated alias fallback; safe column + escaped value; filters in WHERE → T2 (`buildMetricSql`, `isSafeColumn`, `escapeSqlValue`). ✅
- Binding `filters?` type + persistence validation → T3. ✅
- Adapter passes filters, drops the enum gate → T4. ✅
- Draft carries cleaned filters → T6 (`leafToBinding`). ✅
- Discovery-driven builder UI (searchable metric, add/remove filter rows, lazy values, disconnected free-text fallback) → T7. ✅
- Reuse `SearchCombobox`; no new dependency; back-compat alias map kept; NL path untouched → T2/T7. ✅
- Out of scope (explorer UI, populated-filtering, other tables, non-equality/OR, attribution UI) → none included. ✅

**Placeholder scan:** none. ✅

**Type consistency:** `TwField`/`TwFields` (T1) consumed by T5 (action return) and T7 (state, type-only import); `buildMetricSql(metric: string, filters?: TwFilter[])` (T2) called by T4 with `b.filters`; `TripleWhaleBinding.filters?` (T3) consumed by T4 (adapter), persistence (T3), and produced by `leafToBinding` (T6); `LeafDraft` triplewhale `filters?` (T6) consumed by T7; `getTwFields`/`getTwDimensionValues` return `{ok:true;fields|values} | {ok:false;error}` (T5) destructured as such in T7; `ComboOption` is structurally compatible with `TwField` (both `{value,label}`) so `fields.metrics`/`dimensions` pass to `SearchCombobox`. ✅

**Out-of-band:** stage only each task's listed files; leave unrelated working-tree edits (paid-search, infra fixes, manual-query-builder spec/plan) unstaged.
```
