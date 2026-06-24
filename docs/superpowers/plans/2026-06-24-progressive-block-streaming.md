# Progressive In-Block Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream each metric block in importance order — name (instant) → current value → comparison delta — so the value appears without waiting on the slow comparison query, and a comparison change re-streams only the delta.

**Architecture:** Per block, the page resolves the current value **once** as a shared promise and passes it to two independent Suspense-wrapped server components: `BlockValue` (awaits the shared promise) and `BlockDelta` (awaits the same promise + a separate comparison-range promise, then `computeDelta`). The client `MetricBlockShell` renders the name + chrome immediately and hosts the two server slots.

**Tech Stack:** Next.js 15 App Router (RSC + Suspense streaming), React, TypeScript (strict).

## Global Constraints

- TypeScript strict; no `any` in new/changed code.
- All SM/TW calls stay server-side; `BlockValue`/`BlockDelta` are server components calling the existing cached `resolveBlock`.
- The current-range query must execute **once per render** — `BlockValue` and `BlockDelta` await the **same** `valuePromise`; the delta must not re-pull the current range.
- `resolveBlock(config, global, ctx)` uses `config.range ?? global`, so to resolve at a chosen range you must pass a block clone with `range: null` plus that range as `global`.
- Compare range is fed as `resolveCompareIso(...)` output (a `"start,end"` string), which `parseDateRange` accepts.
- Comparison stays a URL param (shareable); a comparison change re-streams only the delta; a current-date-range change re-streams both.
- Delta failure or uncomputable delta (prev 0/null) → subtle **"comparison unavailable"**; no comparison configured → render nothing.
- Reuse `resolveBlock`, `resolveCompareIso`, `computeDelta`, and the existing block-override chrome; no behavior change to the kebab menu / per-block range override.
- No new npm dependency.

---

### Task 1: Streaming section components + section skeletons/inline error

Additive: create the two server section components and the inline skeletons/error used inside a block card. Nothing consumes them yet, so the tree stays compiling. (The old `MetricBlockSkeleton`/`MetricBlockErrorState` remain in place until Task 2 removes them.)

**Files:**
- Create: `components/dashboard/block-value.tsx`
- Create: `components/dashboard/block-delta.tsx`
- Modify: `components/dashboard/metric-block-states.tsx` (add `ValueSkeleton`, `DeltaSkeleton`, `BlockValueError`)

**Interfaces:**
- Consumes: `ResolveResult`, `BlockError` from `@/lib/dashboard/types`; `computeDelta` from `@/lib/metrics`; `cn` from `@/lib/utils`; `ERROR_TITLE`/`errorBody` (internal to states file).
- Produces:
  - `BlockValue({ valuePromise: Promise<ResolveResult>; slug: string })` — server component.
  - `BlockDelta({ valuePromise: Promise<ResolveResult>; prevPromise: Promise<ResolveResult> | null; compareRange: string | null })` — server component.
  - `ValueSkeleton()`, `DeltaSkeleton()`, `BlockValueError({ error: BlockError; slug: string })`.

- [ ] **Step 1: Add skeletons + inline error to `metric-block-states.tsx`**

Append these exports to `components/dashboard/metric-block-states.tsx` (after `EmptyDashboardState`). They reuse the existing `ERROR_TITLE`/`errorBody`/`BlockError` already in the file:

```tsx
/** Inline value-area skeleton (sits inside the block card; name is already shown by the shell). */
export function ValueSkeleton() {
  return <div className="h-8 w-32 animate-pulse rounded bg-white/10" aria-busy="true" aria-label="Loading value" />
}

/** Inline comparison-delta skeleton. */
export function DeltaSkeleton() {
  return <div className="h-3 w-20 animate-pulse rounded bg-white/10" aria-busy="true" aria-label="Loading comparison" />
}

/** Inline value error (no card/name — the shell already renders those). */
export function BlockValueError({ error, slug }: { error: BlockError; slug: string }) {
  return (
    <div role="status">
      <p className="text-base font-bold text-white">{ERROR_TITLE[error]}</p>
      <p className="mt-1 text-xs text-text-muted">{errorBody(error, slug)}</p>
    </div>
  )
}
```

- [ ] **Step 2: Create `block-value.tsx`**

Create `components/dashboard/block-value.tsx`:

```tsx
import type { ResolveResult } from '@/lib/dashboard/types'
import { BlockValueError } from './metric-block-states'

/** Streams the block's current value (or an inline error) when its promise resolves.
 *  `resolveBlock` already formatted the number, so we render `r.formatted` directly. */
export async function BlockValue({
  valuePromise,
  slug,
}: {
  valuePromise: Promise<ResolveResult>
  slug: string
}) {
  const r = await valuePromise
  if (!r.ok) return <BlockValueError error={r.error} slug={slug} />
  return <p className="text-3xl font-extrabold text-white">{r.formatted}</p>
}
```

- [ ] **Step 3: Create `block-delta.tsx`**

Create `components/dashboard/block-delta.tsx`:

```tsx
import { cn } from '@/lib/utils'
import { computeDelta } from '@/lib/metrics'
import type { ResolveResult } from '@/lib/dashboard/types'

function deltaSuffix(compareRange: string | null): string {
  if (compareRange === 'previous_year') return 'vs prior year'
  if (compareRange && compareRange.startsWith('custom:')) return 'vs comparison'
  return 'vs prior period'
}

function Unavailable() {
  return <p className="text-xs text-text-muted">comparison unavailable</p>
}

/** Streams the comparison delta. Awaits the SAME current-value promise as
 *  BlockValue (so the current range is never re-pulled) plus the comparison
 *  promise, then computes the delta here. */
export async function BlockDelta({
  valuePromise,
  prevPromise,
  compareRange,
}: {
  valuePromise: Promise<ResolveResult>
  prevPromise: Promise<ResolveResult> | null
  compareRange: string | null
}) {
  if (!prevPromise) return null
  const [cur, prev] = await Promise.all([valuePromise, prevPromise])
  if (!cur.ok || !prev.ok) return <Unavailable />
  const delta = computeDelta(cur.value, prev.value)
  if (delta === undefined) return <Unavailable />
  return (
    <p
      className={cn(
        'text-sm font-bold',
        delta > 0 ? 'text-brand-green' : delta < 0 ? 'text-[#FF4444]' : 'text-text-muted',
      )}
    >
      {delta > 0 ? '↑' : delta < 0 ? '↓' : '—'} {Math.abs(delta).toFixed(1)}% {deltaSuffix(compareRange)}
    </p>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (No consumers yet; this is additive. Per repo convention these RSC/UI components are verified by `tsc` + build, not unit tests — the only pure logic, `computeDelta`, is already unit-tested in `lib/metrics`.)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(dashboard): block value/delta streaming sections + section skeletons

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- components/dashboard/block-value.tsx components/dashboard/block-delta.tsx components/dashboard/metric-block-states.tsx
```

---

### Task 2: Shell restructure + page wiring (remove whole-block resolution)

Turn `MetricBlock` into `MetricBlockShell` (chrome + name + two slots), rewrite the page loop to build the shared promises and Suspense slots, and remove the now-orphaned whole-block skeleton/error/island.

**Files:**
- Modify: `components/dashboard/metric-block.tsx` (`MetricBlock` → `MetricBlockShell`)
- Modify: `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`
- Modify: `components/dashboard/metric-block-states.tsx` (remove orphaned `MetricBlockSkeleton`, `MetricBlockErrorState`)
- Modify (comments only): `components/dashboard/block-grid.tsx`, `components/dashboard/dashboard-shell.tsx`

**Interfaces:**
- Consumes: `BlockValue`, `BlockDelta`, `ValueSkeleton`, `DeltaSkeleton` (Task 1); `resolveBlock` (`@/lib/dashboard/resolve`); `resolveCompareIso` (`@/lib/paid-search/base`).
- Produces: `MetricBlockShell({ block, canEdit, slug, config, activeDefault, value: ReactNode, delta: ReactNode })` (replaces `MetricBlock`'s `result` prop with `value`/`delta` slots).

- [ ] **Step 1: Convert `MetricBlock` → `MetricBlockShell`**

In `components/dashboard/metric-block.tsx`:

Update the props interface (replace `result` with slots; drop the `ResolveResult` import):
```tsx
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'
import type { ReactNode } from 'react'

export interface MetricBlockShellProps {
  block: PersistedBlock
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
  value: ReactNode
  delta: ReactNode
}
```

Replace the `export function MetricBlock(...)` signature and its body down to its `return`. Keep all menu state/handlers (`menuOpen`, `view`, `draftDate`, `draftCompare`, `pending`, `errorMsg`, `runSave`, `applyOverride`, `confirmReset`, `confirmDelete`, `isOverridden`, `overrideLabel`, `badge`). **Remove** `result`, the `deltaSuffix` computation, and the entire `if (!result.ok) { ... }` error branch (errors are now rendered inline by `BlockValue`). The final `return` becomes:

```tsx
export function MetricBlockShell({ block, canEdit, slug, config, activeDefault, value, delta }: MetricBlockShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'range' | 'confirm-delete' | 'confirm-reset'>('menu')
  const [draftDate, setDraftDate] = useState<string>(block.range?.dateRange ?? activeDefault.dateRange)
  const [draftCompare, setDraftCompare] = useState<string | null>(block.range?.compareRange ?? activeDefault.compareRange)
  const [pending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const isOverridden = block.range !== null

  function closeMenu() { setMenuOpen(false); setView('menu'); setErrorMsg(null) }
  function runSave(nextConfig: DashboardConfig) {
    startTransition(async () => {
      const res = await saveDashboardConfig(slug, nextConfig)
      if (!res.ok) { setErrorMsg(res.error); return }
      closeMenu()
    })
  }
  function applyOverride() { runSave(setBlockRange(config, block.id, { dateRange: draftDate, compareRange: draftCompare })) }
  function confirmReset() { runSave(resetBlockRange(config, block.id)) }
  function confirmDelete() { runSave(removeBlock(config, block.id)) }

  const overrideLabel = isOverridden ? getMainLabel(block.range!.dateRange) : null
  const badge = isOverridden ? (
    <DetachBadge label={overrideLabel!} canEdit={canEdit} onReset={() => { setView('confirm-reset'); setMenuOpen(true) }} />
  ) : null

  return (
    <BlockShell
      name={block.name}
      canEdit={canEdit}
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      view={view}
      setView={setView}
      pending={pending}
      errorMsg={errorMsg}
      isOverridden={isOverridden}
      draftDate={draftDate}
      setDraftDate={setDraftDate}
      draftCompare={draftCompare}
      setDraftCompare={setDraftCompare}
      applyOverride={applyOverride}
      confirmDelete={confirmDelete}
      confirmReset={confirmReset}
    >
      <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 min-h-[140px]">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{block.name}</p>
        {badge && <div className="mt-2">{badge}</div>}
        <div className="mt-2">{value}</div>
        <div className="mt-1">{delta}</div>
      </div>
    </BlockShell>
  )
}
```

Leave `BlockShell`, `DetachBadge`, and `ConfirmRow` unchanged. Remove the now-unused `MetricBlockErrorState` import and the `ResolveResult` import.

- [ ] **Step 2: Rewrite the page loop in `page.tsx`**

In `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`:

Update imports:
```tsx
import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getClientBySlug, getDashboardConfig } from '@/lib/db/queries'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { resolveBlock } from '@/lib/dashboard/resolve'
import { resolveCompareIso } from '@/lib/paid-search/base'
import { Header } from '@/components/layout/header'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { MetricBlockShell } from '@/components/dashboard/metric-block'
import { BlockValue } from '@/components/dashboard/block-value'
import { BlockDelta } from '@/components/dashboard/block-delta'
import { ValueSkeleton, DeltaSkeleton, EmptyDashboardState } from '@/components/dashboard/metric-block-states'
import type { DashboardConfig } from '@/lib/dashboard/types'
```
(`PersistedBlock` import is no longer needed; remove it. `MetricBlock`/`MetricBlockSkeleton` imports are gone.)

Replace the block-node loop (the `for (const block of config.blocks) { blockNodes[...] = <Suspense>...<ResolvedBlockIsland/></Suspense> }`) with:
```tsx
  const blockNodes: Record<string, ReactNode> = {}
  for (const block of config.blocks) {
    const eff = block.range ?? activeDefault // effective range (per-block override or global)
    const ctx = { slug: clientSlug }
    // resolveBlock prefers config.range over the passed global, so null the clone's
    // range and pass the effective range as global. compareRange:null ⇒ value only.
    const blockNoRange = { ...block, range: null }
    const valuePromise = resolveBlock(blockNoRange, { dateRange: eff.dateRange, compareRange: null }, ctx)
    const compareIso = resolveCompareIso(eff.dateRange, eff.compareRange)
    const prevPromise = compareIso
      ? resolveBlock(blockNoRange, { dateRange: compareIso, compareRange: null }, ctx)
      : null

    blockNodes[block.id] = (
      <MetricBlockShell
        block={block}
        canEdit={canEdit}
        slug={clientSlug}
        config={config}
        activeDefault={activeDefault}
        value={
          <Suspense fallback={<ValueSkeleton />}>
            <BlockValue valuePromise={valuePromise} slug={clientSlug} />
          </Suspense>
        }
        delta={
          <Suspense fallback={<DeltaSkeleton />}>
            <BlockDelta valuePromise={valuePromise} prevPromise={prevPromise} compareRange={eff.compareRange} />
          </Suspense>
        }
      />
    )
  }
```

Delete the `async function ResolvedBlockIsland(...)` definition entirely (no longer used).

- [ ] **Step 3: Remove the orphaned whole-block states**

In `components/dashboard/metric-block-states.tsx`, delete `MetricBlockSkeleton` (the page no longer uses it) and `MetricBlockErrorState` (replaced by the inline `BlockValueError`). Keep `ERROR_TITLE`, `errorBody`, `BlockValueError`, `ValueSkeleton`, `DeltaSkeleton`, `EmptyDashboardState`, and the `CARD` const if still referenced by `EmptyDashboardState` (it is not — `EmptyDashboardState` has its own classes; remove `CARD` only if unreferenced after deletion).

- [ ] **Step 4: Update stale comments**

In `components/dashboard/block-grid.tsx:29` and `components/dashboard/dashboard-shell.tsx:15`, update the comment text "the resolved `<MetricBlock>`" / "Suspense-wrapped `<MetricBlock>`" to "the `<MetricBlockShell>`". Comments only — no logic change.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (If it reports `MetricBlock`, `MetricBlockSkeleton`, `MetricBlockErrorState`, `ResolvedBlockIsland`, or `PersistedBlock` as missing/unused, fix the corresponding import/reference per Steps 1–3.)

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Manual smoke (note for the executor)**

On `/dashboard/<slug>/configurable-dashboard`: each block's **name paints immediately**; the **value** streams in; the **delta** streams in last. Changing the **comparison** (top-right picker) re-streams only the delta (value stays). Changing the **current date range** re-streams both. A connected-but-no-data block shows the inline error under its name; a block with a comparison that can't resolve shows "comparison unavailable". (Manual check; not automated.)

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(dashboard): progressive in-block streaming (name -> value -> delta)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- components/dashboard/metric-block.tsx "app/dashboard/[clientSlug]/configurable-dashboard/page.tsx" components/dashboard/metric-block-states.tsx components/dashboard/block-grid.tsx components/dashboard/dashboard-shell.tsx
```

---

## Self-Review

- **Spec coverage:** shared `valuePromise` (Task 2 page loop), `BlockValue`/`BlockDelta` (Task 1), streaming order via name-in-shell + two Suspense slots (Task 2 shell), comparison-change re-streams delta only (cache + shared promise; value range unchanged), `computeDelta` on our end / no re-pull (BlockDelta awaits shared promise), delta failure → "comparison unavailable" + no-comparison → nothing (BlockDelta), skeletons + inline error (Task 1). ✅
- **Placeholder scan:** none — all steps carry complete code.
- **Type consistency:** `MetricBlockShell` prop names (`value`/`delta` as `ReactNode`) match the page's usage; `BlockValue`/`BlockDelta` signatures match the page's props; `resolveBlock(blockNoRange, { dateRange, compareRange: null }, ctx)` returns `ResolveResult` which both sections consume; `resolveCompareIso` returns `string | null` matching `prevPromise`'s guard.
- **Footgun documented:** `resolveBlock` prefers `config.range`; the plan nulls the clone's range and passes the effective range as global (Task 2 Step 2) — without this, per-block overrides and the compare-range feed would be wrong.
- **Compile-green seams:** Task 1 is purely additive (new files + new exports) → `tsc` clean with no consumers. Task 2 switches consumers and removes orphans together → `tsc` + build clean.

## Execution Handoff

Plan saved. Recommended: **Subagent-Driven Development** — fresh subagent per task, review between tasks.
