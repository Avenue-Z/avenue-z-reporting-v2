# Progressive In-Block Streaming — Design

**Date:** 2026-06-24
**Status:** Approved (pending spec review)
**Relates to:** the configurable dashboard block rendering and the
period-comparison feature. Today each block has a single Suspense boundary, so
nothing shows until the slowest query (the comparison) resolves.

## Goal

Stream a metric block's content in order of importance so the user sees signal
fast instead of waiting on the slow comparison query:

1. **Metric name** — paints immediately (static config, no await).
2. **Current value** — streams when the current-range query resolves.
3. **Comparison delta** — streams last, when the comparison query resolves.

When the **comparison period** changes, only the delta re-resolves — the name
and current value are not re-fetched. When the **current date range** changes,
both the value and the delta re-resolve (the value genuinely changed).

## Approach (decided with user)

**Approach A — cache-backed server streaming.** The comparison selection stays
a URL param (shareable); changing it triggers a normal App-Router re-render,
but the current value resolves from cache and only the delta re-streams. The
re-render itself is cheap; the cost is the data queries. Rejected: a
client-isolated delta that removes comparison from the URL (more complex, loses
shareable comparison state).

**Shared current-value promise (no re-pull).** The current value is resolved
**once** and the promise is shared by both the value and delta sections, so the
delta computes itself via `computeDelta(current, prev)` and never re-pulls the
current range.

## Data flow

In the page's per-block loop (server component), build the promises once:

```ts
const range = block.range ?? activeDefault            // effective range (override or global)
const ctx = { slug: clientSlug }
const valuePromise = resolveBlock(block, { dateRange: range.dateRange, compareRange: null }, ctx)
const compareIso   = resolveCompareIso(range.dateRange, range.compareRange) // null ⇒ no comparison
const prevPromise  = compareIso
  ? resolveBlock(block, { dateRange: compareIso, compareRange: null }, ctx)  // compareIso is "start,end"; parseDateRange handles it
  : null
```

- `valuePromise` and `prevPromise` each resolve the block at a **single range**
  with `compareRange: null` (so leaves resolve one range, no internal compare).
- `BlockValue` `await`s `valuePromise`.
- `BlockDelta` `await`s **the same** `valuePromise` plus `prevPromise`, then
  `computeDelta(current.value, prev.value)`. Because both sections await the
  same promise object, the current-range query executes **exactly once**.

Caching: leaf results are cached by resolved ISO range. Current range and
compare range have distinct cache keys. On comparison change, `valuePromise`'s
range is unchanged → cache hit (and the shared promise means no second
execution within a render); only `prevPromise`'s range changed → its query is
cold and re-streams.

## Components

### `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx` (MODIFY)
Replace `ResolvedBlockIsland` (which awaited the whole `resolveBlock`) with the
promise-building loop above. For each block, render the client shell with two
Suspense-wrapped server slots:
```tsx
blockNodes[block.id] = (
  <MetricBlockShell block={block} canEdit={canEdit} slug={clientSlug} config={config} activeDefault={activeDefault}
    value={<Suspense fallback={<ValueSkeleton />}><BlockValue valuePromise={valuePromise} /></Suspense>}
    delta={<Suspense fallback={<DeltaSkeleton />}><BlockDelta valuePromise={valuePromise} prevPromise={prevPromise} compareRange={range.compareRange} /></Suspense>}
  />
)
```
The promises stay server-side (consumed by the server `BlockValue`/`BlockDelta`
created here); the client shell only receives the already-wrapped nodes as
props. `DashboardShell` is unchanged (still renders `blockNodes` in grid order).
The page-level per-block `<Suspense>`/`MetricBlockSkeleton` is removed — the
shell paints immediately with the name and inner skeletons.

### `components/dashboard/metric-block.tsx` (MODIFY → `MetricBlockShell`)
Becomes the **client chrome only**: the card frame, the **metric name (always
visible)**, the detached/override badge, the kebab → popover range-override menu
(`setBlockRange`/`resetBlockRange`/`removeBlock`, `useTransition`, error msg) —
all preserved from today. It renders two slots in importance order:
name → `{value}` → `{delta}`. It no longer takes a resolved `result`; it takes
`value: ReactNode` and `delta: ReactNode` props.

### `components/dashboard/block-value.tsx` (NEW, server RSC) — `BlockValue`
Props: `{ valuePromise: Promise<ResolveResult> }`.
`const r = await valuePromise`. If `!r.ok` → render `MetricBlockErrorState`
(the block's primary failure). Else render the big number (`r.formatted`, which
`resolveBlock` already formatted).

### `components/dashboard/block-delta.tsx` (NEW, server RSC) — `BlockDelta`
Props: `{ valuePromise: Promise<ResolveResult>; prevPromise: Promise<ResolveResult> | null; compareRange: string | null }`.
- `prevPromise === null` (no comparison) → render nothing.
- `const [cur, prev] = await Promise.all([valuePromise, prevPromise])`.
- If `!cur.ok || !prev.ok` → render the subtle **"comparison unavailable"** line.
- `const delta = computeDelta(cur.value, prev.value)`. If `delta === undefined`
  (prev is 0/null) → subtle **"comparison unavailable"**. Else render the
  `↑/↓ X% <suffix>` line (existing up/down/flat coloring). `suffix` derived from
  `compareRange`: `previous_year` → "vs prior year"; `custom:` → "vs comparison";
  else "vs prior period".

### `components/dashboard/metric-block-states.tsx` (MODIFY)
Add `ValueSkeleton` (a pulsing bar where the number goes) and `DeltaSkeleton`
(a smaller pulsing bar). Keep `MetricBlockErrorState`. `MetricBlockSkeleton`
(whole-block) is no longer used by the page and may be removed if unreferenced.

## Streaming / interaction summary
- First paint: every block shows its **name** + value/delta skeletons immediately.
- Value streams in per block as current-range queries resolve.
- Delta streams in last as comparison queries resolve.
- **Comparison change** (URL nav): `valuePromise` range unchanged → cache hit,
  no value skeleton, no refetch; only `BlockDelta` shows its skeleton and
  re-resolves.
- **Current-date change** (global or per-block override): both sections get a
  new range → both re-stream.

## Error / loading / empty states
- Current value fails → `BlockValue` shows the error state (primary failure).
- Comparison fails, or delta can't be computed (prev 0/null) → `BlockDelta`
  shows a subtle "comparison unavailable"; a comparison failure never blanks
  the block.
- No comparison configured → `BlockDelta` renders nothing.
- Per-section skeletons while their query is in flight; name never has a skeleton.

## Testing
The value-vs-delta resolution behavior is already covered by `resolve.test.ts`
(no-comparison → `delta` undefined; leaf/aggregate/calculated paths) and
`computeDelta` is unit-tested in `lib/metrics`. This change is a component
restructure plus the page promise-wiring; verified by `tsc --noEmit` +
`npm run build` + manual smoke (name instant; value then delta stream;
comparison change re-streams delta only), consistent with how components are
verified in this repo. No new pure-logic unit is introduced.

## File structure
```
app/dashboard/[clientSlug]/configurable-dashboard/
  page.tsx                       # MODIFY: per-block shared valuePromise/prevPromise + Suspense slots
components/dashboard/
  metric-block.tsx               # MODIFY: MetricBlock -> MetricBlockShell (chrome + value/delta slots)
  block-value.tsx                # NEW: BlockValue server RSC (awaits valuePromise)
  block-delta.tsx                # NEW: BlockDelta server RSC (awaits value+prev, computeDelta, "comparison unavailable")
  metric-block-states.tsx        # MODIFY: + ValueSkeleton, DeltaSkeleton
```

## Global constraints
- TypeScript strict; no `any` in new/changed code.
- All SM/TW calls stay server-side; `BlockValue`/`BlockDelta` are server
  components calling the existing cached resolvers.
- Reuse `resolveBlock`, `resolveCompareIso`, `computeDelta`, `MetricBlockErrorState`,
  and the existing block-override chrome — no behavior change to the kebab menu
  or per-block range override.
- The current-range query must execute once per render (shared `valuePromise`);
  the delta must not re-pull the current range.
- Comparison stays a URL param (shareable); comparison change re-streams only
  the delta.
- No new npm dependency.
```
