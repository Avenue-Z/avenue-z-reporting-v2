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
- Caching `generateConversationalSummary`. The argument is a deeply-nested numeric object; keying on it is structurally broken (huge keys, floating-point instability, near-zero hit rate). The underlying `fetchFunSpotData(dateRange)` IS cached, so the summary regenerates at most once per hour anyway. If the Gemini cost becomes a concern, that's its own brainstorm — likely requires a function-signature change.
- A unit test suite for `lib/cache.ts` beyond what `lib/perf.ts` already covers.

## Approach

A new `lib/cache.ts` helper that stacks `unstable_cache` and the existing `timed()` HOF. Apply it at ~30 vendor-fetcher sites with the same mechanical pattern the profiling tool used, plus several safety mechanisms from the design review.

### Considered and rejected

- **Per-vendor caching only (GA4 first).** Same infrastructure cost, narrower benefit.
- **Stale-while-revalidate.** Better UX, but requires per-tag invalidation plumbing we don't need yet.
- **Separate `cached()` and `timed-and-cached()` helpers.** Two abstractions where one will do — the cache-hit-rate signal is essential, so the inner `timed()` wrap is always there.

## Design

### `lib/cache.ts` — the helper

```ts
import { unstable_cache } from 'next/cache'
import { timed, type PerfExtractor } from '@/lib/perf'

const CACHE_DISABLED = process.env.CACHE_DISABLE === '1'

export interface CachedOptions<TArgs extends unknown[]> {
  /** Cache-busting version string. Bump when response shape or fetch logic changes. */
  version?: string
  /** TTL in seconds. Default 3600 (1 hour). Actual TTL adds ≤300s of jitter unless jitter:false. */
  ttlSeconds?: number
  /** Disable per-call jitter on revalidate. Default false (jitter is on). */
  jitter?: boolean
  /** Optional Next.js cache tags for explicit invalidation via revalidateTag(). */
  tags?: string[]
  /** Tag extractor for the inner timed() wrap. */
  extractTags?: PerfExtractor<TArgs>
}

export function cached<TArgs extends unknown[], TRet>(
  vendor: string,
  fn: string,
  impl: (...args: TArgs) => Promise<TRet>,
  options: CachedOptions<TArgs> = {},
): (...args: TArgs) => Promise<TRet>
```

**Composition (when enabled):**

1. Inner `unstable_cache(implWithMarker, keyParts, { revalidate, tags })` does the caching.
2. `implWithMarker` is a tiny wrapper around `impl` that sets a per-call `wasInvoked = true` flag visible to the outer `timed()` so PERF lines can emit `cached: false` on a cache miss vs. `cached: true` on a hit.
3. Outer `timed(vendor, fn, ..., extractTags)` wraps everything so PERF lines reflect caller-observed latency and the cached field.

**Kill switch — `CACHE_DISABLE=1`:**
When set at module load, `cached(...)` returns `timed(vendor, fn, impl, extractTags)` — the inner `unstable_cache` is bypassed entirely. This is the operational escape hatch from the prior Peec cross-client data-leak incident. If a key-collision bug ships, set `CACHE_DISABLE=1` in Vercel env, redeploy, all traffic skips the cache layer.

**Cache key construction:**
```
keyParts = [vendor, fn, version ?? 'v1', todayISO()]
```
Plus the function args, which `unstable_cache` auto-includes.

- **`version`** — explicit cache-bust string. Bump when response shape or fetch logic changes. (Replaces the implicit `peec-overview-v2` mechanism, applied uniformly.)
- **`todayISO()`** = `new Date().toISOString().slice(0, 10)` — invalidates the cache at every UTC day boundary. Necessary because many fetchers reference `new Date()` internally (resolving "today" without it appearing in args). With a 1-hour TTL spanning midnight, you'd otherwise get yesterday's "today" for up to an hour into the new day. Applied uniformly rather than per-fetcher to avoid forgetting to add it somewhere.

**Cache-busting policy:**
Any change to a fetcher's response shape OR its fetch logic (auth, endpoint, filters) requires bumping `version`. Documented in `lib/cache.ts` JSDoc. The reviewer of any vendor-client PR is expected to ask "did the response shape change? Did you bump version?"

**TTL and jitter:**
- Default `ttlSeconds`: 3600 (1 hour). Matches existing `getPeecOverview` and the vendor APIs' typical refresh cadence (most marketing APIs are hourly at best).
- Default jitter: `Math.floor(Math.random() * 300)` added to the TTL on each `cached()` call site at module load. Prevents thundering-herd at exact-hour boundaries when many cached entries expire simultaneously.
- Per-call override available via `options.ttlSeconds` and `options.jitter`.

**`extractTags`:** unchanged from the existing `PerfExtractor` contract.

**Zero overhead when PERF_LOG is off:** the outer `timed(...)` returns its inner argument unchanged when `PERF_LOG !== '1'`. Inner `unstable_cache` *is* the production behavior — it always runs. (Previous spec wording incorrectly implied the wrapper was free in prod; it's not. `unstable_cache` IS the prod cache layer.)

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

The `timed` import is removed from each file (cached() handles timing internally). Public export names are unchanged.

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

`hit_rate` is computed from the **`cached` field on each PERF entry** (emitted explicitly by `cached()` — see helper design above), not from a fabricated ms threshold. `hit_rate = count(cached === true) / count(any wrapped call)` per vendor.

**Deterministic log splitting via boundary markers:**

A new `app/api/_perf/boundary/route.ts` route handler:

```ts
import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
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
3. **No explicit cache size limits.** Trust Next.js Data Cache defaults on Vercel.
4. **`unstable_` API prefix.** `unstable_cache` is the only stable-enough Next.js API for this need today. Single point of replacement at `lib/cache.ts`.
5. **`/api/_perf/boundary` is unauthenticated.** It's a no-op route that emits a log line; no data exposure. Documented as dev/profiling-only — could be gated by a `PERF_LOG=1` check in the route to fail closed in prod, which we'll do.

## Open questions

- **Thundering herd at TTL boundaries.** Default ±300s jitter mitigates the worst case but doesn't eliminate it. If a 30-client cohort all refresh at minute 60, ~10% might still land within the same 30s window. Accept for now; revisit if Vercel surfaces serverless concurrency issues.
- **`getFormSubmissionCounts` 1-hour TTL.** Form-submission counts during business hours tick upward minute-by-minute. A 1-hour cache means clients refreshing during a campaign launch might see stale counts. Acceptable for a reporting tool (not a real-time inbox), but flag as something to revisit if a customer asks.
