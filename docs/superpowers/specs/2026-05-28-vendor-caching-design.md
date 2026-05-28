# Vendor-Layer Caching — Design

**Date:** 2026-05-28
**Status:** Design approved, ready for implementation plan
**Author:** Brainstorm between Paul and Claude

---

## Goal

Cut report-page load time by caching repeat vendor API calls at the fetcher layer with a 1-hour TTL, applied broadly across every heavy vendor function in the platform.

## Context

The profiling pass on the prior branch (see [2026-05-28-report-loading-profiling-design.md](2026-05-28-report-loading-profiling-design.md) and [2026-05-28-report-loading-findings.md](2026-05-28-report-loading-findings.md)) showed:

- GA4: 16.82s aggregate spend across 33 calls, median 364ms, p95 1.49s
- HubSpot: 5.65s aggregate, with `getContactStats` peaking at 3.13s
- Multiple sections re-fetch the same data inside the same TTL window — clients hopping between report tabs pay the full vendor latency every time

The same caching pattern already in [lib/peec/client.ts:327](../../../lib/peec/client.ts#L327) (`unstable_cache` with 1-hour `revalidate`) generalizes cleanly to every heavy fetcher. This design applies it broadly.

## Non-goals

- Fixing individual slow queries (`getContactStats` 3.13s, `getClientByEmail` 720ms). Caching makes the *second* call free; the first still pays the cost. Underlying query optimization is its own brainstorm.
- BigQuery consolidation (TODO.md "Larger initiatives"). Different architecture.
- Cache invalidation UI / explicit `revalidateTag()` triggers from outside the TTL cycle.
- Distributed cache backend beyond what Next.js Data Cache provides on Vercel.
- A unit test for `lib/cache.ts` itself — it's a thin composition of two well-tested primitives.

## Approach

A new `lib/cache.ts` helper that stacks `unstable_cache` and the existing `timed()` HOF. Apply it at ~30 vendor-fetcher sites with the same mechanical pattern the profiling tool used.

### Considered and rejected

- **Per-vendor caching only (GA4 first).** Same infrastructure cost, narrower benefit. Caching is leveraged work — apply it once across all vendors.
- **Stale-while-revalidate.** Better UX (always-instant loads), but requires per-tag invalidation plumbing we don't need yet. TTL-only is simpler and good enough.
- **Separate `cached()` and `timed-and-cached()` helpers.** Two abstractions where one will do. `cached()` always logs via the internal `timed()` wrap because the cache-hit-rate signal is essential for verification.

## Design

### `lib/cache.ts` — the helper

```ts
import { unstable_cache } from 'next/cache'
import { timed, type PerfExtractor } from '@/lib/perf'

export function cached<TArgs extends unknown[], TRet>(
  vendor: string,
  fn: string,
  impl: (...args: TArgs) => Promise<TRet>,
  options?: {
    extractTags?: PerfExtractor<TArgs>
    ttlSeconds?: number  // default 3600
    tags?: string[]      // optional Next.js cache tags for revalidation
  },
): (...args: TArgs) => Promise<TRet>
```

**Composition:** `cached(...)` returns `timed(vendor, fn, unstable_cache(impl, [vendor, fn], { revalidate, tags }), extractTags)`.

**Why this stacking order:**
- Inner `unstable_cache(impl, ...)` does the actual caching.
- Outer `timed(...)` wraps the cached function so PERF log lines reflect what the caller actually experienced: cache hits show as ~0ms, misses as the underlying call time. This is the verification signal.

**Cache key derivation:**
- `keyParts: [vendor, fn]` — static prefix to avoid collisions across vendors.
- Function args are auto-included by `unstable_cache` (it serializes them and folds into the key).
- Result: `getFoo("avenue-z")` and `getFoo("renaissance")` get separate cache entries automatically. Per-client isolation is free.

**Defaults:**
- `ttlSeconds`: 3600 (1 hour). Matches existing `getPeecOverview`.
- `extractTags`, `tags`: undefined.

**Zero overhead when `PERF_LOG` is off:** the outer `timed(...)` returns `impl` unchanged. So `cached()` collapses to `unstable_cache(impl, ...)` in prod — same surface area as today's `getPeecOverview` pattern.

### What gets wrapped

Apply `cached()` to every fetcher with median > ~200ms from the findings, plus the obvious heavy vendor calls not exercised in the profiling run.

| File | Fetchers wrapped |
|---|---|
| `lib/ga4/client.ts` | `ga4Query` |
| `lib/hubspot/client.ts` | All 18 data-fetching exports (skip `getHubSpotClient` — SDK constructor, no I/O). Includes `getFormSubmissionCounts`, which moves from React `cache()` to cross-render `cached()` — flagged separately below. |
| `lib/peec/client.ts` | `getPeecOverview` (migrate from raw `unstable_cache`) |
| `lib/peec/agent-analytics.ts` | `getAgentAnalytics` |
| `lib/profound/client.ts` | `getProfoundOverview` |
| `lib/gsc/client.ts` | `getGSCOverview` |
| `lib/sitebulb/client.ts` | `getSitebulbData` |
| `lib/screaming-frog/client.ts` | `getSFData` |
| `lib/pr-proof/client.ts` | `getPRProofData` |
| `lib/content-calendar/client.ts` | `getContentCalendarData` |
| `lib/bigquery/client.ts` | `fetchFunSpotData`, `fetchDailySessions` |
| `lib/bigquery/gemini.ts` | `generateConversationalSummary` |

**Total: ~30 wraps.**

**Not wrapped:**
- `lib/db/queries.ts` — auth path, React.cache() per-render is the right level. Caching session lookups across requests is security-sensitive and not what's slow.
- `lib/hubspot/client.ts: getHubSpotClient` — returns the SDK instance, already memoized in module-scope Map.
- Any report-section components, chart files, or `auth.ts` / `proxy.ts`.

### Wrapping pattern (applied at each call site)

```ts
// before — the perf-wrap pattern from the prior branch
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

The `timed` import is removed from each file (cached() handles timing internally). Public export names are unchanged.

**Two notable existing cases:**

1. **`getPeecOverview` is currently `timed(unstable_cache(...))`.** Becomes `cached(...)` with the existing `revalidate: 3600` and `tags: ['peec-overview']` carried over via `options.ttlSeconds` and `options.tags`. Behavior unchanged.

2. **`getFormSubmissionCounts` is currently `timed(cache(...))` (React per-render).** Becomes `cached(...)`. **This is a behavioral change** — it now caches across renders for 1 hour, not just within one render. The form submission counts don't change minute-to-minute, so a 1-hour cache is appropriate. Flagged in the PR description.

### Verification

A new `scripts/perf-compare.ts` takes two log files (cold cache, warm cache) and prints a delta table per vendor:

```
vendor      cold_wait    warm_wait    delta     hit_rate
ga4         16.82s       1.20s        -92%      94%
hubspot     5.65s        0.45s        -92%      96%
peec        0.06s        0.00s        cached    100%
```

`hit_rate` is derived from comparing per-call `ms` distributions — cache hits cluster near 0ms; misses look like the cold distribution. Concretely: hit_rate = (count of warm-call entries with ms < 10) / (total warm-call entries) per vendor.

**End-to-end flow:**

```bash
npm run build
PERF_LOG=1 npm run start 2>&1 | tee perf-cache-cold.log

# walk 1 — populates cache
PERF_SESSION_COOKIE='...' npx tsx --env-file=.env.local scripts/perf-walk.ts

# walk 2 — should be near-instant
PERF_SESSION_COOKIE='...' npx tsx --env-file=.env.local scripts/perf-walk.ts
# Ctrl-C the server

# split log at the boundary, compare
npx tsx scripts/perf-compare.ts perf-cold-portion.log perf-warm-portion.log
```

(Log-splitting: we'll either write a small helper or just suggest doing it manually via `grep -n` for the boundary timestamp. Simpler is fine.)

**Acceptance criterion:** the warm walk's Table 3 totals drop by 60–90% for the cached vendors; hit_rate ≥ 80% for any vendor wrapped with `cached()`.

**Risks the verification catches:**
- Cache poisoning across clients (a warm hit on client A returns client B's data) — would show up as wrong UI in the manual smoke step between walks.
- TTL too short / too long — warm-walk hit rate quantifies this.
- Cache key misses on functions with optional args (e.g., `getPeecOverview(clientSlug?)`) — a 0% hit rate on that fn would surface it.

**Findings update:** after the verification run, append a "Caching results" section to [2026-05-28-report-loading-findings.md](2026-05-28-report-loading-findings.md) showing before/after — closes the loop on the prior brainstorm's recommendations.

## Cleanup

Everything described here stays after the branch ships:
- `lib/cache.ts` — permanent helper.
- `scripts/perf-compare.ts` — reusable for future perf-change validation.
- `cached()` wraps at each fetcher site — permanent.

Nothing gets removed. The `timed()` helper and its existing wraps remain unchanged.

## Risks accepted

1. **First cold-cache load after deploy is no faster than today.** Every TTL revalidate pays the same cold cost. Acceptable because the typical session has > 1 page view, and the staleness window is bounded.
2. **Up to 1 hour of staleness on relative date ranges** (`"last_30_days"`). Daily-grain marketing data won't shift inside an hour. Documented.
3. **No explicit cache size limits.** Trust Next.js Data Cache defaults on Vercel. Mitigate if it ever bites.
4. **`unstable_` API prefix.** `unstable_cache` is the only stable-enough Next.js API for this need today. If renamed, a single replacement in `lib/cache.ts` covers all 30 call sites.

## Open questions

- **Cold cache after `revalidate` cycle hits everyone simultaneously.** If 50 clients reload at the same hour boundary, all 50 trigger the same backing API call. Next.js dedupes inflight requests in some configurations but not across serverless invocations. Could be a small thundering-herd issue on Vercel; flag if it shows up in practice.
- **Some HubSpot calls have a 4 req/s rate limit** (per the explicit comment at [components/report-sections/hubspot-performance/index.tsx:85](../../../components/report-sections/hubspot-performance/index.tsx#L85)). Caching reduces the rate of API hits, so this should only help; flagging in case any production rollout surfaces unexpected throttling on the cold-cache path.
