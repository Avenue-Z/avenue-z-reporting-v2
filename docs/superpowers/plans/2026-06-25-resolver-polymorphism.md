# Resolver Polymorphism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the dashboard's data layer from scalar-only to three modes — scalar, grouped (by dimension), and time-series (by bucket) — so sub-project #3 can render bar and line charts. No UI changes.

**Architecture:** Sub-project #2 of [docs/superpowers/specs/2026-06-24-self-service-blocks-and-layout-design.md](../specs/2026-06-24-self-service-blocks-and-layout-design.md), spec'd in [docs/superpowers/specs/2026-06-25-resolver-polymorphism-design.md](../specs/2026-06-25-resolver-polymorphism-design.md). Six tasks, in order: (1) types + pure helpers; (2) persistence parser; (3) SM constants + TW SQL builder; (4) SM grouped/series adapter; (5) TW grouped/series adapter; (6) top-level resolver dispatch. Each task ends with a green typecheck + commit. Existing scalar blocks are unchanged at every commit boundary.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, `unstable_cache` for adapter result caching, `tsx` + `node:assert` unit tests.

## Global Constraints

- Branch is `feat/tc-dashboard-self-service-dash-system` (stacked on `feat/configurable-dashboard-rnd`). Do NOT change base; do NOT touch parent branch.
- TypeScript strict; no `any` in new or changed code.
- Tests are pure (no live API calls, no `.env` loading); run via `npx tsx <file>` using `node:assert` strict mode. Match the style of [lib/dashboard/persistence.test.ts](../../../lib/dashboard/persistence.test.ts) — IIFE blocks, no test runner.
- Backward compatible at every commit: existing scalar bindings (no `dimensions`/`granularity`) continue to parse and resolve identically. No data migration. No cache-key collision with the existing `sm-data` namespace.
- Aggregate + calculated bindings are **rejected** by `resolveGroupedBlock`/`resolveSeriesBlock` with `invalid-metric` — they're scalar-only by design.
- v1 invariant: `dimensions` array length is exactly 1. Parser enforces; adapters assume the invariant.
- Multi-leaf line / multi-metric grouped / gap-fill / live integration tests are explicitly **out of scope** for this sub-project (see spec §12).
- No new runtime dependencies. `date-fns` (already installed) is used only in sub-project #3, not here.
- One commit per task; conventional prefix `feat(dashboard):` or `feat(supermetrics):` or `feat(triplewhale):`; footer:
  ```
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  ```
- Each task ends with `./node_modules/.bin/tsc --noEmit` clean before commit.

---

### Task 1: Schema types + pure helpers (`group-join`, `buckets`)

Adds the new shared types (`Granularity`, `GroupedRow`, `GroupedResult`, `SeriesPoint`, `SeriesResult`) and the binding extension fields (`dimensions?`, `granularity?`) to `lib/dashboard/types.ts`. Creates two pure helpers that the adapters consume in tasks 4–5: `joinGrouped`/`alignSeries` (compare alignment) and `normalizeSmBucket` (SM time-label parsing). No fetch, no React, all unit-tested.

**Files:**
- Modify: `lib/dashboard/types.ts:1-69` (extend bindings + add new result/point types)
- Create: `lib/dashboard/group-join.ts`
- Create: `lib/dashboard/group-join.test.ts`
- Create: `lib/supermetrics/buckets.ts`
- Create: `lib/supermetrics/buckets.test.ts`

**Interfaces:**
- Produces: `Granularity = 'day' | 'week' | 'month'`.
- Produces: `interface GroupedRow { dim: Record<string, string>; value: number | undefined; prevValue?: number }`.
- Produces: `type GroupedResult = { ok: true; rows: GroupedRow[]; format: MetricFormat } | { ok: false; error: BlockError }`.
- Produces: `interface SeriesPoint { bucket: string; value: number; prevValue?: number }` (`bucket` = ISO YYYY-MM-DD of period start).
- Produces: `type SeriesResult = { ok: true; points: SeriesPoint[]; format: MetricFormat; granularity: Granularity } | { ok: false; error: BlockError }`.
- Produces: `SupermetricsBinding.dimensions?: string[]` and `granularity?: Granularity`; same on `TripleWhaleBinding`.
- Produces: `joinGrouped(current: { dim: string; value: number }[], prior: { dim: string; value: number }[] | null, dimColumn: string): GroupedRow[]` — outer-join by dim string; current-order preserved; prior-only dims appended.
- Produces: `alignSeries(current: { bucket: string; value: number }[], prior: { bucket: string; value: number }[] | null): SeriesPoint[]` — index-aligned, `current[i].prevValue = prior[i]?.value`; length = current.length.
- Produces: `normalizeSmBucket(raw: string, granularity: Granularity): string` — converts SM's display-format bucket labels to ISO `YYYY-MM-DD` of the period start.

- [ ] **Step 1: Write failing `group-join` tests**

Create `lib/dashboard/group-join.test.ts`:

```ts
// lib/dashboard/group-join.test.ts
// Run: npx tsx lib/dashboard/group-join.test.ts
import { strict as assert } from 'node:assert'
import { joinGrouped, alignSeries } from './group-join'

// joinGrouped: both sides present, current order preserved, prevValue populated.
{
  const rows = joinGrouped(
    [{ dim: 'US', value: 100 }, { dim: 'CA', value: 50 }],
    [{ dim: 'CA', value: 40 }, { dim: 'US', value: 80 }],
    'Country',
  )
  assert.deepEqual(rows, [
    { dim: { Country: 'US' }, value: 100, prevValue: 80 },
    { dim: { Country: 'CA' }, value: 50, prevValue: 40 },
  ])
}

// joinGrouped: prior-only dim appended with value=undefined.
{
  const rows = joinGrouped(
    [{ dim: 'US', value: 100 }],
    [{ dim: 'US', value: 80 }, { dim: 'MX', value: 25 }],
    'Country',
  )
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { dim: { Country: 'US' }, value: 100, prevValue: 80 })
  assert.deepEqual(rows[1], { dim: { Country: 'MX' }, value: undefined, prevValue: 25 })
}

// joinGrouped: current-only dim → prevValue undefined (key absent, not null).
{
  const rows = joinGrouped(
    [{ dim: 'US', value: 100 }, { dim: 'NEW', value: 5 }],
    [{ dim: 'US', value: 80 }],
    'Country',
  )
  assert.equal(rows[1].prevValue, undefined)
  assert.equal('prevValue' in rows[1], false, 'undefined prevValue must be absent, not present-undefined')
}

// joinGrouped: null prior (no comparison) → no prevValue on any row.
{
  const rows = joinGrouped([{ dim: 'US', value: 100 }], null, 'Country')
  assert.deepEqual(rows, [{ dim: { Country: 'US' }, value: 100 }])
}

// joinGrouped: empty current + non-null prior → all rows have value undefined, prevValue set.
{
  const rows = joinGrouped([], [{ dim: 'US', value: 80 }], 'Country')
  assert.deepEqual(rows, [{ dim: { Country: 'US' }, value: undefined, prevValue: 80 }])
}

// alignSeries: equal lengths, paired by index.
{
  const pts = alignSeries(
    [{ bucket: '2026-06-01', value: 10 }, { bucket: '2026-06-02', value: 20 }],
    [{ bucket: '2026-05-01', value: 8  }, { bucket: '2026-05-02', value: 18 }],
  )
  assert.deepEqual(pts, [
    { bucket: '2026-06-01', value: 10, prevValue: 8  },
    { bucket: '2026-06-02', value: 20, prevValue: 18 },
  ])
}

// alignSeries: current longer than prior → trailing points carry no prevValue.
{
  const pts = alignSeries(
    [{ bucket: '2026-06-01', value: 10 }, { bucket: '2026-06-02', value: 20 }, { bucket: '2026-06-03', value: 30 }],
    [{ bucket: '2026-05-01', value: 8  }],
  )
  assert.equal(pts.length, 3)
  assert.equal(pts[0].prevValue, 8)
  assert.equal('prevValue' in pts[1], false)
  assert.equal('prevValue' in pts[2], false)
}

// alignSeries: prior longer than current → trailing prior buckets dropped.
{
  const pts = alignSeries(
    [{ bucket: '2026-06-01', value: 10 }],
    [{ bucket: '2026-05-01', value: 8 }, { bucket: '2026-05-02', value: 18 }],
  )
  assert.equal(pts.length, 1)
  assert.equal(pts[0].prevValue, 8)
}

// alignSeries: null prior → no prevValue on any point.
{
  const pts = alignSeries([{ bucket: '2026-06-01', value: 10 }], null)
  assert.deepEqual(pts, [{ bucket: '2026-06-01', value: 10 }])
}

// alignSeries: empty current → empty result.
{
  assert.deepEqual(alignSeries([], [{ bucket: '2026-05-01', value: 8 }]), [])
}

console.log('ok')
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx lib/dashboard/group-join.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement `group-join.ts`**

Create `lib/dashboard/group-join.ts`:

```ts
import type { GroupedRow, SeriesPoint } from './types'

/** Outer-join current vs prior rows by dim string. Current-order preserved;
 *  prior-only dims appended at the end with value: undefined. `prevValue` is
 *  ABSENT (key not present) when there's no prior match — not present-undefined. */
export function joinGrouped(
  current: { dim: string; value: number }[],
  prior: { dim: string; value: number }[] | null,
  dimColumn: string,
): GroupedRow[] {
  const out: GroupedRow[] = []
  const priorByDim = new Map<string, number>()
  if (prior) for (const p of prior) priorByDim.set(p.dim, p.value)
  const seen = new Set<string>()

  for (const c of current) {
    seen.add(c.dim)
    const row: GroupedRow = { dim: { [dimColumn]: c.dim }, value: c.value }
    const pv = priorByDim.get(c.dim)
    if (pv !== undefined) row.prevValue = pv
    out.push(row)
  }
  if (prior) {
    for (const p of prior) {
      if (seen.has(p.dim)) continue
      out.push({ dim: { [dimColumn]: p.dim }, value: undefined, prevValue: p.value })
    }
  }
  return out
}

/** Inner-align two time-bucket series by INDEX (not by absolute date).
 *  `current[i].prevValue = prior[i]?.value`. Length = current.length. */
export function alignSeries(
  current: { bucket: string; value: number }[],
  prior: { bucket: string; value: number }[] | null,
): SeriesPoint[] {
  return current.map((c, i) => {
    const pt: SeriesPoint = { bucket: c.bucket, value: c.value }
    const pv = prior?.[i]?.value
    if (pv !== undefined) pt.prevValue = pv
    return pt
  })
}
```

Note: `group-join.ts` imports `GroupedRow` and `SeriesPoint` from `./types`, which don't exist yet. Step 9 adds them. The test in step 2 fails because the module doesn't exist; once the module exists, it'll fail at typecheck until step 9. Both are expected — we'll verify green at step 10.

- [ ] **Step 4: Run group-join test (still expected to fail at typecheck)**

Run: `npx tsx lib/dashboard/group-join.test.ts`
Expected: FAIL — module references types that don't exist yet (`GroupedRow`, `SeriesPoint`). Confirms the test file compiles only after step 9.

- [ ] **Step 5: Write failing `buckets` tests**

Create `lib/supermetrics/buckets.test.ts`:

```ts
// lib/supermetrics/buckets.test.ts
// Run: npx tsx lib/supermetrics/buckets.test.ts
import { strict as assert } from 'node:assert'
import { normalizeSmBucket } from './buckets'

// day: already ISO → passthrough.
assert.equal(normalizeSmBucket('2026-06-24', 'day'), '2026-06-24')

// day: ISO datetime → date portion only.
assert.equal(normalizeSmBucket('2026-06-24T00:00:00', 'day'), '2026-06-24')

// week: SM "Week 26, 2026" → ISO Monday of that ISO week.
//   ISO week 26 of 2026 starts on Mon 2026-06-22.
assert.equal(normalizeSmBucket('Week 26, 2026', 'week'), '2026-06-22')

// week: SM alternative "2026-W26" → same Monday.
assert.equal(normalizeSmBucket('2026-W26', 'week'), '2026-06-22')

// month: SM "Jan 2026" → 2026-01-01.
assert.equal(normalizeSmBucket('Jan 2026', 'month'), '2026-01-01')
assert.equal(normalizeSmBucket('Dec 2025', 'month'), '2025-12-01')

// month: SM "2026-01" → 2026-01-01.
assert.equal(normalizeSmBucket('2026-01', 'month'), '2026-01-01')

// Unparseable → throws (caller maps to invalid-metric).
assert.throws(() => normalizeSmBucket('garbage', 'week'), /normalizeSmBucket/)
assert.throws(() => normalizeSmBucket('', 'month'),       /normalizeSmBucket/)

console.log('ok')
```

- [ ] **Step 6: Run to verify failure**

Run: `npx tsx lib/supermetrics/buckets.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 7: Implement `buckets.ts`**

Create `lib/supermetrics/buckets.ts`:

```ts
import type { Granularity } from '@/lib/dashboard/types'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** Monday (ISO) of the given ISO-week of year. Year + week → date. */
function isoWeekMonday(year: number, week: number): Date {
  // ISO 8601: week 1 contains Jan 4th. Jan 4th's Monday is the start of week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7   // Mon=1..Sun=7
  const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000)
  return new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000)
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Parse SM's display-format bucket labels into ISO YYYY-MM-DD of the
 *  period start. Throws when unparseable (caller maps to invalid-metric). */
export function normalizeSmBucket(raw: string, granularity: Granularity): string {
  if (raw === '') throw new Error(`normalizeSmBucket: empty input for ${granularity}`)

  if (granularity === 'day') {
    // Accept "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS"
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw)
    if (!m) throw new Error(`normalizeSmBucket: cannot parse day '${raw}'`)
    return m[1]
  }

  if (granularity === 'week') {
    // "Week 26, 2026"
    let m = /^Week\s+(\d{1,2}),\s*(\d{4})$/i.exec(raw)
    if (m) return iso(isoWeekMonday(Number(m[2]), Number(m[1])))
    // "2026-W26"
    m = /^(\d{4})-W(\d{1,2})$/i.exec(raw)
    if (m) return iso(isoWeekMonday(Number(m[1]), Number(m[2])))
    throw new Error(`normalizeSmBucket: cannot parse week '${raw}'`)
  }

  // month
  // "Jan 2026"
  let m = /^([A-Za-z]{3})\s+(\d{4})$/.exec(raw)
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()]
    if (!mo) throw new Error(`normalizeSmBucket: unknown month '${m[1]}'`)
    return iso(new Date(Date.UTC(Number(m[2]), mo - 1, 1)))
  }
  // "2026-01"
  m = /^(\d{4})-(\d{2})$/.exec(raw)
  if (m) return iso(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)))
  throw new Error(`normalizeSmBucket: cannot parse month '${raw}'`)
}
```

Same as group-join: buckets.ts depends on `Granularity` from `types.ts`, which doesn't exist yet. Compiles green after step 9.

- [ ] **Step 8: Run buckets test (still expected to fail at typecheck)**

Run: `npx tsx lib/supermetrics/buckets.test.ts`
Expected: FAIL — `Granularity` type unresolved.

- [ ] **Step 9: Extend `lib/dashboard/types.ts`**

Open `lib/dashboard/types.ts`. Locate the `SupermetricsBinding` interface (currently lines 3–10). Replace it and the `TripleWhaleBinding` interface (currently lines 12–17) with:

```ts
export type Granularity = 'day' | 'week' | 'month'

export interface SupermetricsBinding {
  source: 'supermetrics'
  dsId: string
  metricField: string
  account: string
  expectedAccounts?: string[] // drift guard: returned accounts must be ⊆ this set
  filters?: { column: string; values: string[] }[] // OR within a row (any value), AND across rows
  /** v1: array length exactly 1. Used by resolveGroupedBlock and resolveSeriesBlock; ignored in scalar mode. */
  dimensions?: string[]
  /** Required when called via resolveSeriesBlock; ignored otherwise. */
  granularity?: Granularity
}

export interface TripleWhaleBinding {
  source: 'triplewhale'
  metric: string
  account?: string
  filters?: { column: string; values: string[] }[]
  /** v1: array length exactly 1. */
  dimensions?: string[]
  granularity?: Granularity
}
```

Then, immediately after the `LeafValue` interface (currently lines 49–52), insert these new types:

```ts
/** One row per dimension value. `value` is undefined only when the dim only
 *  appears in the compare period; otherwise both `value` and (when comparison
 *  is active and matched) `prevValue` are present. */
export interface GroupedRow {
  dim: Record<string, string>
  value: number | undefined
  prevValue?: number
}

export type GroupedResult =
  | { ok: true; rows: GroupedRow[]; format: MetricFormat }
  | { ok: false; error: BlockError }

/** One point per time bucket. `bucket` is the ISO YYYY-MM-DD of the period
 *  start (for all granularities). */
export interface SeriesPoint {
  bucket: string
  value: number
  prevValue?: number
}

export type SeriesResult =
  | { ok: true; points: SeriesPoint[]; format: MetricFormat; granularity: Granularity }
  | { ok: false; error: BlockError }
```

- [ ] **Step 10: Run all three tests (now green)**

Run: `npx tsx lib/dashboard/group-join.test.ts`
Expected: `ok`.

Run: `npx tsx lib/supermetrics/buckets.test.ts`
Expected: `ok`.

Run: `npx tsx lib/dashboard/types.test.ts`
Expected: `ok`. (Existing test stays green — type extensions are additive optional fields.)

- [ ] **Step 11: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean. (No production code consumes the new types yet — they're added in tasks 4–6.)

- [ ] **Step 12: Commit**

```bash
git add lib/dashboard/types.ts lib/dashboard/group-join.ts lib/dashboard/group-join.test.ts lib/supermetrics/buckets.ts lib/supermetrics/buckets.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): grouped/series types + pure compare helpers

Adds Granularity, GroupedRow, GroupedResult, SeriesPoint, SeriesResult to
the dashboard types. Extends SupermetricsBinding and TripleWhaleBinding
with optional dimensions (v1 length-1) and granularity. No consumer in
production code yet — the adapters and resolver dispatchers wire these
up in subsequent tasks.

Adds two pure helpers used by tasks 4–6:
- joinGrouped(current, prior, dimColumn) — outer-join by dim string;
  current-order preserved; prior-only dims appended.
- alignSeries(current, prior) — index-aligned; current.length preserved.
- normalizeSmBucket(raw, granularity) — parses SM's display-format bucket
  labels ("Week 26, 2026", "Jan 2026", etc.) into ISO YYYY-MM-DD of the
  period start. Throws on unparseable input.

All three helpers fully unit-tested.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Persistence parser — `dimensions` + `granularity`

Extends the binding parser in `lib/dashboard/persistence.ts` to accept optional `dimensions` (length-1, safe-column) and `granularity` (`'day' | 'week' | 'month'`) on both SM and TW leaf bindings. Existing scalar bindings continue to parse unchanged.

**Files:**
- Modify: `lib/dashboard/persistence.ts:40-70` (extend `parseLeaf`)
- Modify: `lib/dashboard/persistence.test.ts` (append cases)

**Interfaces:**
- Consumes: `Granularity`, extended `SupermetricsBinding`, `TripleWhaleBinding` (from Task 1).
- Produces: no new exports. Behavior change only — `parseLeaf` now extracts the two optional fields and validates them.

- [ ] **Step 1: Write failing persistence tests**

Open `lib/dashboard/persistence.test.ts`. Insert at the bottom, immediately before `console.log('ok')`:

```ts
// dimensions: SM length-1 valid string → round-trips.
{
  const r = parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', dimensions: ['Channel'] }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'supermetrics') {
    assert.deepEqual(r.block.binding.dimensions, ['Channel'])
  }
}
// dimensions: TW length-1 valid string → round-trips.
{
  const r = parseBlockConfig(block({ source: 'triplewhale', metric: 'ad_spend', dimensions: ['channel'] }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'triplewhale') {
    assert.deepEqual(r.block.binding.dimensions, ['channel'])
  }
}
// dimensions: length 0 rejected.
assert.equal(parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', dimensions: [] })).ok, false)
// dimensions: length 2 rejected (v1 invariant).
assert.equal(parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', dimensions: ['Channel', 'Country'] })).ok, false)
// dimensions: SM unsafe column rejected.
assert.equal(parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', dimensions: ['bad col'] })).ok, false)
// dimensions: TW unsafe column rejected (uppercase fails TW's lowercase column regex).
assert.equal(parseBlockConfig(block({ source: 'triplewhale', metric: 'ad_spend', dimensions: ['BadCol'] })).ok, false)
// dimensions: omitted → parses, no field.
{
  const r = parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'supermetrics') assert.equal(r.block.binding.dimensions, undefined)
}

// granularity: 'day' / 'week' / 'month' round-trip.
for (const g of ['day', 'week', 'month'] as const) {
  const r = parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', granularity: g }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'supermetrics') assert.equal(r.block.binding.granularity, g)
}
// granularity: 'minute' rejected.
assert.equal(parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', granularity: 'minute' })).ok, false)
// granularity: omitted → parses, no field.
{
  const r = parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'supermetrics') assert.equal(r.block.binding.granularity, undefined)
}
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: FAIL — parser silently drops the new fields (passes some assertions, fails the round-trip ones).

- [ ] **Step 3: Extend the parser**

Open `lib/dashboard/persistence.ts`. At the top of the file (after the existing `BLOCK_KINDS` constant added in Task 1), add:

```ts
const GRANULARITIES: import('./types').Granularity[] = ['day', 'week', 'month']
const TW_COLUMN_RE = /^[a-z0-9_]+$/                    // mirrors isSafeColumn in lib/triplewhale/queries.ts
const SM_COLUMN_RE_PARSER = /^[A-Za-z0-9_]+$/          // mirrors SM_COLUMN_RE in lib/dashboard/adapters/supermetrics.ts
```

Then, replace the SM branch of `parseLeaf` (currently lines 42–56) with:

```ts
  if (v.source === 'supermetrics') {
    if (!isNonEmptyStr(v.dsId)) return { ok: false, error: `${path}.dsId: expected non-empty string` }
    if (!isNonEmptyStr(v.metricField)) return { ok: false, error: `${path}.metricField: expected non-empty string` }
    if (!isNonEmptyStr(v.account)) return { ok: false, error: `${path}.account: expected non-empty string` }
    if (v.expectedAccounts !== undefined && !(Array.isArray(v.expectedAccounts) && v.expectedAccounts.every(isStr)))
      return { ok: false, error: `${path}.expectedAccounts: expected string[]` }
    const b: SupermetricsBinding = { source: 'supermetrics', dsId: v.dsId, metricField: v.metricField, account: v.account }
    if (v.expectedAccounts !== undefined) b.expectedAccounts = v.expectedAccounts as string[]
    if (v.filters !== undefined) {
      const pf = parseFilters(v.filters, `${path}.filters`)
      if (!pf.ok) return pf
      b.filters = pf.value
    }
    if (v.dimensions !== undefined) {
      if (!Array.isArray(v.dimensions) || v.dimensions.length !== 1) {
        return { ok: false, error: `${path}.dimensions: expected array of length 1 (v1)` }
      }
      const d = v.dimensions[0]
      if (!isNonEmptyStr(d) || !SM_COLUMN_RE_PARSER.test(d)) {
        return { ok: false, error: `${path}.dimensions[0]: expected safe SM column (matching ^[A-Za-z0-9_]+$)` }
      }
      b.dimensions = [d]
    }
    if (v.granularity !== undefined) {
      if (!GRANULARITIES.includes(v.granularity as import('./types').Granularity)) {
        return { ok: false, error: `${path}.granularity: expected one of ${GRANULARITIES.join(',')}` }
      }
      b.granularity = v.granularity as import('./types').Granularity
    }
    return { ok: true, value: b }
  }
```

And the TW branch (currently lines 57–67) with:

```ts
  if (v.source === 'triplewhale') {
    if (!isNonEmptyStr(v.metric)) return { ok: false, error: `${path}.metric: expected non-empty string` }
    if (v.account !== undefined && !isStr(v.account)) return { ok: false, error: `${path}.account: expected string` }
    const b: TripleWhaleBinding = { source: 'triplewhale', metric: v.metric }
    if (v.account !== undefined) b.account = v.account
    if (v.filters !== undefined) {
      const pf = parseFilters(v.filters, `${path}.filters`)
      if (!pf.ok) return pf
      b.filters = pf.value
    }
    if (v.dimensions !== undefined) {
      if (!Array.isArray(v.dimensions) || v.dimensions.length !== 1) {
        return { ok: false, error: `${path}.dimensions: expected array of length 1 (v1)` }
      }
      const d = v.dimensions[0]
      if (!isNonEmptyStr(d) || !TW_COLUMN_RE.test(d)) {
        return { ok: false, error: `${path}.dimensions[0]: expected safe TW column (matching ^[a-z0-9_]+$)` }
      }
      b.dimensions = [d]
    }
    if (v.granularity !== undefined) {
      if (!GRANULARITIES.includes(v.granularity as import('./types').Granularity)) {
        return { ok: false, error: `${path}.granularity: expected one of ${GRANULARITIES.join(',')}` }
      }
      b.granularity = v.granularity as import('./types').Granularity
    }
    return { ok: true, value: b }
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: `ok`.

- [ ] **Step 5: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/persistence.ts lib/dashboard/persistence.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): parse leaf-binding dimensions + granularity

Extends parseLeaf in lib/dashboard/persistence.ts to accept optional
dimensions (v1: array length 1; SM safe column /^[A-Za-z0-9_]+$/; TW safe
column /^[a-z0-9_]+$/) and granularity ('day' | 'week' | 'month'). Both
fields silently absent on existing scalar bindings — full back-compat.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: SM time-dimension constant + TW SQL builder extension

Adds the `SM_TIME_DIMENSION` map (per-DS time-dimension field IDs for series mode) and extends `buildMetricSql` with optional `groupBy` and `bucket` options for grouped and series modes. Both are infrastructure for tasks 4–5.

**Files:**
- Modify: `lib/supermetrics/constants.ts` (append `SM_TIME_DIMENSION`)
- Modify: `lib/triplewhale/queries.ts` (extend `buildMetricSql`)
- Modify: `lib/triplewhale/queries.test.ts` (append cases — if file absent, see note below)

**Note:** Check whether `lib/triplewhale/queries.test.ts` exists before Step 1. If absent, create it in step 1 with a minimal scaffold (imports + first test block) and add the new cases. Existing tests for `buildMetricSql` (scalar mode) likely live in `lib/triplewhale/client.test.ts` or `lib/triplewhale/queries.test.ts` — preserve them.

**Interfaces:**
- Produces: `SM_TIME_DIMENSION: Partial<Record<DsId, Record<Granularity, string>>>` in `lib/supermetrics/constants.ts`.
- Produces: `BuildOptions { groupBy?: string; bucket?: Granularity }` in `lib/triplewhale/queries.ts`.
- Produces: `buildMetricSql(metric, filters, opts?: BuildOptions): string` — third arg optional and additive.

- [ ] **Step 1: Add `SM_TIME_DIMENSION` to SM constants**

Open `lib/supermetrics/constants.ts`. Append:

```ts
import type { Granularity } from '@/lib/dashboard/types'

/**
 * Per-DS time-dimension field IDs used by resolveSeriesBlock. Verified
 * against live /query/fields for the DSes the paid-media team uses.
 * Spot-check any new DS before adding it — SM does not version field IDs.
 */
export const SM_TIME_DIMENSION: Partial<Record<DsId, Record<Granularity, string>>> = {
  GAWA: { day: 'Date', week: 'Week', month: 'Month' }, // GA4
  AW:   { day: 'Date', week: 'Week', month: 'Month' }, // Google Ads
  FA:   { day: 'Date', week: 'Week', month: 'Month' }, // Meta
  SHP:  { day: 'Date', week: 'Week', month: 'Month' }, // Shopify
  LIA:  { day: 'Date', week: 'Week', month: 'Month' }, // LinkedIn
}
```

- [ ] **Step 2: Check + ensure `queries.test.ts` exists**

Run: `ls lib/triplewhale/queries.test.ts 2>&1`

If "No such file": create `lib/triplewhale/queries.test.ts` with:

```ts
// lib/triplewhale/queries.test.ts
// Run: npx tsx lib/triplewhale/queries.test.ts
import { strict as assert } from 'node:assert'
import { buildMetricSql } from './queries'

// Scalar (no group): existing behavior — single-value query.
{
  const sql = buildMetricSql('ad_spend')
  assert.match(sql, /SELECT SUM\(spend\) AS value/)
  assert.match(sql, /FROM pixel_joined_tvf\(/)
  assert.match(sql, /WHERE event_date BETWEEN @startDate AND @endDate/)
  // No GROUP BY in scalar.
  assert.equal(/GROUP BY/.test(sql), false)
}

console.log('ok')
```

If the file already exists, **read it** to confirm the existing test structure, then proceed with step 3 inserting cases there.

- [ ] **Step 3: Write failing grouped + series SQL tests**

In `lib/triplewhale/queries.test.ts`, insert (before `console.log('ok')`):

```ts
// Grouped: SELECT dim, SUM(...) AS value ... GROUP BY dim ORDER BY value DESC.
{
  const sql = buildMetricSql('ad_spend', [], { groupBy: 'channel' })
  assert.match(sql, /SELECT channel AS dim, SUM\(spend\) AS value/)
  assert.match(sql, /GROUP BY channel/)
  assert.match(sql, /ORDER BY value DESC/)
}
// Grouped + filters: WHERE clause appears AFTER the BETWEEN clause.
{
  const sql = buildMetricSql('ad_spend', [{ column: 'country', values: ['US'] }], { groupBy: 'channel' })
  assert.match(sql, /AND country = 'US'/)
  assert.match(sql, /GROUP BY channel/)
}
// Grouped: unsafe dim column rejected.
assert.throws(() => buildMetricSql('ad_spend', [], { groupBy: 'bad col' }), /unsafe TripleWhale dimension/)
// Series day: DATE_TRUNC('day', event_date) AS bucket, GROUP BY bucket, ORDER BY bucket ASC.
{
  const sql = buildMetricSql('ad_spend', [], { bucket: 'day' })
  assert.match(sql, /DATE_TRUNC\('day', event_date\) AS bucket/)
  assert.match(sql, /SUM\(spend\) AS value/)
  assert.match(sql, /GROUP BY bucket/)
  assert.match(sql, /ORDER BY bucket ASC/)
}
// Series week.
{
  const sql = buildMetricSql('ad_spend', [], { bucket: 'week' })
  assert.match(sql, /DATE_TRUNC\('week', event_date\) AS bucket/)
}
// Series month.
{
  const sql = buildMetricSql('ad_spend', [], { bucket: 'month' })
  assert.match(sql, /DATE_TRUNC\('month', event_date\) AS bucket/)
}
```

- [ ] **Step 4: Run to verify failure**

Run: `npx tsx lib/triplewhale/queries.test.ts`
Expected: FAIL — `buildMetricSql` does not accept a third argument; some assertions fail.

- [ ] **Step 5: Extend `buildMetricSql`**

Open `lib/triplewhale/queries.ts`. Replace `buildMetricSql` (currently lines 50–72) with:

```ts
import type { Granularity } from '@/lib/dashboard/types'

const PIXEL_TVF = `pixel_joined_tvf(
  subscription_filter      = NULL,
  include_custom_ad_spend  = true,
  sales_platform_filter    = NULL,
  use_click_date           = false
)`
const BASE_WHERE = `event_date BETWEEN @startDate AND @endDate
  AND attribution_window = '7_days'
  AND model = 'Triple Attribution'`

export interface BuildOptions {
  /** Single-column GROUP BY for grouped mode. v1 enforces single column. */
  groupBy?: string
  /** DATE_TRUNC bucket for series mode. */
  bucket?: Granularity
}

/**
 * Single-row aggregate query for one metric (scalar mode), OR a multi-row
 * grouped/series query when opts is provided. Filters are AND-combined in all
 * modes. `@startDate`/`@endDate` substitute server-side from `period`.
 */
export function buildMetricSql(
  metric: string,
  filters: TwFilter[] = [],
  opts: BuildOptions = {},
): string {
  const expr = TW_METRIC_SQL[metric as TwMetric] ?? (isSafeColumn(metric) ? `SUM(${metric})` : null)
  if (expr === null) throw new TwQueryError(`unsafe TripleWhale metric: ${metric}`)
  const filterSql = filters
    .map((f) => {
      if (!isSafeColumn(f.column)) throw new TwQueryError(`unsafe TripleWhale filter column: ${f.column}`)
      const vals = f.values.filter((v) => v !== '')
      if (vals.length === 0) return ''
      if (vals.length === 1) return `\n  AND ${f.column} = '${escapeSqlValue(vals[0])}'`
      return `\n  AND ${f.column} IN (${vals.map((v) => `'${escapeSqlValue(v)}'`).join(', ')})`
    })
    .join('')

  // Grouped mode: SELECT dim, value FROM ... GROUP BY dim ORDER BY value DESC.
  if (opts.groupBy) {
    if (!isSafeColumn(opts.groupBy)) throw new TwQueryError(`unsafe TripleWhale dimension: ${opts.groupBy}`)
    return `SELECT ${opts.groupBy} AS dim, ${expr} AS value
FROM ${PIXEL_TVF}
WHERE ${BASE_WHERE}${filterSql}
GROUP BY ${opts.groupBy}
ORDER BY value DESC`
  }

  // Series mode: SELECT DATE_TRUNC(bucket, event_date), value FROM ... GROUP BY bucket ORDER BY bucket ASC.
  if (opts.bucket) {
    return `SELECT DATE_TRUNC('${opts.bucket}', event_date) AS bucket, ${expr} AS value
FROM ${PIXEL_TVF}
WHERE ${BASE_WHERE}${filterSql}
GROUP BY bucket
ORDER BY bucket ASC`
  }

  // Scalar mode (existing behavior).
  return `SELECT ${expr} AS value
FROM ${PIXEL_TVF}
WHERE ${BASE_WHERE}${filterSql}`
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npx tsx lib/triplewhale/queries.test.ts`
Expected: `ok`.

- [ ] **Step 7: Re-run the existing scalar adapter test to confirm no regression**

Run: `npx tsx lib/triplewhale/queries.test.ts` (already verified). Then run the test that exercises scalar TW resolution end-to-end if one exists:

Run: `ls lib/dashboard/adapters/triplewhale.test.ts 2>/dev/null`
- If absent: skip — Task 5 will create it.
- If present: `npx tsx lib/dashboard/adapters/triplewhale.test.ts` should still pass (scalar branch unchanged).

- [ ] **Step 8: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/supermetrics/constants.ts lib/triplewhale/queries.ts lib/triplewhale/queries.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): SM time-dimension map + TW SQL grouped/series builder

Adds SM_TIME_DIMENSION (per-DS time-dimension field IDs for series mode)
to lib/supermetrics/constants.ts. Covers GAWA, AW, FA, SHP, LIA — every
DS the paid-media team currently uses.

Extends buildMetricSql in lib/triplewhale/queries.ts with optional
BuildOptions {groupBy, bucket}. Scalar branch unchanged. Grouped emits
SELECT dim, SUM(...) ORDER BY value DESC. Series emits DATE_TRUNC bucket
+ GROUP BY bucket ORDER BY bucket ASC. Reuses existing isSafeColumn
allowlist for dimension column safety.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Supermetrics adapter — grouped + series

Adds `resolveSupermetricsGrouped` and `resolveSupermetricsSeries` to the SM adapter, plus exported pure helpers for row-to-shape conversion + cache key construction. The scalar path (`resolveSupermetricsLeaf`) is unchanged.

**Files:**
- Modify: `lib/dashboard/adapters/supermetrics.ts` (add 2 public resolvers + 4 pure helpers)
- Modify: `lib/dashboard/adapters/supermetrics.test.ts` (append cases for pure helpers + key isolation)

**Interfaces:**
- Consumes: `SupermetricsBinding`, `Granularity`, `GroupedRow`, `SeriesPoint` (Task 1); `SM_TIME_DIMENSION` (Task 3); `joinGrouped`, `alignSeries` (Task 1); `normalizeSmBucket` (Task 1); existing `smQuery`, `parseSmRows`, `buildSmFilter`, `keyHash`, `resolveSmApiKey`.
- Produces: `resolveSupermetricsGrouped(b: SupermetricsBinding, ctx, dateRange, compareRange): Promise<GroupedRow[]>`.
- Produces: `resolveSupermetricsSeries(b: SupermetricsBinding, granularity: Granularity, ctx, dateRange, compareRange): Promise<SeriesPoint[]>`.
- Produces (exported, pure, tested): `groupRowsFromSm(rows, dim, metricField)`, `seriesPointsFromSm(rows, timeDim, metricField, granularity)`, `buildSmGroupedKey(b, dim, isoRange, apiKey)`, `buildSmSeriesKey(b, granularity, isoRange, apiKey)`.

- [ ] **Step 1: Write failing tests for pure helpers**

Open `lib/dashboard/adapters/supermetrics.test.ts`. Append before `console.log('ok')`:

```ts
import { groupRowsFromSm, seriesPointsFromSm, buildSmGroupedKey, buildSmSeriesKey } from './supermetrics'

// groupRowsFromSm: extracts {dim, value} per row; blanks coerced to 0.
{
  const rows: Record<string, string>[] = [
    { Channel: 'Google', SocialSpend: '1000' },
    { Channel: 'Meta',   SocialSpend: '500'  },
    { Channel: 'TikTok', SocialSpend: ''     },
  ]
  assert.deepEqual(groupRowsFromSm(rows, 'Channel', 'SocialSpend'), [
    { dim: 'Google', value: 1000 },
    { dim: 'Meta',   value: 500 },
    { dim: 'TikTok', value: 0 },
  ])
}

// seriesPointsFromSm: extracts {bucket, value}; bucket normalized via normalizeSmBucket.
{
  const rows: Record<string, string>[] = [
    { Date: '2026-06-22', Cost: '100' },
    { Date: '2026-06-23', Cost: '150' },
  ]
  assert.deepEqual(seriesPointsFromSm(rows, 'Date', 'Cost', 'day'), [
    { bucket: '2026-06-22', value: 100 },
    { bucket: '2026-06-23', value: 150 },
  ])
}

// buildSmGroupedKey: encodes the §9 matrix exactly.
{
  const b = { source: 'supermetrics' as const, dsId: 'AW', metricField: 'Cost', account: '1' }
  const key = buildSmGroupedKey(b, 'Channel', '2026-06-01,2026-06-30', 'k')
  assert.equal(key[0], 'sm-grouped')
  assert.equal(key[1], 'AW')
  assert.equal(key[2], '1')
  assert.equal(key[3], 'Cost')
  assert.equal(key[4], 'Channel')
  assert.equal(key[5], '2026-06-01,2026-06-30')
  assert.equal(key[6], '')                // no filters → empty string
  assert.equal(typeof key[7], 'string')   // keyHash present
  assert.equal(key[7].length, 16)
}
// buildSmGroupedKey: filters present → filter string in slot 6.
{
  const b = { source: 'supermetrics' as const, dsId: 'AW', metricField: 'Cost', account: '1', filters: [{ column: 'country', values: ['US'] }] }
  const key = buildSmGroupedKey(b, 'Channel', '2026-06-01,2026-06-30', 'k')
  assert.equal(key[6], 'country == US')
}
// buildSmSeriesKey: granularity in slot 4.
{
  const b = { source: 'supermetrics' as const, dsId: 'AW', metricField: 'Cost', account: '1' }
  const key = buildSmSeriesKey(b, 'week', '2026-06-01,2026-06-30', 'k')
  assert.equal(key[0], 'sm-series')
  assert.equal(key[4], 'week')
}
// Cache key isolation: grouped vs series vs scalar prefixes are distinct.
{
  const b = { source: 'supermetrics' as const, dsId: 'AW', metricField: 'Cost', account: '1' }
  assert.equal(buildSmGroupedKey(b, 'Channel', 'r', 'k')[0], 'sm-grouped')
  assert.equal(buildSmSeriesKey(b, 'day', 'r', 'k')[0], 'sm-series')
}
```

(Note: `lib/triplewhale/client.ts` exports `buildSmFilter` consumers in the existing test; this set of asserts only touches the new exports.)

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx lib/dashboard/adapters/supermetrics.test.ts`
Expected: FAIL — `groupRowsFromSm`, `seriesPointsFromSm`, `buildSmGroupedKey`, `buildSmSeriesKey` not exported.

- [ ] **Step 3: Add the four pure helpers to the SM adapter**

Open `lib/dashboard/adapters/supermetrics.ts`. Add (anywhere after the existing `accountDrift` export):

```ts
import type { Granularity, GroupedRow, SeriesPoint } from '../types'
import { joinGrouped, alignSeries } from '../group-join'
import { normalizeSmBucket } from '@/lib/supermetrics/buckets'
import { SM_TIME_DIMENSION } from '@/lib/supermetrics/constants'
import { InvalidMetricError } from '../errors'

/** Flatten SM rows into { dim, value } shape. Numeric coercion: blank → 0. */
export function groupRowsFromSm(
  rows: Record<string, string>[],
  dim: string,
  metricField: string,
): { dim: string; value: number }[] {
  return rows.map((r) => ({ dim: r[dim], value: Number(r[metricField] || 0) }))
}

/** Flatten SM rows into { bucket, value } shape; bucket normalized via normalizeSmBucket. */
export function seriesPointsFromSm(
  rows: Record<string, string>[],
  timeDim: string,
  metricField: string,
  granularity: Granularity,
): { bucket: string; value: number }[] {
  return rows
    .map((r) => ({ bucket: normalizeSmBucket(r[timeDim], granularity), value: Number(r[metricField] || 0) }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
}

/** Cache key for sm-grouped. Components match design §9. */
export function buildSmGroupedKey(
  b: SupermetricsBinding,
  dim: string,
  isoRange: string,
  apiKey: string,
): string[] {
  return ['sm-grouped', b.dsId, b.account, b.metricField, dim, isoRange, buildSmFilter(b.filters) ?? '', keyHash(apiKey)]
}

/** Cache key for sm-series. Components match design §9. */
export function buildSmSeriesKey(
  b: SupermetricsBinding,
  granularity: Granularity,
  isoRange: string,
  apiKey: string,
): string[] {
  return ['sm-series', b.dsId, b.account, b.metricField, granularity, isoRange, buildSmFilter(b.filters) ?? '', keyHash(apiKey)]
}
```

Note: `errors.ts` already exports `DisconnectedError` and `NoDataError`. It does NOT yet export `InvalidMetricError`. Check before importing:

Run: `grep -n "InvalidMetricError" lib/dashboard/errors.ts`

- If present: skip the next sub-step.
- If absent: open `lib/dashboard/errors.ts` and add (alongside the existing error classes):
  ```ts
  export class InvalidMetricError extends Error { constructor(msg = 'invalid-metric') { super(msg); this.name = 'InvalidMetricError' } }
  ```
  And add the mapping to `mapError`:
  ```ts
  if (e instanceof InvalidMetricError) return 'invalid-metric'
  ```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx lib/dashboard/adapters/supermetrics.test.ts`
Expected: `ok`.

- [ ] **Step 5: Implement `resolveSupermetricsGrouped`**

In `lib/dashboard/adapters/supermetrics.ts`, after `resolveSupermetricsLeaf`, add:

```ts
async function fetchGroupedForRange(
  apiKey: string,
  b: SupermetricsBinding,
  dim: string,
  isoRange: string,
): Promise<{ dim: string; value: number }[]> {
  return unstable_cache(
    async () => {
      const result = await smQuery({
        apiKey, dsId: b.dsId, dsAccounts: b.account,
        fields: [dim, b.metricField],
        dateRange: isoRange,
        filters: buildSmFilter(b.filters),
      })
      const rows = parseSmRows(result, [dim, b.metricField])
      if (rows.length === 0) throw new NoDataError(`no rows for ${b.metricField} grouped by ${dim} in ${isoRange}`)
      return groupRowsFromSm(rows, dim, b.metricField)
    },
    buildSmGroupedKey(b, dim, isoRange, apiKey),
    { revalidate: 3600 },
  )()
}

export async function resolveSupermetricsGrouped(
  b: SupermetricsBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<GroupedRow[]> {
  if (!b.dimensions || b.dimensions.length !== 1) {
    throw new InvalidMetricError('resolveSupermetricsGrouped requires a single dimension')
  }
  const dim = b.dimensions[0]
  if (!SM_COLUMN_RE.test(dim)) throw new InvalidMetricError(`unsafe SM dimension: ${dim}`)

  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const client = await getClientBySlug(ctx.slug)
  const apiKey = resolveSmApiKey(client?.smApiKeyEnvVar, process.env)
  if (!apiKey) throw new DisconnectedError(`Supermetrics not connected for ${ctx.slug}`)

  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [current, prior] = await Promise.all([
    fetchGroupedForRange(apiKey, b, dim, `${startDate},${endDate}`),
    compareIso ? fetchGroupedForRange(apiKey, b, dim, compareIso) : Promise.resolve(null),
  ])

  return joinGrouped(current, prior, dim)
}
```

- [ ] **Step 6: Implement `resolveSupermetricsSeries`**

Right after `resolveSupermetricsGrouped`, add:

```ts
async function fetchSeriesForRange(
  apiKey: string,
  b: SupermetricsBinding,
  timeDim: string,
  granularity: Granularity,
  isoRange: string,
): Promise<{ bucket: string; value: number }[]> {
  return unstable_cache(
    async () => {
      const result = await smQuery({
        apiKey, dsId: b.dsId, dsAccounts: b.account,
        fields: [timeDim, b.metricField],
        dateRange: isoRange,
        filters: buildSmFilter(b.filters),
      })
      const rows = parseSmRows(result, [timeDim, b.metricField])
      if (rows.length === 0) throw new NoDataError(`no series rows for ${b.metricField} in ${isoRange}`)
      return seriesPointsFromSm(rows, timeDim, b.metricField, granularity)
    },
    buildSmSeriesKey(b, granularity, isoRange, apiKey),
    { revalidate: 3600 },
  )()
}

export async function resolveSupermetricsSeries(
  b: SupermetricsBinding,
  granularity: Granularity,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<SeriesPoint[]> {
  const dimMap = SM_TIME_DIMENSION[b.dsId as keyof typeof SM_TIME_DIMENSION]
  if (!dimMap) throw new InvalidMetricError(`no time dimension map for SM ds ${b.dsId}`)
  const timeDim = dimMap[granularity]

  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const client = await getClientBySlug(ctx.slug)
  const apiKey = resolveSmApiKey(client?.smApiKeyEnvVar, process.env)
  if (!apiKey) throw new DisconnectedError(`Supermetrics not connected for ${ctx.slug}`)

  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [current, prior] = await Promise.all([
    fetchSeriesForRange(apiKey, b, timeDim, granularity, `${startDate},${endDate}`),
    compareIso ? fetchSeriesForRange(apiKey, b, timeDim, granularity, compareIso) : Promise.resolve(null),
  ])

  return alignSeries(current, prior)
}
```

- [ ] **Step 7: Re-run the SM adapter test**

Run: `npx tsx lib/dashboard/adapters/supermetrics.test.ts`
Expected: `ok`. (All previous assertions + new pure-helper assertions.)

- [ ] **Step 8: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/dashboard/adapters/supermetrics.ts lib/dashboard/adapters/supermetrics.test.ts lib/dashboard/errors.ts
git commit -m "$(cat <<'EOF'
feat(supermetrics): grouped + series adapter resolvers

Adds resolveSupermetricsGrouped (single-dim group-by via fields=[dim,metric]
on smQuery) and resolveSupermetricsSeries (time-bucketed via SM_TIME_DIMENSION
lookup + normalizeSmBucket on the returned label). Both wrap fetches in
unstable_cache with distinct key namespaces (sm-grouped / sm-series) so
they never collide with scalar (sm-data). Compare-range fetched in parallel
and outer-joined (joinGrouped) or index-aligned (alignSeries). Scalar path
(resolveSupermetricsLeaf) is unchanged.

Exports four pure helpers covered by unit tests: groupRowsFromSm,
seriesPointsFromSm, buildSmGroupedKey, buildSmSeriesKey. Cache-key shape
matches design §9 verbatim.

InvalidMetricError class added to lib/dashboard/errors.ts (if missing) and
wired into mapError → 'invalid-metric'.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: TripleWhale adapter — grouped + series

Adds `resolveTripleWhaleGrouped` and `resolveTripleWhaleSeries` to the TW adapter, paralleling the SM adapter's structure. Reuses Task 3's `buildMetricSql` SQL builder. Creates the TW adapter test file (today absent).

**Files:**
- Modify: `lib/dashboard/adapters/triplewhale.ts` (add 2 public resolvers + 4 pure helpers)
- Create: `lib/dashboard/adapters/triplewhale.test.ts`

**Interfaces:**
- Consumes: `TripleWhaleBinding`, `Granularity`, `GroupedRow`, `SeriesPoint` (Task 1); extended `buildMetricSql` (Task 3); `joinGrouped`, `alignSeries` (Task 1); existing `twSql`, `twValue`.
- Produces: `resolveTripleWhaleGrouped(b: TripleWhaleBinding, ctx, dateRange, compareRange): Promise<GroupedRow[]>`.
- Produces: `resolveTripleWhaleSeries(b: TripleWhaleBinding, granularity: Granularity, ctx, dateRange, compareRange): Promise<SeriesPoint[]>`.
- Produces (exported, pure, tested): `groupRowsFromTw(sqlRows)`, `seriesPointsFromTw(sqlRows)`, `buildTwGroupedKey(b, dim, isoRange)`, `buildTwSeriesKey(b, granularity, isoRange)`.

- [ ] **Step 1: Write failing TW adapter test**

Create `lib/dashboard/adapters/triplewhale.test.ts`:

```ts
// lib/dashboard/adapters/triplewhale.test.ts
// Run: npx tsx lib/dashboard/adapters/triplewhale.test.ts
import { strict as assert } from 'node:assert'
import { groupRowsFromTw, seriesPointsFromTw, buildTwGroupedKey, buildTwSeriesKey } from './triplewhale'

// groupRowsFromTw: SQL row shape { dim, value } → flat helper output.
{
  const rows = [
    { dim: 'Google', value: 1000 },
    { dim: 'Meta', value: 500 },
  ]
  assert.deepEqual(groupRowsFromTw(rows), [
    { dim: 'Google', value: 1000 },
    { dim: 'Meta',   value: 500 },
  ])
}
// groupRowsFromTw: numeric strings coerced; null/undefined → 0.
{
  const rows = [
    { dim: 'A', value: '100' },
    { dim: 'B', value: null },
    { dim: 'C', value: undefined },
  ] as unknown as { dim: unknown; value: unknown }[]
  assert.deepEqual(groupRowsFromTw(rows), [
    { dim: 'A', value: 100 },
    { dim: 'B', value: 0 },
    { dim: 'C', value: 0 },
  ])
}

// seriesPointsFromTw: bucket from DATE_TRUNC already ISO; sorted ascending.
{
  const rows = [
    { bucket: '2026-06-23', value: 150 },
    { bucket: '2026-06-22', value: 100 },
  ]
  assert.deepEqual(seriesPointsFromTw(rows), [
    { bucket: '2026-06-22', value: 100 },
    { bucket: '2026-06-23', value: 150 },
  ])
}
// seriesPointsFromTw: ISO timestamps trimmed to date.
{
  const rows = [{ bucket: '2026-06-22T00:00:00.000Z', value: 100 }]
  assert.deepEqual(seriesPointsFromTw(rows), [{ bucket: '2026-06-22', value: 100 }])
}

// buildTwGroupedKey shape.
{
  const b = { source: 'triplewhale' as const, metric: 'ad_spend' }
  const k = buildTwGroupedKey(b, 'channel', '2026-06-01,2026-06-30')
  assert.equal(k[0], 'tw-grouped')
  assert.equal(k[1], 'ad_spend')
  assert.equal(k[2], 'channel')
  assert.equal(k[3], '2026-06-01,2026-06-30')
  assert.equal(k[4], '')                  // no filters → empty
}
// buildTwSeriesKey shape.
{
  const b = { source: 'triplewhale' as const, metric: 'revenue', filters: [{ column: 'country', values: ['US'] }] }
  const k = buildTwSeriesKey(b, 'week', '2026-06-01,2026-06-30')
  assert.equal(k[0], 'tw-series')
  assert.equal(k[1], 'revenue')
  assert.equal(k[2], 'week')
  assert.equal(k[3], '2026-06-01,2026-06-30')
  assert.match(k[4], /country = 'US'/)    // filter string serialized
}

console.log('ok')
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx lib/dashboard/adapters/triplewhale.test.ts`
Expected: FAIL — exports do not exist.

- [ ] **Step 3: Add the four pure helpers + the two resolvers to the TW adapter**

Open `lib/dashboard/adapters/triplewhale.ts`. Replace the entire file with:

```ts
// lib/dashboard/adapters/triplewhale.ts
import { unstable_cache } from 'next/cache'
import { twSql, twValue, TwQueryError } from '@/lib/triplewhale/client'
import { buildMetricSql } from '@/lib/triplewhale/queries'
import type { Granularity, GroupedRow, LeafValue, SeriesPoint, TripleWhaleBinding } from '../types'
import { DisconnectedError, InvalidMetricError, NoDataError } from '../errors'
import { joinGrouped, alignSeries } from '../group-join'

/** Number-coerce TW value cells. Blank/null/undefined → 0. */
function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Flatten TW SQL rows into { dim, value } shape. */
export function groupRowsFromTw(rows: { dim: unknown; value: unknown }[]): { dim: string; value: number }[] {
  return rows.map((r) => ({ dim: String(r.dim), value: toNumber(r.value) }))
}

/** Flatten TW SQL rows into { bucket, value } shape; bucket trimmed to date,
 *  rows sorted ascending. */
export function seriesPointsFromTw(rows: { bucket: unknown; value: unknown }[]): { bucket: string; value: number }[] {
  return rows
    .map((r) => ({ bucket: String(r.bucket).slice(0, 10), value: toNumber(r.value) }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
}

/** Serialize TW filters into a stable cache-key string (matches the WHERE clause shape). */
function twFilterKey(b: TripleWhaleBinding): string {
  if (!b.filters || b.filters.length === 0) return ''
  return b.filters
    .map((f) => {
      const vals = (f.values ?? []).filter((v) => v !== '')
      if (vals.length === 0) return ''
      if (vals.length === 1) return `${f.column} = '${vals[0]}'`
      return `${f.column} IN (${vals.map((v) => `'${v}'`).join(', ')})`
    })
    .filter((s) => s !== '')
    .join(' AND ')
}

export function buildTwGroupedKey(b: TripleWhaleBinding, dim: string, isoRange: string): string[] {
  return ['tw-grouped', b.metric, dim, isoRange, twFilterKey(b)]
}

export function buildTwSeriesKey(b: TripleWhaleBinding, granularity: Granularity, isoRange: string): string[] {
  return ['tw-series', b.metric, granularity, isoRange, twFilterKey(b)]
}

/** Scalar resolver — unchanged behavior. */
export async function resolveTripleWhaleLeaf(
  b: TripleWhaleBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafValue> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  const shopId = (await getClientBySlug(ctx.slug))?.triplewhaleShopId
  if (!apiKey || !shopId) throw new DisconnectedError(`TripleWhale not connected for ${ctx.slug}`)

  const query = buildMetricSql(b.metric, b.filters)
  const fetchValue = async (isoRange: string): Promise<number> => {
    const [startDate, endDate] = isoRange.split(',')
    const rows = await twSql({ apiKey, shopId, query, startDate, endDate })
    const v = twValue(rows)
    if (v === null) throw new NoDataError(`no TripleWhale data for ${b.metric} in ${isoRange}`)
    return v
  }

  const { startDate, endDate } = parseDateRange(dateRange)
  const value = await fetchValue(`${startDate},${endDate}`)
  const compareIso = resolveCompareIso(dateRange, compareRange)
  const prevValue = compareIso ? await fetchValue(compareIso) : undefined

  return { value, prevValue }
}

async function fetchTwGroupedForRange(
  apiKey: string,
  shopId: string,
  b: TripleWhaleBinding,
  dim: string,
  isoRange: string,
): Promise<{ dim: string; value: number }[]> {
  return unstable_cache(
    async () => {
      const [startDate, endDate] = isoRange.split(',')
      const query = buildMetricSql(b.metric, b.filters, { groupBy: dim })
      const rows = await twSql({ apiKey, shopId, query, startDate, endDate })
      if (rows.length === 0) throw new NoDataError(`no TW grouped rows for ${b.metric} by ${dim} in ${isoRange}`)
      return groupRowsFromTw(rows as { dim: unknown; value: unknown }[])
    },
    buildTwGroupedKey(b, dim, isoRange),
    { revalidate: 3600 },
  )()
}

export async function resolveTripleWhaleGrouped(
  b: TripleWhaleBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<GroupedRow[]> {
  if (!b.dimensions || b.dimensions.length !== 1) {
    throw new InvalidMetricError('resolveTripleWhaleGrouped requires a single dimension')
  }
  const dim = b.dimensions[0]

  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  const shopId = (await getClientBySlug(ctx.slug))?.triplewhaleShopId
  if (!apiKey || !shopId) throw new DisconnectedError(`TripleWhale not connected for ${ctx.slug}`)

  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [current, prior] = await Promise.all([
    fetchTwGroupedForRange(apiKey, shopId, b, dim, `${startDate},${endDate}`),
    compareIso ? fetchTwGroupedForRange(apiKey, shopId, b, dim, compareIso) : Promise.resolve(null),
  ])

  return joinGrouped(current, prior, dim)
}

async function fetchTwSeriesForRange(
  apiKey: string,
  shopId: string,
  b: TripleWhaleBinding,
  granularity: Granularity,
  isoRange: string,
): Promise<{ bucket: string; value: number }[]> {
  return unstable_cache(
    async () => {
      const [startDate, endDate] = isoRange.split(',')
      const query = buildMetricSql(b.metric, b.filters, { bucket: granularity })
      const rows = await twSql({ apiKey, shopId, query, startDate, endDate })
      if (rows.length === 0) throw new NoDataError(`no TW series rows for ${b.metric} in ${isoRange}`)
      return seriesPointsFromTw(rows as { bucket: unknown; value: unknown }[])
    },
    buildTwSeriesKey(b, granularity, isoRange),
    { revalidate: 3600 },
  )()
}

export async function resolveTripleWhaleSeries(
  b: TripleWhaleBinding,
  granularity: Granularity,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<SeriesPoint[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  const shopId = (await getClientBySlug(ctx.slug))?.triplewhaleShopId
  if (!apiKey || !shopId) throw new DisconnectedError(`TripleWhale not connected for ${ctx.slug}`)

  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [current, prior] = await Promise.all([
    fetchTwSeriesForRange(apiKey, shopId, b, granularity, `${startDate},${endDate}`),
    compareIso ? fetchTwSeriesForRange(apiKey, shopId, b, granularity, compareIso) : Promise.resolve(null),
  ])

  return alignSeries(current, prior)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx lib/dashboard/adapters/triplewhale.test.ts`
Expected: `ok`.

- [ ] **Step 5: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/adapters/triplewhale.ts lib/dashboard/adapters/triplewhale.test.ts
git commit -m "$(cat <<'EOF'
feat(triplewhale): grouped + series adapter resolvers

Adds resolveTripleWhaleGrouped and resolveTripleWhaleSeries paralleling the
SM grouped/series adapters. Both wrap twSql fetches in unstable_cache with
tw-grouped / tw-series key namespaces. Scalar path
(resolveTripleWhaleLeaf) is unchanged.

Exports four pure helpers covered by unit tests: groupRowsFromTw,
seriesPointsFromTw, buildTwGroupedKey, buildTwSeriesKey. Cache-key shape
matches design §9.

Creates lib/dashboard/adapters/triplewhale.test.ts (previously absent).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Top-level resolver dispatch — `resolveGroupedBlock` + `resolveSeriesBlock`

Adds the two public resolver entry points alongside the existing `resolveBlock`. Both reject aggregate and calculated bindings with `invalid-metric`. Registers default dispatch by source.

**Files:**
- Modify: `lib/dashboard/registry.ts` (add `resolveGrouped`, `resolveSeries` dispatchers)
- Modify: `lib/dashboard/resolve.ts` (add `resolveGroupedBlock`, `resolveSeriesBlock`)
- Modify: `lib/dashboard/resolve.test.ts` (append cases)

**Interfaces:**
- Consumes: `resolveSupermetricsGrouped`, `resolveSupermetricsSeries` (Task 4); `resolveTripleWhaleGrouped`, `resolveTripleWhaleSeries` (Task 5); `mapError`, `InvalidMetricError`; `GroupedResult`, `SeriesResult`, `Granularity`.
- Produces: `resolveGrouped(b: LeafBinding, ctx, dateRange, compareRange): Promise<GroupedRow[]>` (registry-level dispatch by source).
- Produces: `resolveSeries(b: LeafBinding, granularity: Granularity, ctx, dateRange, compareRange): Promise<SeriesPoint[]>` (registry-level dispatch).
- Produces: `resolveGroupedBlock(config, global, ctx, deps?): Promise<GroupedResult>`.
- Produces: `resolveSeriesBlock(config, global, ctx, deps?): Promise<SeriesResult>`.
- Produces: `GroupedResolver`, `SeriesResolver` type aliases (mirror existing `LeafResolver`).

- [ ] **Step 1: Extend the registry**

Open `lib/dashboard/registry.ts`. Replace the entire file with:

```ts
import type { Granularity, GroupedRow, LeafBinding, LeafValue, SeriesPoint } from './types'
import { resolveSupermetricsLeaf, resolveSupermetricsGrouped, resolveSupermetricsSeries } from './adapters/supermetrics'
import { resolveTripleWhaleLeaf, resolveTripleWhaleGrouped, resolveTripleWhaleSeries } from './adapters/triplewhale'

/** Real leaf dispatcher used at runtime. resolveBlock injects this by default. */
export function resolveLeaf(
  b: LeafBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafValue> {
  switch (b.source) {
    case 'supermetrics':
      return resolveSupermetricsLeaf(b, ctx, dateRange, compareRange)
    case 'triplewhale':
      return resolveTripleWhaleLeaf(b, ctx, dateRange, compareRange)
  }
}

/** Default grouped dispatcher. resolveGroupedBlock injects this by default. */
export function resolveGrouped(
  b: LeafBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<GroupedRow[]> {
  switch (b.source) {
    case 'supermetrics':
      return resolveSupermetricsGrouped(b, ctx, dateRange, compareRange)
    case 'triplewhale':
      return resolveTripleWhaleGrouped(b, ctx, dateRange, compareRange)
  }
}

/** Default series dispatcher. resolveSeriesBlock injects this by default. */
export function resolveSeries(
  b: LeafBinding,
  granularity: Granularity,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<SeriesPoint[]> {
  switch (b.source) {
    case 'supermetrics':
      return resolveSupermetricsSeries(b, granularity, ctx, dateRange, compareRange)
    case 'triplewhale':
      return resolveTripleWhaleSeries(b, granularity, ctx, dateRange, compareRange)
  }
}
```

- [ ] **Step 2: Write failing tests for new dispatchers**

Open `lib/dashboard/resolve.test.ts`. Append before the final `console.log` (the test file follows an `async function run() { … }` wrapper — append inside the run() function, before its closing brace):

```ts
  // resolveGroupedBlock: aggregate binding → invalid-metric.
  {
    const { resolveGroupedBlock } = await import('./resolve')
    const agg: BlockConfig = {
      id: 'a', name: 'X', format: 'number', range: null,
      binding: { source: 'aggregate', op: '/',
        left:  { source: 'triplewhale', metric: 'revenue' },
        right: { source: 'triplewhale', metric: 'ad_spend' } },
    }
    const r = await resolveGroupedBlock(agg, GLOBAL, { slug: 'k' })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.error, 'invalid-metric')
  }

  // resolveGroupedBlock: calculated binding → invalid-metric.
  {
    const { resolveGroupedBlock } = await import('./resolve')
    const calc: BlockConfig = {
      id: 'c', name: 'X', format: 'number', range: null,
      binding: { source: 'calculated', terms: [{ coefficient: 1, leaf: { source: 'triplewhale', metric: 'revenue' } }] },
    }
    const r = await resolveGroupedBlock(calc, GLOBAL, { slug: 'k' })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.error, 'invalid-metric')
  }

  // resolveGroupedBlock: leaf binding + mock resolver → ok with rows + format.
  {
    const { resolveGroupedBlock, type: _ } = await import('./resolve')
    const cfg: BlockConfig = {
      id: 'g', name: 'Spend by Channel', format: 'currency', range: null,
      binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', dimensions: ['Channel'] },
    }
    const mock = async () => [{ dim: { Channel: 'Google' }, value: 1000 }]
    const r = await resolveGroupedBlock(cfg, GLOBAL, { slug: 'k' }, { resolveGrouped: mock })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.rows.length, 1)
      assert.equal(r.format, 'currency')
    }
  }

  // resolveSeriesBlock: missing granularity → invalid-metric.
  {
    const { resolveSeriesBlock } = await import('./resolve')
    const cfg: BlockConfig = {
      id: 's', name: 'X', format: 'number', range: null,
      binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' },
    }
    const r = await resolveSeriesBlock(cfg, GLOBAL, { slug: 'k' })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.error, 'invalid-metric')
  }

  // resolveSeriesBlock: leaf binding + granularity + mock → ok with points + granularity.
  {
    const { resolveSeriesBlock } = await import('./resolve')
    const cfg: BlockConfig = {
      id: 's2', name: 'Cost over time', format: 'currency', range: null,
      binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', granularity: 'day' },
    }
    const mock = async () => [{ bucket: '2026-06-22', value: 10 }, { bucket: '2026-06-23', value: 20 }]
    const r = await resolveSeriesBlock(cfg, GLOBAL, { slug: 'k' }, { resolveSeries: mock })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.points.length, 2)
      assert.equal(r.granularity, 'day')
      assert.equal(r.format, 'currency')
    }
  }

  // resolveSeriesBlock: mock throws → result-level error mapped.
  {
    const { resolveSeriesBlock } = await import('./resolve')
    const cfg: BlockConfig = {
      id: 's3', name: 'X', format: 'number', range: null,
      binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', granularity: 'day' },
    }
    const mock = async () => { throw new NoDataError('empty') }
    const r = await resolveSeriesBlock(cfg, GLOBAL, { slug: 'k' }, { resolveSeries: mock })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.error, 'no-data')
  }
```

- [ ] **Step 3: Run to verify failure**

Run: `npx tsx lib/dashboard/resolve.test.ts`
Expected: FAIL — `resolveGroupedBlock`/`resolveSeriesBlock` not exported.

- [ ] **Step 4: Implement the two new resolvers**

Open `lib/dashboard/resolve.ts`. Replace its full contents with:

```ts
// lib/dashboard/resolve.ts
import type {
  BlockConfig, Granularity, GroupedResult, GroupedRow, LeafAttempt, LeafBinding, LeafValue,
  ResolveResult, SeriesPoint, SeriesResult,
} from './types'
import {
  resolveLeaf as defaultResolveLeaf,
  resolveGrouped as defaultResolveGrouped,
  resolveSeries as defaultResolveSeries,
} from './registry'
import { resolveAggregate, resolveCalculated, type AttemptLeaf } from './aggregate'
import { mapError } from './errors'
import { computeDelta } from '@/lib/metrics'
import { formatMetric } from './format'

export type LeafResolver = (
  b: LeafBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
) => Promise<LeafValue>

export type GroupedResolver = (
  b: LeafBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
) => Promise<GroupedRow[]>

export type SeriesResolver = (
  b: LeafBinding,
  granularity: Granularity,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
) => Promise<SeriesPoint[]>

export async function resolveBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
  deps: { resolveLeaf?: LeafResolver } = {},
): Promise<ResolveResult> {
  const resolveLeaf = deps.resolveLeaf ?? defaultResolveLeaf
  const range = config.range ?? global

  const attemptLeaf: AttemptLeaf = async (b, c, dr, cr): Promise<LeafAttempt> => {
    try {
      const v = await resolveLeaf(b, c, dr, cr)
      return { ok: true, ...v }
    } catch (e) {
      return { ok: false, error: mapError(e) }
    }
  }

  const res: LeafAttempt =
    config.binding.source === 'aggregate'
      ? await resolveAggregate(config.binding, attemptLeaf, ctx, range.dateRange, range.compareRange)
      : config.binding.source === 'calculated'
        ? await resolveCalculated(config.binding, attemptLeaf, ctx, range.dateRange, range.compareRange)
        : await attemptLeaf(config.binding, ctx, range.dateRange, range.compareRange)

  if (!res.ok) return { ok: false, error: res.error }
  const delta = computeDelta(res.value, res.prevValue)
  return {
    ok: true,
    value: res.value,
    prevValue: res.prevValue,
    delta,
    format: config.format,
    formatted: formatMetric(res.value, config.format),
  }
}

/** Grouped resolution: dim breakdown per leaf binding. Aggregate and calculated
 *  bindings are rejected with invalid-metric (v1: leaf only). */
export async function resolveGroupedBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
  deps: { resolveGrouped?: GroupedResolver } = {},
): Promise<GroupedResult> {
  if (config.binding.source !== 'supermetrics' && config.binding.source !== 'triplewhale') {
    return { ok: false, error: 'invalid-metric' }
  }
  const range = config.range ?? global
  const resolve = deps.resolveGrouped ?? defaultResolveGrouped
  try {
    const rows = await resolve(config.binding, ctx, range.dateRange, range.compareRange)
    return { ok: true, rows, format: config.format }
  } catch (e) {
    return { ok: false, error: mapError(e) }
  }
}

/** Time-series resolution: bucketed metric per leaf binding. Granularity required.
 *  Aggregate and calculated bindings are rejected with invalid-metric. */
export async function resolveSeriesBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
  deps: { resolveSeries?: SeriesResolver } = {},
): Promise<SeriesResult> {
  if (config.binding.source !== 'supermetrics' && config.binding.source !== 'triplewhale') {
    return { ok: false, error: 'invalid-metric' }
  }
  const granularity = config.binding.granularity
  if (!granularity) return { ok: false, error: 'invalid-metric' }

  const range = config.range ?? global
  const resolve = deps.resolveSeries ?? defaultResolveSeries
  try {
    const points = await resolve(config.binding, granularity, ctx, range.dateRange, range.compareRange)
    return { ok: true, points, format: config.format, granularity }
  } catch (e) {
    return { ok: false, error: mapError(e) }
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx tsx lib/dashboard/resolve.test.ts`
Expected: `ok`.

- [ ] **Step 6: Run the full test suite to ensure no regressions**

Run, in order:

```bash
npx tsx lib/dashboard/types.test.ts
npx tsx lib/dashboard/persistence.test.ts
npx tsx lib/dashboard/group-join.test.ts
npx tsx lib/supermetrics/buckets.test.ts
npx tsx lib/triplewhale/queries.test.ts
npx tsx lib/dashboard/adapters/supermetrics.test.ts
npx tsx lib/dashboard/adapters/triplewhale.test.ts
npx tsx lib/dashboard/resolve.test.ts
npx tsx components/dashboard/config-mutations.test.ts
npx tsx components/dashboard/block-grid-defaults.test.ts
npx tsx components/dashboard/blocks/kpi-annotations.test.ts
```

Expected: every one prints `ok`. Any failure blocks the commit — investigate and fix in place.

- [ ] **Step 7: Typecheck + build**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean.

Run: `npm run build 2>&1 | grep -E "(Compiled|Running TypeScript|Failed|error TS)"`
Expected: lines including `✓ Compiled successfully` and `Running TypeScript ...`. (The pre-existing `Missing DATABASE_URL` error during page-data collection is acceptable — it's an environment issue, not a code issue.)

- [ ] **Step 8: Commit**

```bash
git add lib/dashboard/registry.ts lib/dashboard/resolve.ts lib/dashboard/resolve.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): resolveGroupedBlock + resolveSeriesBlock top-level resolvers

Adds two sibling resolver entry points alongside the existing resolveBlock:

- resolveGroupedBlock(config, global, ctx, deps?) → GroupedResult.
  Dispatches by binding source via registry.resolveGrouped (Task 4 + 5
  adapters). Rejects aggregate and calculated bindings with invalid-metric
  (v1: leaf-only grouping).

- resolveSeriesBlock(config, global, ctx, deps?) → SeriesResult.
  Requires binding.granularity ('day'|'week'|'month') — missing → invalid-
  metric. Dispatches by source via registry.resolveSeries.

Both expose dependency-injected resolvers (GroupedResolver, SeriesResolver
type aliases) so callers can mock per-binding behavior — matches the
existing LeafResolver injection pattern in resolveBlock.

registry.ts gains resolveGrouped and resolveSeries dispatchers that route
LeafBinding to the right adapter by source field.

Existing scalar path (resolveBlock) is byte-identical in behavior. No
production code consumes the new resolvers yet — sub-project #3 wires them
into the page route.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Push**

Run: `git push`
Expected: branch advances on origin; PR #76 picks up the new commits.

Run: `gh pr view 76 --json mergeable,additions,deletions,changedFiles | head -3`
Expected: `mergeable: MERGEABLE`. Sanity-check the additions count is reasonable (~+800 over the foundation merge).

---

## Self-Review

**1. Spec coverage** — every section of [docs/superpowers/specs/2026-06-25-resolver-polymorphism-design.md](../specs/2026-06-25-resolver-polymorphism-design.md) is covered:

- §3 type contracts → Task 1 (types.ts extension).
- §4.1 SM grouped → Task 4 (`resolveSupermetricsGrouped`, `groupRowsFromSm`, `buildSmGroupedKey`).
- §4.2 SM series → Task 4 (`resolveSupermetricsSeries`, `seriesPointsFromSm`, `buildSmSeriesKey`, `SM_TIME_DIMENSION` lookup from Task 3).
- §4.3 drift guard reuse → adapter delegates to existing `accountDrift` infrastructure (not modified — applies as before in any adapter that consults expectedAccounts).
- §5.1 TW SQL builder extension → Task 3 (`buildMetricSql` with `BuildOptions`).
- §5.2 TW grouped/series adapter dispatch → Task 5.
- §5.3 TW caching → Task 5 (`unstable_cache` on grouped/series fetches; scalar deliberately unwrapped, matches spec).
- §6 resolver dispatch → Task 6 (`resolveGroupedBlock`, `resolveSeriesBlock`, registry dispatchers).
- §6.1 outer-join helper → Task 1 (`joinGrouped`, `alignSeries`).
- §7 persistence parser → Task 2.
- §9 caching matrix → Task 4 (`buildSmGroupedKey`, `buildSmSeriesKey`) and Task 5 (`buildTwGroupedKey`, `buildTwSeriesKey`) — cache key shape encoded in code, not just spec text.
- §10 error precedence → existing `mapError` covers grouped/series throw sites; `InvalidMetricError` added (Task 4) and wired into mapError if missing.
- §11 testing → pure helpers (Task 1, 4, 5), persistence (Task 2), SQL builder (Task 3), dispatch (Task 6). Live API tests deliberately deferred.
- §12 out of scope → no aggregate/calculated grouped (enforced in Task 6 dispatcher), no multi-dim (length-1 invariant in Task 2 parser), no multi-leaf line / multi-metric grouped, no gap-fill, no UI.

**2. Placeholder scan** — none. Every code step shows the actual code; every command step shows the actual command and expected outcome.

**3. Type consistency** — `GroupedRow`, `SeriesPoint`, `GroupedResult`, `SeriesResult`, `Granularity`, `GroupedResolver`, `SeriesResolver` defined in Tasks 1 and 6 are consumed by exact name in Tasks 4, 5, 6. `resolveSupermetricsGrouped`/`resolveSupermetricsSeries`/`resolveTripleWhaleGrouped`/`resolveTripleWhaleSeries` exported in Tasks 4, 5 are imported by exact name in Task 6's `registry.ts`. `joinGrouped` and `alignSeries` defined in Task 1 are consumed by exact name in Tasks 4 and 5.

**4. Compile-green seams** —
- Task 1: pure additions; the helper modules reference types that exist by the end of the task (steps 3–7 fail at typecheck until step 9 adds the types — expected and explicit; step 10 verifies green).
- Task 2: parser changes are additive on optional fields; existing scalar bindings unaffected.
- Task 3: `SM_TIME_DIMENSION` is a new export, `buildMetricSql`'s third argument is optional. Existing scalar TW call site (`lib/dashboard/adapters/triplewhale.ts` line 26: `buildMetricSql(b.metric, b.filters)`) keeps working.
- Task 4: adds new exports only; `resolveSupermetricsLeaf` is unchanged.
- Task 5: rewrites `triplewhale.ts` but the `resolveTripleWhaleLeaf` exported function is byte-identical in behavior (verified by re-running existing scalar resolve.test.ts).
- Task 6: adds new exports only; `resolveBlock` is unchanged in behavior.

**5. Open questions from the spec carried forward to this plan** —
- `SM_TIME_DIMENSION` field IDs (spec §13): the plan uses the spec's tentative values (`Date`, `Week`, `Month`). Spot-check against live `/query/fields` before deploying — note this in the PR description for Paul.
- Compare-only-side dims: encoded in the test for `joinGrouped` (a `MX` prior-only row → emitted with `value: undefined, prevValue: 25`). Renderer (sub-project #3) decides how to display.
- 10k row cap: not changed in this plan. If a high-cardinality grouped query truncates, the existing SmQueryError pathway handles it as `error`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-25-resolver-polymorphism.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task with the writing-plans → subagent-driven-development pattern; review between tasks; fast iteration. Best when you want each commit independently scrutinized before the next task starts.

**2. Inline Execution** — execute all six tasks in this session using `superpowers:executing-plans`, with checkpoints between tasks. Best when you want to keep the work in one head and ship the whole sub-project in one sitting.

Which approach?
