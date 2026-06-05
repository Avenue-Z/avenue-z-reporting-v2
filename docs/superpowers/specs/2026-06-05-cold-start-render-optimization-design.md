# Cold-Start Render Optimization — Design

**Date:** 2026-06-05
**Status:** Approved (revised after code review)

## Problem

The vendor-data cache (`lib/cache.ts`, `unstable_cache`, 1-hour TTL, daily key
bust) works: **warm** report loads are fast, and the hourly cache-warm cron
plus post-deploy GitHub Action keep the default shapes populated in production.

The remaining pain is the **cold** (cache-miss) render — the first hit on a
shape the cache doesn't hold yet (a freshly deployed build, a user-selected
date range or comparison the warm cron never populated, or any load in local
dev where the cron never runs). On a cold render the section's wall-time is
gated by how long its upstream vendor calls take, and several HubSpot-heavy
sections fetch **serially on purpose** because there is no rate-limit handling.

Cold is also the *dangerous* path: post-deploy traffic, the warm cron, and real
users can stampede the same uncached shapes at once. The warm cron itself fires
`Promise.all` over **every** client×report URL
(`app/api/cache-warm/route.ts`), a self-inflicted concurrent cold storm. The
design must make the cold path faster **and** keep it safe under that
concurrency.

## Goals / Success Criteria

1. Reduce cold (cache-miss) render wall-time for the HubSpot-heavy sections.
2. Reduce *perceived* cold-start on the heaviest mixed-vendor section
   (`demand-overview`) by painting fast tiles before slow ones.
3. 429s are **self-healing**, not fatal: under concurrent cold load there are
   **zero unrecovered** HubSpot 429s (no `ok:false` rate-limit errors reach the
   render).
4. No regressions: warm path and cache keys unchanged; typecheck + lint +
   existing tests green.
5. Falsifiable target: per touched section, cold render wall-time after the
   change is **≥ 30% lower** than its measured baseline (exact per-section
   targets pinned from the baseline measurement in step 1 of Verification).

## Non-Goals

- A **distributed** (cross-instance) rate limiter. We accept best-effort
  per-instance emission and rely on retry to absorb account-wide contention
  (see Rate-limit strategy). Revisit only if real 429 pain is observed.
- **Single-flight / request coalescing** of concurrent cold misses — named as a
  known limitation below, not engineered now.
- Expanding the cache-warm matrix (warm-coverage work was deferred; defaults
  are already warm).
- Changing the `cached()` / `unstable_cache` layer or TTLs.

---

## Part 1 — Make HubSpot fetches parallel and 429-safe

Three changes, in dependency order. **There is no custom token-bucket
scheduler** — an earlier draft proposed one; it was the wrong tool (a
per-process bucket cannot bound an account-wide limit across serverless
instances, and a single global FIFO would serialize every section to the
limit, fighting the parallelism it was meant to enable).

### 1a. Enable the SDK's built-in 429 retry (the real defense)

`@hubspot/api-client` v12 ships `RetryDecorator`
(`node_modules/@hubspot/api-client/lib/src/services/decorators/RetryDecorator.js`),
activated by passing `numberOfApiCallRetries` to `new Client(...)`. It is
**search-aware**: on a 429 whose body message is `"You have reached your
secondly limit."` it backs off `1000ms × attempt`; on the `TEN_SECONDLY_ROLLING`
policy it backs off `10s × attempt`; on 5xx it backs off `200ms × attempt`.

Our client is currently `new Client({ accessToken: token })`
(`lib/hubspot/client.ts:20`) — retries default to 0. Change to
`new Client({ accessToken: token, numberOfApiCallRetries: 3 })`.

This makes a 429 a brief, self-healing backoff instead of a failure. Worst-case
added latency for a single throttled call is `1s + 2s + 3s = 6s` across 3
retries; in practice the secondly limit clears after the first 1s backoff.

### 1b. Parallelize the serial sections (graceful partial failure)

Replace the hand-written serial awaits with parallel fetches using
**`Promise.allSettled`** + per-tile empty/error states (the pattern
`demand-overview` already uses), so one bad vendor call degrades a single tile
rather than the whole section:

- `components/report-sections/inbound-funnel/index.tsx` — `OverviewView`:
  6 serial awaits → parallel.
- `components/report-sections/demand-overview/index.tsx` — Phase 2 HubSpot
  block (contacts / deals / yearly / breakdown) → parallel.
- `components/report-sections/hubspot-performance/index.tsx` — `deals` +
  `ownerMap` → parallel.

### 1c. Per-render concurrency gate (efficiency, not correctness)

New helper `lib/concurrency.ts`:

```ts
// Run thunks with at most `limit` in flight at once. Fixed input array,
// no growable queue — bounded by construction. Returns settled results.
export function mapWithConcurrency<T>(
  thunks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]>
```

Each parallelized section above runs its HubSpot fetch thunks through
`mapWithConcurrency(thunks, HUBSPOT_SEARCH_CONCURRENCY)` where
`HUBSPOT_SEARCH_CONCURRENCY = 4` (single constant; tune in one place). This caps
**a single render's own burst** at the secondly search limit, so a render that
fires >4 search calls avoids self-inflicting a 429 + backoff.

This is explicitly **per-render and best-effort** — it makes no account-wide
rate guarantee. Cross-render / cross-instance contention is handled by 1a
(retry), not by this gate. It is bounded by construction (fixed thunk array, at
most `limit` concurrent, no unbounded queue, no per-call timeout needed).

### Rate-limit strategy (summary)

- **Correctness** (no unrecovered 429): SDK retry (1a). Holds across instances.
- **Efficiency** (avoid self-inflicted 429s within one render): per-render gate
  (1c).
- We do **not** guarantee account-wide ≤ 4 req/s; we guarantee 429s are
  absorbed. This is the deliberate trade for not adding distributed infra.

### Known limitation — no single-flight coalescing

`unstable_cache` does not coalesce concurrent misses, so two simultaneous cold
requests for the same shape both fetch and both call HubSpot. With retry (1a)
this is **wasteful, not fatal**. We accept it; if duplicate cold work becomes a
measured cost/429 driver, add request coalescing then.

---

## Part 2 — Progressive Suspense streaming (`demand-overview` only)

`demand-overview` is the one section that spans data sources with very
different cold latencies: **fast GA4 + Peec** vs **slow HubSpot**. Today it is a
single monolithic async component behind the page-level `<Suspense>`, so the
skeleton holds until the *slowest* (HubSpot) data resolves.

### Change

Split the monolith into independent async children, each owning its own
`await` (a boundary can only suspend on data it fetches itself):

- `GA4PeecTiles` (fast) — GA4 + Peec fetch/derive/render, own `<Suspense>`.
- `HubSpotTiles` (slow) — contacts + deals fetch/derive/render, own
  `<Suspense>` with a tile-dimension-matched skeleton.

The parent renders the layout shell synchronously with two Suspense holes. GA4
/ Peec tiles paint as soon as they resolve; HubSpot tiles stream in behind
their skeleton. Final layout is unchanged.

### Boundary granularity — rationale

A Suspense boundary only earns its keep when its data is **independent** and
resolves at a **meaningfully different time** than its siblings; otherwise it
just adds skeleton flicker and layout-shift risk. That is why the split is
per–independent-data-source, **not** per-section (only one section renders at a
time, already behind the page-level Suspense) and **not** per-tile (tiles that
derive from the same fetch can't suspend independently without duplicating the
fetch).

### Documented option — three-way split

GA4 and Peec currently share the "fast" block, gated by `max(GA4, Peec)`. If
`PERF_LOG` shows Peec is materially slower than GA4 on cold, split into three
boundaries (GA4 / Peec / HubSpot) so GA4 doesn't wait on Peec. **Decision:**
start two-way; promote to three-way only if cold timings justify it.

---

## Verification

1. **Baseline.** `PERF_LOG=1 CACHE_DISABLE=1`, load each touched section cold,
   record render wall-time. Pin the per-section ≥30% target (Goal 5) from these
   numbers.
2. **After.** Re-measure cold wall-time for each section; confirm it meets its
   target.
3. **Concurrency / 429 safety.** Hit `/api/cache-warm` (its `Promise.all` over
   all URLs is the concurrent cold storm) with the cache cold; assert **zero**
   HubSpot `ok:false` rate-limit lines in `PERF` output (429s all recovered by
   retry).
4. Typecheck, lint, and existing tests green.
5. Visually confirm `demand-overview` streams (GA4/Peec first, HubSpot skeleton
   → fills) with no layout shift.

## Risks & Mitigations

- **Retry latency tail** — a throttled call can add up to ~6s across 3 retries.
  Mitigation: cap at 3 retries; the per-render gate (1c) keeps most renders
  under the secondly limit so retries are rare.
- **Layout shift from the Suspense split** — match skeleton dimensions to the
  real tiles.
- **Per-render gate over-throttling** — gate wraps only the parallelized
  HubSpot fan-out in the three sections, not unrelated calls; non-search HubSpot
  calls are unaffected by the gate, and SDK retry only fires on actual 429s.

## Touched Files (anticipated)

- `lib/concurrency.ts` (new — `mapWithConcurrency`)
- `lib/hubspot/client.ts` (set `numberOfApiCallRetries: 3`)
- `components/report-sections/inbound-funnel/index.tsx` (parallelize + gate)
- `components/report-sections/demand-overview/index.tsx` (parallelize + gate + split)
- `components/report-sections/hubspot-performance/index.tsx` (parallelize + gate)
