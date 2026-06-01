# Report Loading Profiling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a vendor-layer profiling tool (helper + wrappers + walker + analyzer) that produces per-call and per-section timing tables for every report in the platform, so subsequent optimization work targets real bottlenecks.

**Architecture:** A single `PERF_LOG`-gated `timed()` higher-order function wraps every exported async function in each vendor-client file. Each call emits one structured JSON log line to stdout. Two new `tsx`-runnable scripts drive a sequential walk over all `(client, report)` URLs against a local `next start`, then parse the captured log into three aggregate tables.

**Tech Stack:** TypeScript, Next.js 16 App Router, `tsx` (already a devDep), Node's built-in `node:assert/strict` for the tiny self-tests. No new runtime dependencies.

**Spec:** [docs/superpowers/specs/2026-05-28-report-loading-profiling-design.md](../specs/2026-05-28-report-loading-profiling-design.md)

---

## File Structure

**Created:**
- `lib/perf.ts` — the `timed()` helper. Single responsibility: wrap an async function and emit one timing log line per call when `PERF_LOG=1`.
- `scripts/perf-test.ts` — standalone assertion-based check that `timed()` behaves correctly. Runs via `tsx`. No test framework dep.
- `scripts/perf-walk.ts` — DB-driven sequential URL walker. Enumerates all `(client, enabledReport)` pairs, fetches each `/portal/<slug>/reports/<report>` URL against `http://localhost:3000` with a supplied session cookie.
- `scripts/perf-report.ts` — log parser + aggregator. Reads `perf.log`, prints Tables 1–3 from the spec.
- `scripts/perf-report.test.ts` — standalone assertion-based check that parser/aggregator behaves correctly.

**Modified (instrumentation wraps, all identical pattern):**
- `lib/db/queries.ts` — 3 cached helpers
- `lib/ga4/client.ts` — `ga4Query`
- `lib/peec/client.ts` — `getPeecOverview` (wrapped around `unstable_cache(...)`)
- `lib/peec/agent-analytics.ts` — `getAgentAnalytics`
- `lib/profound/client.ts` — `getProfoundOverview`
- `lib/gsc/client.ts` — `getGSCOverview`
- `lib/sitebulb/client.ts` — `getSitebulbData`
- `lib/screaming-frog/client.ts` — `getSFData`
- `lib/pr-proof/client.ts` — `getPRProofData`
- `lib/content-calendar/client.ts` — `getContentCalendarData`
- `lib/bigquery/client.ts` — `fetchFunSpotData`, `fetchDailySessions`
- `lib/bigquery/gemini.ts` — `generateConversationalSummary`
- `lib/hubspot/client.ts` — 17 exported async functions (see Task 6)

**Not touched:** any `components/`, `app/`, `auth.ts`, `proxy.ts`, chart files. The whole point of the design is leverage at the vendor layer.

---

## Task 1: Create `lib/perf.ts` helper

**Files:**
- Create: `lib/perf.ts`
- Create: `scripts/perf-test.ts`

The helper API:

```ts
export type PerfTags = Record<string, string | number | undefined>
export type PerfExtractor<TArgs extends unknown[]> = (args: TArgs) => PerfTags

export function timed<TArgs extends unknown[], TRet>(
  vendor: string,
  fn: string,
  impl: (...args: TArgs) => Promise<TRet>,
  extractTags?: PerfExtractor<TArgs>,
): (...args: TArgs) => Promise<TRet>
```

Behavior:
- When `process.env.PERF_LOG !== '1'`: `timed(...)` returns the original `impl` unchanged. Zero per-call overhead.
- When `PERF_LOG=1`: returns a wrapper that records `performance.now()` before and after the call. On success emits `PERF {...,"ok":true}`. On throw, emits `PERF {...,"ok":false,"err":"<message>"}` and rethrows the original error unchanged.
- Log line is one `console.log(...)` of the literal string `PERF ` followed by `JSON.stringify({ts, vendor, fn, ms, ok, ...tags, err?})`. `ts` is `new Date().toISOString()`. `ms` is a rounded integer.
- `extractTags(args)` is called inside a try/catch — if it throws, we log without tags rather than failing the call.

- [ ] **Step 1: Write the test script first**

Create `scripts/perf-test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { timed } from '../lib/perf'

async function main() {
  // 1. PERF_LOG off → returns impl unchanged (identity check)
  delete process.env.PERF_LOG
  const plain = async (x: number) => x + 1
  const wrappedOff = timed('test', 'plain', plain)
  assert.equal(wrappedOff, plain, 'PERF_LOG off: should return original impl')
  assert.equal(await wrappedOff(1), 2)

  // 2. PERF_LOG on → captures success
  process.env.PERF_LOG = '1'
  const logs: string[] = []
  const origLog = console.log
  console.log = (msg: string) => { logs.push(msg) }

  try {
    const slow = async (x: number) => {
      await new Promise((r) => setTimeout(r, 20))
      return x * 2
    }
    const wrappedOn = timed('test', 'slow', slow, ([x]) => ({ client: `c${x}` }))
    const result = await wrappedOn(5)
    assert.equal(result, 10)
    assert.equal(logs.length, 1)
    assert.ok(logs[0].startsWith('PERF '), 'log line should start with PERF')
    const payload = JSON.parse(logs[0].slice(5))
    assert.equal(payload.vendor, 'test')
    assert.equal(payload.fn, 'slow')
    assert.equal(payload.ok, true)
    assert.equal(payload.client, 'c5')
    assert.ok(typeof payload.ms === 'number' && payload.ms >= 15, `ms should be >=15, got ${payload.ms}`)
    assert.ok(typeof payload.ts === 'string')

    // 3. Captures failure, re-throws original error
    logs.length = 0
    const boom = async () => { throw new Error('kaboom') }
    const wrappedBoom = timed('test', 'boom', boom)
    await assert.rejects(() => wrappedBoom(), /kaboom/)
    assert.equal(logs.length, 1)
    const errPayload = JSON.parse(logs[0].slice(5))
    assert.equal(errPayload.ok, false)
    assert.equal(errPayload.err, 'kaboom')

    // 4. Extractor that throws does not break the call
    logs.length = 0
    const wrappedBadTags = timed('test', 'ok', async () => 'fine', () => { throw new Error('tag fail') })
    assert.equal(await wrappedBadTags(), 'fine')
    assert.equal(logs.length, 1)
    const okPayload = JSON.parse(logs[0].slice(5))
    assert.equal(okPayload.ok, true)
  } finally {
    console.log = origLog
  }

  origLog('perf-test: all assertions passed')
}

main().catch((err) => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Run the test to verify it fails (helper doesn't exist yet)**

Run: `npx tsx scripts/perf-test.ts`
Expected: FAIL — error about missing module `../lib/perf`.

- [ ] **Step 3: Implement `lib/perf.ts`**

Create `lib/perf.ts`:

```ts
const ENABLED = process.env.PERF_LOG === '1'

export type PerfTags = Record<string, string | number | undefined>
export type PerfExtractor<TArgs extends unknown[]> = (args: TArgs) => PerfTags

export function timed<TArgs extends unknown[], TRet>(
  vendor: string,
  fn: string,
  impl: (...args: TArgs) => Promise<TRet>,
  extractTags?: PerfExtractor<TArgs>,
): (...args: TArgs) => Promise<TRet> {
  if (!ENABLED) return impl

  return async (...args: TArgs): Promise<TRet> => {
    let tags: PerfTags = {}
    if (extractTags) {
      try {
        tags = extractTags(args) ?? {}
      } catch {
        tags = {}
      }
    }
    const start = performance.now()
    try {
      const result = await impl(...args)
      const ms = Math.round(performance.now() - start)
      emit({ ts: new Date().toISOString(), vendor, fn, ms, ok: true, ...tags })
      return result
    } catch (err) {
      const ms = Math.round(performance.now() - start)
      const message = err instanceof Error ? err.message : String(err)
      emit({ ts: new Date().toISOString(), vendor, fn, ms, ok: false, ...tags, err: message })
      throw err
    }
  }
}

function emit(payload: Record<string, unknown>): void {
  console.log('PERF ' + JSON.stringify(payload))
}
```

Note on the `ENABLED` const: it's evaluated at module-import time. In Next.js server runtime, that's when the server boots — perfect for our `PERF_LOG=1 npm run start` workflow. The test script flips the env var *between* calls, but since `lib/perf.ts` is imported once at the top, the import-time read determines behavior for the whole process. This is intentional: production-realistic, single env-var check per process.

⚠️ This means the test script's "PERF_LOG off" assertion (step 1) only works if `scripts/perf-test.ts` runs without `PERF_LOG=1` in the environment. Our test deletes it explicitly with `delete process.env.PERF_LOG` *before* importing, which works because the `import` statement is hoisted but `delete` runs before `timed()` is first called. To be safe, reorder the test to flip the env var via dynamic import:

Replace the existing `import { timed } from '../lib/perf'` line at the top with two separate dynamic imports — one with PERF_LOG cleared, one with it set:

```ts
import { strict as assert } from 'node:assert'

async function main() {
  // 1. PERF_LOG off → returns impl unchanged (identity check)
  delete process.env.PERF_LOG
  const { timed: timedOff } = await import('../lib/perf?off' as string).catch(() => import('../lib/perf'))
  const plain = async (x: number) => x + 1
  const wrappedOff = timedOff('test', 'plain', plain)
  assert.equal(wrappedOff, plain, 'PERF_LOG off: should return original impl')
  // ... rest unchanged but use timedOff for the "off" assertions
  ...
}
```

Actually that's fragile (TS dynamic-import query strings need bundler support). Simpler: split into **two test scripts**:
- `scripts/perf-test-off.ts` — runs without `PERF_LOG`, asserts identity-return only
- `scripts/perf-test-on.ts` — runs with `PERF_LOG=1`, asserts all logging behavior

Update Step 1 above to write **two scripts** instead of one. Make `scripts/perf-test-off.ts`:

```ts
import { strict as assert } from 'node:assert'
import { timed } from '../lib/perf'

async function main() {
  assert.equal(process.env.PERF_LOG, undefined, 'this script must run without PERF_LOG set')
  const plain = async (x: number) => x + 1
  const wrapped = timed('test', 'plain', plain)
  assert.equal(wrapped, plain, 'PERF_LOG off: should return original impl')
  assert.equal(await wrapped(1), 2)
  console.log('perf-test-off: passed')
}

main().catch((err) => { console.error(err); process.exit(1) })
```

And `scripts/perf-test-on.ts`:

```ts
import { strict as assert } from 'node:assert'
import { timed } from '../lib/perf'

async function main() {
  assert.equal(process.env.PERF_LOG, '1', 'this script must run with PERF_LOG=1')

  const logs: string[] = []
  const origLog = console.log
  console.log = (msg: string) => { logs.push(msg) }

  try {
    // success path
    const slow = async (x: number) => {
      await new Promise((r) => setTimeout(r, 20))
      return x * 2
    }
    const wrappedOn = timed('test', 'slow', slow, ([x]) => ({ client: `c${x}` }))
    const result = await wrappedOn(5)
    assert.equal(result, 10)
    assert.equal(logs.length, 1)
    assert.ok(logs[0].startsWith('PERF '), 'log line should start with PERF')
    const payload = JSON.parse(logs[0].slice(5))
    assert.equal(payload.vendor, 'test')
    assert.equal(payload.fn, 'slow')
    assert.equal(payload.ok, true)
    assert.equal(payload.client, 'c5')
    assert.ok(typeof payload.ms === 'number' && payload.ms >= 15, `ms should be >=15, got ${payload.ms}`)
    assert.ok(typeof payload.ts === 'string')

    // failure path, re-throws original error
    logs.length = 0
    const boom = async () => { throw new Error('kaboom') }
    const wrappedBoom = timed('test', 'boom', boom)
    await assert.rejects(() => wrappedBoom(), /kaboom/)
    assert.equal(logs.length, 1)
    const errPayload = JSON.parse(logs[0].slice(5))
    assert.equal(errPayload.ok, false)
    assert.equal(errPayload.err, 'kaboom')

    // extractor that throws does not break the call
    logs.length = 0
    const wrappedBadTags = timed('test', 'ok', async () => 'fine', () => { throw new Error('tag fail') })
    assert.equal(await wrappedBadTags(), 'fine')
    assert.equal(logs.length, 1)
    const okPayload = JSON.parse(logs[0].slice(5))
    assert.equal(okPayload.ok, true)
  } finally {
    console.log = origLog
  }

  console.log('perf-test-on: passed')
}

main().catch((err) => { console.error(err); process.exit(1) })
```

Delete the original `scripts/perf-test.ts` you started with — there's no single-script version of it in the final tree.

- [ ] **Step 4: Run both tests, verify they pass**

Run: `npx tsx scripts/perf-test-off.ts && PERF_LOG=1 npx tsx scripts/perf-test-on.ts`
Expected:
```
perf-test-off: passed
perf-test-on: passed
```

- [ ] **Step 5: Verify build still passes**

Run: `npm run build`
Expected: build succeeds (no type errors). The helper is unused so far, so this just confirms TS is happy with the file.

- [ ] **Step 6: Commit**

```bash
git add lib/perf.ts scripts/perf-test-off.ts scripts/perf-test-on.ts
git commit -m "feat(perf): add PERF_LOG-gated timed() helper

Wraps an async function. When PERF_LOG=1, emits one structured JSON
line per call ('PERF {...}'). When off, returns the impl unchanged
for zero per-call overhead. Optional extractTags lets callers tag
log lines with clientSlug/dateRange.

Two standalone tsx-runnable test scripts (off/on) verify behavior."
```

---

## Task 2: Instrument `lib/db/queries.ts`

**Files:**
- Modify: [lib/db/queries.ts](../../../lib/db/queries.ts)

Three `cache()`-wrapped helpers: `getClientBySlug`, `getClientByEmail`, `getAllClients`. Wrap each with `timed()` *around* the `cache()` so we measure user-visible time (cache hits show ~0ms, misses show real DB time — both useful).

- [ ] **Step 1: Apply the wraps**

Replace the entire body of [lib/db/queries.ts](../../../lib/db/queries.ts) with:

```ts
import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { clients, users, type Client, type User, type ClientRole } from './schema'
import { timed } from '@/lib/perf'

const getClientBySlugImpl = cache(async (slug: string): Promise<(Client & { users: User[] }) | null> => {
  const row = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
    with: { users: true },
  })
  return row ?? null
})

export const getClientBySlug = timed(
  'db',
  'getClientBySlug',
  getClientBySlugImpl,
  ([slug]) => ({ client: slug }),
)

const getClientByEmailImpl = cache(async (email: string): Promise<{ email: string; role: ClientRole; slug: string } | null> => {
  const row = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    with: { client: true },
  })
  if (!row) return null
  return { email: row.email, role: row.role, slug: row.client.slug }
})

export const getClientByEmail = timed('db', 'getClientByEmail', getClientByEmailImpl)

const getAllClientsImpl = cache(async (): Promise<(Client & { users: User[] })[]> => {
  return db.query.clients.findMany({
    orderBy: (c, { asc }) => [asc(c.name)],
    with: { users: true },
  })
})

export const getAllClients = timed('db', 'getAllClients', getAllClientsImpl)
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: build succeeds. Public export names (`getClientBySlug`, `getClientByEmail`, `getAllClients`) and types are unchanged, so every caller continues to compile.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries.ts
git commit -m "perf(db): wrap query helpers with timed()"
```

---

## Task 3: Instrument `lib/ga4/client.ts`

**Files:**
- Modify: [lib/ga4/client.ts:169](../../../lib/ga4/client.ts#L169)

Single function `ga4Query` — the fan-out point for all 19 GA4 calls per render.

- [ ] **Step 1: Add the import and rename + wrap**

At the top of [lib/ga4/client.ts](../../../lib/ga4/client.ts), add the import alongside existing ones:

```ts
import { timed } from '@/lib/perf'
```

Then rename the existing `export async function ga4Query(params: GA4QueryParams): Promise<GA4ReportResult> {` declaration (currently at [line 169](../../../lib/ga4/client.ts#L169)) to remove the `export` keyword and rename:

```ts
async function ga4QueryImpl(params: GA4QueryParams): Promise<GA4ReportResult> {
```

Leave the entire function body unchanged. At the **bottom of the file**, add:

```ts
export const ga4Query = timed(
  'ga4',
  'runReport',
  ga4QueryImpl,
  ([params]) => ({ client: params.clientSlug, dateRange: params.dateRange }),
)
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add lib/ga4/client.ts
git commit -m "perf(ga4): wrap ga4Query with timed()"
```

---

## Task 4: Instrument single-function vendor clients

**Files (one function each, identical pattern):**
- Modify: [lib/peec/client.ts](../../../lib/peec/client.ts) — `getPeecOverview` (wrapped around `unstable_cache(...)`)
- Modify: [lib/peec/agent-analytics.ts](../../../lib/peec/agent-analytics.ts) — `getAgentAnalytics`
- Modify: [lib/profound/client.ts](../../../lib/profound/client.ts) — `getProfoundOverview`
- Modify: [lib/gsc/client.ts](../../../lib/gsc/client.ts) — `getGSCOverview`
- Modify: [lib/sitebulb/client.ts](../../../lib/sitebulb/client.ts) — `getSitebulbData`
- Modify: [lib/screaming-frog/client.ts](../../../lib/screaming-frog/client.ts) — `getSFData`
- Modify: [lib/pr-proof/client.ts](../../../lib/pr-proof/client.ts) — `getPRProofData`
- Modify: [lib/content-calendar/client.ts](../../../lib/content-calendar/client.ts) — `getContentCalendarData`

Pattern for each file:
1. Add `import { timed } from '@/lib/perf'` near the top alongside existing imports.
2. Rename the function: strip `export` keyword, append `Impl` to the name.
3. At the bottom of the file, add the wrapped export.

The wraps below are the **only** changes per file — leave function bodies untouched.

- [ ] **Step 1: `lib/peec/client.ts` — getPeecOverview**

This one is special: the existing export is `export const getPeecOverview = unstable_cache(async (clientSlug?) => {...}, [...keys])`. Wrap the *outer* `unstable_cache` call.

Rename the existing `export const getPeecOverview = unstable_cache(...)` (at [line 327](../../../lib/peec/client.ts#L327)) to drop the `export` and add `Impl`:

```ts
const getPeecOverviewImpl = unstable_cache(
  async (clientSlug?: string): Promise<PeecOverview> => {
    // ...existing body unchanged...
  },
  // ...existing keys + options unchanged...
)
```

(Find the closing `)` of `unstable_cache(...)` — it's the line with the cache options. Keep everything inside untouched.)

Then at the bottom of the file:

```ts
export const getPeecOverview = timed(
  'peec',
  'getOverview',
  getPeecOverviewImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

Add `import { timed } from '@/lib/perf'` near the top.

- [ ] **Step 2: `lib/peec/agent-analytics.ts` — getAgentAnalytics**

Add `import { timed } from '@/lib/perf'` near the top. Change `export async function getAgentAnalytics(clientSlug: string)` (at [line 202](../../../lib/peec/agent-analytics.ts#L202)) to `async function getAgentAnalyticsImpl(clientSlug: string)`. At the bottom:

```ts
export const getAgentAnalytics = timed(
  'peec',
  'getAgentAnalytics',
  getAgentAnalyticsImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

- [ ] **Step 3: `lib/profound/client.ts` — getProfoundOverview**

Add `import { timed } from '@/lib/perf'`. Change `export async function getProfoundOverview()` ([line 285](../../../lib/profound/client.ts#L285)) to `async function getProfoundOverviewImpl()`. At the bottom:

```ts
export const getProfoundOverview = timed('profound', 'getOverview', getProfoundOverviewImpl)
```

(No `extractTags` — this one takes no client-identifying args.)

- [ ] **Step 4: `lib/gsc/client.ts` — getGSCOverview**

Add the import. Change `export async function getGSCOverview(clientSlug: string)` to `async function getGSCOverviewImpl(clientSlug: string)`. At the bottom:

```ts
export const getGSCOverview = timed(
  'gsc',
  'getOverview',
  getGSCOverviewImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

- [ ] **Step 5: `lib/sitebulb/client.ts` — getSitebulbData**

Add the import. Change `export async function getSitebulbData(clientSlug: string)` to `async function getSitebulbDataImpl(clientSlug: string)`. At the bottom:

```ts
export const getSitebulbData = timed(
  'sitebulb',
  'getData',
  getSitebulbDataImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

- [ ] **Step 6: `lib/screaming-frog/client.ts` — getSFData**

Add the import. Change `export async function getSFData(clientSlug: string)` to `async function getSFDataImpl(clientSlug: string)`. At the bottom:

```ts
export const getSFData = timed(
  'screaming-frog',
  'getData',
  getSFDataImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

- [ ] **Step 7: `lib/pr-proof/client.ts` — getPRProofData**

Add the import. Change `export async function getPRProofData(clientSlug: string)` to `async function getPRProofDataImpl(clientSlug: string)`. At the bottom:

```ts
export const getPRProofData = timed(
  'pr-proof',
  'getData',
  getPRProofDataImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

- [ ] **Step 8: `lib/content-calendar/client.ts` — getContentCalendarData**

Add the import. Change `export async function getContentCalendarData(clientSlug: string)` ([line 209](../../../lib/content-calendar/client.ts#L209)) to `async function getContentCalendarDataImpl(clientSlug: string)`. At the bottom:

```ts
export const getContentCalendarData = timed(
  'content-calendar',
  'getData',
  getContentCalendarDataImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

- [ ] **Step 9: Verify build passes**

Run: `npm run build`
Expected: build succeeds. If any file has a type error, the most likely cause is that the existing function was used in a context that requires the bare `function` form (e.g., generic inference). In that case, leave the original `export async function` in place and instead create a wrapper export with a different name — but flag this back to the user before doing so.

- [ ] **Step 10: Commit**

```bash
git add lib/peec/client.ts lib/peec/agent-analytics.ts lib/profound/client.ts lib/gsc/client.ts lib/sitebulb/client.ts lib/screaming-frog/client.ts lib/pr-proof/client.ts lib/content-calendar/client.ts
git commit -m "perf(vendors): wrap single-function vendor clients with timed()"
```

---

## Task 5: Instrument `lib/bigquery/*.ts`

**Files:**
- Modify: [lib/bigquery/client.ts](../../../lib/bigquery/client.ts) — `fetchFunSpotData`, `fetchDailySessions`
- Modify: [lib/bigquery/gemini.ts](../../../lib/bigquery/gemini.ts) — `generateConversationalSummary`

- [ ] **Step 1: `lib/bigquery/client.ts`**

Add `import { timed } from '@/lib/perf'`. Rename both functions:
- `export async function fetchFunSpotData(dateRange: string)` ([line 96](../../../lib/bigquery/client.ts#L96)) → `async function fetchFunSpotDataImpl(dateRange: string)`
- `export async function fetchDailySessions(...)` ([line 193](../../../lib/bigquery/client.ts#L193)) → `async function fetchDailySessionsImpl(...)`

At the bottom of the file:

```ts
export const fetchFunSpotData = timed(
  'bigquery',
  'fetchFunSpotData',
  fetchFunSpotDataImpl,
  ([dateRange]) => ({ dateRange }),
)

export const fetchDailySessions = timed(
  'bigquery',
  'fetchDailySessions',
  fetchDailySessionsImpl,
  ([ga4Account, dateRange]) => ({ client: ga4Account, dateRange }),
)
```

(`fetchDailySessions`'s first arg is the GA4 account/property ID — not a client slug. We still log it under `client` so the row groups cleanly in Table 1; it just identifies the data source rather than the platform tenant.)

- [ ] **Step 2: `lib/bigquery/gemini.ts`**

Add `import { timed } from '@/lib/perf'`. Rename `export async function generateConversationalSummary(data: FunSpotData)` ([line 87](../../../lib/bigquery/gemini.ts#L87)) to `async function generateConversationalSummaryImpl(data: FunSpotData)`. At the bottom:

```ts
export const generateConversationalSummary = timed(
  'gemini',
  'generateConversationalSummary',
  generateConversationalSummaryImpl,
)
```

(Vendor tag is `gemini`, not `bigquery`, because this is the Gemini AI API even though it lives under `lib/bigquery/`. This separation matters for Table 3 totals.)

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add lib/bigquery/client.ts lib/bigquery/gemini.ts
git commit -m "perf(bigquery): wrap fetchers and gemini summary with timed()"
```

---

## Task 6: Instrument `lib/hubspot/client.ts`

**Files:**
- Modify: [lib/hubspot/client.ts](../../../lib/hubspot/client.ts) — 17 exported async functions

This is the highest-volume file. Apply the same pattern as Task 4 to **each** function. Functions to wrap (line numbers from inspection):

| Line | Current export | New impl name | vendor | fn | extractTags |
|---|---|---|---|---|---|
| 8 | `getHubSpotClient` | `getHubSpotClientImpl` | `hubspot` | `getClient` | `([slug]) => ({ client: slug })` |
| 40 | `getPipelineDeals` | `getPipelineDealsImpl` | `hubspot` | `getPipelineDeals` | `([slug]) => ({ client: slug })` |
| 72 | `getOwnerMap` | `getOwnerMapImpl` | `hubspot` | `getOwnerMap` | `([slug]) => ({ client: slug })` |
| 273 | `getContactStats` | `getContactStatsImpl` | `hubspot` | `getContactStats` | `([slug]) => ({ client: slug })` |
| 314 | `getContactStatsYoY` | `getContactStatsYoYImpl` | `hubspot` | `getContactStatsYoY` | `([slug]) => ({ client: slug })` |
| 353 | `getContactBreakdown` | `getContactBreakdownImpl` | `hubspot` | `getContactBreakdown` | `([slug]) => ({ client: slug })` |
| 393 | `getWeeklyContactStats` | `getWeeklyContactStatsImpl` | `hubspot` | `getWeeklyContactStats` | `([slug]) => ({ client: slug })` |
| 491 | `getWeeklyYTDContacts` | `getWeeklyYTDContactsImpl` | `hubspot` | `getWeeklyYTDContacts` | `([slug]) => ({ client: slug })` |
| 569 | `getMonthlyContactBreakdown` | `getMonthlyContactBreakdownImpl` | `hubspot` | `getMonthlyContactBreakdown` | `([slug]) => ({ client: slug })` |
| 662 | `getQuarterlyContactStats` | `getQuarterlyContactStatsImpl` | `hubspot` | `getQuarterlyContactStats` | `([slug]) => ({ client: slug })` |
| 744 | `getYearlyContactStats` | `getYearlyContactStatsImpl` | `hubspot` | `getYearlyContactStats` | `([slug]) => ({ client: slug })` |
| 820 | `getDailyContactTrend` | `getDailyContactTrendImpl` | `hubspot` | `getDailyContactTrend` | `([slug]) => ({ client: slug })` |
| 863 | `getContactStatsForRange` | `getContactStatsForRangeImpl` | `hubspot` | `getContactStatsForRange` | `([slug]) => ({ client: slug })` |
| 911 | `getHubSpotSummary` | `getHubSpotSummaryImpl` | `hubspot` | `getSummary` | `([slug]) => ({ client: slug })` |
| 1001 | `getFormBreakdown` | `getFormBreakdownImpl` | `hubspot` | `getFormBreakdown` | `([slug]) => ({ client: slug })` |
| 1018 | `getDailyFormTrend` | `getDailyFormTrendImpl` | `hubspot` | `getDailyFormTrend` | `([slug]) => ({ client: slug })` |
| 1078 | `getLifecycleStageCounts` | `getLifecycleStageCountsImpl` | `hubspot` | `getLifecycleStageCounts` | `([slug]) => ({ client: slug })` |
| 1115 | `getFormMetadata` | `getFormMetadataImpl` | `hubspot` | `getFormMetadata` | `([slug]) => ({ client: slug })` |
| 1155 | `getFormSubmissionCounts` (wraps `cache(...)`) | `getFormSubmissionCountsImpl` | `hubspot` | `getFormSubmissionCounts` | `([slug]) => ({ client: slug })` |

Note: the table reads "17" in the header but lists 19 rows because two additional functions were spotted during inspection — wrap all of them.

For the `cache()`-wrapped one (`getFormSubmissionCounts`), the existing line looks like `export const getFormSubmissionCounts = cache(async (...) => {...})`. Drop the `export`, rename to `getFormSubmissionCountsImpl`, then add the timed export at the bottom.

For all `export async function X(slug)` — drop `export`, append `Impl` to the name, then add a timed export at the bottom.

- [ ] **Step 1: Add the import**

At the top of [lib/hubspot/client.ts](../../../lib/hubspot/client.ts), add (after the existing imports):

```ts
import { timed } from '@/lib/perf'
```

- [ ] **Step 2: Rename every function declaration**

For each row in the table above, change `export async function NAME(...)` to `async function NAMEImpl(...)`. Do not touch function bodies. For the one `export const X = cache(...)`, change to `const XImpl = cache(...)`.

- [ ] **Step 3: Add timed exports at the bottom of the file**

Append a single block at the end of the file:

```ts
// --- Profiling wrappers ---
const extractClient = ([slug]: [string, ...unknown[]]) => ({ client: slug })

export const getHubSpotClient = timed('hubspot', 'getClient', getHubSpotClientImpl, extractClient)
export const getPipelineDeals = timed('hubspot', 'getPipelineDeals', getPipelineDealsImpl, extractClient)
export const getOwnerMap = timed('hubspot', 'getOwnerMap', getOwnerMapImpl, extractClient)
export const getContactStats = timed('hubspot', 'getContactStats', getContactStatsImpl, extractClient)
export const getContactStatsYoY = timed('hubspot', 'getContactStatsYoY', getContactStatsYoYImpl, extractClient)
export const getContactBreakdown = timed('hubspot', 'getContactBreakdown', getContactBreakdownImpl, extractClient)
export const getWeeklyContactStats = timed('hubspot', 'getWeeklyContactStats', getWeeklyContactStatsImpl, extractClient)
export const getWeeklyYTDContacts = timed('hubspot', 'getWeeklyYTDContacts', getWeeklyYTDContactsImpl, extractClient)
export const getMonthlyContactBreakdown = timed('hubspot', 'getMonthlyContactBreakdown', getMonthlyContactBreakdownImpl, extractClient)
export const getQuarterlyContactStats = timed('hubspot', 'getQuarterlyContactStats', getQuarterlyContactStatsImpl, extractClient)
export const getYearlyContactStats = timed('hubspot', 'getYearlyContactStats', getYearlyContactStatsImpl, extractClient)
export const getDailyContactTrend = timed('hubspot', 'getDailyContactTrend', getDailyContactTrendImpl, extractClient)
export const getContactStatsForRange = timed('hubspot', 'getContactStatsForRange', getContactStatsForRangeImpl, extractClient)
export const getHubSpotSummary = timed('hubspot', 'getSummary', getHubSpotSummaryImpl, extractClient)
export const getFormBreakdown = timed('hubspot', 'getFormBreakdown', getFormBreakdownImpl, extractClient)
export const getDailyFormTrend = timed('hubspot', 'getDailyFormTrend', getDailyFormTrendImpl, extractClient)
export const getLifecycleStageCounts = timed('hubspot', 'getLifecycleStageCounts', getLifecycleStageCountsImpl, extractClient)
export const getFormMetadata = timed('hubspot', 'getFormMetadata', getFormMetadataImpl, extractClient)
export const getFormSubmissionCounts = timed('hubspot', 'getFormSubmissionCounts', getFormSubmissionCountsImpl, extractClient)
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: build succeeds.

Type-inference pitfall to watch for: TypeScript may complain about `extractClient`'s tuple type if some functions take additional positional args after `slug`. If so, change `extractClient` to a generic-erasing helper:

```ts
const extractClient = (args: unknown[]) => ({ client: args[0] as string })
```

…and pass `extractClient as never` to satisfy the generic — only do this fallback if the strict version fails.

- [ ] **Step 5: Commit**

```bash
git add lib/hubspot/client.ts
git commit -m "perf(hubspot): wrap all exported fetchers with timed()"
```

---

## Task 7: End-to-end smoke test

Confirm that with all wraps in place, running `next start` with `PERF_LOG=1` actually emits log lines on a single report page load.

**Files:** none modified in this task.

- [ ] **Step 1: Build and start the server with PERF_LOG**

In one terminal:
```bash
npm run build
PERF_LOG=1 npm run start
```

Wait for `▲ Next.js ... Ready in ...`.

- [ ] **Step 2: Hit one report page in a browser**

Sign in via the normal flow at `http://localhost:3000/login`. Navigate to any client's GA4 report (e.g. `/portal/avenue-z/reports/ga4`). Wait for the page to render.

- [ ] **Step 3: Verify PERF lines appeared in the server terminal**

Expected: dozens of `PERF {...}` lines, including at least one each with `"vendor":"db"` and `"vendor":"ga4"`, all with `"ok":true` and a numeric `ms`.

If lines are missing, the most likely cause is that one of the wraps didn't actually replace the export (e.g., a leftover `export` keyword on the `*Impl` declaration). Fix the offender and re-run.

- [ ] **Step 4: Stop the server, commit any fixes**

Ctrl-C in the server terminal. If anything needed a fix:

```bash
git add <fixed files>
git commit -m "perf: fix instrumentation wraps surfaced by smoke test"
```

If nothing needed fixing, no commit.

---

## Task 8: Build `scripts/perf-walk.ts`

**Files:**
- Create: `scripts/perf-walk.ts`

Sequential URL walker. Reads all clients + their `enabledReports` from the DB via `getAllClients()`, then for each `(client, report)` issues a GET against `http://localhost:3000/portal/<slug>/reports/<report>` with the session cookie passed via env var.

- [ ] **Step 1: Write the script**

Create `scripts/perf-walk.ts`:

```ts
/**
 * Sequential walker that drives the local Next.js server through every
 * (client, enabledReport) URL so a single `next start` run captures
 * timing data for the whole platform.
 *
 * Usage:
 *   1. In one terminal: PERF_LOG=1 npm run start 2>&1 | tee perf.log
 *   2. In a browser, sign in. Open DevTools > Application > Cookies and
 *      copy the entire Cookie header value for http://localhost:3000.
 *   3. In another terminal:
 *      PERF_SESSION_COOKIE='<paste here>' npx tsx --env-file=.env.local scripts/perf-walk.ts
 */
import { getAllClients } from '../lib/db/queries'

const BASE = process.env.PERF_BASE_URL ?? 'http://localhost:3000'
const COOKIE = process.env.PERF_SESSION_COOKIE
const DATE_RANGE = process.env.PERF_DATE_RANGE ?? 'last_30_days'

async function main() {
  if (!COOKIE) {
    console.error('Missing PERF_SESSION_COOKIE env var.')
    console.error('Sign in at http://localhost:3000, copy the Cookie header from DevTools, and re-run.')
    process.exit(1)
  }

  const clients = await getAllClients()
  console.log(`Walking ${clients.length} clients...`)

  let total = 0
  let ok = 0
  let failed = 0
  const startedAt = Date.now()

  for (const client of clients) {
    for (const report of client.enabledReports) {
      total++
      const url = `${BASE}/portal/${client.slug}/reports/${report}?dateRange=${encodeURIComponent(DATE_RANGE)}`
      const reqStart = Date.now()
      try {
        const res = await fetch(url, {
          headers: { Cookie: COOKIE },
          redirect: 'manual',
        })
        const ms = Date.now() - reqStart
        const status = res.status
        if (status >= 200 && status < 400) {
          ok++
          console.log(`  ✓ ${client.slug}/${report}  ${status}  ${ms}ms`)
          // Drain the body so the server completes the render and emits all PERF lines.
          await res.text()
        } else {
          failed++
          console.log(`  ✗ ${client.slug}/${report}  ${status}  ${ms}ms`)
        }
      } catch (err) {
        failed++
        const message = err instanceof Error ? err.message : String(err)
        console.log(`  ✗ ${client.slug}/${report}  ERROR  ${message}`)
      }
    }
  }

  const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\nWalk complete: ${ok}/${total} ok, ${failed} failed, ${totalSec}s elapsed.`)
}

main().catch((err) => { console.error(err); process.exit(1) })
```

Why `redirect: 'manual'`: an unauthenticated walk (bad cookie) would otherwise follow a 302 to `/login` and return 200, masking the auth failure. With manual mode, the 302 itself shows up as the status code and surfaces the problem.

Why `await res.text()`: `fetch` resolves as soon as headers arrive. To make sure the server finishes rendering and emits every `PERF` line for that page, drain the body before moving on.

- [ ] **Step 2: Sanity-check the script compiles and DB connectivity works**

Run (with the server NOT running — we just want to confirm it starts up and connects to the DB):

```bash
PERF_SESSION_COOKIE='dummy' npx tsx --env-file=.env.local scripts/perf-walk.ts
```

Expected: prints `Walking N clients...` then a series of `✗ <slug>/<report> ERROR connect ECONNREFUSED` lines (because the server isn't running). This confirms DB enumeration works and the loop runs.

If you instead see `Missing PERF_SESSION_COOKIE` — set the env var. If you see a DB connection error — check `.env.local` has `DATABASE_URL`.

- [ ] **Step 3: Commit**

```bash
git add scripts/perf-walk.ts
git commit -m "feat(perf): add perf-walk script for driving local server"
```

---

## Task 9: Build `scripts/perf-report.ts`

**Files:**
- Create: `scripts/perf-report.ts`
- Create: `scripts/perf-report.test.ts`

Pure log parsing and aggregation. Reads any file path from `argv[2]`, parses every line starting with `PERF `, prints Tables 1–3 from the spec.

- [ ] **Step 1: Write the test first**

Create `scripts/perf-report.test.ts`:

```ts
import { strict as assert } from 'node:assert'
import { parseLines, perCall, perSection, perVendor, type PerfEntry } from './perf-report'

const sample = [
  `PERF {"ts":"2026-05-28T18:00:00.000Z","vendor":"db","fn":"getClientBySlug","client":"avenue-z","ms":12,"ok":true}`,
  `PERF {"ts":"2026-05-28T18:00:00.100Z","vendor":"ga4","fn":"runReport","client":"avenue-z","ms":400,"ok":true}`,
  `PERF {"ts":"2026-05-28T18:00:00.150Z","vendor":"ga4","fn":"runReport","client":"avenue-z","ms":600,"ok":true}`,
  `PERF {"ts":"2026-05-28T18:00:00.200Z","vendor":"ga4","fn":"runReport","client":"avenue-z","ms":800,"ok":false,"err":"boom"}`,
  `noise line that should be ignored`,
  `PERF {"ts":"2026-05-28T18:00:05.000Z","vendor":"db","fn":"getClientBySlug","client":"renaissance","ms":15,"ok":true}`,
  `PERF {"ts":"2026-05-28T18:00:05.100Z","vendor":"peec","fn":"getOverview","client":"renaissance","ms":1200,"ok":true}`,
]

const entries: PerfEntry[] = parseLines(sample)
assert.equal(entries.length, 6, 'should parse 6 PERF lines, skip noise')
assert.equal(entries[0].vendor, 'db')
assert.equal(entries[3].ok, false)

const call = perCall(entries)
const ga4Row = call.find((r) => r.vendor === 'ga4' && r.fn === 'runReport')!
assert.equal(ga4Row.n, 3)
assert.equal(ga4Row.err, 1)
assert.equal(ga4Row.median, 600)
assert.equal(ga4Row.max, 800)

const sections = perSection(entries)
// Section boundary: each occurrence of vendor=db, fn=getClientBySlug starts a new section
// for that client. So we should have 2 sections: avenue-z (4 entries) and renaissance (2).
const az = sections.find((s) => s.client === 'avenue-z')!
assert.equal(az.fetches, 4)
assert.equal(az.wall, 200) // 18:00:00.200 - 18:00:00.000
const renSec = sections.find((s) => s.client === 'renaissance')!
assert.equal(renSec.fetches, 2)
assert.equal(renSec.wall, 100)

const vendors = perVendor(entries)
const ga4Total = vendors.find((v) => v.vendor === 'ga4')!
assert.equal(ga4Total.totalCalls, 3)
assert.equal(ga4Total.totalWaitMs, 400 + 600 + 800)

console.log('perf-report.test: passed')
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx tsx scripts/perf-report.test.ts`
Expected: FAIL — module `./perf-report` doesn't exist yet.

- [ ] **Step 3: Implement `scripts/perf-report.ts`**

Create `scripts/perf-report.ts`:

```ts
import { readFileSync } from 'node:fs'

export type PerfEntry = {
  ts: string
  vendor: string
  fn: string
  client?: string
  dateRange?: string
  ms: number
  ok: boolean
  err?: string
}

export function parseLines(lines: string[]): PerfEntry[] {
  const out: PerfEntry[] = []
  for (const line of lines) {
    if (!line.startsWith('PERF ')) continue
    try {
      const obj = JSON.parse(line.slice(5))
      if (typeof obj.vendor === 'string' && typeof obj.fn === 'string' && typeof obj.ms === 'number') {
        out.push(obj as PerfEntry)
      }
    } catch {
      // skip malformed
    }
  }
  return out
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * q
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo))
}

export type CallRow = { vendor: string; fn: string; n: number; median: number; p95: number; max: number; err: number }

export function perCall(entries: PerfEntry[]): CallRow[] {
  const groups = new Map<string, PerfEntry[]>()
  for (const e of entries) {
    const key = `${e.vendor}\t${e.fn}`
    const arr = groups.get(key) ?? []
    arr.push(e)
    groups.set(key, arr)
  }
  const rows: CallRow[] = []
  for (const [key, group] of groups) {
    const [vendor, fn] = key.split('\t')
    const sorted = group.map((e) => e.ms).sort((a, b) => a - b)
    rows.push({
      vendor, fn,
      n: group.length,
      median: quantile(sorted, 0.5),
      p95: quantile(sorted, 0.95),
      max: sorted[sorted.length - 1],
      err: group.filter((e) => !e.ok).length,
    })
  }
  return rows.sort((a, b) => b.p95 - a.p95)
}

export type SectionRow = { client: string; fetches: number; wall: number; sum: number; parallelism: number }

/**
 * Infer sections by treating each `db/getClientBySlug` call as the start of
 * a new section render for that client. All subsequent entries (for ANY
 * client) up until the next `db/getClientBySlug` belong to that section.
 *
 * Because perf-walk is sequential, this is unambiguous: only one render is
 * in flight at a time. We tag the section by the client of the bracketing
 * getClientBySlug call.
 */
export function perSection(entries: PerfEntry[]): SectionRow[] {
  const sections: { client: string; entries: PerfEntry[] }[] = []
  let current: { client: string; entries: PerfEntry[] } | null = null

  for (const e of entries) {
    if (e.vendor === 'db' && e.fn === 'getClientBySlug' && e.client) {
      if (current) sections.push(current)
      current = { client: e.client, entries: [e] }
    } else if (current) {
      current.entries.push(e)
    }
  }
  if (current) sections.push(current)

  return sections.map((s) => {
    const tsList = s.entries.map((e) => new Date(e.ts).getTime()).sort((a, b) => a - b)
    const wall = tsList[tsList.length - 1] - tsList[0]
    const sum = s.entries.reduce((acc, e) => acc + e.ms, 0)
    return {
      client: s.client,
      fetches: s.entries.length,
      wall,
      sum,
      parallelism: wall > 0 ? +(sum / wall).toFixed(1) : 0,
    }
  }).sort((a, b) => b.wall - a.wall)
}

export type VendorRow = { vendor: string; totalCalls: number; totalWaitMs: number; median: number }

export function perVendor(entries: PerfEntry[]): VendorRow[] {
  const groups = new Map<string, PerfEntry[]>()
  for (const e of entries) {
    const arr = groups.get(e.vendor) ?? []
    arr.push(e)
    groups.set(e.vendor, arr)
  }
  const rows: VendorRow[] = []
  for (const [vendor, group] of groups) {
    const sorted = group.map((e) => e.ms).sort((a, b) => a - b)
    rows.push({
      vendor,
      totalCalls: group.length,
      totalWaitMs: group.reduce((acc, e) => acc + e.ms, 0),
      median: quantile(sorted, 0.5),
    })
  }
  return rows.sort((a, b) => b.totalWaitMs - a.totalWaitMs)
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function pad(str: string, n: number): string {
  return str.length >= n ? str : str + ' '.repeat(n - str.length)
}

function printCallTable(rows: CallRow[]): void {
  console.log('Table 1 — Per vendor call (sorted by p95 desc)')
  console.log(pad('vendor', 16) + pad('fn', 28) + pad('n', 7) + pad('median', 10) + pad('p95', 10) + pad('max', 10) + 'err')
  for (const r of rows) {
    console.log(
      pad(r.vendor, 16) + pad(r.fn, 28) + pad(String(r.n), 7) +
      pad(fmtMs(r.median), 10) + pad(fmtMs(r.p95), 10) + pad(fmtMs(r.max), 10) + String(r.err)
    )
  }
}

function printSectionTable(rows: SectionRow[]): void {
  console.log('\nTable 2 — Per section render (sorted by wall desc)')
  console.log(pad('client', 24) + pad('fetches', 10) + pad('wall', 10) + pad('sum', 10) + 'parallelism')
  for (const r of rows) {
    console.log(
      pad(r.client, 24) + pad(String(r.fetches), 10) +
      pad(fmtMs(r.wall), 10) + pad(fmtMs(r.sum), 10) + `${r.parallelism}x`
    )
  }
}

function printVendorTable(rows: VendorRow[]): void {
  console.log('\nTable 3 — Per vendor totals (sorted by total wait desc)')
  console.log(pad('vendor', 16) + pad('total_calls', 14) + pad('total_wait', 14) + 'median')
  for (const r of rows) {
    console.log(
      pad(r.vendor, 16) + pad(String(r.totalCalls), 14) +
      pad(fmtMs(r.totalWaitMs), 14) + fmtMs(r.median)
    )
  }
}

function main() {
  const path = process.argv[2]
  if (!path) {
    console.error('Usage: tsx scripts/perf-report.ts <perf.log>')
    process.exit(1)
  }
  const lines = readFileSync(path, 'utf-8').split('\n')
  const entries = parseLines(lines)
  console.log(`Parsed ${entries.length} PERF entries from ${path}\n`)
  printCallTable(perCall(entries))
  printSectionTable(perSection(entries))
  printVendorTable(perVendor(entries))
}

// Run main only when invoked as a script, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
```

⚠️ The `import.meta.url` guard at the bottom is what lets `scripts/perf-report.test.ts` import the module without triggering `main()`. Confirm at the next step that the test runs cleanly.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx tsx scripts/perf-report.test.ts`
Expected: `perf-report.test: passed`. If a Section 2 assertion fails because the "renaissance" section doesn't include the trailing `peec` entry, re-check `perSection` logic — the test fixture is constructed to exercise exactly that boundary.

- [ ] **Step 5: Commit**

```bash
git add scripts/perf-report.ts scripts/perf-report.test.ts
git commit -m "feat(perf): add perf-report analyzer with parser tests"
```

---

## Task 10: End-to-end dry run + findings stub

Run the whole pipeline once to confirm everything works together, and lay down a findings doc so the next session has a target.

**Files:**
- Create: `docs/superpowers/specs/2026-05-28-report-loading-findings.md`

- [ ] **Step 1: Build and start the server**

```bash
npm run build
PERF_LOG=1 npm run start 2>&1 | tee perf.log
```

Wait for `Ready in ...`.

- [ ] **Step 2: Sign in, capture cookie**

In a browser at `http://localhost:3000/login`, sign in. Open DevTools → Application → Cookies → http://localhost:3000. Copy the value of the `authjs.session-token` cookie. The walker needs the **full** Cookie header value, so format it as `authjs.session-token=<value>` (concatenate other cookies with `;` if multiple exist).

- [ ] **Step 3: Run the walker**

In a second terminal:

```bash
PERF_SESSION_COOKIE='authjs.session-token=<paste here>' npx tsx --env-file=.env.local scripts/perf-walk.ts
```

Expected: a row per `(client, report)` combination, mostly `✓` with 200 status codes, total runtime depends on platform but should be on the order of minutes for a full enumeration.

If you see `✗ ... 307` or `✗ ... 302` on every URL, the session cookie didn't authenticate. Re-copy from DevTools (make sure you're signed in as an internal user with portal access, or signed in to the matching client).

- [ ] **Step 4: Stop the server**

Ctrl-C in the server terminal. `perf.log` should now contain thousands of `PERF {...}` lines.

- [ ] **Step 5: Run the analyzer**

```bash
npx tsx scripts/perf-report.ts perf.log
```

Expected: three tables print to stdout, with non-empty rows for each vendor that was exercised.

- [ ] **Step 6: Write the findings stub**

Pipe the analyzer output into a doc and add interpretation. Create `docs/superpowers/specs/2026-05-28-report-loading-findings.md`:

```bash
{
  echo "# Report Loading Findings — 2026-05-28"
  echo ""
  echo "Captured via the profiling tooling built per [docs/superpowers/specs/2026-05-28-report-loading-profiling-design.md](2026-05-28-report-loading-profiling-design.md)."
  echo ""
  echo "## Run metadata"
  echo ""
  echo "- Environment: local prod build (\`next build && next start\`)"
  echo "- Date range used: \`last_30_days\`"
  echo "- Walker: sequential, all clients × all enabledReports"
  echo "- Caveat: local-network latency to vendor APIs differs from Vercel-network latency. Numbers are relative signal, not production SLO."
  echo ""
  echo "## Raw output"
  echo ""
  echo '```'
  npx tsx scripts/perf-report.ts perf.log
  echo '```'
  echo ""
  echo "## Top offenders (filled in after reviewing the tables above)"
  echo ""
  echo "TBD — review and capture top 5 slowest vendor calls, top 5 slowest section renders, per-vendor aggregate spend."
  echo ""
  echo "## Recommended next actions"
  echo ""
  echo "TBD — frame each as a candidate brainstorm."
} > docs/superpowers/specs/2026-05-28-report-loading-findings.md
```

(The TBDs are intentional — actual analysis is the next session's job, not this plan's. We're laying down the doc shell so the data is captured.)

- [ ] **Step 7: Commit**

Make sure `perf.log` is **not** committed (it's large, repo-noisy, and contains client slugs). Add a gitignore entry first:

```bash
echo "perf.log" >> .gitignore
git add .gitignore docs/superpowers/specs/2026-05-28-report-loading-findings.md
git commit -m "docs: capture initial report-loading profiling findings"
```

---

## Done

After Task 10:
- `lib/perf.ts` is in place, gated, with passing tests.
- Every vendor-client function emits a structured timing log line when `PERF_LOG=1`.
- `scripts/perf-walk.ts` drives the local server through every report URL.
- `scripts/perf-report.ts` summarizes the captured log into three tables.
- `docs/superpowers/specs/2026-05-28-report-loading-findings.md` holds the captured run, ready for human interpretation.

The next session reviews the findings doc and decides which optimization to brainstorm next (per-vendor caching, parallelism fixes, the BigQuery consolidation in TODO.md, etc.). That's a separate brainstorm + spec + plan cycle.
