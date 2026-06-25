# Responsive Dashboard Mutations (Optimistic Add/Delete) — Design

**Status:** Approved · 2026-06-25
**Branch:** `feat/dashboard-optimistic-mutations` (off `feat/tc-dashboard-self-service-dash-system`)

## Goal

Make adding and deleting blocks on the configurable dashboard feel instant. Today
both wait on a full server round-trip with no client feedback: adding a block shows
nothing until the page re-renders; deleting leaves the block on screen until the
server revalidates, then it pops out. Give immediate, optimistic feedback and cut
the revalidation cost so the real data lands faster.

This is feature **A** of two; feature **B** (editing leaf-based data blocks) is a
separate spec and branch, built on top of this one.

## Background

The page (`app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`) is an RSC
that builds one server-rendered island per block into `blockNodes: Record<id,
ReactNode>` and hands them to `DashboardShell` (client) → `BlockGrid` (client),
which renders `blockNodes[b.id]` for each block in `config.blocks`.

Mutations today:
- **Add** — `AddBlockDialog.confirmManual` → `saveDashboardConfig(addBlock(...))`,
  then `onClose(); router.refresh()`.
- **Delete** — `BlockChrome` "Delete block" → `saveDashboardConfig(removeBlock(...))`,
  then `closeMenu()`.
- `saveDashboardConfig` ends with `revalidatePath('/', 'layout')` — invalidates the
  entire app layout on every mutation.

There is no client state for the block list (it derives straight from the server
`config` prop), so neither mutation can reflect until the server re-render arrives.

## Non-Goals

- Editing blocks (feature B).
- Optimistic feedback for the per-block "Set range" / range override flow (unchanged).
- Optimistic *layout* drag/resize (already debounced + saved; out of scope).
- Reordering semantics.

## Architecture

`DashboardShell` becomes the source of truth for the rendered block list via
`useOptimistic`, and exposes two mutation actions through a small context so the
deeply-nested `BlockChrome` (delete) and the `AddBlockDialog` (add) can trigger
optimistic updates without prop-drilling.

```
DashboardShell
  ├─ useOptimistic(config.blocks, reducer) → optimisticBlocks
  ├─ <DashboardMutationsProvider value={{ optimisticAdd, optimisticRemove }}>
  │     └─ BlockGrid(blocks=optimisticBlocks, renderBlock)
  │           renderBlock(b) = blockNodes[b.id] ?? <BlockSkeleton kind=b.kind/>
  │     └─ AddBlockButton → AddBlockDialog → optimisticAdd(block)
  └─ each block's BlockChrome "Delete" → optimisticRemove(id)
```

`useOptimistic(config.blocks, …)` rebases on `config.blocks` automatically: when a
mutation's `router.refresh()` lands and `DashboardShell` re-renders with a fresh
`config` prop, the optimistic layer resets to the now-authoritative server list.

### Unit 1: optimistic reducer — `components/dashboard/optimistic-blocks.ts`

Pure function, fully testable, no React:
```ts
export type OptimisticAction =
  | { type: 'add'; block: PersistedBlock }
  | { type: 'remove'; id: string }

export function optimisticBlocksReducer(
  blocks: PersistedBlock[],
  action: OptimisticAction,
): PersistedBlock[] {
  if (action.type === 'add') return [...blocks, action.block]
  return blocks.filter((b) => b.id !== action.id)
}
```

### Unit 2: mutations context + provider — `components/dashboard/dashboard-mutations.tsx`

`'use client'`. Holds `useOptimistic` + `useTransition`, wraps the existing
`saveDashboardConfig` calls, and provides:
- `optimisticRemove(id)`: inside `startTransition` → dispatch `{type:'remove', id}` →
  `await saveDashboardConfig(slug, removeBlock(config, id))` → `router.refresh()`;
  on `!ok`, set an error message (the transition ending without a server change
  auto-reverts the optimistic removal).
- `optimisticAdd(block)`: takes a full `PersistedBlock` (id already assigned by the
  caller) → dispatch `{type:'add', block}` →
  `await saveDashboardConfig(slug, addBlock(config, block))` →
  `router.refresh()`; on `!ok`, set error (auto-reverts).

A single `PersistedBlock` argument unifies both add paths: the manual builder calls
`optimisticAdd({ id: crypto.randomUUID(), ...cfg })`, and the AI-proposal path calls
`optimisticAdd(block)` with the block it already assembled via `applySelections`.

The provider receives `slug`, `config`, and `blocks` (server `config.blocks`) and
exposes `optimisticBlocks` for `BlockGrid` plus the two actions and an `error`. A
context hook `useDashboardMutations()` reads them.

> id ownership: the caller generates `crypto.randomUUID()` so the optimistic
> placeholder and the persisted block share an id — the server island then renders
> under the same key and replaces the skeleton with no flicker.

### Unit 3: block skeleton — `components/dashboard/blocks/block-skeleton.tsx`

A static, kind-aware placeholder card (pulsing) shown for a block id that has no
server island yet (a just-added block). Sized to the kind's default grid footprint
so the grid doesn't jump when the real island arrives.

### Unit 4: wiring

- `dashboard-shell.tsx`: render `DashboardMutationsProvider`; pass `optimisticBlocks`
  to `BlockGrid`; surface the provider `error` inline.
- `block-grid.tsx`: `renderBlock(b)` returns `blockNodes[b.id] ?? <BlockSkeleton kind={b.kind}/>`.
  (Layout/drag code unchanged; the skeleton occupies the same grid cell.)
- `block-chrome.tsx`: "Delete block" `onConfirm` calls `useDashboardMutations().optimisticRemove(block.id)`
  and closes the menu immediately (no longer awaits the save itself).
- `add-block-dialog.tsx`: `confirmManual` (non-editing path) calls
  `optimisticAdd({ id: crypto.randomUUID(), ...cfg })` then `onClose()` — no longer
  calls `addBlock`/`saveDashboardConfig`/`router.refresh()` directly. The AI-proposal
  `confirm` path calls `optimisticAdd(block)` with its `applySelections` block.

### Unit 5: lighter revalidation — `app/actions/dashboard.ts`

Replace `revalidatePath('/', 'layout')` in `saveDashboardConfig` with a targeted
revalidate of the dashboard routes only:
```ts
revalidatePath(`/dashboard/${slug}/configurable-dashboard`)
revalidatePath(`/portal/${slug}/configurable-dashboard`)
```
`router.refresh()` (called by the mutation actions) already refetches the current
route; the broad `'/', 'layout'` invalidation was pure overhead. Block *data* stays
cached via its own `unstable_cache`, so unchanged blocks don't refetch.

## Error Handling

- `useOptimistic` reverts the optimistic change automatically when the transition
  completes without the server reflecting it (the rebase to `config.blocks` wins).
- On `saveDashboardConfig` failure, the provider sets an inline `error` string
  (rendered in the shell, matching the existing `block-grid` save-error pattern).
  Delete failure → the block reappears; add failure → the skeleton disappears.
- Add data-fetch failure (the real island errors) is unchanged — the block's
  existing Suspense/ErrorBoundary renders its own error card.

## Testing

- **Unit (tsx + node:assert):** `optimisticBlocksReducer` — add appends; remove
  filters by id; remove of an absent id is a no-op; other blocks untouched.
- **Typecheck/lint:** `tsc --noEmit`, `eslint` on changed files.
- **Build:** `npm run build` (RSC/client boundary + no import cycle).
- **Manual smoke:** add a block → skeleton appears instantly → real block streams in;
  delete a block → disappears instantly → stays gone after refresh; force a save
  error (e.g., temporary forbidden) → optimistic change reverts + inline error.

## Risks / Edge Cases

- **Rebase correctness:** `useOptimistic` base must be `config.blocks` (server prop),
  not a derived copy, so it resets cleanly after `router.refresh()`.
- **Skeleton/real swap:** placeholder and real island share the block id → same React
  key in the grid → no remount flicker. The skeleton's grid footprint should match
  the kind default so layout doesn't shift.
- **Delete during pending add (or vice-versa):** actions are independent reducer ops
  keyed by id; concurrent transitions compose (each dispatch applies to the latest
  optimistic state). Acceptable for v1.
- **Targeted revalidation coverage:** if any other surface relied on the old
  `'/', 'layout'` invalidation for dashboard freshness, it now refreshes only via the
  dashboard routes — intended, but noted.
