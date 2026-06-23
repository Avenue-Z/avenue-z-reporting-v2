# Supermetrics Dimension Filters — Design

**Date:** 2026-06-23
**Status:** Approved (pending spec review)
**Relates to:** the manual query builder (`2026-06-23-manual-query-builder-design.md`) and the TripleWhale dimension-filter feature (`2026-06-23-triplewhale-discovery-design.md`). This brings the **same dimension-filter pattern to the Supermetrics leaf**, which today has none.

## Goal

Let an editor filter a Supermetrics metric by one or more dimension values in the
builder — e.g. Shopify `total_sales` where `order_shipping_country == United States`.
Mirrors the TripleWhale filter UX (structured filter rows, discovered dimensions +
values), so the builder is consistent across sources.

## Background / Spike Findings (verified against the live API)

- **Filter grammar** (from the Supermetrics `data_query` tool schema): a string
  `field operator value`, combined with `AND` / `OR`. Operators: `==`, `!=`, `>`,
  `>=`, `<`, `<=`, `=@` (contains), `!@`, `=~`, `!~`, `[]` (in-list). Example:
  `"country == US AND clicks > 100"`. The query endpoint already accepts this as the
  `filter` field (an invalid string returns `FILTER_STRING_INVALID`).
- **Value discovery works** by querying the dimension *as a field*: a query with
  `fields=[order_shipping_country, total_sales]` returned per-value rows
  (`United States` $12.5M, `Canada` $43k, …). So a dimension's distinct values are
  obtained by selecting it as a field and reading the rows.
- **Dimension discovery** already exists: `GET /query/fields` returns `ds_dimension`
  rows (e.g. `order_shipping_country` for Shopify); today the SM discovery client
  keeps only `ds_metric`.
- **Plumbing already exists:** `SupermetricsBinding.filters?: string` already flows
  to `smQuery`'s `filter` param (`SmQueryParams.filters: string`). It is currently an
  unstructured, unvalidated, UI-less passthrough — this design replaces it with a
  structured shape and builds the string in the adapter.

### Open risks (carried into the plan, not design blockers)

1. **Value quoting/escaping** for multi-word/special values (e.g. `United States`).
   The grammar is known; the exact quoting (`col == value` vs `col == "value"` vs an
   escaped form) was not nailed empirically (Shopify queries were slow/async during
   the spike). **The first plan task confirms the quoting against the live API and
   implements `buildSmFilter` accordingly.**
2. **Shopify report types.** Some Shopify dims/fields carry `report_types` (e.g.
   `order_shipping_country` → types 1,2,5); a metric + dimension must share a report
   type. This is **Shopify-specific** (FA/AW/GA4/LIA have no report types). Out of
   scope here; flagged for a later report-type feature. For non-Shopify sources the
   filter works without it; for Shopify, filters work where the chosen metric +
   dimension already share the default report type, else the query errors (surfaced
   as `invalid-metric`, never a crash).

## Scope

**In scope (v1):**
- Structured dimension filters on the **Supermetrics** leaf: `{ column, value }[]`,
  equality (`==`), AND-combined.
- Discovery of SM **dimensions** (per data source) and a **dimension's distinct
  values** (per data source + account).
- Builder UI: add/remove filter rows on the Supermetrics leaf (dimension + value),
  matching the TripleWhale leaf.

**Out of scope (v1):**
- Non-equality operators and the `[]` in-list / OR combiner (documented; natural
  follow-up — also what multi-channel TripleWhale spend will need).
- Shopify report-type selection.
- Calculated / multi-term metrics (the per-country tax-adjusted revenue formula).
- Aggregate-operand dimension filters beyond what the reused leaf builder provides
  (operands already reuse `LeafBuilder`, so they inherit SM filters automatically).

## Decisions (confirmed with user)

1. Add Supermetrics dimension filters, **mirroring the TripleWhale filter pattern**.
2. Equality (`==`), AND-combined, for v1.

## Architecture

```
LeafBuilder (Supermetrics branch)
  dsId <select> ──▶ getMetricOptions (metrics)  [existing]
              ├──▶ getAccountOptions (accounts)  [existing]
              └──▶ getSmDimensions(slug, dsId)   [new] → dimension list
  Filter rows: dimension SearchCombobox
               + value SearchCombobox ← getSmDimensionValues(slug, dsId, account, column) [new, lazy]
       → LeafDraft.filters: { column, value }[]

adapter (lib/dashboard/adapters/supermetrics.ts)
  buildSmFilter(filters) → "col == value AND col2 == value2"  (pure, tested)
  sumForRange → smQuery({ ..., filters: buildSmFilter(b.filters) })   (smQuery unchanged, still string)

discovery (lib/supermetrics/discovery.ts)
  parseDimensions(json) → keep @type==='ds_dimension'
  smDimensions(apiKey, dsId) → GET /query/fields → dimensions
  smDimensionValues(apiKey, dsId, account, column, range) → GET /query/data/json
     fields=[column], ds_accounts=[account] → distinct first-column values
```

## Components & Interfaces

### `lib/supermetrics/discovery.ts` (MODIFY)
- `parseDimensions(json): MetricOption[]` — pure; keep `@type === 'ds_dimension'`,
  map to `{ value: field_id, label: field_name||field_id, group: group_name }`
  (reuse the existing `MetricOption` shape; `dataType` unused for dims).
- `smDimensions(apiKey, dsId, fetchImpl?): Promise<MetricOption[]>` — `GET
  /query/fields` (same call shape as `smFields`), `parseDimensions`.
- `smDimensionValues(apiKey, dsId, account, column, range, fetchImpl?): Promise<string[]>` —
  submit a `query/data/json` with `ds_accounts=[account]`, `fields=[column]`,
  `date_range custom (range)`, `max_rows: 100`; via the existing `smQuery`; return
  the deduped non-empty first-column values. `column` sanitized (`^[A-Za-z0-9_]+$`,
  matching SM field-id charset) — throw otherwise.

### `app/actions/dashboard.ts` (MODIFY)
- `getSmDimensions(slug, dsId): Promise<{ ok: true; options: MetricOption[] } | { ok: false; error: string }>`
  — same auth gate + `resolveSmApiKey` + `unstable_cache([dsId, keyHash])` as
  `getMetricOptions`.
- `getSmDimensionValues(slug, dsId, account, column): Promise<{ ok: true; values: string[] } | { ok: false; error: string }>`
  — auth gate + key resolve; cached `['sm-dim-values', dsId, account, column, keyHash]`;
  resolves a recent range via `parseDateRange('last_30_days')`; never throws to client.

### `lib/dashboard/adapters/supermetrics.ts` (MODIFY)
- `buildSmFilter(filters?: { column: string; value: string }[]): string | undefined`
  — pure, exported, tested. Returns `undefined` when empty; otherwise
  `filters.map(f => \`${f.column} == ${f.value}\`).join(' AND ')`, with each `column`
  sanitized (`^[A-Za-z0-9_]+$`, else the filter is dropped/throws) and the value
  encoded per the quoting confirmed in plan Task 1.
- `sumForRange` passes `filters: buildSmFilter(b.filters)` to `smQuery` (smQuery and
  `SmQueryParams.filters: string` are unchanged).

### `lib/dashboard/types.ts` + `persistence.ts` (MODIFY)
- `SupermetricsBinding.filters` changes from `string` to
  `{ column: string; value: string }[]` (optional). This passthrough was never
  surfaced in the UI, so no saved blocks rely on the string form.
- `persistence.ts` validates `filters` as `{ column: non-empty string, value: string }[]`
  (same validator shape as the TripleWhale filters).

### `components/dashboard/add-block/build-config.ts` (MODIFY)
- `LeafDraft` supermetrics variant gains optional
  `filters?: { column: string; value: string }[]`.
- `leafToBinding` (supermetrics branch) carries **cleaned** filters (drop rows with
  empty column/value; omit the key when none) — same rule as the TripleWhale branch.

### `components/dashboard/add-block/leaf-builder.tsx` (MODIFY)
- Supermetrics branch: after the metric + account fields, load `getSmDimensions(slug, dsId)`
  and render **filter rows** — a dimension `SearchCombobox` + a value `SearchCombobox`
  whose options come from `getSmDimensionValues(slug, dsId, account, column)` (lazy on
  column pick), `+ add filter` / remove. Disabled until `dsId` (and, for values,
  `account`) are chosen. Same visual pattern as the TripleWhale `TwFilterRow`; an
  `SmFilterRow` is used because SM values are `dsId`+`account`-scoped (a different
  value loader signature than TW's). Free-text fallback on discovery error, as
  elsewhere.

## Error / Loading / Empty States

- Loading spinners while dimensions/values load; the value control is disabled until
  both a dimension column and an account are selected.
- Discovery failure → inline error; metric/account/dimension/value fall back to
  free-text id entry so a block can still be authored.
- A filter that matches nothing → the metric sums to 0 / no-data (not an error).
- An invalid filter (bad column, or Shopify report-type mismatch) → `SmQueryError` →
  mapped to `invalid-metric`, never a crash.

## Testing

Env-free `tsx`/`node:assert` pure tests:
- `lib/supermetrics/discovery.test.ts` — `parseDimensions` (keeps only
  `ds_dimension`); `smDimensions`/`smDimensionValues` with injected `fetchImpl`
  (incl. unsafe-column rejection, null/empty value filtering).
- a new `buildSmFilter` test (in `lib/dashboard/adapters/supermetrics.test.ts`) —
  empty → undefined; single → `col == value`; multiple → joined by ` AND `; unsafe
  column dropped/handled; value encoding per the confirmed quoting.
- `build-config.test.ts` — supermetrics `LeafDraft` with `filters` → binding carries
  cleaned filters; empty rows dropped.
- `persistence.test.ts` — supermetrics binding round-trips `filters`; malformed rejected.

UI (`leaf-builder.tsx`) verified by `tsc` + manual, per convention.

## File Structure
```
lib/supermetrics/
  discovery.ts                 # MODIFY: parseDimensions, smDimensions, smDimensionValues
  discovery.test.ts            # MODIFY
lib/dashboard/
  adapters/supermetrics.ts     # MODIFY: buildSmFilter; sumForRange uses it
  adapters/supermetrics.test.ts# MODIFY: buildSmFilter tests
  types.ts                     # MODIFY: SupermetricsBinding.filters -> {column,value}[]
  persistence.ts               # MODIFY: validate SM filters
  persistence.test.ts          # MODIFY
app/actions/
  dashboard.ts                 # MODIFY: getSmDimensions, getSmDimensionValues
components/dashboard/add-block/
  build-config.ts              # MODIFY: SM LeafDraft filters; leafToBinding
  build-config.test.ts         # MODIFY
  leaf-builder.tsx             # MODIFY: SM filter rows (SmFilterRow)
```

## Global Constraints
- TypeScript strict; no `any` in new files.
- All Supermetrics calls server-side only; the discovery client is value-imported
  only by the server actions; client components use `import type` only.
- SQL/filter safety: every interpolated dimension column passes `^[A-Za-z0-9_]+$`;
  values are encoded per the confirmed grammar (Task 1). Enforced in `buildSmFilter`
  and `smDimensionValues` (defense even if a persisted binding is hand-edited).
- Reuse `smQuery` (unchanged, string `filter`), `getClientBySlug`, `resolveSmApiKey`,
  `auth`, `canEditDashboard`, `unstable_cache`/`keyHash`, `SearchCombobox`,
  `parseDateRange`.
- No new npm dependency.
