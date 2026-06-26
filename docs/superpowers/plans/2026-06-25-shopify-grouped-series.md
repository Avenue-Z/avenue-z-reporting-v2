# Shopify Grouped + Series Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Shopify (ShopifyQL) data source power bar/line/table blocks — grouped by a curated dimension and as a time series — with a structured builder UX, mirroring Supermetrics/TripleWhale.

**Architecture:** Add a raw-`TableData` ShopifyQL client fn, a curated dimension catalog, `dimensions`/`granularity` on `ShopifyBinding`, grouped/series adapters that append `GROUP BY <dim|granularity>` and parse the 2-column result (reusing `joinGrouped`/`alignSeries`), wire them into the registry, and surface Shopify in the bar/line/table builders.

**Tech Stack:** TypeScript (strict), Next.js 15 App Router, ShopifyQL via Admin GraphQL, `tsx` + `node:assert` tests.

**Spec:** `docs/superpowers/specs/2026-06-25-shopify-grouped-series-design.md`
**Branch:** `feat/shopify-grouped-series` (already created, off `feat/tc-dashboard-self-service-dash-system`).

## Global Constraints

- TypeScript strict; no `any` in new/changed code.
- ShopifyQL verified live: `… GROUP BY <dim>` → `[dim, metric]` rows; `… GROUP BY day|week|month` → `[bucket, metric]` rows; bucket is an ISO date; values are strings (use `Number()`); series rows need ascending sort. The `GROUP BY` clause goes between the body and `SINCE/UNTIL` (so pass `"<body> GROUP BY <x>"` as the body to the date-appending client).
- Valid curated dimensions: `sales_channel`, `product_type`, `product_title`, `billing_country`, `billing_region`, `new_or_returning_customer`. Guard any dim with `/^[a-z0-9_]+$/`.
- Granularity is exactly `'day' | 'week' | 'month'` (matches ShopifyQL).
- Shopify grouped/series only (bar/line/table); the scalar leaf path and curated metric catalog are unchanged.
- No new npm dependency. Tests: `npx tsx <file>` + `node:assert`, ending `console.log('ok')`.

---

## Parallelization Map (for an agent fleet)

```
Wave 1 (parallel, foundations)         Wave 2 (parallel, integrations)
  T1 client raw-table  ─┐
  T2 dimension catalog ─┼─► T5 adapters + registry   (needs T1,T2,T3)
  T3 binding fields    ─┤    T6 build-config guards   (needs T3)
  T4 dialog sources    ─┘    T7 persistence parsing   (needs T2,T3)
                            T8 dimension picker        (needs T2)
```

**File ownership (no two concurrent tasks share a file):**
| Task | Files |
|---|---|
| T1 | `lib/shopify/client.ts`, `…/client.test.ts` |
| T2 | `lib/shopify/catalog.ts`, `…/catalog.test.ts` |
| T3 | `lib/dashboard/types.ts` |
| T4 | `components/dashboard/add-block/add-block-dialog.tsx` |
| T5 | `lib/dashboard/adapters/shopify.ts`, `…/shopify.test.ts`, `lib/dashboard/registry.ts` |
| T6 | `components/dashboard/add-block/build-config.ts`, `…/build-config.test.ts` |
| T7 | `lib/dashboard/persistence.ts`, `…/persistence.test.ts` |
| T8 | `components/dashboard/add-block/dimension-picker.tsx` |

**Locked interface contracts:**
- **T1:** `runShopifyQlTable(args: ShopifyQlArgs, opts?: ShopifyQlOpts): Promise<TableData>` (existing `runShopifyQl` refactored to call it).
- **T2:** `SHOPIFY_DIMENSIONS: readonly { id: string; label: string }[]`; `SHOPIFY_DIM_RE: RegExp`.
- **T3:** `ShopifyBinding` gains `dimensions?: string[]` and `granularity?: Granularity`.
- **T5:** `resolveShopifyGrouped(b: ShopifyBinding, ctx: { slug: string }, dateRange: string, compareRange: string | null): Promise<GroupedRow[]>`; `resolveShopifySeries(b: ShopifyBinding, granularity: Granularity, ctx: { slug: string }, dateRange: string, compareRange: string | null): Promise<SeriesPoint[]>`.

**Integration note:** T5 consumes T1/T2/T3; T6 & T7 consume T3 (and T7 also T2); T8 consumes T2. If a Wave-2 task starts before Wave-1 merges, stub against the contracts above.

---

### Task 1: ShopifyQL raw-table client fn

**Files:**
- Modify: `lib/shopify/client.ts`
- Modify: `lib/shopify/client.test.ts`

**Interfaces:**
- Produces: `runShopifyQlTable(args, opts?): Promise<TableData>`. `runShopifyQl` unchanged externally.

- [ ] **Step 1: Write the failing test**

In `lib/shopify/client.test.ts`, add `runShopifyQlTable` to the `./client` import and append (the file already constructs a fake `fetchImpl`; mirror its existing mock shape):
```ts
// runShopifyQlTable returns the raw TableData (columns + rows), not a scalar
{
  const fetchImpl = (async () => ({
    ok: true,
    json: async () => ({ data: { shopifyqlQuery: { parseErrors: [], tableData: {
      columns: [{ name: 'sales_channel' }, { name: 'net_sales' }],
      rows: [{ sales_channel: 'Online Store', net_sales: '100.5' }, { sales_channel: 'TikTok', net_sales: '40' }],
    } } } }),
  })) as unknown as typeof fetch
  const td = await runShopifyQlTable(
    { shop: 's.myshopify.com', token: 't', query: 'FROM sales SHOW net_sales GROUP BY sales_channel', startDate: '2026-05-01', endDate: '2026-05-31' },
    { fetchImpl },
  )
  assert.equal(td.columns.length, 2)
  assert.equal(td.rows.length, 2)
  assert.equal(td.columns[0].name, 'sales_channel')
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx lib/shopify/client.test.ts`
Expected: FAIL — `runShopifyQlTable` not exported.

- [ ] **Step 3: Implement**

In `lib/shopify/client.ts`, refactor so the GraphQL call returns the table, and `runShopifyQl` sums it. Add:
```ts
/** Run one ShopifyQL query and return the raw TableData (columns + rows). */
export async function runShopifyQlTable(args: ShopifyQlArgs, opts: ShopifyQlOpts = {}): Promise<TableData> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const apiVersion = opts.apiVersion ?? DEFAULT_API_VERSION
  const url = `https://${args.shop}/admin/api/${apiVersion}/graphql.json`
  const q = buildShopifyQl(args.query, args.startDate, args.endDate)

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': args.token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: GQL, variables: { q } }),
  })
  if (!res.ok) throw new ShopifyQlError(`Shopify Admin API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const json = (await res.json()) as {
    errors?: { message?: string }[]
    data?: { shopifyqlQuery?: { parseErrors?: string[]; tableData?: TableData | null } }
  }
  if (json.errors?.length) throw new ShopifyQlError(`ShopifyQL GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`)
  const result = json.data?.shopifyqlQuery
  if (!result) throw new ShopifyQlError('Empty shopifyqlQuery response')
  if (result.parseErrors?.length) throw new ShopifyQlError(`ShopifyQL parse error(s): ${result.parseErrors.join('; ')}`)
  return result.tableData ?? { columns: [], rows: [] }
}
```
Then replace the body of `runShopifyQl` to delegate:
```ts
/** Run one ShopifyQL query and return the summed first column. */
export async function runShopifyQl(args: ShopifyQlArgs, opts: ShopifyQlOpts = {}): Promise<number> {
  return sumFirstColumn(await runShopifyQlTable(args, opts))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx lib/shopify/client.test.ts`
Expected: `ok`.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add lib/shopify/client.ts lib/shopify/client.test.ts
git commit -m "feat(shopify): runShopifyQlTable returns raw TableData

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Curated dimension catalog + guard

**Files:**
- Modify: `lib/shopify/catalog.ts`
- Create: `lib/shopify/catalog.test.ts`

**Interfaces:**
- Produces: `SHOPIFY_DIMENSIONS: readonly { id: string; label: string }[]`; `SHOPIFY_DIM_RE: RegExp`.

- [ ] **Step 1: Write the failing test**

Create `lib/shopify/catalog.test.ts`:
```ts
// Run: npx tsx lib/shopify/catalog.test.ts
import { strict as assert } from 'node:assert'
import { SHOPIFY_DIMENSIONS, SHOPIFY_DIM_RE } from './catalog'

assert.ok(SHOPIFY_DIMENSIONS.length >= 6, 'has the curated dimensions')
assert.ok(SHOPIFY_DIMENSIONS.some((d) => d.id === 'sales_channel'), 'includes sales_channel')
// every curated dim id must pass the safe-column guard
for (const d of SHOPIFY_DIMENSIONS) {
  assert.equal(SHOPIFY_DIM_RE.test(d.id), true, `${d.id} must be a safe column`)
  assert.ok(d.label.length > 0)
}
// guard rejects injection
assert.equal(SHOPIFY_DIM_RE.test('a; DROP'), false)
assert.equal(SHOPIFY_DIM_RE.test('UPPER'), false)
console.log('ok')
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx lib/shopify/catalog.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement**

Append to `lib/shopify/catalog.ts`:
```ts
/** ShopifyQL `sales` table columns that are safe + low/medium cardinality to GROUP BY
 *  in a chart. Verified live against bright-patches 2026-06. */
export const SHOPIFY_DIMENSIONS: readonly { id: string; label: string }[] = [
  { id: 'sales_channel',             label: 'Sales Channel' },
  { id: 'product_type',              label: 'Product Type' },
  { id: 'product_title',             label: 'Product' },
  { id: 'billing_country',           label: 'Country' },
  { id: 'billing_region',            label: 'Region' },
  { id: 'new_or_returning_customer', label: 'New vs Returning' },
] as const

/** Safe-column guard for any ShopifyQL dimension before interpolation into a GROUP BY. */
export const SHOPIFY_DIM_RE = /^[a-z0-9_]+$/
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx lib/shopify/catalog.test.ts`
Expected: `ok`.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add lib/shopify/catalog.ts lib/shopify/catalog.test.ts
git commit -m "feat(shopify): curated GROUP BY dimension catalog + safe-column guard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Extend ShopifyBinding

**Files:**
- Modify: `lib/dashboard/types.ts`

**Interfaces:**
- Produces: `ShopifyBinding` gains optional `dimensions?: string[]`, `granularity?: Granularity`.

- [ ] **Step 1: Make the change**

In `lib/dashboard/types.ts`, extend `ShopifyBinding` (keep existing fields):
```ts
export interface ShopifyBinding {
  source: 'shopify'
  query: string // ShopifyQL body (FROM…SHOW…WHERE…) without a date or GROUP BY clause
  dimensions?: string[]      // grouped mode (bar/table): single dim — GROUP BY <dim>
  granularity?: Granularity  // series mode (line): GROUP BY day|week|month
}
```
Ensure `Granularity` is in scope in this file (it is defined here / already referenced by `SupermetricsBinding`/`TripleWhaleBinding`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → clean (additive optional fields; nothing else should break).

- [ ] **Step 3: Commit**

```bash
git add lib/dashboard/types.ts
git commit -m "feat(dashboard): ShopifyBinding gains dimensions + granularity

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Offer Shopify for bar/line/table in the dialog

**Files:**
- Modify: `components/dashboard/add-block/add-block-dialog.tsx`

- [ ] **Step 1: Make the change**

In `SOURCES_BY_KIND`, add Shopify to the `bar`, `line`, and `table` entries (currently SM/TW only):
```ts
  bar:       [{ value: 'supermetrics', label: 'Supermetrics' }, { value: 'triplewhale', label: 'TripleWhale' }, { value: 'shopify', label: 'Shopify (ShopifyQL)' }],
  line:      [{ value: 'supermetrics', label: 'Supermetrics' }, { value: 'triplewhale', label: 'TripleWhale' }, { value: 'shopify', label: 'Shopify (ShopifyQL)' }],
  table:     [{ value: 'supermetrics', label: 'Supermetrics' }, { value: 'triplewhale', label: 'TripleWhale' }, { value: 'shopify', label: 'Shopify (ShopifyQL)' }],
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → clean. Run: `npx eslint components/dashboard/add-block/add-block-dialog.tsx` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/add-block/add-block-dialog.tsx
git commit -m "feat(dashboard): offer Shopify source for bar/line/table blocks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Shopify grouped + series adapters + registry wiring

**Files:**
- Modify: `lib/dashboard/adapters/shopify.ts`
- Create: `lib/dashboard/adapters/shopify.test.ts`
- Modify: `lib/dashboard/registry.ts`

**Interfaces:**
- Consumes: `runShopifyQlTable` (T1), `SHOPIFY_DIM_RE` (T2), `ShopifyBinding.dimensions/granularity` (T3); existing `joinGrouped`/`alignSeries` (`../group-join`), `GroupedRow`/`SeriesPoint`/`Granularity` types, `resolveShopifyCreds`, `DisconnectedError`, `InvalidMetricError`.
- Produces: `resolveShopifyGrouped`, `resolveShopifySeries`, and pure helpers `groupRowsFromShopify`/`seriesPointsFromShopify`.

- [ ] **Step 1: Write the failing test** (pure row-parsers)

Create `lib/dashboard/adapters/shopify.test.ts`:
```ts
// Run: npx tsx lib/dashboard/adapters/shopify.test.ts
import { strict as assert } from 'node:assert'
import { groupRowsFromShopify, seriesPointsFromShopify } from './shopify'

const grouped = { columns: [{ name: 'sales_channel' }, { name: 'net_sales' }], rows: [
  { sales_channel: 'Online Store', net_sales: '100.5' },
  { sales_channel: 'TikTok', net_sales: '40' },
] }
assert.deepEqual(groupRowsFromShopify(grouped), [
  { dim: 'Online Store', value: 100.5 },
  { dim: 'TikTok', value: 40 },
])
// non-numeric / missing value → 0
assert.deepEqual(groupRowsFromShopify({ columns: [{ name: 'x' }, { name: 'v' }], rows: [{ x: 'A', v: 'n/a' }] }), [{ dim: 'A', value: 0 }])

const series = { columns: [{ name: 'day' }, { name: 'net_sales' }], rows: [
  { day: '2026-05-31 00:00:00', net_sales: '171768.789' },
  { day: '2026-05-29', net_sales: '162640.677' },
] }
// trimmed to date + sorted ascending by bucket
assert.deepEqual(seriesPointsFromShopify(series), [
  { bucket: '2026-05-29', value: 162640.677 },
  { bucket: '2026-05-31', value: 171768.789 },
])
console.log('ok')
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx lib/dashboard/adapters/shopify.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement adapters + helpers**

In `lib/dashboard/adapters/shopify.ts`: extend imports and append the helpers + resolvers. New imports at top:
```ts
import { createHash } from 'node:crypto'
import { unstable_cache } from 'next/cache'
import { runShopifyQl, runShopifyQlTable, type TableData } from '@/lib/shopify/client'
import { SHOPIFY_DIM_RE } from '@/lib/shopify/catalog'
import type { Granularity, GroupedRow, LeafValue, SeriesPoint, ShopifyBinding } from '../types'
import { DisconnectedError, InvalidMetricError } from '../errors'
import { joinGrouped, alignSeries } from '../group-join'
```
(Keep the existing `resolveShopifyCreds`/`resolveShopifyLeaf`; just merge the import lines so `runShopifyQl` stays imported.)

Append:
```ts
function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Flatten a 2-column ShopifyQL table (dim, metric) → { dim, value }. */
export function groupRowsFromShopify(td: TableData): { dim: string; value: number }[] {
  const dimKey = td.columns[0]?.name
  const valKey = td.columns[1]?.name
  if (typeof dimKey !== 'string' || typeof valKey !== 'string') return []
  return td.rows.map((r) => ({ dim: String(r[dimKey] ?? ''), value: toNumber(r[valKey]) }))
}

/** Flatten a 2-column ShopifyQL table (bucket, metric) → { bucket, value }, date-asc. */
export function seriesPointsFromShopify(td: TableData): { bucket: string; value: number }[] {
  const bKey = td.columns[0]?.name
  const valKey = td.columns[1]?.name
  if (typeof bKey !== 'string' || typeof valKey !== 'string') return []
  return td.rows
    .map((r) => ({ bucket: String(r[bKey] ?? '').slice(0, 10), value: toNumber(r[valKey]) }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
}

const keyHash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

async function fetchShopifyTable(shop: string, token: string, query: string, isoRange: string, tag: string) {
  return unstable_cache(
    async () => {
      const [startDate, endDate] = isoRange.split(',')
      return runShopifyQlTable({ shop, token, query, startDate, endDate })
    },
    ['shopify', tag, shop, isoRange, keyHash(query)],
    { revalidate: 3600 },
  )()
}

export async function resolveShopifyGrouped(
  b: ShopifyBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<GroupedRow[]> {
  if (!b.dimensions || b.dimensions.length !== 1) {
    throw new InvalidMetricError('resolveShopifyGrouped requires a single dimension')
  }
  const dim = b.dimensions[0]
  if (!SHOPIFY_DIM_RE.test(dim)) throw new InvalidMetricError(`unsafe Shopify dimension: ${dim}`)

  const creds = resolveShopifyCreds(ctx.slug, process.env)
  if (!creds) throw new DisconnectedError(`Shopify not connected for ${ctx.slug}`)
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const query = `${b.query} GROUP BY ${dim}`
  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [cur, prior] = await Promise.all([
    fetchShopifyTable(creds.shop, creds.token, query, `${startDate},${endDate}`, 'grouped').then(groupRowsFromShopify),
    compareIso ? fetchShopifyTable(creds.shop, creds.token, query, compareIso, 'grouped').then(groupRowsFromShopify) : Promise.resolve(null),
  ])
  return joinGrouped(cur, prior, dim)
}

export async function resolveShopifySeries(
  b: ShopifyBinding,
  granularity: Granularity,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<SeriesPoint[]> {
  const creds = resolveShopifyCreds(ctx.slug, process.env)
  if (!creds) throw new DisconnectedError(`Shopify not connected for ${ctx.slug}`)
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const query = `${b.query} GROUP BY ${granularity}`
  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [cur, prior] = await Promise.all([
    fetchShopifyTable(creds.shop, creds.token, query, `${startDate},${endDate}`, 'series').then(seriesPointsFromShopify),
    compareIso ? fetchShopifyTable(creds.shop, creds.token, query, compareIso, 'series').then(seriesPointsFromShopify) : Promise.resolve(null),
  ])
  return alignSeries(cur, prior)
}
```

- [ ] **Step 4: Run helper test → pass**

Run: `npx tsx lib/dashboard/adapters/shopify.test.ts`
Expected: `ok`.

- [ ] **Step 5: Wire into the registry**

In `lib/dashboard/registry.ts`: add the Shopify imports and replace the `default: throw` in both `resolveGrouped` and `resolveSeries`.
Imports:
```ts
import { resolveShopifyLeaf, resolveShopifyGrouped, resolveShopifySeries } from './adapters/shopify'
```
In `resolveGrouped`, replace `default: throw new Error(...)` with:
```ts
    case 'shopify':
      return resolveShopifyGrouped(b, ctx, dateRange, compareRange)
```
In `resolveSeries`, replace `default: throw new Error(...)` with:
```ts
    case 'shopify':
      return resolveShopifySeries(b, granularity, ctx, dateRange, compareRange)
```
(All three sources now covered → switch is exhaustive.)

- [ ] **Step 6: Typecheck + lint + commit**

Run: `npx tsc --noEmit` → clean. Run: `npx eslint lib/dashboard/adapters/shopify.ts lib/dashboard/registry.ts` → clean.
```bash
git add lib/dashboard/adapters/shopify.ts lib/dashboard/adapters/shopify.test.ts lib/dashboard/registry.ts
git commit -m "feat(dashboard): Shopify grouped + series adapters, wired into registry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Allow Shopify in bar/line/table block builders

**Files:**
- Modify: `components/dashboard/add-block/build-config.ts`
- Modify: `components/dashboard/add-block/build-config.test.ts`

**Interfaces:**
- Consumes: `ShopifyBinding.dimensions/granularity` (T3).

- [ ] **Step 1: Write the failing test**

In `components/dashboard/add-block/build-config.test.ts`, append:
```ts
// bar with a Shopify leaf attaches the dimension to the shopify binding
{
  const cfg = buildBlockConfig({ kind: 'bar', name: 'Sales by Channel', format: 'currency',
    bar: { source: 'bar', leaf: { source: 'shopify', query: 'FROM sales SHOW net_sales' }, dimension: 'sales_channel' } })
  assert.equal(cfg.kind, 'bar')
  assert.equal(cfg.binding.source, 'shopify')
  if (cfg.binding.source === 'shopify') assert.deepEqual(cfg.binding.dimensions, ['sales_channel'])
}
// line with a Shopify leaf attaches the granularity
{
  const cfg = buildBlockConfig({ kind: 'line', name: 'Sales/day', format: 'currency',
    line: { source: 'line', leaf: { source: 'shopify', query: 'FROM sales SHOW net_sales' }, granularity: 'day' } })
  assert.equal(cfg.binding.source, 'shopify')
  if (cfg.binding.source === 'shopify') assert.equal(cfg.binding.granularity, 'day')
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: FAIL — currently `barToBlockConfig`/`lineToBlockConfig` throw for shopify.

- [ ] **Step 3: Remove the guards**

In `components/dashboard/add-block/build-config.ts`, delete the three guard lines added during the merge — in `barToBlockConfig`, `lineToBlockConfig`, and `tableToBlockConfig` remove:
```ts
  if (base.source === 'shopify') throw new Error('Shopify is not supported for bar blocks')
```
```ts
  if (base.source === 'shopify') throw new Error('Shopify is not supported for line blocks')
```
```ts
  if (base.source === 'shopify') throw new Error('Shopify is not supported for table blocks')
```
The `{ ...base, dimensions: [d.dimension] }` / `{ ...base, granularity: d.granularity }` spreads now typecheck because `ShopifyBinding` carries those optional fields (T3). Also drop the now-stale `// SM/TW carry … Shopify … narrow it out` comment in `barToBlockConfig`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: `ok`.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts
git commit -m "feat(dashboard): build Shopify bar/line/table configs (dimension/granularity)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Persist Shopify dimensions/granularity

**Files:**
- Modify: `lib/dashboard/persistence.ts`
- Modify: `lib/dashboard/persistence.test.ts`

**Interfaces:**
- Consumes: `SHOPIFY_DIM_RE` (T2), `ShopifyBinding.dimensions/granularity` (T3).

- [ ] **Step 1: Write the failing test**

In `lib/dashboard/persistence.test.ts`, append:
```ts
// shopify grouped binding: dimension round-trips (safe column)
{
  const r = parseBlockConfig(block({ source: 'shopify', query: 'FROM sales SHOW net_sales', dimensions: ['sales_channel'] }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'shopify') assert.deepEqual(r.block.binding.dimensions, ['sales_channel'])
}
// shopify series binding: granularity round-trips
{
  const r = parseBlockConfig(block({ source: 'shopify', query: 'FROM sales SHOW net_sales', granularity: 'week' }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'shopify') assert.equal(r.block.binding.granularity, 'week')
}
// shopify: unsafe dimension rejected; length-2 rejected; bad granularity rejected
assert.equal(parseBlockConfig(block({ source: 'shopify', query: 'q', dimensions: ['bad; drop'] })).ok, false)
assert.equal(parseBlockConfig(block({ source: 'shopify', query: 'q', dimensions: ['a', 'b'] })).ok, false)
assert.equal(parseBlockConfig(block({ source: 'shopify', query: 'q', granularity: 'minute' })).ok, false)
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: FAIL — dimensions/granularity dropped, so `deepEqual`/`equal` mismatch (and the unsafe cases currently parse `ok:true`).

- [ ] **Step 3: Implement**

In `lib/dashboard/persistence.ts`, add the `SHOPIFY_DIM_RE` import:
```ts
import { SHOPIFY_DIM_RE } from '@/lib/shopify/catalog'
```
Replace the shopify branch of `parseLeaf` (currently builds `{ source: 'shopify', query: v.query }`) with dimension/granularity parsing mirroring the SM branch:
```ts
  if (v.source === 'shopify') {
    if (!isNonEmptyStr(v.query)) return { ok: false, error: `${path}.query: expected non-empty string` }
    const b: ShopifyBinding = { source: 'shopify', query: v.query }
    if (v.dimensions !== undefined) {
      if (!Array.isArray(v.dimensions) || v.dimensions.length !== 1) {
        return { ok: false, error: `${path}.dimensions: expected array of length 1 (v1)` }
      }
      const d = v.dimensions[0]
      if (!isNonEmptyStr(d) || !SHOPIFY_DIM_RE.test(d)) {
        return { ok: false, error: `${path}.dimensions[0]: expected safe Shopify column (matching ^[a-z0-9_]+$)` }
      }
      b.dimensions = [d]
    }
    if (v.granularity !== undefined) {
      if (!GRANULARITIES.includes(v.granularity as Granularity)) {
        return { ok: false, error: `${path}.granularity: expected one of ${GRANULARITIES.join(',')}` }
      }
      b.granularity = v.granularity as Granularity
    }
    return { ok: true, value: b }
  }
```
(`GRANULARITIES` and `Granularity` are already used by the SM/TW branches in this file.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: `ok`.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add lib/dashboard/persistence.ts lib/dashboard/persistence.test.ts
git commit -m "feat(dashboard): persist Shopify dimensions + granularity

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Shopify-aware dimension picker

**Files:**
- Modify: `components/dashboard/add-block/dimension-picker.tsx`

**Interfaces:**
- Consumes: `SHOPIFY_DIMENSIONS` (T2). Used by `BarBuilder` and `TableBuilder` (both render `<DimensionPicker leaf=…>` already — no builder changes needed).

- [ ] **Step 1: Make the change**

In `components/dashboard/add-block/dimension-picker.tsx`, import the catalog and add a Shopify option list:
```ts
import { SHOPIFY_DIMENSIONS } from '@/lib/shopify/catalog'
```
Add near `TW_DIMENSION_OPTIONS`:
```ts
const SHOPIFY_DIMENSION_OPTIONS: ComboOption[] = SHOPIFY_DIMENSIONS.map((d) => ({ value: d.id, label: d.label }))
```
Change the `options` selection to include Shopify (currently `leaf.source === 'triplewhale' ? TW_DIMENSION_OPTIONS : smDimOpts`):
```ts
  const options =
    leaf.source === 'shopify' ? SHOPIFY_DIMENSION_OPTIONS
    : leaf.source === 'triplewhale' ? TW_DIMENSION_OPTIONS
    : smDimOpts
```
The `disabled` flag stays SM-only (`leaf.source === 'supermetrics' && dsId === ''`), so Shopify is always enabled with its curated list.

- [ ] **Step 2: Typecheck + lint + build**

Run: `npx tsc --noEmit` → clean. Run: `npx eslint components/dashboard/add-block/dimension-picker.tsx` → clean. Run: `npm run build` → succeeds.

- [ ] **Step 3: Manual smoke (executor note)**

Dev server with Shopify creds (from the kindpatches checkout) on `/dashboard/kind-patches/configurable-dashboard`: Add block → Bar → Shopify → pick a metric + a curated dimension (e.g. Sales Channel) → Save → bar renders grouped data. Repeat: Line → Shopify → metric + granularity (day) → series renders. (Live; creds required.)

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/add-block/dimension-picker.tsx
git commit -m "feat(dashboard): Shopify curated dimensions in the dimension picker

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** raw-table client (T1); dimension catalog + guard (T2); binding fields (T3); dialog sources (T4); grouped/series adapters + registry (T5); build-config binders (T6); persistence (T7); dimension picker UX (T8). ✅
- **Placeholder scan:** none — full code in every step; the adapters' resolve fns are integration-verified live (manual smoke in T8) while the pure row-parsers are unit-tested (T5).
- **Type consistency:** `runShopifyQlTable` return `TableData` consumed by `groupRowsFromShopify`/`seriesPointsFromShopify`; `ShopifyBinding.dimensions/granularity` (T3) used by adapters (T5), build-config (T6), persistence (T7); `SHOPIFY_DIM_RE` (T2) used by adapters (T5) + persistence (T7); `SHOPIFY_DIMENSIONS` (T2) used by the picker (T8); registry switch becomes exhaustive over supermetrics/triplewhale/shopify. ✅
- **Live-verified syntax:** `GROUP BY <dim>` / `GROUP BY day|week|month` appended before SINCE/UNTIL; values string→number; series asc-sorted — all per the probes. ✅
- **Parallelization:** Wave 1 (T1–T4) disjoint; Wave 2 (T5–T8) disjoint, consuming Wave 1 via the locked contracts. ✅
