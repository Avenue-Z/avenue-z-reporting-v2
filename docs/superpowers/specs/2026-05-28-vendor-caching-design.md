# Vendor-Layer Caching — Design

**Date:** 2026-05-28 (revised after design review)
**Status:** Design approved with revisions, ready for implementation plan
**Author:** Brainstorm between Paul and Claude

---

## Goal

Cut report-page load time by caching repeat vendor API calls at the fetcher layer with a ~1-hour TTL, applied broadly across every heavy vendor function in the platform.

## Context

The profiling pass on the prior branch (see [2026-05-28-report-loading-profiling-design.md](2026-05-28-report-loading-profiling-design.md) and [2026-05-28-report-loading-findings.md](2026-05-28-report-loading-findings.md)) showed:

- GA4: 16.82s aggregate spend across 33 calls, median 364ms, p95 1.49s
- HubSpot: 5.65s aggregate, with `getContactStats` peaking at 3.13s
- Multiple sections re-fetch the same data inside the same TTL window — clients hopping between report tabs pay the full vendor latency every time

The same caching pattern already in [lib/peec/client.ts:327](../../../lib/peec/client.ts#L327) (`unstable_cache` with 1-hour `revalidate` and a `peec-overview-v2` version-bumpable key) generalizes cleanly to every heavy fetcher. This design applies it broadly while preserving the safety mechanisms the existing implementation relies on.

## Non-goals

- Fixing individual slow queries (`getContactStats` 3.13s, `getClientByEmail` 720ms). Caching makes the *second* call free; the first still pays. Underlying query optimization is its own brainstorm.
- BigQuery consolidation (TODO.md "Larger initiatives").
- Cache invalidation UI / explicit `revalidateTag()` triggers from outside the TTL cycle.
- Caching `generateConversationalSummary`. The argument is a deeply-nested numeric object; keying on it is structurally broken (huge keys, floating-point instability, near-zero hit rate). Caching the underlying `fetchFunSpotData` doesn't help here — the Gemini call still fires on every render regardless of whether its input was a cache hit. To cache the summary itself would require a function-signature change (pass `dateRange` as a separate keyable arg) — its own brainstorm.
- A unit test suite for `lib/cache.ts` beyond what `lib/perf.ts` already covers.

## Approach

A new `lib/cache.ts` helper that wraps each fetcher with `unstable_cache` (when enabled) and emits its own PERF logs with explicit `cached: true|false` via AsyncLocalStorage. Apply it at ~30 vendor-fetcher sites with the same mechanical pattern the profiling tool used, plus the safety mechanisms surfaced during design review (version cache-bust, daily UTC key invalidation, CACHE_DISABLE kill switch).

### Considered and rejected

- **Per-vendor caching only (GA4 first).** Same infrastructure cost, narrower benefit.
- **Stale-while-revalidate.** Better UX, but requires per-tag invalidation plumbing we don't need yet.
- **Outer `timed()` composition for PERF emission.** Initially considered; doesn't work for cached:true|false signaling because the outer wrapper can't see whether the inner impl was invoked without a race-free per-call signal. `cached()` does its own PERF emission directly via AsyncLocalStorage — see helper design below. The standalone `timed()` HOF stays available for non-cached call sites.
- **Per-call jitter on TTL.** `Math.random()` evaluated at `cached()` wrap time is constant per fetcher (set at module load), not per cache entry. It would shift the herd, not disperse it. `unstable_cache` doesn't accept dynamic `revalidate` per entry. Dropped from the design; herd risk documented under Risks accepted.

## Design

### `lib/cache.ts` — the helper

```ts
import { AsyncLocalStorage } from 'node:async_hooks'
import { unstable_cache } from 'next/cache'
import { timed, type PerfExtractor } from '@/lib/perf'

const CACHE_DISABLED = process.env.CACHE_DISABLE === '1'
const PERF_LOG_ENABLED = process.env.PERF_LOG === '1'

// Per-call store. Each invocation of a cached() wrapper runs inside its own
// store, so concurrent calls don't trample each other's wasInvoked flag.
const cacheStore = new AsyncLocalStorage<{ wasInvoked: { current: boolean } }>()

export interface CachedOptions<TArgs extends unknown[]> {
  /** Cache-busting version string. Bump when response shape or fetch logic changes. */
  version?: string
  /** TTL in seconds. Default 3600 (1 hour). */
  ttlSeconds?: number
  /** Optional Next.js cache tags for explicit invalidation via revalidateTag(). */
  tags?: string[]
  /** Tag extractor for PERF log lines. */
  extractTags?: PerfExtractor<TArgs>
}

export function cached<TArgs extends unknown[], TRet>(
  vendor: string,
  fn: string,
  impl: (...args: TArgs) => Promise<TRet>,
  options: CachedOptions<TArgs> = {},
): (...args: TArgs) => Promise<TRet>
```

**Mechanism (when enabled):**

`cached()` does its own PERF emission directly — it does **not** compose with the outer `timed()` helper. Reason: detecting cache hits vs. misses requires a per-call signal that `timed()`'s outside-the-cache vantage can't observe race-free. AsyncLocalStorage provides that signal.

The construction (sketch — exact code in the implementation plan):

```ts
// implWithMarker runs INSIDE unstable_cache. When called, it means cache missed.
// It sets the per-call flag and strips the prepended `today` arg before
// calling the real impl (impl's signature is unchanged).
const implWithMarker = async (...allArgs: unknown[]): Promise<TRet> => {
  const store = cacheStore.getStore()
  if (store) store.wasInvoked.current = true
  const [_today, ...realArgs] = allArgs
  return impl(...(realArgs as TArgs))
}

const cachedFn = unstable_cache(
  implWithMarker,
  [vendor, fn, version ?? 'v1'],          // static keyParts
  { revalidate: ttlSeconds ?? 3600, tags },
)

return async (...args: TArgs): Promise<TRet> => {
  const wasInvoked = { current: false }
  const today = new Date().toISOString().slice(0, 10)
  return cacheStore.run({ wasInvoked }, async () => {
    const start = performance.now()
    try {
      const result = await cachedFn(today, ...args)  // prepend today as first arg
      const ms = Math.round(performance.now() - start)
      if (PERF_LOG_ENABLED) emit({ vendor, fn, ms, ok: true, cached: !wasInvoked.current, ...tags })
      return result
    } catch (err) {
      const ms = Math.round(performance.now() - start)
      if (PERF_LOG_ENABLED) emit({ vendor, fn, ms, ok: false, cached: false, ...tags, err: err.message })
      throw err
    }
  })
}
```

Three things the mechanism gets right:
1. **Cache-hit detection** — `wasInvoked.current` is only set if `implWithMarker` runs, which only happens on a cache miss. ALS gives each concurrent call its own store; no races.
2. **Daily UTC invalidation** — `today` is injected as the first arg, so `unstable_cache` serializes it into the entry key. At 00:00 UTC the date string changes and the next call for any wrapped fetcher gets a miss. `implWithMarker` strips it before calling the real impl, so the impl's signature is unchanged.
3. **PERF emission** — done directly by `cached()`, including `cached: true|false`. No composition with `timed()` (that path was abandoned because it can't see the inner-impl invocation).

**Kill switch — `CACHE_DISABLE=1`:**
When set at module load, `cached(...)` returns `timed(vendor, fn, impl, extractTags)` — the inner `unstable_cache` is bypassed entirely. Same PERF logging via the existing `timed()` helper. This is the operational escape hatch. If a key-collision bug ships, set `CACHE_DISABLE=1` in Vercel env, redeploy, all traffic skips the cache layer.

**Cache key construction:**
```
unstable_cache keyParts = [vendor, fn, version ?? 'v1']
Plus auto-included args: [today, ...originalArgs]
Effective key = vendor + fn + version + serialize([today, ...originalArgs])
```

- **`version`** — explicit cache-bust string. Bump when response shape or fetch logic changes. (Replaces the implicit `peec-overview-v2` mechanism, applied uniformly.)
- **`today`** = `new Date().toISOString().slice(0, 10)` (UTC). Prepended to args at call time so the cache key varies per UTC day. Required because many fetchers reference `new Date()` internally without it appearing in their signatures.

**Cache-busting policy:**
Any change to a fetcher's response shape OR its fetch logic (auth, endpoint, filters) requires bumping `version`. Documented in `lib/cache.ts` JSDoc. The reviewer of any vendor-client PR is expected to ask "did the response shape change? Did you bump version?"

**TTL:**
- Default 3600s (1 hour). Matches existing `getPeecOverview` and the vendor APIs' typical refresh cadence.
- Per-call override via `options.ttlSeconds`.
- No jitter. See "Risks accepted" for the thundering-herd discussion at TTL and UTC boundaries.

**`extractTags`:** unchanged from the existing `PerfExtractor` contract.

**Behavior when PERF_LOG is off:** the `cached()` wrapper still runs the ALS+unstable_cache machinery (that IS the production cache layer), but skips the `emit()` call. Per-call ALS overhead is a few µs; production observers won't notice it.

### `byClient` convenience extractor

Adding a typed helper to `lib/perf.ts` (re-exported from `lib/cache.ts`):

```ts
export const byClient: PerfExtractor<[string, ...unknown[]]> =
  ([clientSlug]) => ({ client: clientSlug })
```

HubSpot's 18 wraps use it directly — no `as never` cast required. This replaces the cast across all 18 hubspot call sites.

### Audit of request-scoped APIs

`grep -rEn "cookies\(\)|headers\(\)|auth\(\)"` across `lib/ga4`, `lib/hubspot`, `lib/peec`, `lib/profound`, `lib/gsc`, `lib/sitebulb`, `lib/screaming-frog`, `lib/pr-proof`, `lib/content-calendar`, `lib/bigquery` returned **zero hits**. Safe to wrap — none of the fetchers use Next.js dynamic APIs that `unstable_cache` forbids inside its scope.

### What gets wrapped

| File | Fetchers wrapped |
|---|---|
| `lib/ga4/client.ts` | `ga4Query` |
| `lib/hubspot/client.ts` | All 18 data-fetching exports (skip `getHubSpotClient`). Includes `getFormSubmissionCounts` — see migration note below. |
| `lib/peec/client.ts` | `getPeecOverview` (migrate from raw `unstable_cache`, **carry forward `version: 'v2'`**) |
| `lib/peec/agent-analytics.ts` | `getAgentAnalytics` |
| `lib/profound/client.ts` | `getProfoundOverview` |
| `lib/gsc/client.ts` | `getGSCOverview` |
| `lib/sitebulb/client.ts` | `getSitebulbData` |
| `lib/screaming-frog/client.ts` | `getSFData` |
| `lib/pr-proof/client.ts` | `getPRProofData` |
| `lib/content-calendar/client.ts` | `getContentCalendarData` |
| `lib/bigquery/client.ts` | `fetchFunSpotData`, `fetchDailySessions` |
| `lib/bigquery/gemini.ts` | **NOT wrapped** — see Non-goals |

**Not wrapped:**
- `lib/db/queries.ts` — auth path, React.cache() per-render is the right level.
- `lib/hubspot/client.ts: getHubSpotClient` — SDK constructor, already memoized in module-scope Map.
- `lib/bigquery/gemini.ts: generateConversationalSummary` — see Non-goals.

### Wrapping pattern

```ts
// before — the perf-wrap pattern from the prior branch
import { timed } from '@/lib/perf'
async function getFooImpl(slug: string) { ... }
export const getFoo = timed('vendor', 'getFoo', getFooImpl, ([s]) => ({ client: s }))

// after
import { cached, byClient } from '@/lib/cache'
async function getFooImpl(slug: string) { ... }
export const getFoo = cached('vendor', 'getFoo', getFooImpl, {
  extractTags: byClient,
})
```

The `timed` import is removed from each wrapped file (cached() handles PERF emission internally and does not compose with `timed()`). Public export names are unchanged.

### Two notable migrations

**1. `getPeecOverview`** ([lib/peec/client.ts:327](../../../lib/peec/client.ts#L327)) is currently `timed(unstable_cache(...))` with `['peec-overview-v2']` keyParts, `revalidate: 3600`, and `tags: ['peec-overview']`. Becomes:

```ts
export const getPeecOverview = cached('peec', 'getOverview', getPeecOverviewImpl, {
  version: 'v2',  // PRESERVES the existing cache-bust marker
  tags: ['peec-overview'],
  extractTags: ([clientSlug]) => ({ client: clientSlug }),
})
```

No behavior change.

**2. `getFormSubmissionCounts`** ([lib/hubspot/client.ts:1156](../../../lib/hubspot/client.ts#L1156)) is currently `timed(cache(...))` (React per-render). Migrating to `cached()` requires:
- Drop the inner `cache(...)` wrap — the outer `cached()` provides both per-render dedup and cross-render TTL caching.
- This IS a behavioral change: counts now cache for 1 hour across renders, not just within a single render. Form-submission counts don't change minute-to-minute, so a 1-hour cache is appropriate.

**Inner React `cache()` calls — leave alone:** [lib/hubspot/client.ts:109](../../../lib/hubspot/client.ts#L109) (`load2025InboundContacts`), [line 181](../../../lib/hubspot/client.ts#L181) (`load2026InboundContacts`), and [line 949](../../../lib/hubspot/client.ts#L949) (`loadFormContactsForRange`) are NOT exported and NOT wrapped with `cached()`. They're React per-render helpers that coordinate multiple outer fetchers within a single render that all touch the same paginated load. On a cold-cache miss for any outer fetcher, these helpers still save redundant pagination within that render. Untouched by this design.

### Verification

A new `scripts/perf-compare.ts` takes two log files and prints a delta table per vendor:

```
vendor      cold_wait    warm_wait    delta     hit_rate
ga4         16.82s       1.20s        -92%      94%
hubspot     5.65s        0.45s        -92%      96%
peec        0.06s        0.00s        cached    100%
```

`hit_rate` is computed from the **`cached` field on each PERF entry** (emitted directly by `cached()` via the ALS+marker mechanism — see helper design above), not from a fabricated ms threshold. `hit_rate = count(cached === true) / count(any wrapped call)` per vendor. `perf-compare.ts` filters out boundary entries (`vendor === '_walk'`) before computing any aggregate — boundary entries are split markers only and would otherwise pollute the totals.

**Deterministic log splitting via boundary markers:**

A new `app/api/_perf/boundary/route.ts` route handler:

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

`scripts/perf-walk.ts` gets a new `--pass <label>` arg. Before walking, it hits `/api/_perf/boundary?label=<label>` with the session cookie. The marker emits as a PERF line to server stdout, captured by the existing `tee perf.log`. `perf-compare.ts` splits the log on those boundary entries:

```
PERF ... vendor=_walk fn=boundary label=cold     ← cold pass starts here
... (cold-pass PERF lines)
PERF ... vendor=_walk fn=boundary label=warm     ← warm pass starts here
... (warm-pass PERF lines)
```

No `grep -n` guesswork. `perf-compare` takes one log file and the two labels: `perf-compare.ts perf.log cold warm`.

**End-to-end flow:**

```bash
npm run build
PERF_LOG=1 npm run start 2>&1 | tee perf.log

# walks back-to-back, same server, deterministic boundaries
PERF_SESSION_COOKIE='...' npx tsx --env-file=.env.local scripts/perf-walk.ts --pass cold
PERF_SESSION_COOKIE='...' npx tsx --env-file=.env.local scripts/perf-walk.ts --pass warm
# Ctrl-C server

npx tsx scripts/perf-compare.ts perf.log cold warm
```

**Acceptance criteria:**
- Hit rate (from explicit `cached: true|false` field) ≥ 80% for any vendor wrapped with `cached()`.
- p50 total wait per vendor drops by ≥ 60% cold→warm.
- No cross-client data exposure during the smoke step between walks (manually verified by loading a second client's report after the cold pass).

**Risks the verification catches:**
- Cache poisoning across clients — would show up as wrong UI on the manual cross-client smoke step.
- Cache key misses on functions with optional args — surface as 0% hit rate on that fn.
- TTL too short / too long — quantified by hit rate.

**Findings update:** after verification, append a "Caching results" section to [2026-05-28-report-loading-findings.md](2026-05-28-report-loading-findings.md) showing before/after.

## Cleanup

Everything described here stays:
- `lib/cache.ts`, `byClient` extractor in `lib/perf.ts` — permanent helpers.
- `scripts/perf-compare.ts` — reusable.
- `app/api/_perf/boundary/route.ts` — reusable for future perf comparisons.
- `cached()` wraps at each fetcher site — permanent.

Nothing gets removed. `timed()` and its existing wraps remain.

## Risks accepted

1. **First cold-cache load after deploy is no faster than today.** Every TTL revalidate pays the same cold cost. Acceptable because typical sessions have > 1 page view.
2. **Up to ~1 hour of staleness within a UTC day.** Daily-grain marketing data won't shift inside an hour. Bounded.
3. **Thundering herd at TTL boundaries.** No per-entry jitter (see Considered-and-rejected). Cache entries created at near-identical times expire at near-identical times; clients refreshing at the boundary all hit the cold path. Acceptable at current 2-client scale. Revisit if Vercel concurrency surfaces issues — at that point the fix is likely per-client-stable key salting, not jitter.
4. **Daily UTC rollover invalidates all wrapped caches simultaneously.** Cost of the `today` injection in #2 above: at 00:00 UTC (5–8pm US local), every wrapped fetcher's cache is invalidated across all clients in one tick. At current scale, fine. At 50+ clients in US business hours, this matters — revisit if Vercel surfaces concurrent cold-start issues.
5. **`getFormSubmissionCounts` 1-hour TTL during business hours.** Form-submission counts tick upward minute-by-minute during campaigns. A 1-hour cache means clients refreshing during a launch might see stale counts. Acceptable for a reporting tool (not a real-time inbox), but flag for revisit if a customer asks. Per-call TTL override available if needed.
6. **No explicit cache size limits.** Trust Next.js Data Cache defaults on Vercel.
7. **`unstable_` API prefix.** `unstable_cache` is the only stable-enough Next.js API for this need today. Single point of replacement at `lib/cache.ts`.
8. **UTC vs local time in `parseDateRange`.** `lib/ga4/client.ts:79` resolves "today" in local time; our key uses UTC. For US-east Vercel functions, the two diverge for ~5 hours each evening. For daily-grain reporting data, this is invisible (the resolved date range still covers the same calendar day from the user's perspective in most cases). If we ever cache an hourly-grain fetcher, this needs revisiting.
9. **AsyncLocalStorage on Edge runtime.** Next.js App Router defaults to Node.js runtime for server components, where ALS is fully supported. If a route is later forced to Edge runtime and imports a `cached()`-wrapped fetcher, behavior is best-effort (Edge has partial ALS support depending on Next.js version). All current call sites are server components running on Node.
