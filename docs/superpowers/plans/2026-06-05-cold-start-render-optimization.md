# Cold-Start Render Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut cold (cache-miss) render time of the HubSpot-heavy report sections by enabling the SDK's 429 retry, parallelizing serial fetches, and capping each render's HubSpot burst with a per-render concurrency gate.

**Architecture:** Three changes, in dependency order — (1) a tiny generic `mapWithConcurrency` helper; (2) turn on `@hubspot/api-client`'s built-in search-aware 429 retry; (3) replace the hand-serial awaits in three sections with gated parallel fetches. Correctness (no unrecovered 429) comes from retry; the gate is a best-effort per-render efficiency cap, not an account-wide guarantee. Warm path and cache keys are untouched (the gate/retry live below the `cached()` layer, so a cache hit never reaches them).

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript 5, `@hubspot/api-client` v12, `tsx` for node:assert test scripts.

**Spec:** `docs/superpowers/specs/2026-06-05-cold-start-render-optimization-design.md` (Part 2 dropped — see spec).

---

## File Structure

- `lib/concurrency.ts` (new) — `mapWithConcurrency(thunks, limit)`: allSettled with a concurrency cap, per-element types preserved. Single responsibility, unit-tested.
- `lib/concurrency.test.ts` (new) — node:assert tests run with `npx tsx`.
- `lib/hubspot/client.ts` (modify) — set `numberOfApiCallRetries: 3` on the `Client`; export `HUBSPOT_SEARCH_CONCURRENCY = 4`.
- `components/report-sections/hubspot-performance/index.tsx` (modify) — parallelize `deals` + `ownerMap`.
- `components/report-sections/inbound-funnel/index.tsx` (modify) — parallelize the 6 `OverviewView` calls.
- `components/report-sections/demand-overview/index.tsx` (modify) — parallelize the Phase 2 HubSpot block.

Verification commands used throughout:
- Typecheck: `npx tsc --noEmit`
- Lint: `npm run lint`
- Helper test: `npx tsx lib/concurrency.test.ts`

---

## Task 1: Capture cold baseline (sets the ≥30% targets)

Measure each touched section's cold render wall-time **before** any change, so Goal 5's targets are real numbers. Uses the existing `/api/cache-warm` endpoint, which returns per-URL render `ms` and fires all URLs in parallel (this is also the concurrent-stampede harness reused in Task 7).

> Requires a working local env: `.env.local` with `DATABASE_URL`, `AUTH_SECRET`, and the vendor tokens (HubSpot etc.). If local creds are unavailable, run Tasks 1 and 7 against a Vercel **preview** deploy instead (set `CACHE_DISABLE=1`, `PERF_LOG=1` on the preview env, and call its `/api/cache-warm` with its `CRON_SECRET`).

**Files:** none (measurement only).

- [ ] **Step 1: Build the app**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 2: Start the server with cold cache forced + perf logging, capturing logs**

`APP_URL` is overridden to the local origin so the warm route self-fetches localhost (not the production `APP_URL` from `.env.local`).

```bash
CACHE_DISABLE=1 PERF_LOG=1 CRON_SECRET=localtest APP_URL=http://localhost:3000 \
  npm run start 2>&1 | tee /tmp/cold-baseline.log
```

- [ ] **Step 3: Trigger a cold render of every section and record per-section ms**

In a second terminal:

```bash
curl -s -H "Authorization: Bearer localtest" http://localhost:3000/api/cache-warm \
  | jq '[.results[] | select(.url | test("inbound-funnel|demand-overview|hubspot-performance")) | {url, ms}]'
```

Expected: a JSON array of `{url, ms}`. Record the `ms` for each of the three sections (dashboard surface). These are the **baselines**.

- [ ] **Step 4: Write the baselines + targets into the plan**

Edit this file's table below with the measured numbers (target = `round(0.70 × baseline)`):

| Section | Baseline ms | Target ms (≤70%) |
|---|---|---|
| inbound-funnel | _fill_ | _fill_ |
| demand-overview | _fill_ | _fill_ |
| hubspot-performance | _fill_ | _fill_ |

- [ ] **Step 5: Commit the recorded baselines**

```bash
git add docs/superpowers/plans/2026-06-05-cold-start-render-optimization.md
git commit -m "perf(cold-start): record cold-render baselines for touched sections"
```

---

## Task 2: `mapWithConcurrency` helper (TDD)

**Files:**
- Create: `lib/concurrency.ts`
- Test: `lib/concurrency.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/concurrency.test.ts`:

```ts
/**
 * lib/concurrency.test.ts — unit tests for mapWithConcurrency.
 * Run with: npx tsx lib/concurrency.test.ts
 */
import { strict as assert } from 'node:assert'
import { mapWithConcurrency } from './concurrency'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function run() {
  // 1) never exceeds the concurrency limit
  let inFlight = 0
  let peak = 0
  const make = (ms: number) => async () => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await sleep(ms)
    inFlight--
    return ms
  }
  const res = await mapWithConcurrency(
    [make(20), make(20), make(20), make(20), make(20), make(20)],
    2,
  )
  assert.equal(peak, 2, `peak concurrency should be 2, got ${peak}`)

  // 2) preserves input order and values
  assert.deepEqual(
    res.map((r) => (r.status === 'fulfilled' ? r.value : null)),
    [20, 20, 20, 20, 20, 20],
  )

  // 3) a rejection is captured per-element; siblings still fulfil
  const mixed = await mapWithConcurrency(
    [async () => 1, async () => { throw new Error('boom') }, async () => 3],
    2,
  )
  assert.equal(mixed[0].status, 'fulfilled')
  assert.equal(mixed[1].status, 'rejected')
  assert.equal(mixed[2].status, 'fulfilled')

  // 4) empty input returns empty array
  assert.deepEqual(await mapWithConcurrency([], 4), [])

  console.log('OK lib/concurrency.test.ts passed')
}

run().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx lib/concurrency.test.ts`
Expected: FAIL — `Cannot find module './concurrency'` (file not created yet).

- [ ] **Step 3: Write the minimal implementation**

Create `lib/concurrency.ts`:

```ts
/**
 * Run `thunks` with at most `limit` in flight at once, returning settled
 * results in input order (like Promise.allSettled, but concurrency-capped).
 *
 * The input is a fixed array, so there is no growable queue — memory is bounded
 * by the input length. Per-element result types are preserved (variadic tuple),
 * so callers can destructure with full typing:
 *
 *   const [a, b] = await mapWithConcurrency([() => f1(), () => f2()], 4)
 */
export async function mapWithConcurrency<
  T extends readonly (() => Promise<unknown>)[],
>(
  thunks: readonly [...T],
  limit: number,
): Promise<{
  -readonly [K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>
}> {
  const results = new Array(thunks.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < thunks.length) {
      const i = next++
      try {
        results[i] = { status: 'fulfilled', value: await thunks[i]() }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }

  const poolSize = Math.max(1, Math.min(limit, thunks.length))
  await Promise.all(Array.from({ length: poolSize }, () => worker()))

  return results as {
    -readonly [K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx lib/concurrency.test.ts`
Expected: PASS — `OK lib/concurrency.test.ts passed`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/concurrency.ts lib/concurrency.test.ts
git commit -m "feat(perf): add mapWithConcurrency concurrency-gate helper"
```

---

## Task 3: Enable HubSpot SDK 429 retry + concurrency constant

**Files:**
- Modify: `lib/hubspot/client.ts:20` (Client construction)
- Modify: `lib/hubspot/client.ts` (add exported constant near the top)

- [ ] **Step 1: Turn on the SDK's built-in 429 retry**

In `lib/hubspot/client.ts`, change the client construction (line 20):

```ts
  const client = new Client({ accessToken: token })
```

to:

```ts
  // numberOfApiCallRetries activates the SDK's RetryDecorator, which is
  // search-aware: it backs off on the "secondly limit" 429 (1s × attempt) and
  // the ten-secondly rolling policy (10s × attempt), plus 5xx. This — not the
  // per-render gate — is what makes a 429 self-healing under concurrent load.
  const client = new Client({ accessToken: token, numberOfApiCallRetries: 3 })
```

- [ ] **Step 2: Export the per-render concurrency constant**

Add near the top of `lib/hubspot/client.ts` (after the imports, before the client cache):

```ts
/**
 * Max concurrent HubSpot search calls a single render should fire. Matches the
 * search API's ~4 req/s ceiling. Used as the `limit` for mapWithConcurrency in
 * report sections. Best-effort per-render cap only — cross-render contention is
 * absorbed by the SDK retry (numberOfApiCallRetries above).
 */
export const HUBSPOT_SEARCH_CONCURRENCY = 4
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/hubspot/client.ts
git commit -m "feat(perf): enable HubSpot SDK 429 retry + export search-concurrency constant"
```

---

## Task 4: Parallelize `hubspot-performance`

**Files:**
- Modify: `components/report-sections/hubspot-performance/index.tsx:1` (imports)
- Modify: `components/report-sections/hubspot-performance/index.tsx:84-87` (fetch block)

- [ ] **Step 1: Update imports**

Change line 1:

```ts
import { getPipelineDeals, getOwnerMap } from '@/lib/hubspot/client'
```

to:

```ts
import { getPipelineDeals, getOwnerMap, HUBSPOT_SEARCH_CONCURRENCY, type OwnerMap } from '@/lib/hubspot/client'
import { mapWithConcurrency } from '@/lib/concurrency'
```

- [ ] **Step 2: Replace the serial fetch with a gated parallel fetch**

Replace:

```ts
  // Sequential — HubSpot search API is rate-limited to 4 req/s
  const deals    = await getPipelineDeals(clientSlug)
  const ownerMap = await getOwnerMap(clientSlug)
```

with:

```ts
  // Parallel with a per-render concurrency gate (HubSpot search ~4 req/s).
  // deals is load-bearing → rethrow on failure (preserves error-boundary
  // behavior). ownerMap degrades to {} — call sites already fall back to the
  // raw owner id via `ownerMap[id] ?? id`.
  const [dealsRes, ownerMapRes] = await mapWithConcurrency(
    [() => getPipelineDeals(clientSlug), () => getOwnerMap(clientSlug)],
    HUBSPOT_SEARCH_CONCURRENCY,
  )
  if (dealsRes.status === 'rejected') throw dealsRes.reason
  const deals = dealsRes.value
  const ownerMap: OwnerMap = ownerMapRes.status === 'fulfilled' ? ownerMapRes.value : {}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/hubspot-performance/index.tsx
git commit -m "perf(hubspot-performance): parallelize deals + ownerMap fetch"
```

---

## Task 5: Parallelize `inbound-funnel` OverviewView

**Files:**
- Modify: `components/report-sections/inbound-funnel/index.tsx` (imports + `OverviewView` fetch block, lines ~77-92)

- [ ] **Step 1: Add imports**

Add to the existing import block (alongside the `@/lib/hubspot/client` import that ends at line 11):

```ts
import { HUBSPOT_SEARCH_CONCURRENCY } from '@/lib/hubspot/client'
import { mapWithConcurrency } from '@/lib/concurrency'
```

- [ ] **Step 2: Replace the 6 serial awaits with one gated parallel fetch**

Replace:

```ts
  // Sequential — HubSpot search API is rate-limited to 4 req/s
  const rangeStats   = await getContactStatsForRange(clientSlug, main.startDate, main.endDate)
  const compareStats = compare
    ? await getContactStatsForRange(clientSlug, compare.startDate, compare.endDate)
    : null

  const mainTrend    = await getDailyContactTrend(clientSlug, main.startDate, main.endDate)
  const compareTrend = compare
    ? await getDailyContactTrend(clientSlug, compare.startDate, compare.endDate)
    : null

  const lifecycle  = await getLifecycleStageCounts(clientSlug, main.startDate, main.endDate)
  const breakdown  = await getContactBreakdown(clientSlug)
```

with:

```ts
  // Parallel with a per-render concurrency gate (HubSpot search ~4 req/s).
  // rangeStats feeds every KPI → rethrow on failure (preserves error-boundary
  // behavior). The independent blocks (trend chart, lifecycle funnel, quality
  // mix) degrade to empty on their own failure rather than killing the section.
  const [
    rangeStatsRes, compareStatsRes,
    mainTrendRes, compareTrendRes,
    lifecycleRes, breakdownRes,
  ] = await mapWithConcurrency(
    [
      () => getContactStatsForRange(clientSlug, main.startDate, main.endDate),
      () => (compare ? getContactStatsForRange(clientSlug, compare.startDate, compare.endDate) : Promise.resolve(null)),
      () => getDailyContactTrend(clientSlug, main.startDate, main.endDate),
      () => (compare ? getDailyContactTrend(clientSlug, compare.startDate, compare.endDate) : Promise.resolve(null)),
      () => getLifecycleStageCounts(clientSlug, main.startDate, main.endDate),
      () => getContactBreakdown(clientSlug),
    ],
    HUBSPOT_SEARCH_CONCURRENCY,
  )

  if (rangeStatsRes.status === 'rejected') throw rangeStatsRes.reason
  const rangeStats   = rangeStatsRes.value
  const compareStats = compareStatsRes.status === 'fulfilled' ? compareStatsRes.value : null
  const mainTrend    = mainTrendRes.status    === 'fulfilled' ? mainTrendRes.value    : []
  const compareTrend = compareTrendRes.status === 'fulfilled' ? compareTrendRes.value : null
  const lifecycle    = lifecycleRes.status    === 'fulfilled' ? lifecycleRes.value    : []
  const breakdown    = breakdownRes.status    === 'fulfilled' ? breakdownRes.value    : []
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (If `tsc` reports `breakdown` or `lifecycle` as unused, that means a downstream block already declared them — search the file; they should be consumed by `LifecycleFunnel` / the lead-quality mix. Do not silence with `_`.)

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/inbound-funnel/index.tsx
git commit -m "perf(inbound-funnel): parallelize OverviewView HubSpot fetches"
```

---

## Task 6: Parallelize `demand-overview` Phase 2

**Files:**
- Modify: `components/report-sections/demand-overview/index.tsx:3` (imports)
- Modify: `components/report-sections/demand-overview/index.tsx:113-122` (Phase 2 block)

- [ ] **Step 1: Add imports**

After the existing `@/lib/hubspot/client` import (line 3), add:

```ts
import { HUBSPOT_SEARCH_CONCURRENCY } from '@/lib/hubspot/client'
import { mapWithConcurrency } from '@/lib/concurrency'
```

- [ ] **Step 2: Replace the serial Phase 2 block**

Replace:

```ts
  // ── Phase 2: HubSpot — sequential to respect 4 req/s rate limit ──────────
  // getContactStats and getPipelineDeals both paginate heavily; running them
  // concurrently alongside GA4 reliably triggers rate-limit rejections.
  const [contactRes]      = await Promise.allSettled([getContactStats(clientSlug)])
  const [dealsRes]        = await Promise.allSettled([getPipelineDeals(clientSlug)])
  // These two reuse the React cache() from getContactStats — no extra pagination
  const [contactYearlyRes, breakdownRes] = await Promise.allSettled([
    getYearlyContactStats(clientSlug),
    getContactBreakdown(clientSlug),
  ])
```

with:

```ts
  // ── Phase 2: HubSpot — parallel with a per-render concurrency gate ────────
  // Search ~4 req/s; SDK retry (numberOfApiCallRetries) absorbs any 429s from
  // the heavy internal pagination. Results keep the same PromiseSettledResult
  // shape the derivations below already consume.
  const [contactRes, dealsRes, contactYearlyRes, breakdownRes] = await mapWithConcurrency(
    [
      () => getContactStats(clientSlug),
      () => getPipelineDeals(clientSlug),
      () => getYearlyContactStats(clientSlug),
      () => getContactBreakdown(clientSlug),
    ],
    HUBSPOT_SEARCH_CONCURRENCY,
  )
```

(The downstream derivations at lines ~213-251 already read `contactRes`/`dealsRes`/`contactYearlyRes`/`breakdownRes` via `.status === 'fulfilled' ? .value : fallback` — leave them unchanged.)

> **Dedup caution:** the original ordering exploited `React.cache()` ("these two reuse the React cache() from getContactStats"). Concurrency is expected to be dedup-safe because `React.cache` returns the same in-flight promise to concurrent callers regardless of order — so a shared internal `getContactStats(clientSlug)` call is still deduped. Task 7 Step 3 verifies this held (HubSpot call count must not increase).

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/demand-overview/index.tsx
git commit -m "perf(demand-overview): parallelize Phase 2 HubSpot fetches"
```

---

## Task 7: Verify — after-measurement, 429 safety, full build

**Files:** none (verification only). Mirrors Task 1's setup.

- [ ] **Step 1: Rebuild and start with cold cache + perf logging**

```bash
npm run build
CACHE_DISABLE=1 PERF_LOG=1 CRON_SECRET=localtest APP_URL=http://localhost:3000 \
  npm run start 2>&1 | tee /tmp/cold-after.log
```

- [ ] **Step 2: Trigger the concurrent cold storm + capture per-section ms**

```bash
curl -s -H "Authorization: Bearer localtest" http://localhost:3000/api/cache-warm \
  | jq '[.results[] | select(.url | test("inbound-funnel|demand-overview|hubspot-performance")) | {url, ms}]'
```

Expected: each section's `ms` ≤ its Task 1 target (≤70% of baseline). Record the after-numbers; if any section misses its target, investigate before claiming success (do not assert "faster" without the numbers).

- [ ] **Step 3: Assert zero unrecovered HubSpot 429s**

```bash
grep '"vendor":"hubspot"' /tmp/cold-after.log | grep '"ok":false' || echo "NO unrecovered hubspot failures"
```

Expected: prints `NO unrecovered hubspot failures`. (The SDK retry should absorb every 429; any `ok:false` rate-limit line is a failure of Goal 3.)

Also confirm the `demand-overview` parallelization did not break `React.cache()` dedup (Task 6 caution). Count HubSpot calls for one demand-overview render before and after — it must not increase:

```bash
grep '"vendor":"hubspot"' /tmp/cold-baseline.log | wc -l   # Task 1 run
grep '"vendor":"hubspot"' /tmp/cold-after.log    | wc -l   # this run
```

Expected: the after-count is **not greater** than the baseline count (same shapes warmed). A jump means dedup broke — investigate before claiming success.

- [ ] **Step 4: Full build + lint + helper test (regression gate)**

```bash
npm run build && npm run lint && npx tsx lib/concurrency.test.ts
```

Expected: build succeeds, lint clean, helper test passes.

- [ ] **Step 5: Visual check (no regression)**

Load `/dashboard/<a-client>/reports?section=demand-overview`, `…?section=inbound-funnel`, and `…?section=hubspot-performance` in the browser. Confirm each renders the same content as before (the parallelization is data-order-only; no layout change expected).

- [ ] **Step 6: Record after-numbers + commit**

Add an "after" column to the Task 1 table and commit:

```bash
git add docs/superpowers/plans/2026-06-05-cold-start-render-optimization.md
git commit -m "perf(cold-start): record post-change cold-render numbers + 429 verification"
```

---

## Self-Review Notes

- **Spec coverage:** 1a → Task 3; 1b (allSettled + per-tile fallback) → Tasks 4-6; 1c (per-render gate + constant) → Tasks 2-6; Goal 5 (falsifiable target) → Tasks 1 & 7; Goal 3 (zero unrecovered 429) → Task 7 Step 3. Part 2 dropped — no task, by design.
- **Behavior note:** Tasks 4-5 change failure behavior for *non-load-bearing* calls from "throw the section" to "degrade that block"; the load-bearing call (deals / rangeStats) still throws. Task 6's section already used allSettled, so its behavior is unchanged.
- **Type consistency:** `mapWithConcurrency`, `HUBSPOT_SEARCH_CONCURRENCY`, `OwnerMap` used identically across Tasks 2-6.
