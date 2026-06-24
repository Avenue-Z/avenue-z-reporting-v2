# Resolver Polymorphism — Design (Sub-project #2)

**Status:** Draft v1 — R&D
**Date:** 2026-06-25
**Branch:** `feat/configurable-dashboard-rnd`
**Source:** Sub-project #2 of [2026-06-24-self-service-blocks-and-layout-design.md](./2026-06-24-self-service-blocks-and-layout-design.md)
**Predecessor specs:**
- `2026-06-24-self-service-blocks-and-layout-design.md` (Foundation, shipped on `feat/tc-dashboard-self-service-dash-system`)
- `2026-06-17-configurable-dashboard-design.md` (scalar resolver path, complete)
- `2026-06-18-dashboard-persistence.md` (binding parser, complete)
- `2026-06-23-supermetrics-dimension-filters-design.md` (`getSmFields` returns dimensions; `smDimensionValues` exists)

---

## 1. Summary

Extend the dashboard's data layer from **scalar-only** to **scalar + grouped + time-series** resolution. Today every block ends in a single `{value, prevValue}` pair because both adapters (`resolveSupermetricsLeaf`, `resolveTripleWhaleLeaf`) sum all rows server-side. After this sub-project, the same `LeafBinding` can be resolved in **three modes**:

- **scalar** (kpi blocks): `{value, prevValue?}` — unchanged contract, current path stays load-bearing.
- **grouped** (bar + table blocks): `GroupedRow[]` — one row per dimension value (e.g., one per channel, one per country).
- **series** (line + area blocks): `SeriesPoint[]` — one point per time bucket at a chosen granularity (day/week/month).

This sub-project ships **only the data layer**. No new block kinds, no chart renderers, no UI changes — those land in sub-project #3 (Bar + Line) and #4 (Table + Narrative + Header). After #2 ships, an internal test page can call the new resolvers and inspect the rows/points; the user sees nothing different.

Why ship #2 alone: the contract evolution is the load-bearing decision. Locking it down before any renderer commits to a data shape means #3, #4, and the eventual NL pipeline (#5) all consume a stable surface. Ship the foundation correctly, then layer charts on top with confidence.

---

## 2. Key decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Contract shape | Add `resolveGrouped` and `resolveSeries` **alongside** existing `resolveLeaf` — never replace | Scalar path is in production today (every KPI block). Replacing it would force a migration we don't need. Additive contract means zero risk to existing blocks |
| Binding extension | Add optional `dimensions?: string[]` and `granularity?: 'day' \| 'week' \| 'month'` to `SupermetricsBinding` and `TripleWhaleBinding` | Same binding shape resolves in all three modes — the consumer (renderer) decides which method to call. Cleaner than a discriminated `BindingMode` union |
| Resolver dispatch | New top-level `resolveGroupedBlock` and `resolveSeriesBlock` siblings to `resolveBlock`, all in `lib/dashboard/resolve.ts` | One file owns the public resolve API. Same `BlockConfig`/`global`/`ctx` parameters across all three for caller symmetry |
| Aggregate + calculated in non-scalar modes | **Not supported in v1.** `resolveGrouped`/`resolveSeries` accept `LeafBinding` only; aggregate/calculated bindings throw `invalid-metric` if invoked in those modes | Aggregating a bar chart's rows ("ROAS by channel where ROAS is `revenue / spend`") requires aligning two groupings — out of scope. Track in v2 |
| Compare semantics | Same rule everywhere: `prevValue` (scalar) / `prev` field per row or point (grouped/series) present **iff** `compareRange` is set and the comparison query succeeds | One mental model. No special cases per mode |
| Compare alignment (grouped) | Outer-join by dimension key. Dim values present in only one side carry `value` or `prevValue` undefined respectively | Channel that didn't run last period still appears with current value + no delta; honest representation |
| Compare alignment (series) | Inner-aligned by bucket index, NOT by absolute date | A 30-day current range vs. its 30-day prior period: bucket 0 of current pairs with bucket 0 of prior. "Day 1 vs day 1" comparison matches how the rest of the platform reads time |
| Caching | New cache key namespaces: `sm-grouped`, `sm-series`. Same 1-hour TTL via `unstable_cache`. Cache keys include dimensions list (sorted, joined) and granularity so grouped and series queries never collide with scalar | Three modes, three caches. Sorted-joined dimensions avoid order-dependence cache misses |
| Drift guard | Existing `accountDrift` runs identically across modes — applied once to the union of accounts seen across current + compare fetches | Account-set rule is invariant to resolution mode |
| SM time dimension | Map per DS in a new `SM_TIME_DIMENSION` constant. Validated against live for GA4/Google Ads/Meta/Shopify (the four DSes paid-media uses) | SM uses display-name keys ("Date", "Week (Mon-Sun)", "Month") which vary per DS. A constant table is the only safe path |
| TW SQL grouping | Extend `buildMetricSql` with optional `groupBy` (single column for grouped) and `bucket` (`DATE_TRUNC` for series). Reuse existing `isSafeColumn` allowlist | TW SQL is hand-built; column allowlist is already there for filters. Same pattern |
| Series gap-filling | **No gap-fill in v1.** If a bucket has no rows, the bucket is omitted from the result. Recharts renders gaps cleanly as discontinuities | Filling with zero hides real "no data" cases. Decision revisited if analysts request continuous lines |
| Multi-dimension grouping | **Not supported in v1.** `dimensions` is typed as `string[]` for forward compat, but the length-1 invariant is enforced at parse time | One dimension covers every deck slide. Multi-dim (country × channel matrix) is a v2 ask, almost certainly for tables |

### Architecture: three-mode adapter, parallel dispatch

```
                ┌───────────────────────────────────────┐
                │  BlockConfig { binding, range, ... }  │
                └───────────────────┬───────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       │ SCALAR                     │ GROUPED                    │ SERIES
       │ resolveBlock()             │ resolveGroupedBlock()      │ resolveSeriesBlock()
       │ (unchanged)                │ (new)                      │ (new)
       │                            │                            │
       │ — attemptLeaf via          │ — leaf-only;               │ — leaf-only;
       │   adapter.resolveLeaf      │   adapter.resolveGrouped   │   adapter.resolveSeries
       │ — supports aggregate +     │ — current + compare        │ — current + compare
       │   calculated paths         │   outer-joined by dim       │   aligned by bucket idx
       │ — returns ResolveResult    │ — returns GroupedResult    │ — returns SeriesResult
       └────────────────────────────┴────────────────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  │ adapter (per source)              │
                  │  resolveLeaf     → sumMetric      │
                  │  resolveGrouped  → groupBy dim    │
                  │  resolveSeries   → groupBy bucket │
                  └───────────────────────────────────┘
```

Each adapter exposes all three methods. The dispatch at `resolveBlock`/`resolveGroupedBlock`/`resolveSeriesBlock` chooses by **binding source**, not by mode (the mode is implicit in the function called). This keeps the per-mode error-mapping logic identical.

---

## 3. Type contracts (locked interfaces)

These additions to `lib/dashboard/types.ts` are the load-bearing surface. Every subsequent sub-project (#3 renderers, #5 NL kind classifier, future #6 tables) consumes these exact shapes.

```ts
// ─────────────────────────────────────────────────────────────────────────
// Time-series granularity. SM and TW both round to period start.
export type Granularity = 'day' | 'week' | 'month'

// ─────────────────────────────────────────────────────────────────────────
// GROUPED MODE — one row per dimension value.
// `dim` is { columnId: stringValue }. v1: exactly one key/value pair.
// `prevValue` present iff a comparison range was provided AND the prior
// fetch produced a value for this dim. Outer-join semantics: a dim that
// only appears in compare gets `value: undefined` (still emits the row);
// a dim that only appears in current gets `prevValue: undefined`.
export interface GroupedRow {
  dim: Record<string, string>
  value: number | undefined        // undefined only when comparison-only-side
  prevValue?: number
}

export type GroupedResult =
  | { ok: true; rows: GroupedRow[]; format: MetricFormat }
  | { ok: false; error: BlockError }

// ─────────────────────────────────────────────────────────────────────────
// SERIES MODE — one point per time bucket, sorted ascending by bucket.
// `bucket` is the ISO date of the period START (YYYY-MM-DD for all granularities).
// `prevValue` present iff a comparison range was provided AND the aligned
// prior bucket exists. Alignment is by bucket INDEX (not absolute date) —
// current[i].prevValue = prior[i].value.
export interface SeriesPoint {
  bucket: string                   // ISO YYYY-MM-DD (period start)
  value: number
  prevValue?: number
}

export type SeriesResult =
  | { ok: true; points: SeriesPoint[]; format: MetricFormat; granularity: Granularity }
  | { ok: false; error: BlockError }

// ─────────────────────────────────────────────────────────────────────────
// Binding extension. Both leaf binding shapes gain optional `dimensions`
// (length-1 in v1) and `granularity`. The fields are ignored in scalar mode.
export interface SupermetricsBinding {
  source: 'supermetrics'
  dsId: string
  metricField: string
  account: string
  expectedAccounts?: string[]
  filters?: { column: string; values: string[] }[]
  dimensions?: string[]            // NEW — v1: length 1; persistence rejects length ≠ 1
  granularity?: Granularity        // NEW — required when called via resolveSeries; ignored otherwise
}

export interface TripleWhaleBinding {
  source: 'triplewhale'
  metric: string
  account?: string
  filters?: { column: string; values: string[] }[]
  dimensions?: string[]            // NEW
  granularity?: Granularity        // NEW
}
```

The adapter interface (internal, in `lib/dashboard/adapters/types.ts` — new file):

```ts
import type {
  GroupedRow, LeafBinding, LeafValue, SeriesPoint, Granularity,
} from '@/lib/dashboard/types'

export interface LeafAdapter {
  resolveLeaf(
    b: LeafBinding,
    ctx: { slug: string },
    dateRange: string,
    compareRange: string | null,
  ): Promise<LeafValue>

  resolveGrouped(
    b: LeafBinding,
    ctx: { slug: string },
    dateRange: string,
    compareRange: string | null,
  ): Promise<GroupedRow[]>

  resolveSeries(
    b: LeafBinding,
    granularity: Granularity,
    ctx: { slug: string },
    dateRange: string,
    compareRange: string | null,
  ): Promise<SeriesPoint[]>
}
```

The new resolvers in `lib/dashboard/resolve.ts`:

```ts
export async function resolveGroupedBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
  deps?: { resolveGrouped?: GroupedResolver },
): Promise<GroupedResult>

export async function resolveSeriesBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
  deps?: { resolveSeries?: SeriesResolver },
): Promise<SeriesResult>
```

Both refuse `binding.source === 'aggregate' | 'calculated'` with `{ ok: false, error: 'invalid-metric' }` — non-leaf bindings cannot be grouped in v1.

---

## 4. Supermetrics adapter implementation

### 4.1 `resolveGrouped` — single dimension

Reuse `smQuery` with two-field request `[dimensionColumn, metricField]`. Each returned row is one dim value's sum (SM's own aggregation when the dim is requested). No client-side reduction beyond row-row outer-join with the compare fetch.

```ts
async function fetchGroupedRows(
  apiKey: string,
  b: SupermetricsBinding,
  dim: string,                       // single dimension column (v1)
  isoRange: string,
): Promise<{ dim: string; value: number }[]> {
  if (!SM_COLUMN_RE.test(dim)) throw new InvalidMetricError(`unsafe SM dimension: ${dim}`)
  return unstable_cache(
    async () => {
      const result = await smQuery({
        apiKey, dsId: b.dsId, dsAccounts: b.account,
        fields: [dim, b.metricField],
        dateRange: isoRange,
        filters: buildSmFilter(b.filters),
      })
      // Parse with explicit field IDs (not header display names) for stable keys.
      const rows = parseSmRows(result, [dim, b.metricField])
      return rows.map((r) => ({ dim: r[dim], value: Number(r[b.metricField] || 0) }))
    },
    ['sm-grouped', b.dsId, b.account, b.metricField, dim, isoRange,
     (buildSmFilter(b.filters) ?? ''), keyHash(apiKey)],
    { revalidate: 3600 },
  )()
}
```

Outer-join (current ⨝ prior) by dim value into `GroupedRow[]`, ordered by descending `value` of the current period (most prominent first; matches the deck's ranked bar charts).

### 4.2 `resolveSeries` — time bucket

SM exposes time grouping by requesting a Date-type dimension field at the desired granularity. The field IDs vary per DS — locked in a constant:

```ts
// lib/supermetrics/constants.ts (extension)
// Verified against live /query/fields for GAWA, AW, FA, SHP. Spot-check
// before adding a new DS — SM does not version field IDs.
export const SM_TIME_DIMENSION: Partial<Record<DsId, Record<Granularity, string>>> = {
  GAWA: { day: 'Date',     week: 'Week',          month: 'Month'      }, // GA4
  AW:   { day: 'Date',     week: 'Week',          month: 'Month'      }, // Google Ads
  FA:   { day: 'Date',     week: 'Week',          month: 'Month'      }, // Meta
  SHP:  { day: 'Date',     week: 'Week',          month: 'Month'      }, // Shopify
  LIA:  { day: 'Date',     week: 'Week',          month: 'Month'      }, // LinkedIn
}
```

A DS without a `SM_TIME_DIMENSION` entry throws `invalid-metric` in `resolveSeries` — never silently fall back to "day."

```ts
async function fetchSeriesPoints(
  apiKey: string,
  b: SupermetricsBinding,
  granularity: Granularity,
  isoRange: string,
): Promise<{ bucket: string; value: number }[]> {
  const dimMap = SM_TIME_DIMENSION[b.dsId as DsId]
  if (!dimMap) throw new InvalidMetricError(`no time dimension map for SM ds ${b.dsId}`)
  const timeDim = dimMap[granularity]
  return unstable_cache(
    async () => {
      const result = await smQuery({
        apiKey, dsId: b.dsId, dsAccounts: b.account,
        fields: [timeDim, b.metricField],
        dateRange: isoRange,
        filters: buildSmFilter(b.filters),
      })
      const rows = parseSmRows(result, [timeDim, b.metricField])
      // SM returns the bucket as a string already in period-start ISO for "Date",
      // and as a label like "2026-W26 (Mon)" for week. Normalize to ISO start:
      return rows
        .map((r) => ({ bucket: normalizeSmBucket(r[timeDim], granularity), value: Number(r[b.metricField] || 0) }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket))
    },
    ['sm-series', b.dsId, b.account, b.metricField, granularity, isoRange,
     (buildSmFilter(b.filters) ?? ''), keyHash(apiKey)],
    { revalidate: 3600 },
  )()
}

// Pure, exported, tested. Day → already ISO. Week → "Week 26, 2026 (Mon)" → "2026-06-22".
// Month → "Jan 2026" → "2026-01-01". Implementation in lib/supermetrics/buckets.ts.
export function normalizeSmBucket(raw: string, granularity: Granularity): string
```

`normalizeSmBucket` is a new pure helper with its own test file — bucket parsing is fiddly and SM's label format is not contract-stable, so isolate it.

### 4.3 Drift guard reuse

`expectedAccounts` is per-binding, not per-mode. Identical check at the union of accounts returned across current + compare. Wraps `fetchGroupedRows`/`fetchSeriesPoints` exactly like the existing scalar path wraps `sumForRange`. No drift-guard duplication.

---

## 5. TripleWhale adapter implementation

### 5.1 SQL builder extension

`lib/triplewhale/queries.ts` gains optional `groupBy` and `bucket`:

```ts
export interface BuildOptions {
  groupBy?: string                                       // dimension column (v1: single)
  bucket?: Granularity                                   // time bucket
}

export function buildMetricSql(
  metric: string,
  filters: TwFilter[] = [],
  opts: BuildOptions = {},
): string {
  const expr = TW_METRIC_SQL[metric as TwMetric] ?? (isSafeColumn(metric) ? `SUM(${metric})` : null)
  if (expr === null) throw new TwQueryError(`unsafe TripleWhale metric: ${metric}`)
  const filterSql = /* unchanged */

  // Scalar (no group): existing behavior.
  if (!opts.groupBy && !opts.bucket) {
    return `SELECT ${expr} AS value FROM ${PIXEL_TVF} WHERE ${BASE_WHERE}${filterSql}`
  }

  // Grouped by dimension.
  if (opts.groupBy) {
    if (!isSafeColumn(opts.groupBy)) throw new TwQueryError(`unsafe TripleWhale dimension: ${opts.groupBy}`)
    return `SELECT ${opts.groupBy} AS dim, ${expr} AS value
            FROM ${PIXEL_TVF}
            WHERE ${BASE_WHERE}${filterSql}
            GROUP BY ${opts.groupBy}
            ORDER BY value DESC`
  }

  // Series by time bucket.
  const trunc = { day: 'day', week: 'week', month: 'month' }[opts.bucket!]
  return `SELECT DATE_TRUNC('${trunc}', event_date) AS bucket, ${expr} AS value
          FROM ${PIXEL_TVF}
          WHERE ${BASE_WHERE}${filterSql}
          GROUP BY bucket
          ORDER BY bucket ASC`
}
```

`PIXEL_TVF` and `BASE_WHERE` extracted as constants from today's literal to keep the three variants readable.

### 5.2 Adapter dispatch

`twValue` (used in scalar) extracts `rows[0].value` and that's it. Grouped/series read all rows. `resolveTripleWhaleLeaf` keeps its body untouched; `resolveTripleWhaleGrouped`/`resolveTripleWhaleSeries` are new exports.

### 5.3 TW caching

TW currently has no `unstable_cache` wrap on the adapter (only SM does). v1: add an `unstable_cache` wrap to TW's grouped/series fetches with the same key shape — `['tw-grouped', shopId, metric, dim, isoRange, filterStr]` and `['tw-series', shopId, metric, granularity, isoRange, filterStr]`. Skip wrapping the scalar TW path to keep this sub-project surgical (a separate spec for TW scalar caching can land later).

---

## 6. Resolver dispatch (`lib/dashboard/resolve.ts`)

Three sibling top-level entry points. Each compiles the per-mode error story.

```ts
// SCALAR — unchanged.
export async function resolveBlock(config, global, ctx, deps?): Promise<ResolveResult>

// GROUPED — new.
export async function resolveGroupedBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
  deps?: { resolveGrouped?: GroupedResolver },
): Promise<GroupedResult> {
  if (config.binding.source !== 'supermetrics' && config.binding.source !== 'triplewhale') {
    return { ok: false, error: 'invalid-metric' }
  }
  const range = config.range ?? global
  try {
    const adapter = deps?.resolveGrouped ?? defaultGroupedDispatch
    const rows = await adapter(config.binding, ctx, range.dateRange, range.compareRange)
    return { ok: true, rows, format: config.format }
  } catch (e) {
    return { ok: false, error: mapError(e) }
  }
}

// SERIES — new. Requires binding.granularity (or throws invalid-metric).
export async function resolveSeriesBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
  deps?: { resolveSeries?: SeriesResolver },
): Promise<SeriesResult>
```

`defaultGroupedDispatch` and `defaultSeriesDispatch` live in `lib/dashboard/registry.ts` alongside today's `resolveLeaf` — single source of truth for "given a leaf binding, which adapter."

### 6.1 Outer-join helper (pure, tested)

```ts
// lib/dashboard/group-join.ts (new)
/** Outer-join current rows with prior rows by exact dim-value match.
 *  Sort order: current rows first (in their order), then prior-only rows. */
export function joinGrouped(
  current: { dim: string; value: number }[],
  prior: { dim: string; value: number }[] | null,
): GroupedRow[]

/** Inner-align two time-bucket series by index (NOT by absolute date).
 *  `current[i].prevValue = prior[i]?.value`. Length = current.length. */
export function alignSeries(
  current: { bucket: string; value: number }[],
  prior: { bucket: string; value: number }[] | null,
): SeriesPoint[]
```

Two pure functions, two pure tests. Worth isolating — outer-join semantics are easy to get wrong, easy to verify.

---

## 7. Persistence parser changes (`lib/dashboard/persistence.ts`)

Both `parseLeaf` variants accept optional `dimensions` and `granularity`:

- `dimensions`: `string[]` of length exactly 1; each value must match `^[A-Za-z0-9_]+$` (SM) or be a safe TW column. Empty array rejected. Length ≠ 1 rejected with `expected dimensions of length 1 (v1)`.
- `granularity`: `'day' | 'week' | 'month'` or omitted.
- Unchanged: existing scalar bindings (no `dimensions`/`granularity`) continue to parse and resolve identically.

---

## 8. Files

```
lib/dashboard/
  types.ts                                   # MODIFY: + GroupedRow, GroupedResult, SeriesPoint, SeriesResult,
                                             #          Granularity. + dimensions?/granularity? on leaf bindings.
  resolve.ts                                 # MODIFY: + resolveGroupedBlock, + resolveSeriesBlock.
  registry.ts                                # MODIFY: + defaultGroupedDispatch, + defaultSeriesDispatch.
  persistence.ts                             # MODIFY: parse dimensions / granularity / length-1 invariant.
  errors.ts                                  # (unchanged — same mapError covers new throw sites)
  group-join.ts                              # CREATE: joinGrouped, alignSeries (pure).
  group-join.test.ts                         # CREATE.

lib/dashboard/adapters/
  types.ts                                   # CREATE: LeafAdapter interface.
  supermetrics.ts                            # MODIFY: + resolveSupermetricsGrouped, + resolveSupermetricsSeries.
  supermetrics.test.ts                       # MODIFY: + grouped/series unit tests (parser & key isolation).
  triplewhale.ts                             # MODIFY: + resolveTripleWhaleGrouped, + resolveTripleWhaleSeries.
  triplewhale.test.ts                        # CREATE if absent / MODIFY.

lib/supermetrics/
  constants.ts                               # MODIFY: + SM_TIME_DIMENSION map.
  buckets.ts                                 # CREATE: normalizeSmBucket (pure).
  buckets.test.ts                            # CREATE: every granularity round-trip + bad input rejection.

lib/triplewhale/
  queries.ts                                 # MODIFY: buildMetricSql gains BuildOptions {groupBy, bucket}.
  queries.test.ts                            # MODIFY: SQL string assertions for grouped + series.

(NO changes to: app/, components/, package.json. Sub-project #2 is data-layer-only.)
```

---

## 9. Caching matrix

| Mode | Cache key prefix | Components |
|---|---|---|
| Scalar | `sm-data` | dsId, account, metricField, isoRange, filterStr, keyHash |
| Grouped | `sm-grouped` | dsId, account, metricField, **dim**, isoRange, filterStr, keyHash |
| Series | `sm-series` | dsId, account, metricField, **granularity**, isoRange, filterStr, keyHash |
| TW grouped | `tw-grouped` | shopId, metric, **dim**, isoRange, filterStr |
| TW series | `tw-series` | shopId, metric, **granularity**, isoRange, filterStr |

Invariant: no two cache keys collide across modes. Scalar continues to share its existing key. Adding a dim or granularity to a binding **does not** invalidate the scalar cache — it just routes to a different cache bucket.

---

## 10. Error precedence

Identical across modes. Errors map via the existing `mapError` in `lib/dashboard/errors.ts`:

- `DisconnectedError` (no API key / no shop) → `disconnected`
- `NoDataError` (0 rows returned) → `no-data` (grouped: zero matching dim values; series: zero buckets)
- `SmQueryError` 429 → `rate-limited`; other SM errors → `error`
- `InvalidMetricError` (unsafe column / unknown DS for series / aggregate-as-grouped) → `invalid-metric`

A grouped/series call that succeeds for current but fails for compare returns `{ok: true}` with the value-only side populated (no `prevValue`/`prev`). A current-side failure is the result-level error.

---

## 11. Testing strategy

All new tests are pure (no live API), follow `tsx + node:assert` convention, run via `npx tsx <file>`.

### 11.1 Pure helpers

| File | Coverage |
|---|---|
| `lib/dashboard/group-join.test.ts` | `joinGrouped`: current-only, prior-only, both-sides, empty-current, ordering preservation. `alignSeries`: equal lengths, longer current, longer prior, empty prior |
| `lib/supermetrics/buckets.test.ts` | `normalizeSmBucket` for day/week/month with valid + invalid input; idempotency for day |
| `lib/triplewhale/queries.test.ts` | `buildMetricSql` SQL strings for: scalar, grouped(channel), series(day/week/month), grouped+filters, unsafe column rejected |

### 11.2 Persistence

`lib/dashboard/persistence.test.ts` gains:

- Binding with `dimensions: ['Channel']` round-trips.
- Binding with `dimensions: ['Channel', 'Country']` rejected (length-1 invariant).
- Binding with `dimensions: []` rejected.
- Binding with `dimensions: ['unsafe col']` rejected (regex).
- Binding with `granularity: 'day'` round-trips; `'minute'` rejected.

### 11.3 Adapter (parser-level, no fetch)

`lib/dashboard/adapters/supermetrics.test.ts` gains pure-function tests for:

- The "parse SM rows into GroupedRow shape" extraction (a new tiny pure helper `groupRowsFromSm(rows, dim, metricField)`).
- The "parse SM rows into SeriesPoint shape" via `normalizeSmBucket`.
- The cache-key shape for grouped/series (assert via a tiny exported `buildSmGroupedKey()` so the matrix in §9 is encoded in code, not just spec text).

### 11.4 Resolver dispatch

`lib/dashboard/resolve.test.ts` gains:

- `resolveGroupedBlock` rejects aggregate binding → `invalid-metric`.
- `resolveGroupedBlock` rejects calculated binding → `invalid-metric`.
- `resolveGroupedBlock` with mock `resolveGrouped` returns `{ok: true, rows, format}`.
- `resolveSeriesBlock` rejects binding without `granularity` → `invalid-metric`.
- `resolveSeriesBlock` with mock returns `{ok: true, points, format, granularity}`.

Live-API integration tests are **out of scope for this spec** (they require credentials and run on a separate cadence). The existing `discovery.test.ts` shows the precedent: pure tests for parser, separate live test for end-to-end. Same here — a follow-up live verification harness can land alongside #3 when there's a UI to demo against.

---

## 12. Out of scope (explicit)

- Any chart renderer. `<BarBlock>`, `<LineBlock>` and the page-route dispatching to them land in sub-project #3.
- Any manual builder UI for dimension/granularity selection. Today's `LeafBuilder` already discovers SM dimensions; surfacing them as pickers + persisting them into the draft is #3's job.
- Aggregate or calculated bindings as inputs to `resolveGrouped`/`resolveSeries`. v2 — requires defining how "ROAS by channel" aligns two groupings.
- Multi-dimension grouping (e.g., channel × country). v2.
- Multi-metric grouped queries (one dim, two metrics in the same row). #4 (tables) decides whether to call `resolveGrouped` N times or introduce `resolveGroupedMulti`.
- Gap-filling for series. v2 if analysts request continuous lines.
- TW scalar adapter caching. Separate spec; current TW scalar path stays uncached.
- Live API integration tests. Follow-up harness, not a sub-project #2 deliverable.
- NL kind classifier ("by channel" → bar). Sub-project #5.

---

## 13. Open questions

- **SM time-dimension field IDs:** the `SM_TIME_DIMENSION` map needs spot-check against live `/query/fields` for each DS before this sub-project's plan is written. Use the existing `smFieldsAndDimensions` helper in a one-off script if needed. The risk: SM returns "Week (Mon-Sun)" vs. "Week" depending on locale or recent UI changes. If the live names drift, the constant becomes the patch point.
- **Account drift in compare-only side:** if the prior period's query returns accounts not in `expectedAccounts`, do we treat that as drift? v1: yes, same rule applies — drift detection is mode-agnostic. Confirm against any client where the compare period crosses an account turnover boundary.
- **`prevValue: undefined` in `GroupedRow` (compare-only dim):** is that meaningful to a chart? The renderer needs to decide whether to show a "this channel only ran last period" indicator. Park the answer in #3.
- **Series tail trim:** if current has 31 buckets and prior has 28, do we trim current to 28 to align? v1: no — current emits all 31; the last 3 carry no `prevValue`. Renderer's job to decide whether to show the unaligned tail.
- **SM "max_rows" for grouped:** current scalar passes `max_rows: 10000`. For grouped (countries × metric), 10k is plenty; for high-cardinality dims (campaign_id × spend with thousands of campaigns) it's borderline. v1: keep 10k. Add a `maxRows?: number` option on the adapter call only when a real high-cardinality use case demands it.

---

## 14. Notes

- Every existing scalar block — `resolveBlock(config, ...)` — works unchanged. No migration. Cache keys for scalar are unaffected. Drift guards are unaffected. Aggregate + calculated paths are untouched.
- The spec's resolver triplet (`resolveBlock` / `resolveGroupedBlock` / `resolveSeriesBlock`) intentionally mirrors the existing `resolveBlock` signature. Callers (the page route in #3) pick by which method they call, not by passing a mode discriminator. This keeps the per-mode return types tight.
- This sub-project ships **no user-visible change**. It can land and merge safely while #3 is in flight. The integration smoke test (which is the next thing the user sees) is part of #3, after the renderers consume these APIs.
- Cache TTL of 3600s is inherited from the scalar path — analyst expectations are already calibrated to "data refreshes hourly." Don't relitigate.
- The `LeafAdapter` interface in `lib/dashboard/adapters/types.ts` is the formal type that both SM and TW implement. Today's code has no such interface; the methods are just exported functions. Introducing the interface is a small refactor that makes #3's renderer dispatch easy to test with mocks.
