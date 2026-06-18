# Configurable Dashboard — Sub-project #1: Runtime Resolution Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `lib/dashboard/` — a deterministic, fully-tested engine that turns a stored structured block config into a rendered metric value + comparison, over proven REST paths (Supermetrics real, TripleWhale stub). No Glean, no NL, no UI, no persistence.

**Architecture:** A two-level resolution contract. *Leaf* sources (`supermetrics`, `triplewhale`) each resolve a single metric; an *aggregate* orchestrator delegates to two leaves and applies a binary op. `resolveBlock` selects the active range (per-block override vs. global inherit), dispatches leaf vs. aggregate via an injectable resolver, maps failures to a discriminated `ResolveResult`, computes the delta, and formats. Dependency injection of the leaf resolver keeps every unit testable with zero network calls.

**Tech Stack:** TypeScript (strict), Next.js 15 lib layer, `tsx` test scripts with `node:assert`. Reuses `smQuery`/`parseSmRows` (`lib/supermetrics/client.ts`), `parseDateRange`/`deriveCompareRange` (`lib/ga4/client.ts`), `resolveCompareIso` (`lib/paid-search/base.ts`), and the `SmQueryError`/`SmTimeoutError` classes (`lib/supermetrics/types.ts`).

## Global Constraints

- TypeScript strict mode; **no `any`** in any new file.
- All data fetching is **server-side only** (these are `lib/` modules; never import into a Client Component).
- Tests are **pure** — no live API calls, no `.env` loading. Run as `npx tsx <file>.test.ts` (the absence of `--env-file` is deliberate).
- Test files match the existing convention: `import { strict as assert } from 'node:assert'`, top-level assertions, final `console.log('ok')`.
- Reuse existing helpers; **do not** reimplement `smQuery`, `parseDateRange`, `deriveCompareRange`, or `resolveCompareIso`.
- The Supermetrics adapter wraps **`smQuery`** (generic: takes `dsId`/`dsAccounts`/`fields`), **not** `awQuery` (which is hardcoded to Google Ads + `paidSearchConfig`).
- Commit after each task with the message shown.

---

## Inter-Component Dependency Map (read before parallelizing)

```
   lib/metrics (T2)        lib/dashboard/types (T1)  ← foundation: every dashboard file imports types
   INDEPENDENT                     │
        │              ┌───────────┼───────────────┐
        │              ▼           ▼               ▼
        │        format (T3)  errors (T4)   triplewhale (T5)
        │              │           │               │
        │              │     ┌─────┴─────┐         │
        │              │     ▼           ▼         │
        │              │  supermetrics  aggregate  │
        │              │    (T6)         (T7)       │
        │              │     │                      │
        │              │     └────────┬─────────────┘
        │              │              ▼
        │              │         registry (T8)   ← imports T5 + T6
        │              │              │
        └──────────────┴──────────────┴────▶ resolve (T9)  ← integration; imports T1,T2,T3,T4,T7,T8
```

**Edges = "imports / consumes".** A task may start as soon as every task it points *from* is committed. Note `supermetrics` (T6) and `aggregate` (T7) both import from `errors` (T4) — so they cannot share a wave with T4.

### Parallelization waves

| Wave | Tasks (parallel within a wave) | Unblocked by |
|---|---|---|
| 0 | **T1 types**, **T2 metrics** | nothing (T2 is fully independent of types) |
| 1 | **T3 format**, **T4 errors**, **T5 triplewhale** | T1 |
| 2 | **T6 supermetrics**, **T7 aggregate** | T1 + T4 |
| 3 | **T8 registry** | T5 + T6 |
| 4 | **T9 resolve** | T1,T2,T3,T4,T7,T8 |

Waves 0–2 are the parallelism payoff (2 + 3 + 2 concurrent files). Each task is a standalone file + colocated test with no cross-imports *within its wave* and no shared mutable state, so a wave's tasks dispatch to separate workers simultaneously. T8 and T9 are single-task waves (T8 needs T6; T9 is the integration point and must be last).

---

## File Structure

```
lib/
  metrics.ts                      # computeDelta() — neutral shared util (canonical home of the % rule)
  metrics.test.ts
  dashboard/
    types.ts                      # all shared types + the discriminated ResolveResult / LeafAttempt
    types.test.ts                 # construct-each-type sanity + tsc gate
    format.ts                     # formatMetric()
    format.test.ts
    errors.ts                     # typed errors, mapError(), worseError(), ERROR_PRECEDENCE
    errors.test.ts
    aggregate.ts                  # resolveAggregate() — orchestrator over two leaf attempts
    aggregate.test.ts
    registry.ts                   # resolveLeaf() dispatcher (thin; covered via resolve tests)
    resolve.ts                    # resolveBlock() — range select, dispatch, error map, delta, format
    resolve.test.ts
    adapters/
      supermetrics.ts             # sumMetric() + accountDrift() (pure, tested) + resolveSupermetricsLeaf() (I/O)
      supermetrics.test.ts        # tests the pure helpers only
      triplewhale.ts              # stubValue() + resolveTripleWhaleLeaf() (deterministic stub)
      triplewhale.test.ts
```

---

## Task 1: Shared types (`lib/dashboard/types.ts`)

**Files:**
- Create: `lib/dashboard/types.ts`
- Test: `lib/dashboard/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MetricFormat`, `SupermetricsBinding`, `TripleWhaleBinding`, `LeafBinding`, `AggregateBinding`, `Binding`, `BlockConfig`, `BlockError`, `LeafValue`, `LeafAttempt`, `ResolveResult`. Every later task imports from here.

- [ ] **Step 1: Write the type definitions**

```ts
// lib/dashboard/types.ts
export type MetricFormat = 'currency' | 'percent' | 'count' | 'number'

export interface SupermetricsBinding {
  source: 'supermetrics'
  dsId: string
  metricField: string
  account: string
  expectedAccounts?: string[] // drift guard: returned accounts must be ⊆ this set
  filters?: string            // opaque passthrough to smQuery — NOT validated in v1
}

export interface TripleWhaleBinding {
  source: 'triplewhale'
  metric: string
  account?: string
}

export type LeafBinding = SupermetricsBinding | TripleWhaleBinding

export interface AggregateBinding {
  source: 'aggregate'
  left: LeafBinding
  op: '+' | '-' | '*' | '/'
  right: LeafBinding
}

export type Binding = LeafBinding | AggregateBinding

export interface BlockConfig {
  id: string
  name: string
  binding: Binding
  format: MetricFormat
  range: { dateRange: string; compareRange: string | null } | null // null = inherit global
}

export type BlockError = 'disconnected' | 'invalid-metric' | 'no-data' | 'rate-limited' | 'error'

/** Raw output of a single leaf resolution. prevValue present iff a comparison is active. */
export interface LeafValue {
  value: number
  prevValue?: number
}

/** Internal: outcome of attempting one leaf (success carries LeafValue, failure carries a BlockError). */
export type LeafAttempt = ({ ok: true } & LeafValue) | { ok: false; error: BlockError }

/** Public resolver output — drives the Metric Block UI states. */
export type ResolveResult =
  | { ok: true; value: number; prevValue?: number; delta?: number; format: MetricFormat; formatted: string }
  | { ok: false; error: BlockError }
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/dashboard/types.test.ts
// Run: npx tsx lib/dashboard/types.test.ts
import { strict as assert } from 'node:assert'
import type { BlockConfig, ResolveResult } from './types'

const block: BlockConfig = {
  id: 'b1',
  name: 'Blended ROAS',
  binding: {
    source: 'aggregate',
    op: '/',
    left: { source: 'triplewhale', metric: 'revenue' },
    right: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '4136001852' },
  },
  format: 'number',
  range: null,
}
const ok: ResolveResult = { ok: true, value: 2, format: 'number', formatted: '2' }
assert.equal(block.binding.source, 'aggregate')
assert.equal(ok.ok, true)
console.log('ok')
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx lib/dashboard/types.test.ts`
Expected: FAIL (`Cannot find module './types'`) before Step 1's file exists; if you wrote Step 1 first, it passes — in that case temporarily rename `types.ts` to confirm the test exercises the import, then restore.

- [ ] **Step 4: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "lib/dashboard" || echo "no dashboard type errors"`
Expected: `no dashboard type errors` (pre-existing errors elsewhere in the repo are out of scope).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx lib/dashboard/types.test.ts`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/types.ts lib/dashboard/types.test.ts
git commit -m "feat(dashboard): block config + resolution types"
```

---

## Task 2: Shared delta util (`lib/metrics.ts`)

**Files:**
- Create: `lib/metrics.ts`
- Test: `lib/metrics.test.ts`

**Interfaces:**
- Consumes: nothing (pure number math — independent of Task 1).
- Produces: `computeDelta(cur: number, prev: number | null | undefined): number | undefined`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/metrics.test.ts
// Run: npx tsx lib/metrics.test.ts
import { strict as assert } from 'node:assert'
import { computeDelta } from './metrics'

assert.equal(computeDelta(150, 100), 50)        // +50%
assert.equal(computeDelta(50, 100), -50)        // -50%
assert.equal(computeDelta(100, 0), undefined)   // zero prev → undefined (no divide-by-zero)
assert.equal(computeDelta(100, undefined), undefined)
assert.equal(computeDelta(100, null), undefined)
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/metrics.test.ts`
Expected: FAIL with `Cannot find module './metrics'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/metrics.ts

/**
 * Percent change of `cur` vs `prev`. Returns undefined when there is no usable
 * baseline (prev null/undefined/0) so callers hide the delta rather than show a
 * misleading zero or divide-by-zero. Canonical home of this rule; lib/paid-search
 * has a private copy slated to migrate here (see spec §5).
 */
export function computeDelta(cur: number, prev: number | null | undefined): number | undefined {
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/metrics.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/metrics.ts lib/metrics.test.ts
git commit -m "feat(metrics): shared computeDelta util"
```

---

## Task 3: Metric formatting (`lib/dashboard/format.ts`)

**Files:**
- Create: `lib/dashboard/format.ts`
- Test: `lib/dashboard/format.test.ts`

**Interfaces:**
- Consumes: `MetricFormat` (Task 1).
- Produces: `formatMetric(value: number, format: MetricFormat): string`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/format.test.ts
// Run: npx tsx lib/dashboard/format.test.ts
import { strict as assert } from 'node:assert'
import { formatMetric } from './format'

assert.equal(formatMetric(1234.6, 'currency'), '$1,235')  // rounded, thousands sep
assert.equal(formatMetric(12.34, 'percent'), '12.3%')     // one decimal
assert.equal(formatMetric(1234, 'count'), '1,234')
assert.equal(formatMetric(1234.6, 'number'), '1,235')
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/format.test.ts`
Expected: FAIL with `Cannot find module './format'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/dashboard/format.ts
import type { MetricFormat } from './types'

export function formatMetric(value: number, format: MetricFormat): string {
  switch (format) {
    case 'currency':
      return '$' + Math.round(value).toLocaleString('en-US')
    case 'percent':
      return value.toFixed(1) + '%'
    case 'count':
    case 'number':
      return Math.round(value).toLocaleString('en-US')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/format.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/format.ts lib/dashboard/format.test.ts
git commit -m "feat(dashboard): formatMetric"
```

---

## Task 4: Error model (`lib/dashboard/errors.ts`)

**Files:**
- Create: `lib/dashboard/errors.ts`
- Test: `lib/dashboard/errors.test.ts`

**Interfaces:**
- Consumes: `BlockError` (Task 1); `SmQueryError`, `SmTimeoutError` (`@/lib/supermetrics/types`).
- Produces: classes `DisconnectedError`, `NoDataError`, `DriftError`; `mapError(e: unknown): BlockError`; `worseError(a: BlockError, b: BlockError): BlockError`; `ERROR_PRECEDENCE: BlockError[]`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/errors.test.ts
// Run: npx tsx lib/dashboard/errors.test.ts
import { strict as assert } from 'node:assert'
import { SmQueryError, SmTimeoutError } from '@/lib/supermetrics/types'
import { mapError, worseError, DisconnectedError, NoDataError, DriftError } from './errors'

// mapError: each known cause → its BlockError
assert.equal(mapError(new DisconnectedError()), 'disconnected')
assert.equal(mapError(new DriftError()), 'invalid-metric')
assert.equal(mapError(new NoDataError()), 'no-data')
assert.equal(mapError(new SmTimeoutError('slow')), 'rate-limited')
assert.equal(mapError(new SmQueryError('bad field')), 'invalid-metric')
assert.equal(mapError(new Error('unknown')), 'error')

// worseError: precedence disconnected > invalid-metric > rate-limited > no-data > error
assert.equal(worseError('no-data', 'disconnected'), 'disconnected')
assert.equal(worseError('error', 'no-data'), 'no-data')
assert.equal(worseError('rate-limited', 'invalid-metric'), 'invalid-metric')
assert.equal(worseError('disconnected', 'disconnected'), 'disconnected')
// order-independent
assert.equal(worseError('invalid-metric', 'rate-limited'), worseError('rate-limited', 'invalid-metric'))
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/errors.test.ts`
Expected: FAIL with `Cannot find module './errors'`

- [ ] **Step 3: Write minimal implementation**

Note: `SmTimeoutError`/`SmQueryError` constructors take a `string` message (see `lib/supermetrics/types.ts`).

```ts
// lib/dashboard/errors.ts
import { SmQueryError, SmTimeoutError } from '@/lib/supermetrics/types'
import type { BlockError } from './types'

/** Missing/invalid credentials or client config for the source. */
export class DisconnectedError extends Error {}
/** Query succeeded but returned no rows for the range. */
export class NoDataError extends Error {}
/** Returned data fell outside the binding's confirmed scope (account drift). */
export class DriftError extends Error {}

/** Highest-priority first. */
export const ERROR_PRECEDENCE: BlockError[] = [
  'disconnected',
  'invalid-metric',
  'rate-limited',
  'no-data',
  'error',
]

export function mapError(e: unknown): BlockError {
  if (e instanceof DisconnectedError) return 'disconnected'
  if (e instanceof DriftError) return 'invalid-metric'
  if (e instanceof NoDataError) return 'no-data'
  if (e instanceof SmTimeoutError) return 'rate-limited'
  if (e instanceof SmQueryError) return 'invalid-metric'
  return 'error'
}

/** Returns whichever error has higher precedence (used to combine aggregate operand failures). */
export function worseError(a: BlockError, b: BlockError): BlockError {
  return ERROR_PRECEDENCE.indexOf(a) <= ERROR_PRECEDENCE.indexOf(b) ? a : b
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/errors.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/errors.ts lib/dashboard/errors.test.ts
git commit -m "feat(dashboard): error model + precedence"
```

---

## Task 5: TripleWhale stub adapter (`lib/dashboard/adapters/triplewhale.ts`)

**Files:**
- Create: `lib/dashboard/adapters/triplewhale.ts`
- Test: `lib/dashboard/adapters/triplewhale.test.ts`

**Interfaces:**
- Consumes: `TripleWhaleBinding`, `LeafValue` (Task 1).
- Produces: `stubValue(metric: string, salt: string): number`; `resolveTripleWhaleLeaf(b: TripleWhaleBinding, ctx: { slug: string }, dateRange: string, compareRange: string | null): Promise<LeafValue>`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/adapters/triplewhale.test.ts
// Run: npx tsx lib/dashboard/adapters/triplewhale.test.ts
import { strict as assert } from 'node:assert'
import { stubValue, resolveTripleWhaleLeaf } from './triplewhale'

// Deterministic: same inputs → same output, every run.
assert.equal(stubValue('revenue', 'last_30_days'), stubValue('revenue', 'last_30_days'))
// Different metric → different value (extremely likely; guards against constant stub).
assert.notEqual(stubValue('revenue', 'last_30_days'), stubValue('spend', 'last_30_days'))

const noCompare = await resolveTripleWhaleLeaf({ source: 'triplewhale', metric: 'revenue' }, { slug: 'ren' }, 'last_30_days', null)
assert.equal(noCompare.prevValue, undefined) // no comparison → no prevValue

const withCompare = await resolveTripleWhaleLeaf({ source: 'triplewhale', metric: 'revenue' }, { slug: 'ren' }, 'last_30_days', 'previous_period')
assert.equal(typeof withCompare.prevValue, 'number') // comparison active → prevValue present
assert.equal(withCompare.value, noCompare.value)     // value stable regardless of comparison
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/adapters/triplewhale.test.ts`
Expected: FAIL with `Cannot find module './triplewhale'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/dashboard/adapters/triplewhale.ts
// TODO: real TripleWhale REST API. Stub until creds + metric catalog land (spec §5).
import type { LeafValue, TripleWhaleBinding } from '../types'

/** Deterministic pseudo-value in [0, 1000). No Math.random/Date — stable across runs. */
export function stubValue(metric: string, salt: string): number {
  let h = 0
  const s = metric + '|' + salt
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return (h % 100000) / 100
}

export async function resolveTripleWhaleLeaf(
  b: TripleWhaleBinding,
  _ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafValue> {
  const value = stubValue(b.metric, dateRange)
  const prevValue = compareRange ? stubValue(b.metric, 'prev:' + dateRange) : undefined
  return { value, prevValue }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/adapters/triplewhale.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/adapters/triplewhale.ts lib/dashboard/adapters/triplewhale.test.ts
git commit -m "feat(dashboard): triplewhale stub adapter"
```

---

## Task 6: Supermetrics adapter (`lib/dashboard/adapters/supermetrics.ts`)

**Files:**
- Create: `lib/dashboard/adapters/supermetrics.ts`
- Test: `lib/dashboard/adapters/supermetrics.test.ts`

**Interfaces:**
- Consumes: `SupermetricsBinding`, `LeafValue` (Task 1); `DisconnectedError`, `NoDataError` (Task 4); `smQuery`, `parseSmRows` (`@/lib/supermetrics/client`); `parseDateRange` (`@/lib/ga4/client`); `resolveCompareIso` (`@/lib/paid-search/base`); `getClientBySlug` (`@/lib/db/queries`).
- Produces: `sumMetric(rows: Record<string, string>[], field: string): number`; `accountDrift(returned: string[], expected?: string[]): string[]`; `resolveSupermetricsLeaf(b, ctx, dateRange, compareRange): Promise<LeafValue>`.

**Note:** Only the pure helpers `sumMetric` and `accountDrift` are unit-tested (matching the repo convention of testing transforms, not network wrappers). `resolveSupermetricsLeaf` is a thin I/O wrapper exercised later via `resolveBlock` with an injected fake resolver (Task 9). It wraps `smQuery` (generic), **not** `awQuery` (Google-Ads-specific). Live multi-account drift enforcement needs an account-dimension field supplied at authoring (#4); for #1 the binding's `account` is passed as `ds_accounts` so the query is scoped by construction, and `accountDrift` is the tested guard for when an account column is available.

- [ ] **Step 1: Write the failing test (pure helpers only)**

```ts
// lib/dashboard/adapters/supermetrics.test.ts
// Run: npx tsx lib/dashboard/adapters/supermetrics.test.ts
import { strict as assert } from 'node:assert'
import { sumMetric, accountDrift } from './supermetrics'

// sumMetric: sums a field across rows, treating blanks/missing as 0.
const rows = [{ Cost: '8824.99' }, { Cost: '3283.43' }, { Cost: '' }, {}]
assert.equal(Math.round(sumMetric(rows, 'Cost')), 12108)
assert.equal(sumMetric([], 'Cost'), 0)

// accountDrift: returns accounts present in `returned` but absent from `expected`.
assert.deepEqual(accountDrift(['123', '999'], ['123']), ['999'])
assert.deepEqual(accountDrift(['123'], ['123', '456']), []) // subset → no drift
assert.deepEqual(accountDrift(['123'], undefined), [])       // no expectation → never drift
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/adapters/supermetrics.test.ts`
Expected: FAIL with `Cannot find module './supermetrics'`

- [ ] **Step 3: Write minimal implementation**

`smQuery` params (from `lib/supermetrics/client.ts`): `{ apiKey, dsId, dsAccounts, fields, dateRange, filters?, settings?, maxRows? }`, returning an `SmResult` for `parseSmRows`.

**Import-time DB constraint (must follow):** `@/lib/db/queries`, `@/lib/ga4/client`, and `@/lib/paid-search/base` all transitively load `lib/db/client.ts`, which **throws at import time when `DATABASE_URL` is unset**. To keep this file importable without env (so the pure-helper test stays env-free) these three are loaded with **dynamic `await import(...)` inside `resolveSupermetricsLeaf`**, mirroring the existing pattern in `lib/paid-search/kpis.ts`. Only `@/lib/supermetrics/client` (env-free) and the local `types`/`errors` modules are static imports.

```ts
// lib/dashboard/adapters/supermetrics.ts
import { smQuery, parseSmRows } from '@/lib/supermetrics/client'
import type { LeafValue, SupermetricsBinding } from '../types'
import { DisconnectedError, NoDataError } from '../errors'

/** Sum a numeric metric field across rows; blank/missing cells count as 0. */
export function sumMetric(rows: Record<string, string>[], field: string): number {
  return rows.reduce((s, r) => s + Number(r[field] || 0), 0)
}

/** Accounts present in `returned` but not allowed by `expected`. Empty when no expectation. */
export function accountDrift(returned: string[], expected?: string[]): string[] {
  if (!expected) return []
  const allowed = new Set(expected)
  return returned.filter((a) => !allowed.has(a))
}

async function sumForRange(
  apiKey: string,
  b: SupermetricsBinding,
  isoRange: string, // "YYYY-MM-DD,YYYY-MM-DD"
): Promise<number> {
  const result = await smQuery({
    apiKey,
    dsId: b.dsId,
    dsAccounts: b.account, // scope the query to the bound account(s)
    fields: [b.metricField],
    dateRange: isoRange,
    filters: b.filters,
  })
  const rows = parseSmRows(result)
  if (rows.length === 0) throw new NoDataError(`no rows for ${b.metricField} in ${isoRange}`)
  return sumMetric(rows, b.metricField)
}

export async function resolveSupermetricsLeaf(
  b: SupermetricsBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafValue> {
  // Lazy imports — these transitively load lib/db/client (throws at import without
  // DATABASE_URL). Dynamic-importing here keeps the module env-free to import,
  // mirroring lib/paid-search/kpis.ts.
  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const client = await getClientBySlug(ctx.slug)
  const envVar = client?.smApiKeyEnvVar
  const apiKey = envVar ? process.env[envVar] : undefined
  if (!apiKey) throw new DisconnectedError(`Supermetrics not connected for ${ctx.slug}`)

  const { startDate, endDate } = parseDateRange(dateRange)
  const value = await sumForRange(apiKey, b, `${startDate},${endDate}`)

  const compareIso = resolveCompareIso(dateRange, compareRange)
  const prevValue = compareIso ? await sumForRange(apiKey, b, compareIso) : undefined

  return { value, prevValue }
}
```

Note on the drift guard: `accountDrift` is implemented and unit-tested here but **not yet wired into the live resolver** — #1 scopes the query by `ds_accounts`, so single-account drift is impossible by construction. Live multi-account enforcement needs an account-dimension field supplied at authoring (#4); `DriftError` is therefore introduced in Task 4 but not imported here until that wiring lands. This staged helper is spec-mandated (design §4.2 / §5).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/adapters/supermetrics.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/adapters/supermetrics.ts lib/dashboard/adapters/supermetrics.test.ts
git commit -m "feat(dashboard): supermetrics adapter (sumMetric, accountDrift, leaf resolver)"
```

---

## Task 7: Aggregate orchestrator (`lib/dashboard/aggregate.ts`)

**Files:**
- Create: `lib/dashboard/aggregate.ts`
- Test: `lib/dashboard/aggregate.test.ts`

**Interfaces:**
- Consumes: `AggregateBinding`, `LeafAttempt`, `LeafBinding` (Task 1); `worseError` (Task 4).
- Produces: type `AttemptLeaf = (b: LeafBinding, ctx: { slug: string }, dateRange: string, compareRange: string | null) => Promise<LeafAttempt>`; `resolveAggregate(binding: AggregateBinding, attemptLeaf: AttemptLeaf, ctx: { slug: string }, dateRange: string, compareRange: string | null): Promise<LeafAttempt>`.

**Note:** `attemptLeaf` is **injected** (dependency injection) so this unit is tested with fakes — no network, no registry import. `resolveBlock` (Task 9) supplies the real one.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/aggregate.test.ts
// Run: npx tsx lib/dashboard/aggregate.test.ts
import { strict as assert } from 'node:assert'
import { resolveAggregate, type AttemptLeaf } from './aggregate'
import type { AggregateBinding, LeafBinding } from './types'

const TW: LeafBinding = { source: 'triplewhale', metric: 'revenue' }
const SM: LeafBinding = { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }

// fake attemptLeaf: returns a fixed result per source
const fake = (map: Record<string, Awaited<ReturnType<AttemptLeaf>>>): AttemptLeaf =>
  async (b) => map[b.source]

const ratio: AggregateBinding = { source: 'aggregate', op: '/', left: TW, right: SM }

// ratio: 1000 / 250 = 4; prev 800 / 200 = 4
{
  const r = await resolveAggregate(ratio, fake({
    triplewhale: { ok: true, value: 1000, prevValue: 800 },
    supermetrics: { ok: true, value: 250, prevValue: 200 },
  }), { slug: 'ren' }, 'last_30_days', 'previous_period')
  assert.equal(r.ok, true)
  if (r.ok) { assert.equal(r.value, 4); assert.equal(r.prevValue, 4) }
}

// sum, no comparison: prevValue undefined when operands lack prev
{
  const r = await resolveAggregate({ ...ratio, op: '+' }, fake({
    triplewhale: { ok: true, value: 10 },
    supermetrics: { ok: true, value: 5 },
  }), { slug: 'ren' }, 'last_30_days', null)
  assert.equal(r.ok && r.value, 15)
  assert.equal(r.ok && r.prevValue, undefined)
}

// divide-by-zero → no-data
{
  const r = await resolveAggregate(ratio, fake({
    triplewhale: { ok: true, value: 100 },
    supermetrics: { ok: true, value: 0 },
  }), { slug: 'ren' }, 'last_30_days', null)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'no-data')
}

// one operand fails → that error
{
  const r = await resolveAggregate(ratio, fake({
    triplewhale: { ok: true, value: 100 },
    supermetrics: { ok: false, error: 'invalid-metric' },
  }), { slug: 'ren' }, 'last_30_days', null)
  assert.equal(!r.ok && r.error, 'invalid-metric')
}

// both fail → precedence (disconnected beats no-data) regardless of side
{
  const r = await resolveAggregate(ratio, fake({
    triplewhale: { ok: false, error: 'no-data' },
    supermetrics: { ok: false, error: 'disconnected' },
  }), { slug: 'ren' }, 'last_30_days', null)
  assert.equal(!r.ok && r.error, 'disconnected')
}
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/aggregate.test.ts`
Expected: FAIL with `Cannot find module './aggregate'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/dashboard/aggregate.ts
import type { AggregateBinding, LeafAttempt, LeafBinding } from './types'
import { worseError } from './errors'

export type AttemptLeaf = (
  b: LeafBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
) => Promise<LeafAttempt>

function applyOp(op: AggregateBinding['op'], a: number, b: number): number | null {
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': return b === 0 ? null : a / b
  }
}

export async function resolveAggregate(
  binding: AggregateBinding,
  attemptLeaf: AttemptLeaf,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafAttempt> {
  const [l, r] = await Promise.all([
    attemptLeaf(binding.left, ctx, dateRange, compareRange),
    attemptLeaf(binding.right, ctx, dateRange, compareRange),
  ])

  if (!l.ok && !r.ok) return { ok: false, error: worseError(l.error, r.error) }
  if (!l.ok) return { ok: false, error: l.error }
  if (!r.ok) return { ok: false, error: r.error }

  const value = applyOp(binding.op, l.value, r.value)
  if (value == null) return { ok: false, error: 'no-data' } // divide-by-zero

  // prev present iff BOTH operands have prev (same active range → present iff comparison active)
  let prevValue: number | undefined
  if (l.prevValue !== undefined && r.prevValue !== undefined) {
    const p = applyOp(binding.op, l.prevValue, r.prevValue)
    prevValue = p == null ? undefined : p
  }

  return { ok: true, value, prevValue }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/aggregate.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/aggregate.ts lib/dashboard/aggregate.test.ts
git commit -m "feat(dashboard): aggregate orchestrator + operand error precedence"
```

---

## Task 8: Leaf registry (`lib/dashboard/registry.ts`)

**Files:**
- Create: `lib/dashboard/registry.ts`

**Interfaces:**
- Consumes: `LeafBinding`, `LeafValue` (Task 1); `resolveSupermetricsLeaf` (Task 6); `resolveTripleWhaleLeaf` (Task 5).
- Produces: `resolveLeaf(b: LeafBinding, ctx: { slug: string }, dateRange: string, compareRange: string | null): Promise<LeafValue>`.

**Note:** Thin dispatcher with no branching logic worth its own test cycle; the `switch` is exhaustively type-checked, and behavior is covered through `resolveBlock` in Task 9. No separate test file.

- [ ] **Step 1: Write the implementation**

```ts
// lib/dashboard/registry.ts
import type { LeafBinding, LeafValue } from './types'
import { resolveSupermetricsLeaf } from './adapters/supermetrics'
import { resolveTripleWhaleLeaf } from './adapters/triplewhale'

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
```

- [ ] **Step 2: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "lib/dashboard/registry" || echo "registry ok"`
Expected: `registry ok` (exhaustive switch over the `source` union compiles).

- [ ] **Step 3: Commit**

```bash
git add lib/dashboard/registry.ts
git commit -m "feat(dashboard): leaf adapter registry/dispatcher"
```

---

## Task 9: Block resolver (`lib/dashboard/resolve.ts`) — integration

**Files:**
- Create: `lib/dashboard/resolve.ts`
- Test: `lib/dashboard/resolve.test.ts`

**Interfaces:**
- Consumes: `BlockConfig`, `LeafAttempt`, `LeafBinding`, `LeafValue`, `ResolveResult` (Task 1); `resolveLeaf` (Task 8); `mapError` (Task 4); `resolveAggregate`, `AttemptLeaf` (Task 7); `computeDelta` (Task 2); `formatMetric` (Task 3).
- Produces: type `LeafResolver = (b: LeafBinding, ctx: { slug: string }, dateRange: string, compareRange: string | null) => Promise<LeafValue>`; `resolveBlock(config: BlockConfig, global: { dateRange: string; compareRange: string | null }, ctx: { slug: string }, deps?: { resolveLeaf?: LeafResolver }): Promise<ResolveResult>`.

**Note:** `resolveBlock` accepts `deps.resolveLeaf` so the whole engine is tested end-to-end with an injected fake — covering range selection, leaf/aggregate dispatch, delta, formatting, and error mapping with **zero network calls**.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/resolve.test.ts
// Run: npx tsx lib/dashboard/resolve.test.ts
import { strict as assert } from 'node:assert'
import { resolveBlock, type LeafResolver } from './resolve'
import type { BlockConfig } from './types'
import { NoDataError } from './errors'

const GLOBAL = { dateRange: 'last_30_days', compareRange: 'previous_period' as string | null }

// records the range a leaf was asked for, so we can assert override-vs-inherit
function spyResolver(value: number, prev?: number): { fn: LeafResolver; calls: string[] } {
  const calls: string[] = []
  const fn: LeafResolver = async (_b, _c, dateRange) => { calls.push(dateRange); return { value, prevValue: prev } }
  return { fn, calls }
}

const smBlock = (range: BlockConfig['range']): BlockConfig => ({
  id: 'b', name: 'Cost', format: 'currency', range,
  binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' },
})

// inherit: leaf asked for the GLOBAL range; delta + formatted populated
{
  const { fn, calls } = spyResolver(150, 100)
  const r = await resolveBlock(smBlock(null), GLOBAL, { slug: 'ren' }, { resolveLeaf: fn })
  assert.equal(calls[0], 'last_30_days')
  assert.equal(r.ok && r.value, 150)
  assert.equal(r.ok && r.delta, 50)
  assert.equal(r.ok && r.formatted, '$150')
}

// override: leaf asked for the BLOCK range, not global
{
  const { fn, calls } = spyResolver(10)
  await resolveBlock(smBlock({ dateRange: 'last_7_days', compareRange: null }), GLOBAL, { slug: 'ren' }, { resolveLeaf: fn })
  assert.equal(calls[0], 'last_7_days')
}

// no comparison → delta hidden (undefined), even though prevValue absent
{
  const { fn } = spyResolver(10)
  const r = await resolveBlock(smBlock({ dateRange: 'last_7_days', compareRange: null }), GLOBAL, { slug: 'ren' }, { resolveLeaf: fn })
  assert.equal(r.ok && r.prevValue, undefined)
  assert.equal(r.ok && r.delta, undefined)
}

// leaf throws → mapped error result, never throws out of resolveBlock
{
  const fn: LeafResolver = async () => { throw new NoDataError('empty') }
  const r = await resolveBlock(smBlock(null), GLOBAL, { slug: 'ren' }, { resolveLeaf: fn })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'no-data')
}

// aggregate path: 1000 / 250 = 4, formatted as number
{
  const fn: LeafResolver = async (b) => (b.source === 'triplewhale' ? { value: 1000 } : { value: 250 })
  const agg: BlockConfig = {
    id: 'a', name: 'ROAS', format: 'number', range: null,
    binding: { source: 'aggregate', op: '/', left: { source: 'triplewhale', metric: 'revenue' }, right: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' } },
  }
  const r = await resolveBlock(agg, { dateRange: 'last_30_days', compareRange: null }, { slug: 'ren' }, { resolveLeaf: fn })
  assert.equal(r.ok && r.value, 4)
  assert.equal(r.ok && r.formatted, '4')
}
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/resolve.test.ts`
Expected: FAIL with `Cannot find module './resolve'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/dashboard/resolve.ts
import type { BlockConfig, LeafAttempt, LeafBinding, LeafValue, ResolveResult } from './types'
import { resolveLeaf as defaultResolveLeaf } from './registry'
import { resolveAggregate, type AttemptLeaf } from './aggregate'
import { mapError } from './errors'
import { computeDelta } from '@/lib/metrics'
import { formatMetric } from './format'

export type LeafResolver = (
  b: LeafBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
) => Promise<LeafValue>

export async function resolveBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
  deps: { resolveLeaf?: LeafResolver } = {},
): Promise<ResolveResult> {
  const resolveLeaf = deps.resolveLeaf ?? defaultResolveLeaf
  const range = config.range ?? global // per-block override vs. inherit

  // wraps a leaf resolution into a LeafAttempt (success | mapped error)
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/resolve.test.ts`
Expected: `ok`

- [ ] **Step 5: Full type-check + run the whole suite**

Run:
```bash
npx tsc --noEmit 2>&1 | grep "lib/dashboard\|lib/metrics" || echo "no new type errors"
for f in lib/metrics.test.ts lib/dashboard/*.test.ts lib/dashboard/adapters/*.test.ts; do echo "== $f"; npx tsx "$f"; done
```
Expected: `no new type errors`, and each test prints `ok`.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/resolve.ts lib/dashboard/resolve.test.ts
git commit -m "feat(dashboard): resolveBlock integration (range select, dispatch, delta, format)"
```

---

## Self-Review

**Spec coverage** (against `2026-06-17-configurable-dashboard-design.md` §4):
- §4.1 structured config → Task 1 (incl. `expectedAccounts`, `filters` passthrough). ✅
- §4.2 two-level contract (LeafAdapter registry + aggregate orchestrator) → Tasks 5/6 (leaves), 8 (registry), 7 (aggregate). ✅
- §4.2 supermetrics drift guard → Task 6 `accountDrift` (pure, tested) + `ds_accounts` scoping; live multi-account enforcement deferred to #4 (noted). ✅
- §4.2 prevValue invariant → Task 7 (both-operands rule) + test. ✅
- §4.2 operand error precedence → Task 4 `worseError` + Task 7 test. ✅
- §4.3 ResolveResult, range selection, no-comparison hides delta, error mapping, formatting ownership → Task 9 + tests; `formatMetric` Task 3; `computeDelta` Task 2. ✅
- §4.3 error mapping (disconnected/invalid-metric/no-data/rate-limited/error) → Task 4 + test. ✅
- §4.4 file layout → matches File Structure above. ✅
- §4.5 test list → covered across tasks; pure, no `--env-file`. ✅
- §4.6 out-of-scope (Glean, NL, preview card, real TW, drag-drop, global control UI, persistence) → none included. ✅

**Placeholder scan:** No TBD/TODO-as-work. (The single `// TODO: real TripleWhale API` is an intentional, spec-mandated stub marker, not a missing plan step.) ✅

**Type consistency:** `LeafValue`, `LeafAttempt`, `BlockError`, `AttemptLeaf`, `LeafResolver`, and the `{ ok: true } & LeafValue | { ok: false; error }` shape are used identically across Tasks 1, 7, 9. `resolveLeaf`/`resolveSupermetricsLeaf`/`resolveTripleWhaleLeaf`/`resolveAggregate`/`resolveBlock` names match their definitions and consumers. ✅

**Out-of-band note:** Pre-existing uncommitted paid-search edits on this branch are unrelated; do not stage them in any task's `git add`.
