# TripleWhale Discovery + Dimension Filtering — Design

**Date:** 2026-06-23
**Status:** Approved (pending spec review)
**Relates to:** the manual query builder (`2026-06-23-manual-query-builder-design.md`) — this makes the builder's TripleWhale leaf discovery-driven, mirroring the Supermetrics side.

## Goal

In the dashboard builder, replace TripleWhale's static 9-metric enum with **live discovery** of the real, queryable fields for a client's shop, and let the user **filter** a metric by any dimension (e.g. `channel = facebook-ads`). The user picks a numeric column → `SUM(column)`; ratios (ROAS/CPA) are composed via the existing aggregate path.

## Background / Probe Findings (verified against `bright-patches.myshopify.com`)

TripleWhale data is queried through the Orcabase SQL API
(`POST https://api.triplewhale.com/api/v2/orcabase/api/sql`, body `{ shopId, query, period }`),
over the `pixel_joined_tvf(...)` table-valued function. Verified:

- **`DESCRIBE pixel_joined_tvf(...)`** returns the column schema: **138 rows** of
  `{ name, type, ... }` where `type` is a ClickHouse type, e.g. `Nullable(Float64)`,
  `Nullable(String)`, `Nullable(Date)`. This is the authoritative typed field list.
  (Note: `SELECT *` returned 178 columns vs DESCRIBE's 138 — a discrepancy, likely
  computed/arg-dependent columns; **DESCRIBE is the authoritative basis** for the
  field list.)
- **Numeric columns** (`Int*`/`UInt*`/`Float*`/`Decimal*`) are the metric candidates
  (e.g. `spend`, `clicks`, `impressions`, `channel_reported_conversion_value`).
  **String columns** are the dimension/filter candidates (e.g. `channel`,
  `campaign_status`, `campaign_name`, `account_id`).
- **`SELECT DISTINCT channel ...`** → `applovin, facebook-ads, google-ads, klaviyo,
  snapchat-ads, tiktok-ads`. Low-cardinality, real values.
- **`SUM(spend) WHERE channel = 'facebook-ads'`** → `$1,010,467` ✓; but
  `channel = 'meta'` → `0`. **The actual distinct values must be discovered, never
  guessed.**
- Date `@startDate`/`@endDate` placeholders substitute correctly from the `period`
  body field (verified: inline-date and placeholder queries return identical sums).

This is **client-agnostic by construction**: discovery runs `DESCRIBE`/`DISTINCT`
against whatever shop id is configured on the client, at runtime, cached per shop.
Pointing a client at a different shop id surfaces that shop's fields automatically.

## Scope

**In scope (v1):**
- Discovery of `pixel_joined_tvf` **metric** columns (numeric) and **dimension**
  columns (string) for a client's shop.
- Lazy discovery of a dimension's **distinct values**.
- The builder's TripleWhale leaf: searchable metric picker + add/remove **equality
  filter rows** (dimension + value), AND-combined.
- Generic `SUM(column)` aggregation; back-compat alias map for existing/NL metrics.

**Out of scope (v1):**
- A standalone TripleWhale "explorer" UI (this is builder-only).
- Populated-ness filtering (offer all numeric columns; a chosen column may sum to 0).
- Other TW tables/TVFs (`ads_table`, `custom_categories_table`, orders, …) — only
  `pixel_joined_tvf`.
- Non-equality operators, multiple values per dimension (IN/OR) — equality, AND-only.
- NL-path changes (it rides the back-compat alias map).
- Attribution-window / model selection in the UI (keeps the current hardcoded
  `attribution_window = '7_days'`, `model = 'Triple Attribution'`).

## Decisions (confirmed with user)

1. **Discovery for the builder** (not a standalone explorer).
2. **Discovered columns only**, each `SUM(column)`; ratios via the aggregate path;
   searchable picker (reuse `SearchCombobox`).
3. **All numeric columns** offered (no populated filtering).
4. **General dimension filtering**: any dimension + value, equality, AND-combined.

## Architecture

```
LeafBuilder (TripleWhale branch)
  ├─ load getTwFields(slug)          → { metrics[], dimensions[] }   (on mount)
  ├─ Metric: SearchCombobox(metrics) → SUM(column)
  └─ Filters: rows of
        Dimension SearchCombobox(dimensions)
        Value     SearchCombobox(getTwDimensionValues(slug, column))  (lazy)
        [+ add filter] / remove
        → emits LeafDraft.filters: { column, value }[]

server actions (app/actions/dashboard.ts; auth + canEditDashboard gated)
  getTwFields(slug)                  → twFields(apiKey, shopId)        [cached/shop]
  getTwDimensionValues(slug, column) → twDistinctValues(apiKey, shopId, column) [cached/shop+col]

discovery client (lib/triplewhale/discovery.ts)
  twFields(apiKey, shopId)            → DESCRIBE → { metrics, dimensions }
  twDistinctValues(apiKey, shopId, c) → SELECT DISTINCT c ... LIMIT 200

adapter/query (lib/triplewhale/queries.ts + adapters/triplewhale.ts)
  buildMetricSql(metric, filters?) → <expr> + WHERE dates/attribution + AND col='val' …
  expr = TW_METRIC_SQL[metric] ?? SUM(<sanitized column>)
```

## Components & Interfaces

### `lib/triplewhale/discovery.ts` (NEW)
```ts
export interface TwField { value: string; label: string }       // value = column name
export interface TwFields { metrics: TwField[]; dimensions: TwField[] }

// type strings from DESCRIBE, e.g. "Nullable(Float64)" / "Nullable(String)"
export function parseColumns(describeRows: unknown): TwFields   // pure
export function isNumericType(t: string): boolean               // /(?:U?Int|Float|Decimal)/i after unwrapping Nullable(...)

export async function twFields(apiKey: string, shopId: string, fetchImpl?): Promise<TwFields>
export async function twDistinctValues(apiKey: string, shopId: string, column: string, fetchImpl?): Promise<string[]>
```
- `twFields`: runs `DESCRIBE pixel_joined_tvf(<standard args>)` via the existing
  `twSql` (pass a recent date window for the required `period`); `parseColumns`
  splits numeric→metrics, string→dimensions; humanize labels (`channel_reported_conversion_value` → "Channel reported conversion value").
- `twDistinctValues`: `SELECT DISTINCT <sanitizedCol> AS value FROM pixel_joined_tvf(...)
  WHERE event_date BETWEEN @startDate AND @endDate ORDER BY value LIMIT 200`; drop
  nulls; return strings. Column sanitized (`^[a-z0-9_]+$`) — throw on violation.
- The standard `pixel_joined_tvf(...)` args + the recent window live in one shared
  constant reused by `queries.ts`.

### `app/actions/dashboard.ts` (MODIFY)
```ts
export async function getTwFields(slug: string):
  Promise<{ ok: true; fields: TwFields } | { ok: false; error: string }>
export async function getTwDimensionValues(slug: string, column: string):
  Promise<{ ok: true; values: string[] } | { ok: false; error: string }>
```
- Same gate as `proposeBlock`/`getMetricOptions`: `auth()` → `canEditDashboard` →
  else `forbidden`/`unauthenticated`.
- Resolve `process.env.TRIPLE_WHALE_API_KEY` + `(await getClientBySlug(slug))?.triplewhaleShopId`;
  if either missing → `{ ok:false, error:'disconnected' }`.
- Wrap discovery calls in `unstable_cache` keyed including the shop id (and column),
  `revalidate: 3600`; never throw to the client (catch → `{ ok:false, error }`).

### `lib/triplewhale/queries.ts` (MODIFY)
- Keep `TwMetric` + `TW_METRIC_SQL` as a **curated alias map** (back-compat for the
  NL path and existing saved blocks; includes the `channel_reported_conversion_value`
  revenue fix). `isTwMetric` unchanged.
- Add:
  ```ts
  export function isSafeColumn(c: string): boolean   // ^[a-z0-9_]+$ (case-insensitive)
  export function escapeSqlValue(v: string): string  // v.replace(/'/g, "''")
  export interface TwFilter { column: string; value: string }
  export function buildMetricSql(metric: string, filters?: TwFilter[]): string
  ```
- `buildMetricSql` resolves `expr = TW_METRIC_SQL[metric] ?? \`SUM(${col})\`` where
  `col` must pass `isSafeColumn` (else throw `TwQueryError('unsafe metric')`). Appends
  `AND <col> = '<escapeSqlValue(value)>'` per filter (each column `isSafeColumn`-checked).
  Same `FROM pixel_joined_tvf(...)` + `WHERE event_date BETWEEN @startDate AND @endDate
  AND attribution_window = '7_days' AND model = 'Triple Attribution'` base as today.

### `lib/dashboard/adapters/triplewhale.ts` (MODIFY)
- Drop the `isTwMetric` hard-gate (arbitrary columns are now valid); rely on
  `buildMetricSql`'s `isSafeColumn` check. Pass `b.filters` into `buildMetricSql`.

### `lib/dashboard/types.ts` + `lib/dashboard/persistence.ts` (MODIFY)
- `TripleWhaleBinding` gains `filters?: { column: string; value: string }[]`.
- `persistence.ts` validates `filters` when present: array of objects with non-empty
  string `column` + string `value`.

### `components/dashboard/add-block/build-config.ts` (MODIFY)
- `LeafDraft` triplewhale variant: `{ source:'triplewhale'; metric: string; filters: { column: string; value: string }[] }`.
- `leafToBinding` carries `filters` through (omit when empty). `isLeafComplete`
  (triplewhale) still only requires `metric` (filters optional).

### `components/dashboard/add-block/leaf-builder.tsx` (MODIFY)
- TripleWhale branch becomes discovery-driven:
  - Load `getTwFields(slug)` (loading / `disconnected` error → free-text metric input fallback).
  - Metric `SearchCombobox` over `fields.metrics`.
  - Filter rows: `fields.dimensions` `SearchCombobox` for the column; on column pick,
    lazily `getTwDimensionValues(slug, column)` → value `SearchCombobox` (with
    free-text fallback for high-cardinality dimensions). `+ add filter` / remove.
  - All hooks unconditional (rules of hooks); TW loads on mount, not on a dsId change.
- Given the added surface, the TripleWhale branch may be extracted into a
  `TwLeafFields` sub-component for focus (controller's discretion in the plan).

## Data Flow

pick TripleWhale → `getTwFields` → choose metric column + optional filters →
`LeafDraft` → `buildBlockConfig` → `TripleWhaleBinding { metric, filters }` →
`addBlock` → `saveDashboardConfig`. At render, `resolveTripleWhaleLeaf` →
`buildMetricSql(metric, filters)` → `twSql` → value.

## Error / Loading / Empty States

- Loading spinner while fields / values load; metric+filter controls disabled until ready.
- `disconnected` (no key or no shop id) → inline message + free-text metric/value
  inputs so a block can still be authored.
- Unsafe column/value at query time → `TwQueryError` → mapped to `invalid-metric`.
- A filter that matches nothing → the metric sums to 0 (rendered as 0/no-data), not an error.

## Testing

Env-free `tsx`/`node:assert` pure tests:
- `lib/triplewhale/discovery.test.ts` — `isNumericType` (Nullable unwrap; Int/Float/Decimal vs String/Date), `parseColumns` (numeric→metrics, string→dimensions), against a captured DESCRIBE fixture.
- `lib/triplewhale/queries.test.ts` (extend) — `buildMetricSql`: curated alias → its expression; raw column → `SUM(col)`; unsafe column → throws; filters → `AND col = 'val'` with `'`-escaping; existing assertions preserved.
- `build-config.test.ts` (extend) — triplewhale `LeafDraft` with `filters` → binding carries them; `isLeafComplete` ignores empty filters.

UI (`leaf-builder.tsx`) verified by `tsc` + manual, per existing convention.

## File Structure
```
lib/triplewhale/
  discovery.ts                 # NEW: twFields, twDistinctValues, parseColumns, isNumericType
  discovery.test.ts            # NEW
  queries.ts                   # MODIFY: generic SUM + filters + isSafeColumn/escapeSqlValue
  queries.test.ts              # MODIFY
lib/dashboard/
  adapters/triplewhale.ts      # MODIFY: pass filters; drop isTwMetric gate
  types.ts                     # MODIFY: TripleWhaleBinding.filters?
  persistence.ts               # MODIFY: validate filters
app/actions/
  dashboard.ts                 # MODIFY: getTwFields, getTwDimensionValues
components/dashboard/add-block/
  build-config.ts              # MODIFY: LeafDraft.filters; leafToBinding
  build-config.test.ts         # MODIFY
  leaf-builder.tsx             # MODIFY: discovery-driven TW branch + filter rows
```

## Global Constraints
- TypeScript strict; no `any` in new files.
- All TripleWhale calls server-side only; the discovery client is imported as a value
  only by the server actions, never a `'use client'` file (`import type` only there).
- Reuse `auth`, `canEditDashboard`, `getClientBySlug`, `twSql`, `TwQueryError`,
  `SearchCombobox`, `unstable_cache`.
- SQL safety: every interpolated column passes `isSafeColumn`; every value passes
  `escapeSqlValue`. Enforced in the adapter/query layer (defense even if a persisted
  binding is hand-edited).
- No new npm dependency.
