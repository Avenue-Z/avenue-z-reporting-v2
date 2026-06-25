# Optimistic Dashboard Mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make adding and deleting dashboard blocks feel instant — optimistic add (skeleton placeholder) and delete (immediate removal), with a lighter route-scoped revalidation so the real data lands faster.

**Architecture:** `DashboardShell` holds the rendered block list in `useOptimistic(config.blocks, reducer)` and exposes `optimisticAdd`/`optimisticRemove` through a context so the nested `BlockChrome` (delete) and `AddBlockDialog` (add) can update optimistically. The optimistic layer auto-rebases on the server `config.blocks` prop after each mutation's `router.refresh()`.

**Tech Stack:** TypeScript (strict), Next.js 15 App Router (React 19 `useOptimistic`/`useTransition`), `tsx` + `node:assert` tests.

**Spec:** `docs/superpowers/specs/2026-06-25-optimistic-dashboard-mutations-design.md`
**Branch:** `feat/dashboard-optimistic-mutations` (already created, off `feat/tc-dashboard-self-service-dash-system`).

## Global Constraints

- TypeScript strict; no `any` in new/changed code.
- The `useOptimistic` base MUST be the server `config.blocks` prop (so it rebases cleanly after `router.refresh()`).
- Optimistic placeholder and the persisted block share a caller-generated `crypto.randomUUID()` id (same React key → no remount flicker).
- Editing path (`AddBlockDialog` `editing` mode → `updateBlock`) is NOT made optimistic here (that is feature B) — leave it unchanged.
- Empty-dashboard first-add stays non-optimistic (no provider yet); optimistic flow applies to dashboards with ≥1 block. The dialog falls back to a direct save when no provider is present.
- No new npm dependency.
- Tests run with `npx tsx <file>` and assert via `node:assert` (`console.log('ok')` at the end).

---

## Parallelization Map (for an agent fleet)

```
Wave 1 (parallel)        Wave 2          Wave 3 (parallel)
  T1 reducer ────────┐
  T2 skeleton ───────┼──► (T1)► T4 context ──► T5 shell
  T3 revalidation ───┘                      ├─► T7 chrome
                          (T2)──────────────┼─► T8 dialog
                                            └─► T6 grid (needs T2)
```

- **Wave 1** (T1, T2, T3): fully independent, disjoint files — run concurrently.
- **Wave 2** (T4): the context/provider; consumes T1's reducer.
- **Wave 3** (T5, T6, T7, T8): disjoint files; T5/T7/T8 consume T4's context, T6 consumes T2's skeleton. Run concurrently once their deps are in. A final build + manual smoke gates the integrated flow.

**File ownership (no two concurrent tasks share a file):**
| Task | File(s) |
|---|---|
| T1 | `components/dashboard/optimistic-blocks.ts`, `…/optimistic-blocks.test.ts` |
| T2 | `components/dashboard/blocks/block-skeleton.tsx` |
| T3 | `app/actions/dashboard.ts` |
| T4 | `components/dashboard/dashboard-mutations.tsx` |
| T5 | `components/dashboard/dashboard-shell.tsx` |
| T6 | `components/dashboard/block-grid.tsx` |
| T7 | `components/dashboard/block-chrome.tsx` |
| T8 | `components/dashboard/add-block/add-block-dialog.tsx` |

**Locked interface contracts (agree before parallel start):**
- **T1:** `optimisticBlocksReducer(blocks: PersistedBlock[], action: OptimisticAction): PersistedBlock[]`; `type OptimisticAction = { type: 'add'; block: PersistedBlock } | { type: 'remove'; id: string }`
- **T2:** `export function BlockSkeleton(): JSX.Element` — a pulsing card filling `h-full` (no props; the grid cell sizes it).
- **T4:** `DashboardMutationsProvider({ slug: string; config: DashboardConfig; children: ReactNode })`; `useDashboardMutations(): DashboardMutations` (throws outside a provider); `useOptionalDashboardMutations(): DashboardMutations | null`; where `interface DashboardMutations { optimisticBlocks: PersistedBlock[]; optimisticAdd: (block: PersistedBlock) => void; optimisticRemove: (id: string) => void; error: string | null }`

**Integration note:** T5 renders the provider and passes `optimisticBlocks` to `BlockGrid`; T6 renders `<BlockSkeleton/>` when a block has no server island; T7 calls `optimisticRemove`; T8 calls `optimisticAdd`. If a Wave-3 task is built before T4 lands, stub against the contract above.

---

### Task 1: optimistic reducer

Pure function — the heart of the optimistic state. Independent.

**Files:**
- Create: `components/dashboard/optimistic-blocks.ts`
- Create: `components/dashboard/optimistic-blocks.test.ts`

**Interfaces:**
- Consumes: `PersistedBlock` from `@/lib/dashboard/types`.
- Produces: `optimisticBlocksReducer(blocks, action)`, `type OptimisticAction`.

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/optimistic-blocks.test.ts`:
```ts
// Run: npx tsx components/dashboard/optimistic-blocks.test.ts
import { strict as assert } from 'node:assert'
import { optimisticBlocksReducer } from './optimistic-blocks'
import type { PersistedBlock } from '@/lib/dashboard/types'

const mk = (id: string): PersistedBlock => ({
  id, name: id, format: 'number', range: null, kind: 'kpi',
  binding: { source: 'triplewhale', metric: 'ad_spend' },
})
const a = mk('a'), b = mk('b')

// add appends
assert.deepEqual(optimisticBlocksReducer([a], { type: 'add', block: b }).map((x) => x.id), ['a', 'b'])
// remove filters by id, leaves others
assert.deepEqual(optimisticBlocksReducer([a, b], { type: 'remove', id: 'a' }).map((x) => x.id), ['b'])
// remove of an absent id is a no-op
assert.deepEqual(optimisticBlocksReducer([a, b], { type: 'remove', id: 'zzz' }).map((x) => x.id), ['a', 'b'])
// does not mutate the input array
{
  const input = [a]
  optimisticBlocksReducer(input, { type: 'add', block: b })
  assert.equal(input.length, 1, 'input not mutated')
}
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx components/dashboard/optimistic-blocks.test.ts`
Expected: FAIL — module/function not found.

- [ ] **Step 3: Write minimal implementation**

Create `components/dashboard/optimistic-blocks.ts`:
```ts
import type { PersistedBlock } from '@/lib/dashboard/types'

export type OptimisticAction =
  | { type: 'add'; block: PersistedBlock }
  | { type: 'remove'; id: string }

/** Reducer for the dashboard's optimistic block list. Pure; never mutates input. */
export function optimisticBlocksReducer(
  blocks: PersistedBlock[],
  action: OptimisticAction,
): PersistedBlock[] {
  if (action.type === 'add') return [...blocks, action.block]
  return blocks.filter((b) => b.id !== action.id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx components/dashboard/optimistic-blocks.test.ts`
Expected: `ok`.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add components/dashboard/optimistic-blocks.ts components/dashboard/optimistic-blocks.test.ts
git commit -m "feat(dashboard): optimistic blocks reducer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: block skeleton placeholder

A pulsing card shown in a grid cell for a just-added block before its server island exists. Independent (presentational).

**Files:**
- Create: `components/dashboard/blocks/block-skeleton.tsx`

**Interfaces:**
- Produces: `BlockSkeleton()` — fills `h-full`; the grid cell controls its size.

- [ ] **Step 1: Create the component**

Create `components/dashboard/blocks/block-skeleton.tsx`:
```tsx
/** Placeholder shown in a grid cell for an optimistically-added block until its
 *  server-rendered island arrives. Fills the cell; the grid sizes it. */
export function BlockSkeleton() {
  return (
    <div className="h-full min-h-[60px] animate-pulse rounded-lg border border-white/[0.06] bg-bg-surface" />
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint components/dashboard/blocks/block-skeleton.tsx` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/blocks/block-skeleton.tsx
git commit -m "feat(dashboard): block skeleton placeholder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: lighter, route-scoped revalidation

Replace the whole-app invalidation in `saveDashboardConfig` with a targeted one. Independent.

**Files:**
- Modify: `app/actions/dashboard.ts` (the `revalidatePath('/', 'layout')` line in `saveDashboardConfig`)

- [ ] **Step 1: Make the change**

In `app/actions/dashboard.ts`, inside `saveDashboardConfig`, replace:
```ts
  revalidatePath('/', 'layout')
  return { ok: true }
```
with:
```ts
  revalidatePath(`/dashboard/${slug}/configurable-dashboard`)
  revalidatePath(`/portal/${slug}/configurable-dashboard`)
  return { ok: true }
```
(`router.refresh()` in the mutation actions refetches the current route; block data stays cached via its own `unstable_cache`, so unchanged blocks don't refetch.)

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint app/actions/dashboard.ts` → clean.

- [ ] **Step 3: Commit**

```bash
git add app/actions/dashboard.ts
git commit -m "perf(dashboard): scope saveDashboardConfig revalidation to dashboard routes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: mutations context + provider

The optimistic state holder and action surface. Consumes T1.

**Files:**
- Create: `components/dashboard/dashboard-mutations.tsx`

**Interfaces:**
- Consumes: `optimisticBlocksReducer`, `OptimisticAction` (T1); `saveDashboardConfig` (`@/app/actions/dashboard`); `addBlock`, `removeBlock` (`./config-mutations`).
- Produces: `DashboardMutationsProvider`, `useDashboardMutations`, `useOptionalDashboardMutations`, `interface DashboardMutations`.

- [ ] **Step 1: Create the provider + hooks**

Create `components/dashboard/dashboard-mutations.tsx`:
```tsx
'use client'

import { createContext, useContext, useOptimistic, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { saveDashboardConfig } from '@/app/actions/dashboard'
import { addBlock, removeBlock } from './config-mutations'
import { optimisticBlocksReducer } from './optimistic-blocks'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

export interface DashboardMutations {
  optimisticBlocks: PersistedBlock[]
  optimisticAdd: (block: PersistedBlock) => void
  optimisticRemove: (id: string) => void
  error: string | null
}

const Ctx = createContext<DashboardMutations | null>(null)

export function useDashboardMutations(): DashboardMutations {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDashboardMutations must be used within a DashboardMutationsProvider')
  return v
}

export function useOptionalDashboardMutations(): DashboardMutations | null {
  return useContext(Ctx)
}

export function DashboardMutationsProvider({
  slug, config, children,
}: {
  slug: string
  config: DashboardConfig
  children: ReactNode
}) {
  const router = useRouter()
  // Base is the server prop, so it rebases automatically after router.refresh().
  const [optimisticBlocks, applyOptimistic] = useOptimistic(config.blocks, optimisticBlocksReducer)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const optimisticAdd = (block: PersistedBlock) => {
    setError(null)
    startTransition(async () => {
      applyOptimistic({ type: 'add', block })
      const res = await saveDashboardConfig(slug, addBlock(config, block))
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  const optimisticRemove = (id: string) => {
    setError(null)
    startTransition(async () => {
      applyOptimistic({ type: 'remove', id })
      const res = await saveDashboardConfig(slug, removeBlock(config, id))
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <Ctx.Provider value={{ optimisticBlocks, optimisticAdd, optimisticRemove, error }}>
      {children}
    </Ctx.Provider>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint components/dashboard/dashboard-mutations.tsx` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/dashboard-mutations.tsx
git commit -m "feat(dashboard): optimistic mutations context + provider

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: wire the shell to the provider + optimistic blocks

`DashboardShell` renders the provider and drives `BlockGrid` from `optimisticBlocks`. Consumes T4.

**Files:**
- Modify: `components/dashboard/dashboard-shell.tsx`

**Interfaces:**
- Consumes: `DashboardMutationsProvider`, `useDashboardMutations` (T4).

- [ ] **Step 1: Restructure the shell**

Replace the body of `components/dashboard/dashboard-shell.tsx` (keep the `DashboardShellProps` interface and imports; add the new imports) so it wraps a provider and an inner consumer:
```tsx
'use client'

import type { ReactNode } from 'react'
import { GlobalTimeControl } from './global-time-control'
import { AddBlockButton } from './add-block/add-block-button'
import { BlockGrid } from './block-grid'
import { EmptyDashboardState } from './metric-block-states'
import { DashboardMutationsProvider, useDashboardMutations } from './dashboard-mutations'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

export interface DashboardShellProps {
  config: DashboardConfig
  canEdit: boolean
  activeDefault: { dateRange: string; compareRange: string | null }
  slug: string
  blockNodes: Record<string, ReactNode>
}

export function DashboardShell({ config, canEdit, activeDefault, slug, blockNodes }: DashboardShellProps) {
  if (config.blocks.length === 0) {
    return <EmptyDashboardState canEdit={canEdit} slug={slug} />
  }
  return (
    <DashboardMutationsProvider slug={slug} config={config}>
      <DashboardShellInner config={config} canEdit={canEdit} activeDefault={activeDefault} slug={slug} blockNodes={blockNodes} />
    </DashboardMutationsProvider>
  )
}

function DashboardShellInner({ config, canEdit, activeDefault, slug, blockNodes }: DashboardShellProps) {
  const { optimisticBlocks, error } = useDashboardMutations()
  if (optimisticBlocks.length === 0) {
    return <EmptyDashboardState canEdit={canEdit} slug={slug} />
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        {canEdit ? <AddBlockButton slug={slug} config={config} /> : <span />}
        <GlobalTimeControl activeDefault={activeDefault} />
      </div>
      {error && <p className="text-xs text-[#FF6666]" role="alert">Save failed: {error}</p>}
      <BlockGrid
        blocks={optimisticBlocks}
        canEdit={canEdit}
        slug={slug}
        config={config}
        renderBlock={(b: PersistedBlock) => blockNodes[b.id]}
      />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint components/dashboard/dashboard-shell.tsx` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/dashboard-shell.tsx
git commit -m "feat(dashboard): render shell from optimistic block list via provider

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: skeleton fallback in the grid

Render `<BlockSkeleton/>` for a block whose server island isn't present yet. Consumes T2.

**Files:**
- Modify: `components/dashboard/block-grid.tsx`

**Interfaces:**
- Consumes: `BlockSkeleton` (T2).

- [ ] **Step 1: Add the import + fallback**

In `components/dashboard/block-grid.tsx`, add the import near the others:
```ts
import { BlockSkeleton } from './blocks/block-skeleton'
```
Change the block map body from:
```tsx
        {blocks.map((b) => (
          <div key={b.id}>
            <div className="h-full">{renderBlock(b)}</div>
          </div>
        ))}
```
to:
```tsx
        {blocks.map((b) => (
          <div key={b.id}>
            <div className="h-full">{renderBlock(b) ?? <BlockSkeleton />}</div>
          </div>
        ))}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint components/dashboard/block-grid.tsx` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/block-grid.tsx
git commit -m "feat(dashboard): show block skeleton for not-yet-rendered blocks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: optimistic delete in the kebab

`BlockChrome` "Delete block" removes optimistically via the context. Consumes T4.

**Files:**
- Modify: `components/dashboard/block-chrome.tsx`

**Interfaces:**
- Consumes: `useDashboardMutations` (T4).

- [ ] **Step 1: Use the context for delete**

In `components/dashboard/block-chrome.tsx`:
- Add the import:
```ts
import { useDashboardMutations } from './dashboard-mutations'
```
- Remove `removeBlock` from the `./config-mutations` import (it's now done by the provider). The line becomes:
```ts
import { setBlockRange, resetBlockRange } from './config-mutations'
```
- Inside `BlockChrome`, near the other hooks, add:
```tsx
  const { optimisticRemove } = useDashboardMutations()
```
- Replace `confirmDelete`:
```tsx
  function confirmDelete() { optimisticRemove(block.id); closeMenu() }
```
(`runSave` stays — it's still used by `applyOverride`/`confirmReset`.)

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → clean (confirms `removeBlock` has no other use in this file).
Run: `npx eslint components/dashboard/block-chrome.tsx` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/block-chrome.tsx
git commit -m "feat(dashboard): optimistic block delete from the kebab

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: optimistic add in the dialog

`AddBlockDialog` add paths route through `optimisticAdd` when a provider is present; fall back to a direct save otherwise (empty-dashboard first add). Editing path unchanged. Consumes T4.

**Files:**
- Modify: `components/dashboard/add-block/add-block-dialog.tsx`

**Interfaces:**
- Consumes: `useOptionalDashboardMutations` (T4).

- [ ] **Step 1: Import the optional hook**

In `components/dashboard/add-block/add-block-dialog.tsx`, add:
```ts
import { useOptionalDashboardMutations } from '../dashboard-mutations'
```
Inside `AddBlockDialog`, near the other hooks, add:
```tsx
  const mutations = useOptionalDashboardMutations()
```

- [ ] **Step 2: Route the manual add through optimisticAdd**

Replace `confirmManual` with (editing path unchanged; non-editing add goes optimistic when a provider exists):
```tsx
  function confirmManual(cfg: Omit<BlockConfig, 'id'>) {
    setError(null)
    if (editing) {
      startTransition(async () => {
        const next = updateBlock(config ?? DEFAULT_CONFIG, editing.id, cfg)
        const res = await saveDashboardConfig(slug, next)
        if (!res.ok) { setError(res.error); return }
        onClose(); router.refresh()
      })
      return
    }
    const block = { id: crypto.randomUUID(), ...cfg }
    if (mutations) { mutations.optimisticAdd(block); onClose(); return }
    startTransition(async () => {
      const next = addBlock(config ?? DEFAULT_CONFIG, block)
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) { setError(res.error); return }
      onClose(); router.refresh()
    })
  }
```

- [ ] **Step 3: Route the AI-proposal add through optimisticAdd**

Replace `confirm`:
```tsx
  function confirm(sel: BlockSelections) {
    if (!proposal) return
    setError(null)
    const block = applySelections(proposal.config, sel, crypto.randomUUID())
    if (mutations) { mutations.optimisticAdd(block); onClose(); return }
    startTransition(async () => {
      const next = addBlock(config ?? DEFAULT_CONFIG, block)
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) setError(res.error)
      else { onClose(); router.refresh() }
    })
  }
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint components/dashboard/add-block/add-block-dialog.tsx` → clean.
Run: `npm run build` → succeeds (confirms RSC/client boundaries and no import cycle across the new context wiring).

- [ ] **Step 5: Manual smoke (executor note)**

Dev server on `/dashboard/<slug>/configurable-dashboard` for a client with ≥1 block (e.g. `kind-patches`):
1. **Add** → builder → confirm: the dialog closes and a pulsing skeleton appears immediately in a new grid cell; the real block streams in shortly. No blank wait.
2. **Delete** → kebab → Delete block: the block disappears immediately and stays gone after the refresh (no lingering).
3. **Error revert:** if a save fails, the optimistic change reverts and `Save failed: …` shows in the shell.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/add-block/add-block-dialog.tsx
git commit -m "feat(dashboard): optimistic block add from the dialog (provider-aware)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** reducer (T1); skeleton (T2); lighter revalidation (T3); context+provider with useOptimistic over `config.blocks` (T4); shell wiring + empty-state handling (T5); skeleton fallback (T6); optimistic delete (T7); optimistic add incl. provider-aware fallback + unchanged editing path (T8). ✅
- **Placeholder scan:** none — full code in every code step; UI tasks are typecheck/lint/build-gated with a manual smoke (the optimistic flow isn't unit-testable headlessly; the pure reducer is, in T1).
- **Type consistency:** `OptimisticAction`/`optimisticBlocksReducer` (T1) match the `useOptimistic` call (T4); `DashboardMutations` fields (`optimisticBlocks`/`optimisticAdd(block)`/`optimisticRemove(id)`/`error`) match consumers in T5 (`optimisticBlocks`,`error`), T7 (`optimisticRemove`), T8 (`optimisticAdd`); `optimisticAdd` takes a full `PersistedBlock` and both add paths pass one; `BlockSkeleton()` is prop-less as used in T6.
- **Rebase correctness:** `useOptimistic` base is the `config.blocks` server prop (T4), so it resets after `router.refresh()`. ✅
- **Orphan cleanup:** T7 drops the now-unused `removeBlock` import; `tsc` gates it. ✅
- **No cycle:** `dashboard-mutations` imports actions/config-mutations/reducer; nothing imports back into the shell. `npm run build` in T8 gates it. ✅
- **Parallelization:** Wave 1 (T1/T2/T3) disjoint; T4 integrates T1; Wave 3 (T5/T6/T7/T8) disjoint, consume T4/T2. Contracts locked above. ✅
