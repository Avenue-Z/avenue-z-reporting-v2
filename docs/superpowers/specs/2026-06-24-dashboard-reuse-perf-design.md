# Dashboard Reuse / Perf Fixes — Design

**Date:** 2026-06-24
**Status:** Approved (pending spec review)
**Branch:** `feat/dashboard-reuse-perf-rnd` (off `feat/metric-references-rnd`)
**Relates to:** the formula-metrics feature and progressive streaming. These
close the gap between what "reuse already-pulled data" delivers (warm cache on
later renders) and what users expect (no re-pull even on the first render / for
on-screen blocks), and make adding a block feel instant.

## Problem (root-caused)

1. **No in-render dedupe.** The only data-path cache is `unstable_cache`
   (cross-request, time-keyed) in the Supermetrics adapter. Within a single
   render, a new formula's ref-pull and the referenced block's own island fire
   the *same* query concurrently and are not reliably de-duplicated → both hit
   the API. Reuse only kicks in once the cache is warm (a later render).
2. **TripleWhale is uncached.** `resolveTripleWhaleLeaf` has no `unstable_cache`,
   so TW leaf pulls never reuse across renders.
3. **Add is not optimistic.** Saving a block runs `router.refresh()` (a full
   server round-trip); the new block enters the tree only after it returns, so
   it doesn't appear immediately.

## Fixes

### Fix 1 — Request-scoped dedupe (React `cache()`)
Wrap each adapter's per-query fetch in React **`cache()`** (per-request
memoization) keyed by the **primitive** query identity, composed *around* the
existing `unstable_cache`:
- `cache()` → returns the same in-flight promise to concurrent callers in one
  render (the formula reuses the on-screen block's pull).
- `unstable_cache` → persists across renders (1h).

Keys MUST be primitives so identical queries from different code paths collapse:
- **SM** (`lib/dashboard/adapters/supermetrics.ts`): `cache((apiKey, dsId, account, metricField, isoRange, filter) => unstable_cache(…)())`. `sumForRange` computes `filter = buildSmFilter(b.filters) ?? ''` and calls it.
- **TW** (`lib/dashboard/adapters/triplewhale.ts`): `cache((apiKey, shopId, query, isoRange) => unstable_cache(…)())`, where `query = buildMetricSql(b.metric, b.filters)` (encodes metric + filters). `fetchValue` calls it.

**Contract preserved:** `cache()` wraps only the fetch; a thrown `NoDataError`
propagates (the rejected promise is shared in-render, never stored cross-render
by `unstable_cache`) — same behavior as today.

### Fix 2 — Cache TripleWhale
Give the TW adapter the same `unstable_cache` layer as SM (inside the Fix-1
`cache()` wrapper): key `['tw-data', shopId, query, isoRange, keyHash(apiKey)]`,
`{ revalidate: 3600 }`, where `keyHash` is the same `createHash('sha256')…slice(0,16)`
helper SM uses (never the raw key). TW operands now reuse like SM.

(Fixes 1 and 2 are one edit per adapter: SM gains the `cache()` wrapper; TW
gains both `cache()` and `unstable_cache`.)

### Fix 3 — Optimistic add
`DashboardShell` (client) gains **optimistic-block state** so a saved block
appears instantly with skeletons instead of waiting on `router.refresh()`:
- On a successful manual/NL save, the add flow signals the new `{ id, name }`
  up to `DashboardShell`.
- `DashboardShell` keeps `optimistic: { id; name }[]`; it renders those whose id
  is **not yet** in the server `config.blocks` as placeholder cards (the block
  frame + name + the existing `ValueSkeleton`/`DeltaSkeleton`).
- `router.refresh()` still runs. A `useEffect` on `config.blocks` ids drops any
  optimistic entry whose id has arrived from the server — the real streamed
  island then replaces the placeholder (dedupe by id; no flicker/duplication).

Wiring:
- `add-block-dialog.tsx` — `confirmManual` (and `confirm` for the NL path) call
  a new `onAdded({ id, name })` prop on save success (the id is the
  `crypto.randomUUID()` it already generates; the name from the saved config).
- `add-block-button.tsx` — threads an `onAdded` prop to the dialog.
- `dashboard-shell.tsx` — owns `optimistic` state + the clear effect; passes
  `onAdded` to its `AddBlockButton` and the optimistic list to `BlockGrid`.
- `block-grid.tsx` — renders optimistic placeholder cards in the grid **after**
  the real (sortable) blocks and **outside** the `SortableContext` items (they
  aren't reorderable/persisted), so dnd is unaffected.
- `metric-block-states.tsx` — small `OptimisticBlockCard({ name })` (card frame +
  name + `ValueSkeleton` + `DeltaSkeleton`), reusing existing pieces.

The empty-dashboard "add first block" path (`EmptyDashboardState`) also routes
through `router.refresh()`; optimistic handling there is **out of scope** (the
shell isn't mounted yet) — the first block still appears via refresh.

## Out of scope
- Optimistic add from the empty-state (no shell mounted yet).
- Optimistic delete/reorder (already snappy via `useTransition`).
- Any change to resolution semantics, formula behavior, or the comparison model.

## Error / edge handling
- Fix 1/2: a failed query still surfaces the block error state; in-render the
  rejected promise is shared (consistent error), re-tried next render — unchanged.
- Fix 3: if `saveDashboardConfig` fails, no optimistic block is added (the add
  flow only signals on success). If `router.refresh()` is slow, the placeholder
  persists until the id appears; if the save succeeded but the id never arrives
  (shouldn't happen), the placeholder remains until next refresh — acceptable.

## Testing
- **Fix 1/2:** extract the SM and TW cache-key arrays into tiny pure
  key-builder functions and unit-test them (stable, ordered, key-hashed) —
  `tsx` + `node:assert`. Caching behavior itself (in-render dedupe, cross-render
  hit) is verified by `tsc` + build + manual (second load instant; TW reuse).
- **Fix 3:** `tsc` + build + manual smoke (add a block → it appears immediately
  with skeletons → real data streams in → no duplicate when refresh lands).

## File structure
```
lib/dashboard/adapters/
  supermetrics.ts     # MODIFY: cache() wrapper around sumForRange's unstable_cache; + smDataKey() helper
  triplewhale.ts      # MODIFY: cache() + unstable_cache; + twDataKey() helper; keyHash
  cache-keys.test.ts  # NEW: pure tests for smDataKey/twDataKey (or co-located)
components/dashboard/
  dashboard-shell.tsx          # MODIFY: optimistic state + clear effect + wiring
  block-grid.tsx               # MODIFY: render optimistic placeholder cells
  metric-block-states.tsx      # MODIFY: + OptimisticBlockCard
  add-block/add-block-button.tsx  # MODIFY: onAdded prop
  add-block/add-block-dialog.tsx  # MODIFY: call onAdded on save success
```

## Global constraints
- TypeScript strict; no `any` in new/changed code.
- `cache()` from `react` wraps only the fetch and keys on **primitives**; it
  composes with (does not replace) `unstable_cache`.
- Never put the raw API key in a cache key (use `keyHash`).
- No behavior change to resolution/formula/comparison; back-compat preserved.
- Optimistic placeholders are client-only, never persisted, never reorderable.
- No new npm dependency.
```
