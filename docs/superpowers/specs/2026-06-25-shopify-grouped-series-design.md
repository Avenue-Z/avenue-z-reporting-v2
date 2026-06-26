# Shopify Grouped + Series Blocks — Design

**Status:** Approved · 2026-06-25
**Branch:** `feat/shopify-grouped-series` (off `feat/tc-dashboard-self-service-dash-system`)

## Goal

Let Shopify (ShopifyQL) power **all** dashboard block kinds — not just KPI/pills. Add
grouped resolution (bar, table — split by a dimension) and series resolution (line —
split by a time bucket) for the Shopify data source, with a structured builder UX
(pick a curated metric + a curated dimension / a granularity), mirroring how
Supermetrics and TripleWhale already work.

## Background

A Shopify binding today is `{ source: 'shopify', query: string }` — a ShopifyQL body
(`FROM sales SHOW net_sales …`) with no date clause. `runShopifyQl` appends
`SINCE/UNTIL`, runs `shopifyqlQuery` over the Admin GraphQL API, and returns
`sumFirstColumn(tableData)` — a scalar. The leaf builder offers a curated metric
dropdown (`SHOPIFY_METRICS`) plus a custom-ShopifyQL escape hatch. `resolveShopifyLeaf`
handles KPI/pills. `registry.ts`'s `resolveGrouped`/`resolveSeries` currently throw for
`shopify` (leaf-only).

## Verified ShopifyQL behavior (live, against `bright-patches`)

- **Grouped:** `FROM sales SHOW net_sales GROUP BY sales_channel SINCE … UNTIL …`
  → columns `[sales_channel, net_sales]`, rows `{sales_channel, net_sales}` (sorted value-desc).
- **Series:** `… GROUP BY day|week|month …` → columns `[day|week|month, net_sales]`,
  bucket is an ISO date (day: full date; week/month: period-start date). ShopifyQL's
  `day`/`week`/`month` map 1:1 to our `Granularity` type.
- Metric values come back as **strings** (need `Number()`); series rows are **not**
  date-sorted (need ascending re-sort).
- **Valid curated dimensions** (verified): `sales_channel`, `product_type`,
  `billing_country`, `billing_region`, `new_or_returning_customer`, `product_title`.
  (`referrer_name`/`payment_method` don't exist; `utm_*` need attribution syntax;
  `order_name`/`discount_code` are too high-cardinality for charts — excluded.)

## Non-Goals

- Shopify `utm_*`/attribution-syntax dimensions (separate, needs ShopifyQL `WITH` clauses).
- High-cardinality dimensions (order_name, discount_code) in the curated picker.
- Changing the existing scalar leaf path or the curated metric catalog.

## Architecture

### Unit 1: raw-table client — `lib/shopify/client.ts`

Add `runShopifyQlTable(args): Promise<TableData>` that performs the existing GraphQL
fetch + parse-error handling and returns the raw `TableData` (columns + rows).
Refactor `runShopifyQl` to call it and apply `sumFirstColumn` (no behavior change to
the scalar path). `buildShopifyQl` is reused unchanged.

### Unit 2: dimension catalog — `lib/shopify/catalog.ts`

Add `SHOPIFY_DIMENSIONS: { id: string; label: string }[]` with the 6 verified dims:
```ts
export const SHOPIFY_DIMENSIONS = [
  { id: 'sales_channel',             label: 'Sales Channel' },
  { id: 'product_type',              label: 'Product Type' },
  { id: 'product_title',             label: 'Product' },
  { id: 'billing_country',           label: 'Country' },
  { id: 'billing_region',            label: 'Region' },
  { id: 'new_or_returning_customer', label: 'New vs Returning' },
] as const
```
A `SHOPIFY_DIM_RE = /^[a-z0-9_]+$/` guards any dimension before interpolation (defense
in depth, mirroring the SM/TW column guards).

### Unit 3: binding shape — `lib/dashboard/types.ts`

Extend `ShopifyBinding` (additively):
```ts
export interface ShopifyBinding {
  source: 'shopify'
  query: string            // ShopifyQL body, no date/GROUP BY clause
  dimensions?: string[]    // grouped mode: single dim (v1), GROUP BY <dim>
  granularity?: Granularity // series mode: GROUP BY day|week|month
}
```

### Unit 4: adapters — `lib/dashboard/adapters/shopify.ts`

`resolveShopifyGrouped(b, ctx, dateRange, compareRange): Promise<GroupedRow[]>`
- Require `b.dimensions?.length === 1`; guard the dim with `SHOPIFY_DIM_RE`.
- Build `${b.query} GROUP BY ${dim}`; run `runShopifyQlTable` per range.
- Parse rows: `dim = String(row[cols[0]])`, `value = Number(row[cols[1]])` (col0 is the
  GROUP BY column, col1 the metric); coerce non-finite → 0.
- Fetch current + (optional) compare ranges concurrently; combine via the existing
  `joinGrouped(current, prior, dimKey)`.

`resolveShopifySeries(b, granularity, ctx, dateRange, compareRange): Promise<SeriesPoint[]>`
- Build `${b.query} GROUP BY ${granularity}`; run per range.
- Parse rows: `bucket = String(row[cols[0]]).slice(0,10)`, `value = Number(row[cols[1]])`;
  sort ascending by bucket.
- Fetch current + compare; combine via the existing `alignSeries`.

Both reuse `resolveShopifyCreds` + `DisconnectedError`, dynamic date imports, and the
same structure as the TripleWhale grouped/series adapters.

### Unit 5: registry — `lib/dashboard/registry.ts`

Replace the `default: throw` in `resolveGrouped`/`resolveSeries` with a `case 'shopify'`
dispatching to the new adapters.

### Unit 6: builders + dialog

- `add-block-dialog.tsx`: add `{ value: 'shopify', label: 'Shopify (ShopifyQL)' }` to the
  `bar`, `line`, and `table` entries of `SOURCES_BY_KIND`.
- `build-config.ts`: remove the three `if (base.source === 'shopify') throw` guards in
  `barToBlockConfig`/`lineToBlockConfig`/`tableToBlockConfig` (Shopify now supports
  dimensions/granularity, so the `{ ...base, dimensions }` / `{ ...base, granularity }`
  spreads are valid once `ShopifyBinding` carries those fields).
- Bar/Table dimension picker: when the leaf source is Shopify, the dimension control
  offers `SHOPIFY_DIMENSIONS` (a select) instead of the free-text SM column / TW combo.
  Line's granularity picker (day/week/month) is source-agnostic — unchanged.

### Unit 7: persistence — `lib/dashboard/persistence.ts`

In the Shopify branch of `parseLeaf`, parse optional `dimensions` (array length 1, each
matching `SHOPIFY_DIM_RE`) and `granularity` (one of `day|week|month`), mirroring the
SM/TW handling.

## Error Handling

- No creds → `DisconnectedError` (existing). ShopifyQL parse errors → `ShopifyQlError`
  (existing), surfaced as the block's error card via the resolver's `mapError`.
- Empty result → grouped/series return `[]`; the block bodies already render their
  `no-data` state.

## Testing

- **Unit (tsx + node:assert):** ShopifyQL build (`GROUP BY <dim>` / `GROUP BY <granularity>`
  appended in the right position, before SINCE/UNTIL); row parsing (string→number,
  series asc sort); `SHOPIFY_DIM_RE` guard; persistence round-trip for `dimensions`/
  `granularity` on a Shopify binding.
- **Typecheck/lint/build:** `tsc`, eslint, `npm run build`.
- **Live verification:** probe `bright-patches` for a grouped (bar) and a series (line)
  query end-to-end (creds from the kindpatches checkout) to confirm real data renders.

## Risks / Edge Cases

- **Column order assumption:** parsing assumes col0 = GROUP BY field, col1 = metric.
  Verified true for single-metric ShowQL; guard by reading `cols[0]` (dim) and the
  remaining column as value.
- **High-cardinality dims:** excluded from the curated list; if a custom ShopifyQL leaf
  is grouped by a huge dim, the table/bar may be large — acceptable (curated picker is
  the default path).
- **Custom ShopifyQL + grouping:** a custom leaf query must not already contain its own
  `GROUP BY`/date clause (same contract as today's leaf). Documented in the builder hint.
- **Series bucket labels:** `toLineChartInput` formats buckets via `parseISO` + the
  granularity pattern; ShopifyQL's ISO buckets parse cleanly.
