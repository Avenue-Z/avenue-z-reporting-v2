# Dashboard Reuse / Perf Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a metric reuse already-pulled data even on the first render (in-render dedupe + TripleWhale caching) and make adding a block appear instantly (optimistic add).

**Architecture:** Wrap each data adapter's fetch in React `cache()` (per-request dedupe) composed around `unstable_cache` (cross-request persistence), and add `unstable_cache` to the TripleWhale adapter. Separately, give `DashboardShell` optimistic-block state so a saved block renders with skeletons immediately, dropped once the refreshed server config includes it.

**Tech Stack:** Next.js 15 App Router (RSC, `react` `cache`, `unstable_cache`), React client components, TypeScript (strict), `tsx` + `node:assert` tests.

## Global Constraints

- TypeScript strict; no `any` in new/changed code.
- `cache()` from `react` wraps only the fetch and keys on **primitives**; it composes with (does not replace) `unstable_cache`.
- Never put the raw API key in a cache key — use the `keyHash` (`createHash('sha256').update(key).digest('hex').slice(0,16)`).
- No behavior change to resolution / formula / comparison semantics; back-compat preserved.
- Optimistic placeholders are client-only, never persisted, never reorderable.
- A thrown `NoDataError` must still propagate (not be stored as a value) — same contract as today's `unstable_cache`.
- No new npm dependency.

## Parallelization / interconnected components

**The two tasks touch DISJOINT file sets and can be implemented fully in parallel** (no shared files, no ordering dependency):

- **Task 1 (backend caching)** → only `lib/dashboard/adapters/supermetrics.ts`, `lib/dashboard/adapters/triplewhale.ts`, `lib/dashboard/adapters/cache-keys.test.ts`.
- **Task 2 (optimistic add)** → only `components/dashboard/metric-block-states.tsx`, `components/dashboard/block-grid.tsx`, `components/dashboard/dashboard-shell.tsx`, `components/dashboard/add-block/add-block-button.tsx`, `components/dashboard/add-block/add-block-dialog.tsx`.

Interconnections to be aware of (none cause a file conflict):
- Task 2 **reuses** `ValueSkeleton`/`DeltaSkeleton` (already exported from `metric-block-states.tsx`) inside the new `OptimisticBlockCard` — it edits that file, Task 1 does not.
- Both tasks are **additive** and each compiles green on its own (`tsc`/build).
- The shared idea (cache layering) is duplicated per-adapter by design — SM and TW each own their `cache()`+`unstable_cache` wrapper and their own key-builder; there is no shared module to coordinate.

A controller may dispatch Task 1 and Task 2 implementers concurrently, review each independently, then run one combined `tsc`/build at the end.

---

### Task 1: In-render dedupe + TripleWhale caching (Fix 1 + Fix 2)

Wrap each adapter's per-query fetch in `react` `cache()` (request dedupe) around `unstable_cache` (cross-request); add the `unstable_cache` layer to TripleWhale. Extract pure key-builders for unit tests.

**Files:**
- Modify: `lib/dashboard/adapters/supermetrics.ts`
- Modify: `lib/dashboard/adapters/triplewhale.ts`
- Test: `lib/dashboard/adapters/cache-keys.test.ts` (new)

**Interfaces:**
- Produces: `smDataKey(apiKey, dsId, account, metricField, isoRange, filter): string[]` (from `supermetrics.ts`); `twDataKey(apiKey, shopId, query, isoRange): string[]` (from `triplewhale.ts`). Both exported for testing.
- Consumes: existing `smQuery`/`parseSmRows`/`sumMetric`/`buildSmFilter`/`keyHash` (SM); `twSql`/`twValue`/`buildMetricSql` (TW).

- [ ] **Step 1: Write the failing cache-key test**

Create `lib/dashboard/adapters/cache-keys.test.ts`:
```ts
// Run: npx tsx lib/dashboard/adapters/cache-keys.test.ts
import { strict as assert } from 'node:assert'
import { smDataKey } from './supermetrics'
import { twDataKey } from './triplewhale'

// SM key: stable, ordered, raw apiKey never present
{
  const k = smDataKey('SECRET_KEY', 'AW', '123', 'cost', '2026-05-01,2026-05-30', '')
  assert.deepEqual(k.slice(0, 6), ['sm-data', 'AW', '123', 'cost', '2026-05-01,2026-05-30', ''])
  assert.equal(k.length, 7)            // + keyHash
  assert.ok(!k.includes('SECRET_KEY')) // raw key never in the key
  // different filter / range produce different keys
  assert.notDeepEqual(smDataKey('SECRET_KEY', 'AW', '123', 'cost', '2026-05-01,2026-05-30', 'channel == x'), k)
}

// TW key: stable, ordered, raw apiKey never present
{
  const k = twDataKey('SECRET_KEY', 'shop1', 'SELECT 1 AS value', '2026-05-01,2026-05-30')
  assert.deepEqual(k.slice(0, 4), ['tw-data', 'shop1', 'SELECT 1 AS value', '2026-05-01,2026-05-30'])
  assert.equal(k.length, 5)            // + keyHash
  assert.ok(!k.includes('SECRET_KEY'))
}
console.log('ok')
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx lib/dashboard/adapters/cache-keys.test.ts`
Expected: FAIL (`smDataKey`/`twDataKey` not exported).

- [ ] **Step 3: Implement the SM cache layering**

In `lib/dashboard/adapters/supermetrics.ts`: add `import { cache } from 'react'` at the top (beside the existing imports). Add the exported key-builder and a request-cached fetch above `sumForRange`, and replace `sumForRange`'s body to call it:
```ts
import { cache } from 'react'
```
```ts
/** Stable cross-render cache-key parts for one SM metric query (raw key hashed). */
export function smDataKey(
  apiKey: string, dsId: string, account: string, metricField: string, isoRange: string, filter: string,
): string[] {
  return ['sm-data', dsId, account, metricField, isoRange, filter, keyHash(apiKey)]
}

// Request-scoped dedupe (react cache) around cross-request persistence (unstable_cache),
// both keyed by the same primitive query identity. Two callers in one render (e.g. a
// formula's ref-pull and the referenced block's own island) share ONE in-flight fetch.
const cachedSum = cache(
  (apiKey: string, dsId: string, account: string, metricField: string, isoRange: string, filter: string): Promise<number> =>
    unstable_cache(
      async () => {
        const result = await smQuery({
          apiKey, dsId, dsAccounts: account, fields: [metricField], dateRange: isoRange,
          filters: filter || undefined,
        })
        const rows = parseSmRows(result)
        if (rows.length === 0) throw new NoDataError(`no rows for ${metricField} in ${isoRange}`)
        return sumMetric(rows, result.header[0] ?? metricField)
      },
      smDataKey(apiKey, dsId, account, metricField, isoRange, filter),
      { revalidate: 3600 },
    )(),
)
```
Replace the existing `sumForRange` function body with:
```ts
async function sumForRange(
  apiKey: string,
  b: SupermetricsBinding,
  isoRange: string, // "YYYY-MM-DD,YYYY-MM-DD"
): Promise<number> {
  return cachedSum(apiKey, b.dsId, b.account, b.metricField, isoRange, buildSmFilter(b.filters) ?? '')
}
```
(Remove the old inline `unstable_cache` block now living inside `cachedSum`. Keep `keyHash`, `buildSmFilter`, `sumMetric`, etc. as-is.)

- [ ] **Step 4: Implement the TW cache layering**

In `lib/dashboard/adapters/triplewhale.ts`: add imports and the cached fetch, and route `fetchValue` through it.
```ts
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createHash } from 'node:crypto'
```
Add near the top (module scope, after imports):
```ts
const keyHash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

/** Stable cross-render cache-key parts for one TW metric query (raw key hashed). */
export function twDataKey(apiKey: string, shopId: string, query: string, isoRange: string): string[] {
  return ['tw-data', shopId, query, isoRange, keyHash(apiKey)]
}

// Request-scoped dedupe (react cache) around cross-request persistence (unstable_cache).
const cachedTwValue = cache(
  (apiKey: string, shopId: string, query: string, isoRange: string): Promise<number> =>
    unstable_cache(
      async () => {
        const [startDate, endDate] = isoRange.split(',')
        const rows = await twSql({ apiKey, shopId, query, startDate, endDate })
        const v = twValue(rows)
        if (v === null) throw new NoDataError(`no TripleWhale data for ${query} in ${isoRange}`)
        return v
      },
      twDataKey(apiKey, shopId, query, isoRange),
      { revalidate: 3600 },
    )(),
)
```
Then in `resolveTripleWhaleLeaf`, replace the inline `fetchValue` with a call to `cachedTwValue` (query already built from `buildMetricSql`):
```ts
  const query = buildMetricSql(b.metric, b.filters)
  const fetchValue = (isoRange: string): Promise<number> => cachedTwValue(apiKey, shopId, query, isoRange)

  const { startDate, endDate } = parseDateRange(dateRange)
  const value = await fetchValue(`${startDate},${endDate}`)
  const compareIso = resolveCompareIso(dateRange, compareRange)
  const prevValue = compareIso ? await fetchValue(compareIso) : undefined

  return { value, prevValue }
```
(`apiKey`/`shopId` are still resolved earlier in the function from env + `getClientBySlug`; `TwQueryError` import stays.)

- [ ] **Step 5: Run to verify the test passes**

Run: `npx tsx lib/dashboard/adapters/cache-keys.test.ts`
Expected: `ok`. (If the import of `react`'s `cache` fails under `tsx`, STOP and report — both adapters import it at module load; the keys are pure but the module must load.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git commit -m "perf(dashboard): in-render dedupe (react cache) + TripleWhale caching

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- lib/dashboard/adapters/supermetrics.ts lib/dashboard/adapters/triplewhale.ts lib/dashboard/adapters/cache-keys.test.ts
```

---

### Task 2: Optimistic add (Fix 3)

A saved block appears instantly with skeletons; the placeholder is dropped once the refreshed server config includes its id.

**Files:**
- Modify: `components/dashboard/metric-block-states.tsx` (`OptimisticBlockCard`)
- Modify: `components/dashboard/add-block/add-block-dialog.tsx` (`onAdded` signal)
- Modify: `components/dashboard/add-block/add-block-button.tsx` (`onAdded` passthrough)
- Modify: `components/dashboard/dashboard-shell.tsx` (optimistic state + clear effect)
- Modify: `components/dashboard/block-grid.tsx` (render placeholder cells)

**Interfaces:**
- Produces: `OptimisticBlockCard({ name: string })`; `AddBlockButton`/`AddBlockDialog` gain `onAdded?: (b: { id: string; name: string }) => void`; `BlockGrid` gains `optimisticBlocks?: { id: string; name: string }[]`.
- Consumes: existing `ValueSkeleton`/`DeltaSkeleton`.

- [ ] **Step 1: Add `OptimisticBlockCard` to `metric-block-states.tsx`**

Append to `components/dashboard/metric-block-states.tsx`:
```tsx
/** Client-only placeholder for a just-added block (shown until the refreshed
 *  server config includes it). Reuses the section skeletons. */
export function OptimisticBlockCard({ name }: { name: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 min-h-[140px]" aria-busy="true">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <div className="mt-2"><ValueSkeleton /></div>
      <div className="mt-1"><DeltaSkeleton /></div>
    </div>
  )
}
```

- [ ] **Step 2: Signal the new block from `add-block-dialog.tsx`**

In `components/dashboard/add-block/add-block-dialog.tsx`: add `onAdded` to the props and call it on save success in BOTH `confirm` (NL) and `confirmManual`.

Props:
```tsx
export function AddBlockDialog({ slug, config, onClose, onAdded }: { slug: string; config: DashboardConfig | null; onClose: () => void; onAdded?: (b: { id: string; name: string }) => void }) {
```
In `confirmManual`, the success branch becomes (the `block` already has `id` + the name from `cfg`):
```tsx
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) setError(res.error)
      else { onAdded?.({ id: block.id, name: block.name }); onClose(); router.refresh() }
```
In `confirm` (NL path), the success branch becomes (`block` is from `applySelections(proposal.config, sel, id)` and has `id` + `name`):
```tsx
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) setError(res.error)
      else { onAdded?.({ id: block.id, name: block.name }); onClose(); router.refresh() }
```

- [ ] **Step 3: Thread `onAdded` through `add-block-button.tsx`**

Replace `components/dashboard/add-block/add-block-button.tsx` with:
```tsx
'use client'

import { useState } from 'react'
import { AddBlockDialog } from './add-block-dialog'
import type { DashboardConfig } from '@/lib/dashboard/types'

export function AddBlockButton({ slug, config, onAdded }: { slug: string; config: DashboardConfig | null; onAdded?: (b: { id: string; name: string }) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-white/10 bg-bg-surface px-4 py-2 text-sm font-bold text-white transition-colors hover:border-white/25"
      >
        + Add block
      </button>
      {open && <AddBlockDialog slug={slug} config={config} onClose={() => setOpen(false)} onAdded={onAdded} />}
    </>
  )
}
```

- [ ] **Step 4: Optimistic state in `dashboard-shell.tsx`**

In `components/dashboard/dashboard-shell.tsx`: add `useState`/`useEffect`, hold the optimistic list, clear entries once the server config includes them, pass `onAdded` to `AddBlockButton`, and pass the still-pending placeholders to `BlockGrid`.
```tsx
'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { GlobalTimeControl } from './global-time-control'
import { AddBlockButton } from './add-block/add-block-button'
import { BlockGrid } from './block-grid'
import { EmptyDashboardState } from './metric-block-states'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'
```
Inside `DashboardShell`, before the `config.blocks.length === 0` check:
```tsx
  const [optimistic, setOptimistic] = useState<{ id: string; name: string }[]>([])
  const serverIdsKey = config.blocks.map((b) => b.id).join(',')
  useEffect(() => {
    const ids = new Set(config.blocks.map((b) => b.id))
    setOptimistic((prev) => prev.filter((o) => !ids.has(o.id)))
  }, [serverIdsKey])
  const pendingOptimistic = optimistic.filter((o) => !config.blocks.some((b) => b.id === o.id))
```
Change the header `AddBlockButton` to pass `onAdded`:
```tsx
        {canEdit ? <AddBlockButton slug={slug} config={config} onAdded={(b) => setOptimistic((prev) => [...prev, b])} /> : <span />}
```
Change the `BlockGrid` usage to pass `optimisticBlocks`:
```tsx
      <BlockGrid
        blocks={config.blocks}
        canEdit={canEdit}
        slug={slug}
        config={config}
        optimisticBlocks={pendingOptimistic}
        renderBlock={(b: PersistedBlock) => blockNodes[b.id]}
      />
```
(The `config.blocks.length === 0` → `EmptyDashboardState` early return is unchanged; optimistic add from the empty state is out of scope.)

- [ ] **Step 5: Render placeholders in `block-grid.tsx`**

In `components/dashboard/block-grid.tsx`: import `OptimisticBlockCard`, add `optimisticBlocks` to props, and render the placeholders inside the grid after the real blocks (both the editor dnd grid and the non-editor grid).

Add to imports:
```tsx
import { OptimisticBlockCard } from './metric-block-states'
```
Extend `BlockGridProps`:
```tsx
  optimisticBlocks?: { id: string; name: string }[]
```
Destructure it: `export function BlockGrid({ blocks, canEdit, slug, config, renderBlock, optimisticBlocks }: BlockGridProps) {` and compute `const optimistics = optimisticBlocks ?? []`.

Non-editor grid — append after the mapped blocks:
```tsx
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {blocks.map((b) => (
          <div key={b.id}>{renderBlock(b)}</div>
        ))}
        {optimistics.map((o) => (
          <div key={o.id}><OptimisticBlockCard name={o.name} /></div>
        ))}
      </div>
```
Editor grid — append after the `SortableBlock`s, **inside the grid div but outside the sortable items** (placeholders aren't draggable/persisted):
```tsx
          <div className={`grid grid-cols-2 gap-5 lg:grid-cols-4 ${pending ? 'opacity-70' : ''}`}>
            {blocks.map((b) => (
              <SortableBlock key={b.id} id={b.id}>
                {renderBlock(b)}
              </SortableBlock>
            ))}
            {optimistics.map((o) => (
              <div key={o.id}><OptimisticBlockCard name={o.name} /></div>
            ))}
          </div>
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit` → clean.
Run: `npm run build` → succeeds.

- [ ] **Step 7: Manual smoke (note for executor)**

On `/dashboard/<slug>/configurable-dashboard` (with ≥1 existing block): **+ Add block** → save → the new block appears **immediately** as a skeleton card; when `router.refresh()` lands, the real streamed block replaces it with no duplicate. (Manual; not automated.)

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(dashboard): optimistic block add (instant skeleton, dropped on refresh)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- components/dashboard/metric-block-states.tsx components/dashboard/add-block/add-block-dialog.tsx components/dashboard/add-block/add-block-button.tsx components/dashboard/dashboard-shell.tsx components/dashboard/block-grid.tsx
```

---

## Self-Review

- **Spec coverage:** Fix 1 (react `cache()` dedupe both adapters) + Fix 2 (TW `unstable_cache`) → Task 1; Fix 3 (optimistic add) → Task 2. Pure key-builder tests (Task 1 Step 1). ✅
- **Placeholder scan:** none — full code in every step.
- **Type consistency:** `smDataKey`/`twDataKey` signatures match the test; `onAdded: (b:{id,name})=>void` identical across dialog/button/shell; `optimisticBlocks: {id,name}[]` identical shell↔grid; `OptimisticBlockCard({name})` matches its callers.
- **Disjoint-file check:** Task 1 = `lib/dashboard/adapters/*`; Task 2 = `components/dashboard/*`. No overlap → parallel-safe.
- **Contract preserved:** `cache()` wraps only the fetch; `NoDataError` still thrown (unstable_cache stores resolved values only); raw key never in cache keys (`keyHash`).
- **Compile-green:** Task 1 additive (key-builders + cache wrappers); Task 2 additive (new prop + placeholder). Each compiles independently.

## Execution Handoff

Plan saved. Recommended: **Subagent-Driven Development** — and because Task 1 and Task 2 touch disjoint files, their implementers may be dispatched **concurrently** (review each independently; one final `tsc`/build over both).
