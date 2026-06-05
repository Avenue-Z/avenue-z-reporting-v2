# Cold-Start Render Optimization — Design

**Date:** 2026-06-05
**Status:** Approved (pending spec review)

## Problem

The vendor-data cache (`lib/cache.ts`, `unstable_cache`, 1-hour TTL, daily key
bust) works: **warm** report loads are fast, and the hourly cache-warm cron
plus post-deploy GitHub Action keep the default shapes populated in production.

The remaining pain is the **cold** (cache-miss) render — the first hit on a
shape the cache doesn't hold yet (a freshly deployed build, a user-selected
date range or comparison the warm cron never populated, or any load in local
dev where the cron never runs). On a cold render the section's wall-time is
gated by how long its upstream vendor calls take, and several HubSpot-heavy
sections fetch **serially on purpose** because there is no shared rate limiter.

## Goals / Success Criteria

1. Reduce cold (cache-miss) render wall-time for the HubSpot-heavy sections.
2. Reduce *perceived* cold-start on the heaviest mixed-vendor section
   (`demand-overview`) by painting fast tiles before slow ones.
3. No regressions:
   - Warm path and cache keys unchanged.
   - No HubSpot `429` (rate-limit) errors under parallel load.
   - Typecheck + lint + existing tests green.
4. Measured with `PERF_LOG=1` + `CACHE_DISABLE=1`: cold render wall-time for
   each touched section is materially lower after the change.

## Non-Goals

- Expanding the cache-warm matrix (warm-coverage work was explicitly deferred —
  defaults are already warm; deviations are combinatorial and low-yield).
- Changing the `cached()` / `unstable_cache` layer or TTLs.
- Touching sections that are single-vendor and already parallel
  (e.g. `ga4`) or that gain nothing from a Suspense split.

---

## Part 1 — Shared HubSpot scheduler + parallelize

### New unit: `lib/hubspot/scheduler.ts`

A module-level token-bucket rate limiter with a single responsibility: cap the
global HubSpot request rate so callers can fire in parallel safely.

**Interface:**

```ts
// Queue a HubSpot call; resolves when the call completes, released at
// no more than RATE requests per second (FIFO).
export function schedule<T>(fn: () => Promise<T>): Promise<T>
```

- Default rate: **4 req/s** (HubSpot search API limit). Single source of truth
  via a constant; easy to raise if the plan allows a higher search rate.
- Module-level singleton — one shared bucket per server instance.
- FIFO queue; no priorities, no cancellation (YAGNI).

### Wiring

Route the `hs.crm.*.searchApi.doSearch(...)` calls inside
`lib/hubspot/client.ts` through `schedule(...)` at the lowest level, so **all**
HubSpot search requests are governed globally regardless of how callers invoke
them. Scope to `doSearch` (the 4 req/s endpoint); other HubSpot endpoints have
higher limits and need not be throttled to the search rate.

### Section changes — serial → parallel

Once the limit is enforced globally, replace the hand-written serial awaits
with parallel fetches:

- `components/report-sections/inbound-funnel/index.tsx` — `OverviewView`:
  6 serial awaits (`rangeStats`, `compareStats`, `mainTrend`, `compareTrend`,
  `lifecycle`, `breakdown`) → `Promise.all` / `Promise.allSettled`.
- `components/report-sections/demand-overview/index.tsx` — Phase 2 HubSpot
  block (contacts / deals / yearly / breakdown) → parallel.
- `components/report-sections/hubspot-performance/index.tsx` — `deals` +
  `ownerMap` → `Promise.all`.

### Key safety property

The scheduler lives **below** the `cached()` layer. A cache **hit** never runs
the wrapped impl, so it makes no HubSpot call and never touches the scheduler —
the warm path is completely unaffected. The scheduler only governs the cold
path (actual upstream calls). Net cold effect: ~N serial round-trips →
~⌈N / RATE⌉ batches.

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

1. `PERF_LOG=1 CACHE_DISABLE=1`, load each touched section cold; record render
   wall-time before vs after. Expect HubSpot sections materially faster.
2. Under parallel load, confirm no HubSpot `429` responses (check error logs /
   PERF `ok:false` lines).
3. Confirm warm path unchanged: with the cache populated, cold-path changes are
   inert (cache hit skips impl → no scheduler, no extra fetches).
4. Typecheck, lint, and existing tests green.
5. Visually confirm `demand-overview` streams (GA4/Peec first, HubSpot skeleton
   → fills) with no layout shift.

## Risks & Mitigations

- **Over-throttling non-search HubSpot calls** — only `doSearch` is 4 req/s.
  Mitigation: scope the scheduler to `doSearch` calls only.
- **Scheduler starvation / unbounded queue growth** — keep FIFO and simple;
  cold render fan-out is small (single section per request). No priority logic.
- **Layout shift from the Suspense split** — match skeleton dimensions to the
  real tiles.
- **Double rate-limiting** if a future caller wraps `schedule` again — keep the
  scheduler call at exactly one layer (inside the low-level client helper).

## Touched Files (anticipated)

- `lib/hubspot/scheduler.ts` (new)
- `lib/hubspot/client.ts` (route `doSearch` through `schedule`)
- `components/report-sections/inbound-funnel/index.tsx`
- `components/report-sections/demand-overview/index.tsx` (parallelize + split)
- `components/report-sections/hubspot-performance/index.tsx`
