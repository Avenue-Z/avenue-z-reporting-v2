# Vendor-Layer Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cached()` helper that wraps every heavy vendor-fetcher with `unstable_cache` (1-hour TTL, daily UTC invalidation, version-bumpable, kill-switchable) and emits `cached: true|false` PERF lines via AsyncLocalStorage, then migrate ~28 fetchers across 10 vendor files to use it.

**Architecture:** A single `lib/cache.ts` helper that does its own PERF emission (not composed with `timed()`) and uses ALS to race-free detect cache hits vs. misses. A new `app/api/_perf/boundary` route gives `scripts/perf-compare.ts` deterministic split points between cold and warm walks.

**Tech Stack:** TypeScript, Next.js 16 App Router, `next/cache` `unstable_cache`, Node `AsyncLocalStorage`, `tsx`, Node's `node:assert/strict`. No new runtime dependencies.

**Spec:** [docs/superpowers/specs/2026-05-28-vendor-caching-design.md](../specs/2026-05-28-vendor-caching-design.md)

---

## Dependency Waves

This plan is structured in three waves. Tasks within a wave have **no inter-dependencies** and can be dispatched in parallel. Each wave gates the next.

```
Wave 1 (5 tasks, fully parallel):
  ├── T1: lib/cache.ts + tests          (the cached() helper)
  ├── T2: lib/perf.ts byClient extractor (new typed helper)
  ├── T3: app/api/_perf/boundary/route.ts (PERF marker endpoint)
  ├── T4: scripts/perf-compare.ts + test (cold/warm analyzer)
  └── T5: scripts/perf-walk.ts --pass arg (walker extension)

  ─── all of Wave 1 must complete before Wave 2 ───

Wave 2 (5 tasks, fully parallel — all depend ONLY on T1, plus T2 for T10):
  ├── T6: lib/ga4/client.ts migration
  ├── T7: lib/peec/client.ts migration (preserves version: 'v2')
  ├── T8: 7 single-fn vendor clients (peec/agent-analytics, profound,
  │       gsc, sitebulb, screaming-frog, pr-proof, content-calendar)
  ├── T9: lib/bigquery/client.ts migration (2 fns; gemini NOT wrapped)
  └── T10: lib/hubspot/client.ts migration (18 fns; uses byClient from T2)

  ─── all of Wave 2 must complete + consolidated build must pass ───

Wave 3 (1 task, user-driven):
  └── T11: End-to-end verification + findings doc update
```

**Parallelization notes for orchestrators:**
- Wave 1 implementers do NOT run `npm run build` themselves; the orchestrator runs one consolidated build after Wave 1 completes.
- Wave 2 implementers also do NOT run `npm run build`; orchestrator runs the consolidated build after Wave 2.
- All implementers commit their own work. Git index-lock contention is brief and resolves with retry.
- Within Wave 2, tasks touch entirely disjoint file sets — no conflict risk.

---

## File Structure

**Created:**
- `lib/cache.ts` — the `cached()` HOF + ALS plumbing. Single responsibility: wrap an async fetcher with unstable_cache + PERF emission.
- `scripts/cache-test-disabled.ts` — verifies `CACHE_DISABLE=1` bypass path.
- `scripts/cache-test-byclient.ts` — verifies the `byClient` extractor (lives in T2 file, tested here for proximity).
- `scripts/perf-compare.ts` — cold-vs-warm log analyzer.
- `scripts/perf-compare.test.ts` — unit tests for parser + delta math.
- `app/api/_perf/boundary/route.ts` — PERF boundary marker endpoint.

**Modified:**
- `lib/perf.ts` — add `byClient` typed extractor export. Existing `timed()` stays unchanged.
- `scripts/perf-walk.ts` — accept `--pass <label>` arg, hit boundary route before walking.
- `lib/ga4/client.ts` — replace `timed(ga4Query)` with `cached(ga4Query)`.
- `lib/peec/client.ts` — replace `timed(unstable_cache(...))` with `cached(...)` carrying `version: 'v2'`.
- `lib/peec/agent-analytics.ts` — replace `timed()` with `cached()`.
- `lib/profound/client.ts` — replace `timed()` with `cached()`.
- `lib/gsc/client.ts` — replace `timed()` with `cached()`.
- `lib/sitebulb/client.ts` — replace `timed()` with `cached()`.
- `lib/screaming-frog/client.ts` — replace `timed()` with `cached()`.
- `lib/pr-proof/client.ts` — replace `timed()` with `cached()`.
- `lib/content-calendar/client.ts` — replace `timed()` with `cached()`.
- `lib/bigquery/client.ts` — replace `timed()` with `cached()` for `fetchFunSpotData` + `fetchDailySessions`.
- `lib/bigquery/gemini.ts` — **unchanged** (out of scope per design).
- `lib/hubspot/client.ts` — replace all 18 `timed()` wraps with `cached(...)` using the `byClient` extractor (drops the `as never` casts). Drop the inner React `cache()` from `getFormSubmissionCountsImpl`. Leave the three internal `load*` helpers' React `cache()` wraps alone.

**Not touched (by intent):**
- `lib/db/queries.ts` — auth path, React.cache() per-render is the right level.
- `lib/hubspot/client.ts: getHubSpotClient` — SDK constructor, already memoized.
- `lib/bigquery/gemini.ts: generateConversationalSummary` — keying broken; excluded.
- Any `components/`, `app/dashboard/`, `app/portal/`, `auth.ts`, `proxy.ts`.

---

## Wave 1 — Infrastructure

All five tasks are independent. Implementers do NOT run `npm run build`.

---

### Task 1: `lib/cache.ts` + tests

**Wave:** 1 — independent.
**Files:**
- Create: `lib/cache.ts`
- Create: `scripts/cache-test-disabled.ts`

**Why no full integration test here:** `unstable_cache`'s hit/miss behavior requires a Next.js runtime. Unit tests cover the bypass path (`CACHE_DISABLE=1`) and the PERF emission shape; the ALS/marker mechanism for `cached: true|false` is exercised end-to-end in T11.

- [ ] **Step 1: Write `lib/cache.ts`**

```ts
/**
 * Vendor-layer caching helper.
 *
 * Wraps an async fetcher with Next.js `unstable_cache` (1-hour TTL by
 * default), emits one structured PERF log line per call when `PERF_LOG=1`
 * with an explicit `cached: true|false` field derived via AsyncLocalStorage.
 *
 * Pattern for adding a new wrap:
 *   async function getFooImpl(slug: string) { ... }
 *   export const getFoo = cached('vendor', 'getFoo', getFooImpl, {
 *     extractTags: ([slug]) => ({ client: slug }),
 *   })
 *
 * Cache-busting policy: bump `options.version` whenever a fetcher's
 * response shape OR fetch logic (auth, endpoint, filters) changes.
 *
 * Operational escape: set `CACHE_DISABLE=1` in the environment to bypass
 * unstable_cache entirely. The wrapper falls through to `timed()` so
 * PERF logs still emit; the cache layer is transparent.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { unstable_cache } from 'next/cache'
import { timed, type PerfExtractor } from '@/lib/perf'

const CACHE_DISABLED = process.env.CACHE_DISABLE === '1'
const PERF_LOG_ENABLED = process.env.PERF_LOG === '1'

const cacheStore = new AsyncLocalStorage<{ wasInvoked: { current: boolean } }>()

export interface CachedOptions<TArgs extends unknown[]> {
  /** Bump when response shape or fetch logic changes. */
  version?: string
  /** TTL in seconds. Default 3600 (1 hour). */
  ttlSeconds?: number
  /** Next.js cache tags for explicit invalidation via revalidateTag(). */
  tags?: string[]
  /** Tag extractor for PERF log lines. */
  extractTags?: PerfExtractor<TArgs>
}

export function cached<TArgs extends unknown[], TRet>(
  vendor: string,
  fn: string,
  impl: (...args: TArgs) => Promise<TRet>,
  options: CachedOptions<TArgs> = {},
): (...args: TArgs) => Promise<TRet> {
  // Bypass: behave like timed() only, no caching.
  if (CACHE_DISABLED) {
    return timed(vendor, fn, impl, options.extractTags)
  }

  const version = options.version ?? 'v1'
  const ttlSeconds = options.ttlSeconds ?? 3600

  // implWithMarker: runs inside unstable_cache. Strips the prepended `today`
  // arg before calling the real impl. Flips wasInvoked when it runs (= miss).
  const implWithMarker = async (...allArgs: unknown[]): Promise<TRet> => {
    const store = cacheStore.getStore()
    if (store) store.wasInvoked.current = true
    const [, ...realArgs] = allArgs  // discard `today`
    return impl(...(realArgs as TArgs))
  }

  const cachedFn = unstable_cache(
    implWithMarker,
    [vendor, fn, version],
    { revalidate: ttlSeconds, tags: options.tags },
  )

  return async (...args: TArgs): Promise<TRet> => {
    const wasInvoked = { current: false }
    const today = new Date().toISOString().slice(0, 10)

    return cacheStore.run({ wasInvoked }, async () => {
      let tags: Record<string, string | number | undefined> = {}
      if (options.extractTags) {
        try {
          tags = options.extractTags(args) ?? {}
        } catch {
          tags = {}
        }
      }
      const start = performance.now()
      try {
        const result = await cachedFn(today, ...args)
        const ms = Math.round(performance.now() - start)
        if (PERF_LOG_ENABLED) {
          emit({ ts: new Date().toISOString(), vendor, fn, ms, ok: true, cached: !wasInvoked.current, ...tags })
        }
        return result
      } catch (err) {
        const ms = Math.round(performance.now() - start)
        const message = err instanceof Error ? err.message : String(err)
        if (PERF_LOG_ENABLED) {
          emit({ ts: new Date().toISOString(), vendor, fn, ms, ok: false, cached: false, ...tags, err: message })
        }
        throw err
      }
    })
  }
}

function emit(payload: Record<string, unknown>): void {
  console.log('PERF ' + JSON.stringify(payload))
}
```

- [ ] **Step 2: Write `scripts/cache-test-disabled.ts`**

```ts
/**
 * Verifies the CACHE_DISABLE=1 bypass path of lib/cache.ts.
 * Run with: CACHE_DISABLE=1 PERF_LOG=1 npx tsx scripts/cache-test-disabled.ts
 */
import { strict as assert } from 'node:assert'
import { cached } from '../lib/cache'

async function main() {
  assert.equal(process.env.CACHE_DISABLE, '1', 'this script must run with CACHE_DISABLE=1')
  assert.equal(process.env.PERF_LOG, '1', 'this script must run with PERF_LOG=1')

  const logs: string[] = []
  const origLog = console.log
  console.log = (msg: string) => { logs.push(msg) }

  try {
    let calls = 0
    const impl = async (x: number) => { calls++; return x * 2 }
    const wrapped = cached('test', 'doubler', impl, {
      extractTags: ([x]) => ({ client: `c${x}` }),
    })

    // Two calls with same args. With CACHE_DISABLED, impl runs each time.
    assert.equal(await wrapped(3), 6)
    assert.equal(await wrapped(3), 6)
    assert.equal(calls, 2, 'CACHE_DISABLE: impl must run every call (no cache)')

    // PERF emission should still happen (delegated to timed())
    assert.ok(logs.length >= 2, `expected at least 2 PERF lines, got ${logs.length}`)
    assert.ok(logs[0].startsWith('PERF '))
    const payload = JSON.parse(logs[0].slice(5))
    assert.equal(payload.vendor, 'test')
    assert.equal(payload.fn, 'doubler')
    assert.equal(payload.ok, true)
    assert.equal(payload.client, 'c3')

    // Error path: rethrows, emits ok:false
    logs.length = 0
    const boom = async () => { throw new Error('kaboom') }
    const wrappedBoom = cached('test', 'boom', boom)
    await assert.rejects(() => wrappedBoom(), /kaboom/)
    assert.equal(logs.length, 1)
    const errPayload = JSON.parse(logs[0].slice(5))
    assert.equal(errPayload.ok, false)
    assert.equal(errPayload.err, 'kaboom')
  } finally {
    console.log = origLog
  }

  console.log('cache-test-disabled: passed')
}

main().catch((err) => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Run the bypass test**

Run: `CACHE_DISABLE=1 PERF_LOG=1 npx tsx scripts/cache-test-disabled.ts`
Expected: `cache-test-disabled: passed`

- [ ] **Step 4: Commit**

```bash
git add lib/cache.ts scripts/cache-test-disabled.ts
git commit -m "feat(cache): add cached() helper with ALS hit/miss detection"
```

If commit fails with index.lock (other parallel implementers committing), retry up to 3 times.

---

### Task 2: `byClient` extractor in `lib/perf.ts` + test

**Wave:** 1 — independent.
**Files:**
- Modify: `lib/perf.ts`
- Create: `scripts/cache-test-byclient.ts`

Adds a typed convenience extractor used by HubSpot's 18 wraps (in T10) and any future fetcher whose first arg is a client slug. Eliminates the `as never` cast.

- [ ] **Step 1: Add `byClient` to `lib/perf.ts`**

Append to the bottom of `lib/perf.ts` (after the existing `emit` function):

```ts
/**
 * Convenience extractor: tags PERF lines with `{ client: <first arg as string> }`.
 * Use when the wrapped function's first positional arg is the client slug.
 *
 * Example:
 *   export const getFoo = cached('vendor', 'getFoo', getFooImpl, { extractTags: byClient })
 *
 * Properly typed so callers don't need `as never` casts even when wrapped
 * function signatures vary in their trailing args.
 */
export const byClient: PerfExtractor<[string, ...unknown[]]> =
  ([clientSlug]) => ({ client: clientSlug })
```

- [ ] **Step 2: Write `scripts/cache-test-byclient.ts`**

```ts
/**
 * Verifies the byClient extractor returns the expected shape.
 * Run with: npx tsx scripts/cache-test-byclient.ts
 */
import { strict as assert } from 'node:assert'
import { byClient } from '../lib/perf'

const tags1 = byClient(['avenue-z'])
assert.deepEqual(tags1, { client: 'avenue-z' })

// Tolerates trailing args
const tags2 = byClient(['renaissance', { dateRange: 'last_30_days' }, 42])
assert.deepEqual(tags2, { client: 'renaissance' })

console.log('cache-test-byclient: passed')
```

- [ ] **Step 3: Run the test**

Run: `npx tsx scripts/cache-test-byclient.ts`
Expected: `cache-test-byclient: passed`

- [ ] **Step 4: Commit**

```bash
git add lib/perf.ts scripts/cache-test-byclient.ts
git commit -m "feat(perf): add byClient typed extractor"
```

Retry on index.lock.

---

### Task 3: `app/api/_perf/boundary/route.ts` — marker endpoint

**Wave:** 1 — independent.
**Files:**
- Create: `app/api/_perf/boundary/route.ts`

A no-op route that emits a single PERF line tagged as a boundary marker. Gated to return 404 when `PERF_LOG` is unset. Used by `scripts/perf-walk.ts` (T5) and `scripts/perf-compare.ts` (T4) to split cold/warm walks deterministically.

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Fail closed in prod: returns 404 unless PERF_LOG=1 at module load.
// Same gate as lib/perf.ts — the route only exists when profiling is on.
const PERF_LOG_ENABLED = process.env.PERF_LOG === '1'

export async function GET(req: Request) {
  if (!PERF_LOG_ENABLED) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const url = new URL(req.url)
  const label = url.searchParams.get('label') ?? 'unlabeled'

  console.log('PERF ' + JSON.stringify({
    ts: new Date().toISOString(),
    vendor: '_walk',
    fn: 'boundary',
    label,
    ms: 0,
    ok: true,
  }))

  return NextResponse.json({ ok: true, label })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/_perf/boundary/route.ts
git commit -m "feat(perf): add boundary marker route for cold/warm split"
```

Retry on index.lock. (No standalone test — exercised in T11 end-to-end.)

---

### Task 4: `scripts/perf-compare.ts` + test

**Wave:** 1 — independent.
**Files:**
- Create: `scripts/perf-compare.ts`
- Create: `scripts/perf-compare.test.ts`

Parses one log file containing both cold and warm walks separated by `vendor=_walk fn=boundary` markers. Prints the delta table from the spec.

- [ ] **Step 1: Write the test first**

```ts
/**
 * scripts/perf-compare.test.ts — unit tests for perf-compare's parser
 * and delta math. Run with: npx tsx scripts/perf-compare.test.ts
 */
import { strict as assert } from 'node:assert'
import { splitByBoundaries, perVendorDelta, type PerfEntry } from './perf-compare'

const sample: string[] = [
  // boundary: cold pass starts
  `PERF {"ts":"2026-05-28T18:00:00.000Z","vendor":"_walk","fn":"boundary","label":"cold","ms":0,"ok":true}`,
  // cold pass entries
  `PERF {"ts":"2026-05-28T18:00:00.100Z","vendor":"ga4","fn":"runReport","ms":400,"ok":true,"cached":false}`,
  `PERF {"ts":"2026-05-28T18:00:00.500Z","vendor":"ga4","fn":"runReport","ms":600,"ok":true,"cached":false}`,
  `PERF {"ts":"2026-05-28T18:00:01.000Z","vendor":"hubspot","fn":"getDeals","ms":800,"ok":true,"cached":false}`,
  // boundary: warm pass starts
  `PERF {"ts":"2026-05-28T18:00:30.000Z","vendor":"_walk","fn":"boundary","label":"warm","ms":0,"ok":true}`,
  // warm pass entries
  `PERF {"ts":"2026-05-28T18:00:30.100Z","vendor":"ga4","fn":"runReport","ms":2,"ok":true,"cached":true}`,
  `PERF {"ts":"2026-05-28T18:00:30.200Z","vendor":"ga4","fn":"runReport","ms":3,"ok":true,"cached":true}`,
  `PERF {"ts":"2026-05-28T18:00:30.300Z","vendor":"hubspot","fn":"getDeals","ms":2,"ok":true,"cached":true}`,
  // noise
  `not a perf line`,
]

const { cold, warm } = splitByBoundaries(sample, 'cold', 'warm')

// Boundary markers themselves must be excluded from both buckets.
assert.equal(cold.length, 3, 'cold bucket should have 3 entries, got ' + cold.length)
assert.equal(warm.length, 3, 'warm bucket should have 3 entries, got ' + warm.length)
assert.ok(cold.every((e: PerfEntry) => e.vendor !== '_walk'))
assert.ok(warm.every((e: PerfEntry) => e.vendor !== '_walk'))

const deltas = perVendorDelta(cold, warm)
const ga4 = deltas.find((d) => d.vendor === 'ga4')!
assert.equal(ga4.coldTotalMs, 1000)
assert.equal(ga4.warmTotalMs, 5)
assert.equal(ga4.deltaPct, -99)
assert.equal(ga4.hitRatePct, 100, 'all warm calls cached:true → 100% hit rate')

const hs = deltas.find((d) => d.vendor === 'hubspot')!
assert.equal(hs.coldTotalMs, 800)
assert.equal(hs.warmTotalMs, 2)
assert.equal(hs.hitRatePct, 100)

console.log('perf-compare.test: passed')
```

- [ ] **Step 2: Run the test to confirm it fails (module doesn't exist)**

Run: `npx tsx scripts/perf-compare.test.ts`
Expected: error about missing module `./perf-compare`.

- [ ] **Step 3: Implement `scripts/perf-compare.ts`**

```ts
/**
 * Compares cold and warm walks captured in a single PERF log.
 *
 * Usage: tsx scripts/perf-compare.ts <perf.log> <cold-label> <warm-label>
 * Example: tsx scripts/perf-compare.ts perf.log cold warm
 *
 * Splits the log on boundary markers (PERF entries with vendor=_walk,
 * fn=boundary). Boundary entries themselves are excluded from per-vendor
 * aggregates.
 */
import { readFileSync } from 'node:fs'

export type PerfEntry = {
  ts: string
  vendor: string
  fn: string
  ms: number
  ok: boolean
  cached?: boolean
  client?: string
  dateRange?: string
  label?: string
  err?: string
}

function parseLines(lines: string[]): PerfEntry[] {
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

export function splitByBoundaries(
  lines: string[],
  coldLabel: string,
  warmLabel: string,
): { cold: PerfEntry[]; warm: PerfEntry[] } {
  const entries = parseLines(lines)
  const cold: PerfEntry[] = []
  const warm: PerfEntry[] = []
  let bucket: 'cold' | 'warm' | null = null

  for (const e of entries) {
    if (e.vendor === '_walk' && e.fn === 'boundary') {
      if (e.label === coldLabel) bucket = 'cold'
      else if (e.label === warmLabel) bucket = 'warm'
      else bucket = null  // unknown label resets — don't bucket subsequent entries
      continue  // boundary markers themselves are excluded from buckets
    }
    if (bucket === 'cold') cold.push(e)
    else if (bucket === 'warm') warm.push(e)
  }

  return { cold, warm }
}

export type VendorDelta = {
  vendor: string
  coldCalls: number
  warmCalls: number
  coldTotalMs: number
  warmTotalMs: number
  deltaPct: number  // negative = improvement
  hitRatePct: number  // % of warm calls with cached === true
}

export function perVendorDelta(cold: PerfEntry[], warm: PerfEntry[]): VendorDelta[] {
  const vendors = new Set<string>()
  for (const e of cold) vendors.add(e.vendor)
  for (const e of warm) vendors.add(e.vendor)

  const rows: VendorDelta[] = []
  for (const vendor of vendors) {
    const coldEntries = cold.filter((e) => e.vendor === vendor)
    const warmEntries = warm.filter((e) => e.vendor === vendor)
    const coldTotal = coldEntries.reduce((a, e) => a + e.ms, 0)
    const warmTotal = warmEntries.reduce((a, e) => a + e.ms, 0)
    const deltaPct = coldTotal > 0 ? Math.round(((warmTotal - coldTotal) / coldTotal) * 100) : 0
    const cachedHits = warmEntries.filter((e) => e.cached === true).length
    const hitRatePct = warmEntries.length > 0 ? Math.round((cachedHits / warmEntries.length) * 100) : 0
    rows.push({
      vendor,
      coldCalls: coldEntries.length,
      warmCalls: warmEntries.length,
      coldTotalMs: coldTotal,
      warmTotalMs: warmTotal,
      deltaPct,
      hitRatePct,
    })
  }
  return rows.sort((a, b) => b.coldTotalMs - a.coldTotalMs)
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function pad(str: string, n: number): string {
  return str.length >= n ? str : str + ' '.repeat(n - str.length)
}

function printDeltaTable(rows: VendorDelta[]): void {
  console.log(pad('vendor', 16) + pad('cold_wait', 12) + pad('warm_wait', 12) + pad('delta', 10) + 'hit_rate')
  for (const r of rows) {
    const deltaStr = r.deltaPct === 0 ? '—' : `${r.deltaPct}%`
    console.log(
      pad(r.vendor, 16) +
      pad(fmtMs(r.coldTotalMs), 12) +
      pad(fmtMs(r.warmTotalMs), 12) +
      pad(deltaStr, 10) +
      `${r.hitRatePct}%`
    )
  }
}

function main() {
  const [logPath, coldLabel, warmLabel] = process.argv.slice(2)
  if (!logPath || !coldLabel || !warmLabel) {
    console.error('Usage: tsx scripts/perf-compare.ts <perf.log> <cold-label> <warm-label>')
    process.exit(1)
  }
  let lines: string[]
  try {
    lines = readFileSync(logPath, 'utf-8').split('\n')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Could not read perf log at "${logPath}": ${message}`)
    process.exit(1)
  }
  const { cold, warm } = splitByBoundaries(lines, coldLabel, warmLabel)
  console.log(`Parsed ${cold.length} cold + ${warm.length} warm entries from ${logPath}\n`)
  printDeltaTable(perVendorDelta(cold, warm))
}

// Run main only when invoked as a script, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx tsx scripts/perf-compare.test.ts`
Expected: `perf-compare.test: passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/perf-compare.ts scripts/perf-compare.test.ts
git commit -m "feat(perf): add perf-compare cold/warm delta analyzer"
```

Retry on index.lock.

---

### Task 5: `scripts/perf-walk.ts` — `--pass <label>` arg

**Wave:** 1 — independent of T1–T4. The script change can land before the boundary route (T3) exists; the walker only hits the route at runtime.

**Files:**
- Modify: `scripts/perf-walk.ts`

Add a `--pass <label>` CLI flag. When set, the walker hits `/api/_perf/boundary?label=<label>` before walking URLs. The marker emits as a PERF line to server stdout, used by `perf-compare.ts` (T4) to split cold/warm walks.

- [ ] **Step 1: Replace the body of `scripts/perf-walk.ts` with the updated version**

```ts
/**
 * Sequential walker that drives the local Next.js server through every
 * (client, enabledReport) URL so a single `next start` run captures
 * timing data for the whole platform.
 *
 * Usage (basic):
 *   PERF_SESSION_COOKIE='...' tsx --env-file=.env.local scripts/perf-walk.ts
 *
 * Usage (cold/warm comparison):
 *   In one terminal: PERF_LOG=1 npm run start 2>&1 | tee perf.log
 *   Sign in via browser, copy session cookie from DevTools.
 *   PERF_SESSION_COOKIE='...' tsx --env-file=.env.local scripts/perf-walk.ts --pass cold
 *   PERF_SESSION_COOKIE='...' tsx --env-file=.env.local scripts/perf-walk.ts --pass warm
 *   Then: tsx scripts/perf-compare.ts perf.log cold warm
 *
 * The --pass flag (optional) makes the walker hit /api/_perf/boundary?label=<pass>
 * before walking URLs, so perf-compare.ts can split cold/warm passes
 * deterministically.
 */
import { getAllClients } from '../lib/db/queries'

const BASE = process.env.PERF_BASE_URL ?? 'http://localhost:3000'
const COOKIE = process.env.PERF_SESSION_COOKIE
const DATE_RANGE = process.env.PERF_DATE_RANGE ?? 'last_30_days'

function parsePassArg(): string | null {
  const idx = process.argv.indexOf('--pass')
  if (idx === -1) return null
  const label = process.argv[idx + 1]
  if (!label || label.startsWith('--')) {
    console.error('--pass requires a label argument (e.g. --pass cold)')
    process.exit(1)
  }
  return label
}

async function emitBoundary(label: string): Promise<void> {
  const url = `${BASE}/api/_perf/boundary?label=${encodeURIComponent(label)}`
  const res = await fetch(url, { headers: { Cookie: COOKIE! } })
  if (res.status === 404) {
    console.error(`Boundary route returned 404 — make sure the server was started with PERF_LOG=1`)
    process.exit(1)
  }
  if (!res.ok) {
    console.error(`Boundary marker emit failed: HTTP ${res.status}`)
    process.exit(1)
  }
  await res.text()
}

async function main() {
  if (!COOKIE) {
    console.error('Missing PERF_SESSION_COOKIE env var.')
    console.error('Sign in at http://localhost:3000, copy the Cookie header from DevTools, and re-run.')
    process.exit(1)
  }

  const pass = parsePassArg()
  if (pass) {
    console.log(`Emitting boundary marker for pass="${pass}"...`)
    await emitBoundary(pass)
  }

  const clients = await getAllClients()
  console.log(`Walking ${clients.length} clients${pass ? ` (pass=${pass})` : ''}...`)

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

- [ ] **Step 2: Sanity-check the script parses args**

Run: `PERF_SESSION_COOKIE='dummy' npx tsx --env-file=.env.local scripts/perf-walk.ts --pass cold 2>&1 | head -3`
Expected: prints `Emitting boundary marker for pass="cold"...` then a fetch error (server not running). Confirms the new flag was parsed.

Then verify the no-pass form still works:
Run: `PERF_SESSION_COOKIE='dummy' npx tsx --env-file=.env.local scripts/perf-walk.ts 2>&1 | head -3`
Expected: prints `Walking N clients...` (no boundary emission, no error from boundary).

- [ ] **Step 3: Commit**

```bash
git add scripts/perf-walk.ts
git commit -m "feat(perf): add --pass arg to perf-walk for boundary markers"
```

Retry on index.lock.

---

## Wave 1 gate — Consolidated build

After all five Wave 1 implementers complete, the orchestrator runs:

```bash
npm run build
```

Expected: build succeeds. If any file has a type error, dispatch a fix subagent targeted at the failing file before starting Wave 2.

---

## Wave 2 — Vendor file migrations

All five tasks are independent. Each depends ONLY on Wave 1's T1 (`cached()` helper) and T2 (`byClient` extractor — used by T10 only). Implementers do NOT run `npm run build`.

Migration pattern (applies to every wrap, identical mechanics):

```ts
// before — the perf-wrap pattern
import { timed } from '@/lib/perf'
async function getFooImpl(slug: string) { ... }
export const getFoo = timed('vendor', 'getFoo', getFooImpl, ([s]) => ({ client: s }))

// after
import { cached } from '@/lib/cache'
async function getFooImpl(slug: string) { ... }
export const getFoo = cached('vendor', 'getFoo', getFooImpl, {
  extractTags: ([s]) => ({ client: s }),
})
```

**Drop the `timed` import**; `cached()` handles PERF emission internally.

---

### Task 6: `lib/ga4/client.ts` migration

**Wave:** 2 — depends on T1.
**Files:**
- Modify: `lib/ga4/client.ts`

- [ ] **Step 1: Update the import**

In `lib/ga4/client.ts`, change:
```ts
import { timed } from '@/lib/perf'
```
to:
```ts
import { cached } from '@/lib/cache'
```

- [ ] **Step 2: Replace the export at the bottom of the file**

Find:
```ts
export const ga4Query = timed(
  'ga4',
  'runReport',
  ga4QueryImpl,
  ([params]) => ({ client: params.clientSlug, dateRange: params.dateRange }),
)
```

Replace with:
```ts
export const ga4Query = cached(
  'ga4',
  'runReport',
  ga4QueryImpl,
  {
    extractTags: ([params]) => ({ client: params.clientSlug, dateRange: params.dateRange }),
  },
)
```

Leave `ga4QueryImpl` and the function body unchanged.

- [ ] **Step 3: Commit**

```bash
git add lib/ga4/client.ts
git commit -m "perf(ga4): migrate ga4Query to cached()"
```

Retry on index.lock.

---

### Task 7: `lib/peec/client.ts` migration (preserves `version: 'v2'`)

**Wave:** 2 — depends on T1.
**Files:**
- Modify: `lib/peec/client.ts`

The existing `getPeecOverview` is `timed(unstable_cache(async ..., ['peec-overview-v2'], { revalidate: 3600, tags: ['peec-overview'] }))`. The migration unwraps the `unstable_cache` (now provided by `cached()`) and carries forward the version `'v2'`.

- [ ] **Step 1: Update imports**

In `lib/peec/client.ts`, remove:
```ts
import { unstable_cache } from 'next/cache'
import { timed } from '@/lib/perf'
```

Add:
```ts
import { cached } from '@/lib/cache'
```

- [ ] **Step 2: Restructure `getPeecOverview`**

Find the existing structure (around lines 327–609):
```ts
const getPeecOverviewImpl = unstable_cache(
  async (clientSlug?: string): Promise<PeecOverview> => {
    // ...body...
  },
  ['peec-overview-v2'],
  { revalidate: 3600, tags: ['peec-overview'] },
)

export const getPeecOverview = timed(
  'peec',
  'getOverview',
  getPeecOverviewImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

Replace with:
```ts
async function getPeecOverviewImpl(clientSlug?: string): Promise<PeecOverview> {
  // ...body unchanged — copy verbatim from inside the unstable_cache call...
}

export const getPeecOverview = cached(
  'peec',
  'getOverview',
  getPeecOverviewImpl,
  {
    version: 'v2',
    tags: ['peec-overview'],
    extractTags: ([clientSlug]) => ({ client: clientSlug }),
  },
)
```

⚠️ **Critical:** the `version: 'v2'` MUST be present. It carries forward the cache-bust marker from the previous `['peec-overview-v2']` keyParts, which existed to invalidate stale entries from the PEEC_AI_ACCESS_TOKEN → PEEC_AI_CUSTOMER_TOKEN migration (per the comment that was at lib/peec/client.ts:596 before this change). Dropping it would risk re-serving the old cache-poisoned data.

- [ ] **Step 3: Update or remove the cache-bust comment**

The existing comment ("Bump the version string to invalidate all cached entries when the response shape or fetch logic changes. v2 = after switching from PEEC_AI_ACCESS_TOKEN to PEEC_AI_CUSTOMER_TOKEN; old cached entries were populated with Avenue Z's data regardless of clientSlug.") was attached to the `['peec-overview-v2']` line. Move/adapt it to sit above the `version: 'v2'` field:

```ts
export const getPeecOverview = cached(
  'peec',
  'getOverview',
  getPeecOverviewImpl,
  {
    // Bump version when response shape or fetch logic changes.
    // v2 = after PEEC_AI_ACCESS_TOKEN → PEEC_AI_CUSTOMER_TOKEN migration;
    // old cached entries were populated with Avenue Z's data regardless of
    // clientSlug. Don't drop this without confirming a fresh deploy clears
    // the Vercel Data Cache.
    version: 'v2',
    tags: ['peec-overview'],
    extractTags: ([clientSlug]) => ({ client: clientSlug }),
  },
)
```

- [ ] **Step 4: Commit**

```bash
git add lib/peec/client.ts
git commit -m "perf(peec): migrate getPeecOverview to cached() with version v2"
```

Retry on index.lock.

---

### Task 8: 7 single-function vendor clients

**Wave:** 2 — depends on T1.
**Files:**
- Modify: `lib/peec/agent-analytics.ts`
- Modify: `lib/profound/client.ts`
- Modify: `lib/gsc/client.ts`
- Modify: `lib/sitebulb/client.ts`
- Modify: `lib/screaming-frog/client.ts`
- Modify: `lib/pr-proof/client.ts`
- Modify: `lib/content-calendar/client.ts`

Each file has one exported async fetcher already wrapped with `timed()`. Same migration pattern, repeated 7 times.

- [ ] **Step 1: `lib/peec/agent-analytics.ts` — `getAgentAnalytics`**

Replace `import { timed } from '@/lib/perf'` with `import { cached } from '@/lib/cache'`.

Find:
```ts
export const getAgentAnalytics = timed(
  'peec',
  'getAgentAnalytics',
  getAgentAnalyticsImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

Replace with:
```ts
export const getAgentAnalytics = cached(
  'peec',
  'getAgentAnalytics',
  getAgentAnalyticsImpl,
  {
    extractTags: ([clientSlug]) => ({ client: clientSlug }),
  },
)
```

- [ ] **Step 2: `lib/profound/client.ts` — `getProfoundOverview`**

Replace the import. Find:
```ts
export const getProfoundOverview = timed('profound', 'getOverview', getProfoundOverviewImpl)
```

Replace with:
```ts
export const getProfoundOverview = cached('profound', 'getOverview', getProfoundOverviewImpl)
```

(No `extractTags` — function takes no args.)

- [ ] **Step 3: `lib/gsc/client.ts` — `getGSCOverview`**

Replace the import. Find:
```ts
export const getGSCOverview = timed(
  'gsc',
  'getOverview',
  getGSCOverviewImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

Replace with:
```ts
export const getGSCOverview = cached(
  'gsc',
  'getOverview',
  getGSCOverviewImpl,
  {
    extractTags: ([clientSlug]) => ({ client: clientSlug }),
  },
)
```

- [ ] **Step 4: `lib/sitebulb/client.ts` — `getSitebulbData`**

Replace the import. Find:
```ts
export const getSitebulbData = timed(
  'sitebulb',
  'getData',
  getSitebulbDataImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

Replace with:
```ts
export const getSitebulbData = cached(
  'sitebulb',
  'getData',
  getSitebulbDataImpl,
  {
    extractTags: ([clientSlug]) => ({ client: clientSlug }),
  },
)
```

- [ ] **Step 5: `lib/screaming-frog/client.ts` — `getSFData`**

Replace the import. Find:
```ts
export const getSFData = timed(
  'screaming-frog',
  'getData',
  getSFDataImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

Replace with:
```ts
export const getSFData = cached(
  'screaming-frog',
  'getData',
  getSFDataImpl,
  {
    extractTags: ([clientSlug]) => ({ client: clientSlug }),
  },
)
```

- [ ] **Step 6: `lib/pr-proof/client.ts` — `getPRProofData`**

Replace the import. Find:
```ts
export const getPRProofData = timed(
  'pr-proof',
  'getData',
  getPRProofDataImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

Replace with:
```ts
export const getPRProofData = cached(
  'pr-proof',
  'getData',
  getPRProofDataImpl,
  {
    extractTags: ([clientSlug]) => ({ client: clientSlug }),
  },
)
```

- [ ] **Step 7: `lib/content-calendar/client.ts` — `getContentCalendarData`**

Replace the import. Find:
```ts
export const getContentCalendarData = timed(
  'content-calendar',
  'getData',
  getContentCalendarDataImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)
```

Replace with:
```ts
export const getContentCalendarData = cached(
  'content-calendar',
  'getData',
  getContentCalendarDataImpl,
  {
    extractTags: ([clientSlug]) => ({ client: clientSlug }),
  },
)
```

- [ ] **Step 8: Commit all 7 files together**

```bash
git add lib/peec/agent-analytics.ts lib/profound/client.ts lib/gsc/client.ts lib/sitebulb/client.ts lib/screaming-frog/client.ts lib/pr-proof/client.ts lib/content-calendar/client.ts
git commit -m "perf(vendors): migrate single-function vendor clients to cached()"
```

Retry on index.lock.

---

### Task 9: `lib/bigquery/client.ts` migration (gemini NOT touched)

**Wave:** 2 — depends on T1.
**Files:**
- Modify: `lib/bigquery/client.ts`
- **NOT modified:** `lib/bigquery/gemini.ts` (per design — `generateConversationalSummary` is excluded from caching scope)

Two fetchers in `lib/bigquery/client.ts`: `fetchFunSpotData` (one arg: dateRange) and `fetchDailySessions` (two args: ga4Account, dateRange).

- [ ] **Step 1: Update the import**

In `lib/bigquery/client.ts`, replace `import { timed } from '@/lib/perf'` with `import { cached } from '@/lib/cache'`.

- [ ] **Step 2: Replace `fetchFunSpotData`**

Find:
```ts
export const fetchFunSpotData = timed(
  'bigquery',
  'fetchFunSpotData',
  fetchFunSpotDataImpl,
  ([dateRange]) => ({ dateRange }),
)
```

Replace with:
```ts
export const fetchFunSpotData = cached(
  'bigquery',
  'fetchFunSpotData',
  fetchFunSpotDataImpl,
  {
    extractTags: ([dateRange]) => ({ dateRange }),
  },
)
```

- [ ] **Step 3: Replace `fetchDailySessions`**

Find:
```ts
export const fetchDailySessions = timed(
  'bigquery',
  'fetchDailySessions',
  fetchDailySessionsImpl,
  ([ga4Account, dateRange]) => ({ client: ga4Account, dateRange }),
)
```

Replace with:
```ts
export const fetchDailySessions = cached(
  'bigquery',
  'fetchDailySessions',
  fetchDailySessionsImpl,
  {
    extractTags: ([ga4Account, dateRange]) => ({ client: ga4Account, dateRange }),
  },
)
```

- [ ] **Step 4: Verify gemini.ts is untouched**

`lib/bigquery/gemini.ts` should NOT be modified. Confirm with `git diff lib/bigquery/gemini.ts` — expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/bigquery/client.ts
git commit -m "perf(bigquery): migrate fetchers to cached() (gemini excluded)"
```

Retry on index.lock.

---

### Task 10: `lib/hubspot/client.ts` migration (18 wraps, uses `byClient`)

**Wave:** 2 — depends on T1 AND T2.
**Files:**
- Modify: `lib/hubspot/client.ts`

The largest migration. 18 wraps. Also drops the inner React `cache()` from `getFormSubmissionCountsImpl`. Leaves the three internal load helpers' React `cache()` calls alone.

- [ ] **Step 1: Update imports**

In `lib/hubspot/client.ts`, replace:
```ts
import { timed } from '@/lib/perf'
```
with:
```ts
import { cached } from '@/lib/cache'
import { byClient } from '@/lib/perf'
```

- [ ] **Step 2: Drop inner React `cache()` from `getFormSubmissionCountsImpl`**

Find (around line 1156):
```ts
const getFormSubmissionCountsImpl = cache(async (
  clientSlug: string,
  startDate:  string,
  endDate:    string,
): Promise<FormSubmissionCount[]> => {
  // ...body...
})
```

Replace with:
```ts
const getFormSubmissionCountsImpl = async (
  clientSlug: string,
  startDate:  string,
  endDate:    string,
): Promise<FormSubmissionCount[]> => {
  // ...body unchanged...
}
```

(Just remove the `cache(` wrapper and the closing `)`. Body stays.)

⚠️ **Do NOT modify the React `cache()` wraps on `load2025InboundContacts` (line 109), `load2026InboundContacts` (line 181), or `loadFormContactsForRange` (line 949).** Those are internal helpers, not exported, and coordinate multiple outer fetchers within one render that touch the same paginated loads. The outer `cached()` doesn't replace their per-render dedup utility on a cold-cache miss.

- [ ] **Step 3: Replace the entire `// --- Profiling wrappers ---` block at the bottom of the file**

Find the existing block (starts with `// --- Profiling wrappers ---`, ends after the 19th `export const ... = timed(...)`):

```ts
// --- Profiling wrappers ---
// `extractClient` assumes args[0] is the client slug for every wrapped fn below.
// ... (existing extractClient definition and 19 timed() exports) ...
```

Replace the entire block with:

```ts
// --- Cache wrappers ---
// All 18 HubSpot fetchers below take `clientSlug` as their first arg, so
// they share the typed `byClient` extractor from lib/perf. If you add a
// wrap for a function whose first arg is NOT the client slug, write a
// per-call extractor inline instead — don't extend byClient.
//
// `getHubSpotClient` is intentionally NOT wrapped: it returns the SDK
// instance (memoized in module-scope _clients Map), not a data fetch.
export const getHubSpotClient = getHubSpotClientImpl  // not cached; SDK constructor

export const getPipelineDeals = cached('hubspot', 'getPipelineDeals', getPipelineDealsImpl, { extractTags: byClient })
export const getOwnerMap = cached('hubspot', 'getOwnerMap', getOwnerMapImpl, { extractTags: byClient })
export const getContactStats = cached('hubspot', 'getContactStats', getContactStatsImpl, { extractTags: byClient })
export const getContactStatsYoY = cached('hubspot', 'getContactStatsYoY', getContactStatsYoYImpl, { extractTags: byClient })
export const getContactBreakdown = cached('hubspot', 'getContactBreakdown', getContactBreakdownImpl, { extractTags: byClient })
export const getWeeklyContactStats = cached('hubspot', 'getWeeklyContactStats', getWeeklyContactStatsImpl, { extractTags: byClient })
export const getWeeklyYTDContacts = cached('hubspot', 'getWeeklyYTDContacts', getWeeklyYTDContactsImpl, { extractTags: byClient })
export const getMonthlyContactBreakdown = cached('hubspot', 'getMonthlyContactBreakdown', getMonthlyContactBreakdownImpl, { extractTags: byClient })
export const getQuarterlyContactStats = cached('hubspot', 'getQuarterlyContactStats', getQuarterlyContactStatsImpl, { extractTags: byClient })
export const getYearlyContactStats = cached('hubspot', 'getYearlyContactStats', getYearlyContactStatsImpl, { extractTags: byClient })
export const getDailyContactTrend = cached('hubspot', 'getDailyContactTrend', getDailyContactTrendImpl, { extractTags: byClient })
export const getContactStatsForRange = cached('hubspot', 'getContactStatsForRange', getContactStatsForRangeImpl, { extractTags: byClient })
export const getHubSpotSummary = cached('hubspot', 'getSummary', getHubSpotSummaryImpl, { extractTags: byClient })
export const getFormBreakdown = cached('hubspot', 'getFormBreakdown', getFormBreakdownImpl, { extractTags: byClient })
export const getDailyFormTrend = cached('hubspot', 'getDailyFormTrend', getDailyFormTrendImpl, { extractTags: byClient })
export const getLifecycleStageCounts = cached('hubspot', 'getLifecycleStageCounts', getLifecycleStageCountsImpl, { extractTags: byClient })
export const getFormMetadata = cached('hubspot', 'getFormMetadata', getFormMetadataImpl, { extractTags: byClient })
export const getFormSubmissionCounts = cached('hubspot', 'getFormSubmissionCounts', getFormSubmissionCountsImpl, { extractTags: byClient })
```

Note: `getHubSpotClient` previously had a `timed()` wrap so we logged calls. Now it's just `export const getHubSpotClient = getHubSpotClientImpl` (no timing). Rationale: it's a memoized SDK constructor, not a data fetch — logging it added noise without diagnostic value.

⚠️ **No `as never` casts.** The `byClient` extractor is properly typed as `PerfExtractor<[string, ...unknown[]]>`, which matches every wrapped fn's first arg (clientSlug: string) without needing the cast that the previous `extractClient` workaround required.

- [ ] **Step 4: Spot-check the file**

```bash
grep -c "^export const .* = cached(" lib/hubspot/client.ts
```
Expected: `18`.

```bash
grep -c "= timed(" lib/hubspot/client.ts
```
Expected: `0`.

```bash
grep -n "as never" lib/hubspot/client.ts
```
Expected: no output (no casts remain).

```bash
grep -n "^const load.* = cache(" lib/hubspot/client.ts
```
Expected: 3 lines (the three internal `load*` helpers; their per-render `cache()` is preserved).

- [ ] **Step 5: Commit**

```bash
git add lib/hubspot/client.ts
git commit -m "perf(hubspot): migrate 18 fetchers to cached() with byClient"
```

Retry on index.lock.

---

## Wave 2 gate — Consolidated build + smoke

After all five Wave 2 implementers complete, the orchestrator runs:

```bash
npm run build
```

Expected: build succeeds. If any file has a type error, dispatch a fix subagent for that specific file.

Then a quick local smoke (no walker needed):

```bash
PERF_LOG=1 npm run start
```

In a browser, sign in and load one report page (any GA4 page works). In the server terminal, confirm:
- PERF lines appear with `"cached":true` or `"cached":false`
- On the second load of the same page, `"cached":true` appears for at least some of the GA4 calls (proves cache hits work)
- No 500 errors, no `unstable_cache` warnings

If the smoke fails, the most likely cause is a syntax issue in `lib/cache.ts` not surfaced by `tsc` — re-check Step 1 of T1. Stop the server when done.

---

## Wave 3 — End-to-end verification

### Task 11: Full perf-walk + perf-compare + findings update

**Wave:** 3 — depends on all of Wave 1 and Wave 2.
**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-report-loading-findings.md`

This task is user-driven because it requires browser sign-in to capture a session cookie. The user runs the walks; the orchestrator updates the findings doc with results.

- [ ] **Step 1: Build and start the server with PERF_LOG**

```bash
npm run build
PERF_LOG=1 npm run start 2>&1 | tee perf-cache.log
```

Wait for `Ready in ...`.

- [ ] **Step 2: Sign in, capture cookie**

In a browser at `http://localhost:3000/login`, sign in. Open DevTools → Application → Cookies → http://localhost:3000. Copy the value of `authjs.session-token`. Format as `authjs.session-token=<value>` (concatenate other cookies with `;` if multiple).

- [ ] **Step 3: Run cold walk**

In a second terminal:

```bash
PERF_SESSION_COOKIE='authjs.session-token=<paste here>' npx tsx --env-file=.env.local scripts/perf-walk.ts --pass cold
```

Expected: walker emits boundary marker, then walks all `(client, enabledReport)` pairs, mostly `✓` with 200 status.

- [ ] **Step 4: Run warm walk**

Immediately after the cold walk completes:

```bash
PERF_SESSION_COOKIE='authjs.session-token=<paste here>' npx tsx --env-file=.env.local scripts/perf-walk.ts --pass warm
```

Expected: same walk, but server-side `console.log` should show many more `"cached":true` entries this time.

- [ ] **Step 5: Stop server, analyze**

In the server terminal: Ctrl-C.

In the walker terminal:

```bash
npx tsx scripts/perf-compare.ts perf-cache.log cold warm
```

Expected: a delta table per vendor, with most vendors showing `delta` ≤ -60% and `hit_rate` ≥ 80%.

- [ ] **Step 6: Validate cross-client smoke**

Manually load reports for both `avenue-z` and `renaissance` (or whatever clients exist) in the browser and visually confirm the data is correct for each client (no cross-client poisoning). If anything looks off — STOP. Set `CACHE_DISABLE=1` in env, redeploy, investigate the wrap-key for the offending fetcher.

- [ ] **Step 7: Update the findings doc**

Append a `## Caching results (2026-05-28 — vendor-caching branch)` section to `docs/superpowers/specs/2026-05-28-report-loading-findings.md`. Include:
- The raw `perf-compare` output (in a fenced code block)
- Cold vs. warm totals per vendor
- Hit-rate per vendor
- Cross-client smoke result (PASS/FAIL)
- Any vendor with hit_rate < 80% (with hypothesis why — e.g., n=1 sample, or cache-key bug)
- Any vendor with delta worse than -60% (with hypothesis)

Use this template:

```markdown
## Caching results (2026-05-28 — vendor-caching branch)

After the vendor-layer caching design from [2026-05-28-vendor-caching-design.md](2026-05-28-vendor-caching-design.md) was implemented.

### Methodology
- Same local prod build, same walker, two passes (cold + warm) back-to-back.
- Boundary markers via `/api/_perf/boundary?label=cold|warm`.
- Cross-client smoke validated before recording results.

### Results
```
[paste perf-compare output here]
```

### Observations
- [Highlight top wins — vendor X dropped from Ys to Zms]
- [Flag any vendor with hit_rate < 80% with hypothesis]
- [Cross-client smoke: PASS/FAIL]

### Outstanding items
- [Any items the verification surfaced that need follow-up brainstorms]
```

- [ ] **Step 8: gitignore the new log, commit findings**

```bash
# perf-cache.log is large and contains client slugs — don't commit
grep -q "^perf-cache.log" .gitignore || echo "perf-cache.log" >> .gitignore

git add .gitignore docs/superpowers/specs/2026-05-28-report-loading-findings.md
git commit -m "docs: capture caching-layer verification results"
```

---

## Done

After Task 11:
- `lib/cache.ts` is in place with ALS-based hit/miss detection and CACHE_DISABLE kill switch.
- `byClient` typed extractor lives in `lib/perf.ts`.
- 28 vendor fetchers are wrapped with `cached()`.
- `getPeecOverview` retains its `v2` cache-bust version.
- `getFormSubmissionCounts` has been migrated from React-only to cross-render caching.
- `/api/_perf/boundary` route enables deterministic cold/warm log splitting.
- `scripts/perf-walk.ts --pass <label>` and `scripts/perf-compare.ts` complete the verification toolchain.
- `docs/superpowers/specs/2026-05-28-report-loading-findings.md` is updated with the verified caching results.

The branch is ready for code review and PR against `dev` (per the user's earlier request).
