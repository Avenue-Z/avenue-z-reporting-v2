# Dashboard UI (Configurable Dashboard #3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UI layer of the Configurable Dashboard — a per-client route that loads `DashboardConfig`, resolves each block server-side via `resolveBlock`, and renders a grid of Metric Blocks with a global Apply-batched time-range control, per-block override with detach badge, drag-and-drop reorder, and delete-with-confirm. All persistence flows through Paul's existing `saveDashboardConfig` server action.

**Architecture:** RSC at `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx` loads the persisted config, computes the active default from URL searchParams (`?dateRange=…&compareRange=…`), and wraps each block in a `<Suspense>` boundary whose child awaits `resolveBlock`. The client shell renders the global control (thin wrapper over the existing `DateRangePicker`, mirrors `ReportDateRange`'s URL-push pattern) and a `@dnd-kit/sortable` grid of `<MetricBlock>` components. Editor mutations construct new `DashboardConfig` values via pure helpers in `components/dashboard/config-mutations.ts` and call `saveDashboardConfig`. No new server actions; no edits to `lib/db/**`, `lib/dashboard/persistence.ts`, `lib/dashboard/permissions.ts`, `app/actions/dashboard.ts`, or any frozen #1 file.

**Tech Stack:** Next.js 15 RSC + Server Actions, React 19, TypeScript, Drizzle (Neon), Auth.js, Tailwind brand tokens (`bg-bg-surface`, `text-text-muted`, `brand-cyan`, `brand-green`, `#FF4444`), `@dnd-kit/{core,sortable,utilities}` (new dep), existing `components/layout/date-range-picker.tsx`, existing `components/ui/{popover,button}.tsx`. Pure-logic tests via `tsx` + `node:assert` (no React component test framework in repo).

**Spec:** `docs/superpowers/specs/2026-06-18-dashboard-ui-design.md`

---

## File Map

**Created (all #3-owned):**
- `components/dashboard/config-mutations.ts` — pure helpers that build new `DashboardConfig` for reorder / remove / set-range / reset-range
- `components/dashboard/config-mutations.test.ts` — tsx assertion tests for the helpers
- `components/dashboard/metric-block-states.tsx` — pure presentational state cards (skeleton, 5 error variants, empty)
- `components/dashboard/metric-block.tsx` — interactive metric block (kebab menu, override popover, detach badge, delete confirm)
- `components/dashboard/global-time-control.tsx` — client wrapper over `DateRangePicker`, pushes URL params on Apply
- `components/dashboard/block-grid.tsx` — `@dnd-kit/sortable` wrapper, renders blocks in `config.blocks` order
- `components/dashboard/dashboard-shell.tsx` — client layout: header for global control + grid + empty-dashboard state
- `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx` — RSC: auth, load config, gate edit, Suspense per block, await `resolveBlock`

**Modified:**
- `package.json` — add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

**Local-only (gitignored, manual):**
- `.env.local` — dev Neon branch credentials Paul provided

**Untouched (out of bounds per Paul §4):**
- `lib/dashboard/{types,resolve,aggregate,registry,errors,format}.ts` and `lib/dashboard/adapters/**` — frozen #1
- `lib/dashboard/persistence.ts`, `lib/dashboard/permissions.ts`, `lib/db/**`, `app/actions/dashboard.ts`, `lib/db/schema.ts` — #2
- Uncommitted paid-search edits in the working tree

---

## Task 1: Local env + drag-and-drop deps

**Files:**
- Create: `.env.local` (gitignored)
- Modify: `package.json`

- [ ] **Step 1: Verify `.env.local` is gitignored**

Run: `git check-ignore -v .env.local`
Expected: line referencing `.gitignore:40:.env*`

- [ ] **Step 2: Write `.env.local`**

```
DATABASE_URL=postgresql://neondb_owner:npg_4dZPzVo8lbGC@ep-royal-king-aqnzuelw.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
DATABASE_URL_UNPOOLED=postgresql://neondb_owner:npg_4dZPzVo8lbGC@ep-royal-king-aqnzuelw.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

If `.env.local` already exists (from another feature), preserve existing lines and append/replace these two keys only.

- [ ] **Step 3: Install dnd-kit**

Run: `npm install @dnd-kit/core@^6.1.0 @dnd-kit/sortable@^8.0.0 @dnd-kit/utilities@^3.2.2`
Expected: success, `package.json` + `package-lock.json` updated.

- [ ] **Step 4: Verify no other dep churn**

Run: `git diff --stat package.json package-lock.json`
Expected: only the three new `@dnd-kit/*` entries in `package.json` dependencies.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(dashboard): add @dnd-kit deps for block reorder"
```

---

## Task 2: Pure config mutations (TDD)

The only TDD-able logic in #3 is the data transforms editors apply to `DashboardConfig`. Components themselves are visually verified via the dev server in Task 9, since the repo has no React testing framework (only `tsx` + `node:assert`, per `lib/dashboard/format.test.ts`).

**Files:**
- Create: `components/dashboard/config-mutations.ts`
- Test: `components/dashboard/config-mutations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/config-mutations.test.ts`:

```ts
// components/dashboard/config-mutations.test.ts
// Run: npx tsx components/dashboard/config-mutations.test.ts
import { strict as assert } from 'node:assert'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'
import {
  reorderBlocks,
  removeBlock,
  setBlockRange,
  resetBlockRange,
} from './config-mutations'

const block = (id: string, range: PersistedBlock['range'] = null): PersistedBlock => ({
  id,
  name: `Block ${id}`,
  format: 'number',
  binding: { source: 'triplewhale', metric: 'fake' },
  range,
})

const base: DashboardConfig = {
  defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' },
  blocks: [block('a'), block('b'), block('c')],
}

// reorderBlocks: move 'a' (index 0) to index 2 → [b, c, a]
{
  const next = reorderBlocks(base, 0, 2)
  assert.deepEqual(next.blocks.map((b) => b.id), ['b', 'c', 'a'])
  assert.notEqual(next, base, 'must return a new object (immutable)')
  assert.notEqual(next.blocks, base.blocks, 'must return a new blocks array')
  assert.deepEqual(base.blocks.map((b) => b.id), ['a', 'b', 'c'], 'input must be unchanged')
}

// reorderBlocks: same index is a no-op identity-shape (still a new array, same order)
{
  const next = reorderBlocks(base, 1, 1)
  assert.deepEqual(next.blocks.map((b) => b.id), ['a', 'b', 'c'])
}

// removeBlock: drops the matching id, leaves others in order
{
  const next = removeBlock(base, 'b')
  assert.deepEqual(next.blocks.map((b) => b.id), ['a', 'c'])
  assert.deepEqual(base.blocks.map((b) => b.id), ['a', 'b', 'c'], 'input must be unchanged')
}

// removeBlock: unknown id is a no-op (returns identical-shape config)
{
  const next = removeBlock(base, 'zzz')
  assert.deepEqual(next.blocks.map((b) => b.id), ['a', 'b', 'c'])
}

// setBlockRange: writes the range on the matching block, leaves others alone
{
  const next = setBlockRange(base, 'b', { dateRange: 'last_7_days', compareRange: 'previous_year' })
  assert.equal(next.blocks[0].range, null)
  assert.deepEqual(next.blocks[1].range, { dateRange: 'last_7_days', compareRange: 'previous_year' })
  assert.equal(next.blocks[2].range, null)
}

// resetBlockRange: sets the matching block back to null
{
  const overridden = setBlockRange(base, 'a', { dateRange: 'last_7_days', compareRange: null })
  const next = resetBlockRange(overridden, 'a')
  assert.equal(next.blocks[0].range, null)
}

console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails (module not found)**

Run: `npx tsx components/dashboard/config-mutations.test.ts`
Expected: failure, message contains `Cannot find module './config-mutations'` or equivalent.

- [ ] **Step 3: Write minimal implementation**

Create `components/dashboard/config-mutations.ts`:

```ts
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

type Range = NonNullable<PersistedBlock['range']>

export function reorderBlocks(
  config: DashboardConfig,
  fromIndex: number,
  toIndex: number,
): DashboardConfig {
  const next = config.blocks.slice()
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return { ...config, blocks: next }
}

export function removeBlock(config: DashboardConfig, blockId: string): DashboardConfig {
  return { ...config, blocks: config.blocks.filter((b) => b.id !== blockId) }
}

export function setBlockRange(
  config: DashboardConfig,
  blockId: string,
  range: Range,
): DashboardConfig {
  return {
    ...config,
    blocks: config.blocks.map((b) => (b.id === blockId ? { ...b, range } : b)),
  }
}

export function resetBlockRange(config: DashboardConfig, blockId: string): DashboardConfig {
  return {
    ...config,
    blocks: config.blocks.map((b) => (b.id === blockId ? { ...b, range: null } : b)),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx components/dashboard/config-mutations.test.ts`
Expected: prints `ok` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/config-mutations.ts components/dashboard/config-mutations.test.ts
git commit -m "feat(dashboard): pure config mutations for reorder / remove / range"
```

---

## Task 3: Metric block states (skeleton + errors + empty)

**Files:**
- Create: `components/dashboard/metric-block-states.tsx`

- [ ] **Step 1: Write the component**

Create `components/dashboard/metric-block-states.tsx`:

```tsx
import Link from 'next/link'
import type { BlockError } from '@/lib/dashboard/types'

const CARD =
  'rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 min-h-[140px] flex flex-col justify-between'

export function MetricBlockSkeleton({ name }: { name?: string }) {
  return (
    <div
      className={CARD}
      aria-busy="true"
      aria-label={name ? `Loading ${name}` : 'Loading metric'}
    >
      <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
      <div className="h-8 w-32 animate-pulse rounded bg-white/10" />
      <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
    </div>
  )
}

const ERROR_COPY: Record<BlockError, { title: string; body: React.ReactNode }> = {
  disconnected: {
    title: 'Not connected',
    body: (
      <>
        Connect this data source on the{' '}
        <Link href="/dashboard/connections" className="underline hover:text-white">
          connections
        </Link>{' '}
        page.
      </>
    ),
  },
  'invalid-metric': {
    title: 'Metric configuration invalid',
    body: 'Re-author this block to pick a valid metric.',
  },
  'no-data': {
    title: 'No data for this range',
    body: 'Try a wider range or a different comparison.',
  },
  'rate-limited': {
    title: 'Temporarily unavailable',
    body: 'Data source is rate-limited. It should recover shortly.',
  },
  error: {
    title: 'Something went wrong',
    body: 'Refresh to try again.',
  },
}

export function MetricBlockErrorState({
  name,
  error,
}: {
  name: string
  error: BlockError
}) {
  const copy = ERROR_COPY[error]
  return (
    <div className={CARD} role="status">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">
        {name}
      </p>
      <p className="mt-2 text-base font-bold text-white">{copy.title}</p>
      <p className="mt-1 text-xs text-text-muted">{copy.body}</p>
    </div>
  )
}

export function EmptyDashboardState({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.08] bg-bg-surface/40 p-12 text-center">
      <p className="text-lg font-bold text-white">No blocks yet</p>
      <p className="mt-2 max-w-md text-sm text-text-muted">
        {canEdit
          ? 'Add a metric block to start building this dashboard.'
          : 'This dashboard has not been configured yet.'}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/metric-block-states.tsx
git commit -m "feat(dashboard): metric block skeleton, error states, empty state"
```

---

## Task 4: Metric block (presentational shell + edit chrome)

The block displays a `ResolveResult` and, for editors, exposes a kebab menu with: Override range, Reset to inherit, Delete. The override popover contains the same preset list and Compare-To toggle as `DateRangePicker`'s left column (presets only — no custom calendar — keeping #3 scope tight).

**Files:**
- Create: `components/dashboard/metric-block.tsx`

- [ ] **Step 1: Write the component**

Create `components/dashboard/metric-block.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { saveDashboardConfig } from '@/app/actions/dashboard'
import { setBlockRange, resetBlockRange, removeBlock } from './config-mutations'
import { MetricBlockErrorState } from './metric-block-states'
import type {
  DashboardConfig,
  PersistedBlock,
  ResolveResult,
} from '@/lib/dashboard/types'

const PRESETS = [
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_14_days', label: 'Last 14 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_60_days', label: 'Last 60 Days' },
  { value: 'last_90_days', label: 'Last 90 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'year_to_date', label: 'Year to Date' },
  { value: 'last_year', label: 'Last Year' },
] as const

const COMPARES = [
  { value: null, label: 'No Comparison' },
  { value: 'previous_period', label: 'Previous Period' },
  { value: 'previous_year', label: 'Previous Year' },
] as const

function presetLabel(value: string): string {
  return PRESETS.find((p) => p.value === value)?.label ?? value
}

export interface MetricBlockProps {
  block: PersistedBlock
  result: ResolveResult
  canEdit: boolean
  slug: string
  config: DashboardConfig
}

export function MetricBlock({ block, result, canEdit, slug, config }: MetricBlockProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'range' | 'confirm-delete' | 'confirm-reset'>('menu')
  const [draftDate, setDraftDate] = useState<string>(block.range?.dateRange ?? 'last_30_days')
  const [draftCompare, setDraftCompare] = useState<string | null>(
    block.range?.compareRange ?? null,
  )
  const [pending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const isOverridden = block.range !== null

  function closeMenu() {
    setMenuOpen(false)
    setView('menu')
    setErrorMsg(null)
  }

  function runSave(nextConfig: DashboardConfig) {
    startTransition(async () => {
      const res = await saveDashboardConfig(slug, nextConfig)
      if (!res.ok) {
        setErrorMsg(res.error)
        return
      }
      closeMenu()
    })
  }

  function applyOverride() {
    runSave(setBlockRange(config, block.id, { dateRange: draftDate, compareRange: draftCompare }))
  }

  function confirmReset() {
    runSave(resetBlockRange(config, block.id))
  }

  function confirmDelete() {
    runSave(removeBlock(config, block.id))
  }

  if (!result.ok) {
    return (
      <BlockShell
        name={block.name}
        canEdit={canEdit}
        isOverridden={isOverridden}
        overrideLabel={isOverridden ? presetLabel(block.range!.dateRange) : null}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        view={view}
        setView={setView}
        pending={pending}
        errorMsg={errorMsg}
        draftDate={draftDate}
        setDraftDate={setDraftDate}
        draftCompare={draftCompare}
        setDraftCompare={setDraftCompare}
        applyOverride={applyOverride}
        confirmDelete={confirmDelete}
        confirmReset={confirmReset}
      >
        <MetricBlockErrorState name={block.name} error={result.error} />
      </BlockShell>
    )
  }

  return (
    <BlockShell
      name={block.name}
      canEdit={canEdit}
      isOverridden={isOverridden}
      overrideLabel={isOverridden ? presetLabel(block.range!.dateRange) : null}
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      view={view}
      setView={setView}
      pending={pending}
      errorMsg={errorMsg}
      draftDate={draftDate}
      setDraftDate={setDraftDate}
      draftCompare={draftCompare}
      setDraftCompare={setDraftCompare}
      applyOverride={applyOverride}
      confirmDelete={confirmDelete}
      confirmReset={confirmReset}
    >
      <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 min-h-[140px]">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">
            {block.name}
          </p>
        </div>
        <p className="mt-2 text-3xl font-extrabold text-white">{result.formatted}</p>
        {result.delta !== undefined && (
          <p
            className={cn(
              'mt-1 text-sm font-bold',
              result.delta > 0
                ? 'text-brand-green'
                : result.delta < 0
                  ? 'text-[#FF4444]'
                  : 'text-text-muted',
            )}
          >
            {result.delta > 0 ? '↑' : result.delta < 0 ? '↓' : '—'}{' '}
            {Math.abs(result.delta).toFixed(1)}% vs prior period
          </p>
        )}
      </div>
    </BlockShell>
  )
}

// Shared chrome (detach badge + kebab + popover) wrapped around the value/error card.
function BlockShell({
  name,
  canEdit,
  isOverridden,
  overrideLabel,
  menuOpen,
  setMenuOpen,
  view,
  setView,
  pending,
  errorMsg,
  draftDate,
  setDraftDate,
  draftCompare,
  setDraftCompare,
  applyOverride,
  confirmDelete,
  confirmReset,
  children,
}: {
  name: string
  canEdit: boolean
  isOverridden: boolean
  overrideLabel: string | null
  menuOpen: boolean
  setMenuOpen: (v: boolean) => void
  view: 'menu' | 'range' | 'confirm-delete' | 'confirm-reset'
  setView: (v: 'menu' | 'range' | 'confirm-delete' | 'confirm-reset') => void
  pending: boolean
  errorMsg: string | null
  draftDate: string
  setDraftDate: (v: string) => void
  draftCompare: string | null
  setDraftCompare: (v: string | null) => void
  applyOverride: () => void
  confirmDelete: () => void
  confirmReset: () => void
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      {children}

      {/* detach badge — visible to viewers too, but only interactive for editors */}
      {isOverridden && (
        <div className="absolute left-6 top-12">
          {canEdit ? (
            <button
              onClick={() => {
                setView('confirm-reset')
                setMenuOpen(true)
              }}
              className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-cyan hover:bg-brand-cyan/20"
            >
              Detached · {overrideLabel}
            </button>
          ) : (
            <span className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-cyan">
              Detached · {overrideLabel}
            </span>
          )}
        </div>
      )}

      {/* kebab + popover — editors only */}
      {canEdit && (
        <Popover open={menuOpen} onOpenChange={(open) => (open ? setMenuOpen(true) : (setMenuOpen(false), setView('menu')))}>
          <PopoverTrigger asChild>
            <button
              aria-label={`Edit ${name}`}
              className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-white/10 hover:text-white"
            >
              ⋯
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 border-white/[0.08] bg-[#1a1a1a] p-2"
            align="end"
            sideOffset={4}
          >
            {view === 'menu' && (
              <div className="flex flex-col">
                <button
                  className="px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.06]"
                  onClick={() => setView('range')}
                >
                  Override range…
                </button>
                {isOverridden && (
                  <button
                    className="px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.06]"
                    onClick={() => setView('confirm-reset')}
                  >
                    Reset to inherit
                  </button>
                )}
                <button
                  className="px-3 py-2 text-left text-[13px] text-[#FF6666] hover:bg-white/[0.06]"
                  onClick={() => setView('confirm-delete')}
                >
                  Delete block
                </button>
              </div>
            )}

            {view === 'range' && (
              <div className="flex flex-col">
                <p className="px-2 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
                  Date Range
                </p>
                <div className="max-h-48 overflow-y-auto">
                  {PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setDraftDate(p.value)}
                      className={cn(
                        'block w-full px-3 py-1.5 text-left text-[13px] hover:bg-white/[0.06]',
                        p.value === draftDate ? 'font-bold text-brand-cyan' : 'text-white/80',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="px-2 pb-1 pt-3 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
                  Compare To
                </p>
                {COMPARES.map((c) => (
                  <button
                    key={String(c.value)}
                    onClick={() => setDraftCompare(c.value)}
                    className={cn(
                      'block w-full px-3 py-1.5 text-left text-[13px] hover:bg-white/[0.06]',
                      c.value === draftCompare ? 'font-bold text-brand-cyan' : 'text-white/80',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
                    onClick={() => setView('menu')}
                    disabled={pending}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
                    onClick={applyOverride}
                    disabled={pending}
                  >
                    {pending ? 'Saving…' : 'Apply'}
                  </button>
                </div>
              </div>
            )}

            {view === 'confirm-reset' && (
              <ConfirmRow
                question="Reset this block to inherit the global range?"
                confirmLabel="Reset"
                pending={pending}
                onCancel={() => setView('menu')}
                onConfirm={confirmReset}
              />
            )}

            {view === 'confirm-delete' && (
              <ConfirmRow
                question="Delete this block? This cannot be undone."
                confirmLabel="Delete"
                destructive
                pending={pending}
                onCancel={() => setView('menu')}
                onConfirm={confirmDelete}
              />
            )}

            {errorMsg && (
              <p className="mt-2 px-2 text-[11px] text-[#FF6666]">Error: {errorMsg}</p>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

function ConfirmRow({
  question,
  confirmLabel,
  destructive = false,
  pending,
  onCancel,
  onConfirm,
}: {
  question: string
  confirmLabel: string
  destructive?: boolean
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="flex flex-col gap-3 p-2">
      <p className="text-[13px] text-white/90">{question}</p>
      <div className="flex justify-end gap-2">
        <button
          className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
        <button
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-bold',
            destructive
              ? 'bg-[#FF4444]/80 text-white hover:bg-[#FF4444]'
              : 'bg-brand-cyan text-black hover:opacity-90',
          )}
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? 'Working…' : confirmLabel}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/metric-block.tsx
git commit -m "feat(dashboard): metric block with override popover, detach badge, delete confirm"
```

---

## Task 5: Global time-range control (URL push wrapper)

**Files:**
- Create: `components/dashboard/global-time-control.tsx`

- [ ] **Step 1: Write the component**

Create `components/dashboard/global-time-control.tsx`:

```tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { DateRangePicker } from '@/components/layout/date-range-picker'

export interface GlobalTimeControlProps {
  /** Active default — already merged from URL searchParams + persisted config.defaultRange. */
  activeDefault: { dateRange: string; compareRange: string | null }
}

export function GlobalTimeControl({ activeDefault }: GlobalTimeControlProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Reflect URL changes immediately after router.push (mirrors ReportDateRange).
  const dateRange = searchParams.get('dateRange') ?? activeDefault.dateRange
  const compareRange = searchParams.has('compareRange')
    ? searchParams.get('compareRange')
    : activeDefault.compareRange

  const push = (next: URLSearchParams) => router.push(`${pathname}?${next.toString()}`)

  const handleDateChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('dateRange', next)
    push(params)
  }

  const handleCompareChange = (next: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next) params.set('compareRange', next)
    else params.set('compareRange', '') // explicit empty = "no comparison"
    push(params)
  }

  return (
    <DateRangePicker
      value={dateRange}
      onChange={handleDateChange}
      compareValue={compareRange}
      onCompareChange={handleCompareChange}
    />
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/global-time-control.tsx
git commit -m "feat(dashboard): global time control wraps DateRangePicker + URL push"
```

---

## Task 6: Block grid (dnd-kit sortable)

**Files:**
- Create: `components/dashboard/block-grid.tsx`

- [ ] **Step 1: Write the component**

Create `components/dashboard/block-grid.tsx`:

```tsx
'use client'

import { useState, useTransition, type ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { saveDashboardConfig } from '@/app/actions/dashboard'
import { reorderBlocks } from './config-mutations'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

export interface BlockGridProps {
  blocks: PersistedBlock[]
  canEdit: boolean
  slug: string
  config: DashboardConfig
  /** Rendered child per block (the resolved <MetricBlock>). */
  renderBlock: (block: PersistedBlock) => ReactNode
}

export function BlockGrid({ blocks, canEdit, slug, config, renderBlock }: BlockGridProps) {
  const [pending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ids = blocks.map((b) => b.id)

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = reorderBlocks(config, from, to)
    startTransition(async () => {
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) setErrorMsg(res.error)
    })
  }

  // Non-editors: skip dnd entirely, plain grid.
  if (!canEdit) {
    return (
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {blocks.map((b) => (
          <div key={b.id}>{renderBlock(b)}</div>
        ))}
      </div>
    )
  }

  return (
    <>
      {errorMsg && (
        <p className="mb-3 text-xs text-[#FF6666]" role="alert">
          Save failed: {errorMsg}
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className={`grid grid-cols-2 gap-5 lg:grid-cols-4 ${pending ? 'opacity-70' : ''}`}>
            {blocks.map((b) => (
              <SortableBlock key={b.id} id={b.id}>
                {renderBlock(b)}
              </SortableBlock>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  )
}

function SortableBlock({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/block-grid.tsx
git commit -m "feat(dashboard): dnd-kit sortable grid with reorder persistence"
```

---

## Task 7: Dashboard shell (orchestrator)

The shell is intentionally thin: it lays out the global control + grid + empty state. The grid uses a `renderBlock` callback because each block is a server-rendered island wrapped in Suspense (constructed in Task 8's page.tsx), which the client shell receives as ReactNodes via a `children`-style prop on `BlockGrid`.

**Files:**
- Create: `components/dashboard/dashboard-shell.tsx`

- [ ] **Step 1: Write the component**

Create `components/dashboard/dashboard-shell.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import { GlobalTimeControl } from './global-time-control'
import { BlockGrid } from './block-grid'
import { EmptyDashboardState } from './metric-block-states'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

export interface DashboardShellProps {
  config: DashboardConfig
  canEdit: boolean
  activeDefault: { dateRange: string; compareRange: string | null }
  slug: string
  /** Map of block id → rendered server island (the Suspense-wrapped <MetricBlock>). */
  blockNodes: Record<string, ReactNode>
}

export function DashboardShell({
  config,
  canEdit,
  activeDefault,
  slug,
  blockNodes,
}: DashboardShellProps) {
  if (config.blocks.length === 0) {
    return <EmptyDashboardState canEdit={canEdit} />
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <GlobalTimeControl activeDefault={activeDefault} />
      </div>
      <BlockGrid
        blocks={config.blocks}
        canEdit={canEdit}
        slug={slug}
        config={config}
        renderBlock={(b: PersistedBlock) => blockNodes[b.id]}
      />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/dashboard-shell.tsx
git commit -m "feat(dashboard): shell composes global control + grid + empty state"
```

---

## Task 8: Route page (RSC, Suspense per block, auth gate)

The page resolves each block in a separate Suspense boundary so blocks stream independently. Each `ResolvedBlockIsland` is a local async function that awaits `resolveBlock` and renders the client `MetricBlock`. The shell receives a map of `id → ReactNode` so block-level Suspense boundaries are created on the server (per-block streaming), while the grid orchestration (dnd) stays client-side.

**Files:**
- Create: `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`

- [ ] **Step 1: Write the page**

Create `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`:

```tsx
import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getClientBySlug, getDashboardConfig } from '@/lib/db/queries'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { resolveBlock } from '@/lib/dashboard/resolve'
import { Header } from '@/components/layout/header'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { MetricBlock } from '@/components/dashboard/metric-block'
import { MetricBlockSkeleton, EmptyDashboardState } from '@/components/dashboard/metric-block-states'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

export default async function ConfigurableDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string }>
  searchParams: Promise<{ dateRange?: string; compareRange?: string }>
}) {
  const { clientSlug } = await params
  const { dateRange: dateRangeParam, compareRange: compareRangeParam } = await searchParams

  const [session, client, config] = await Promise.all([
    auth(),
    getClientBySlug(clientSlug),
    getDashboardConfig(clientSlug),
  ])
  if (!client) notFound()

  const canEdit = canEditDashboard(
    session?.user?.role ?? '',
    session?.user?.clientSlug ?? null,
    clientSlug,
  )

  // No persisted config yet → empty-dashboard state, no control bar.
  if (!config) {
    return (
      <>
        <Header title="Dashboard" subtitle={client.name} />
        <div className="divider-full mb-8" />
        <EmptyDashboardState canEdit={canEdit} />
      </>
    )
  }

  const activeDefault = {
    dateRange: dateRangeParam ?? config.defaultRange.dateRange,
    // Empty string means "no comparison." Missing key → fall back to persisted default.
    compareRange:
      compareRangeParam === undefined
        ? config.defaultRange.compareRange
        : compareRangeParam === ''
          ? null
          : compareRangeParam,
  }

  // Build one Suspense-wrapped server island per block; the shell renders these in grid order.
  const blockNodes: Record<string, ReactNode> = {}
  for (const block of config.blocks) {
    blockNodes[block.id] = (
      <Suspense fallback={<MetricBlockSkeleton name={block.name} />}>
        <ResolvedBlockIsland
          block={block}
          activeDefault={activeDefault}
          slug={clientSlug}
          canEdit={canEdit}
          config={config}
        />
      </Suspense>
    )
  }

  return (
    <>
      <Header title="Dashboard" subtitle={client.name} />
      <div className="divider-full mb-8" />
      <DashboardShell
        config={config}
        canEdit={canEdit}
        activeDefault={activeDefault}
        slug={clientSlug}
        blockNodes={blockNodes}
      />
    </>
  )
}

async function ResolvedBlockIsland({
  block,
  activeDefault,
  slug,
  canEdit,
  config,
}: {
  block: PersistedBlock
  activeDefault: { dateRange: string; compareRange: string | null }
  slug: string
  canEdit: boolean
  config: DashboardConfig
}) {
  const result = await resolveBlock(block, activeDefault, { slug })
  return <MetricBlock block={block} result={result} canEdit={canEdit} slug={slug} config={config} />
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to the new file.

- [ ] **Step 3: Production build (catches RSC/client boundary errors `tsc` misses)**

Run: `npm run build`
Expected: build succeeds. If it fails on this file specifically, fix before committing.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/[clientSlug]/configurable-dashboard/page.tsx
git commit -m "feat(dashboard): RSC route streams each block via Suspense"
```

---

## Task 9: End-to-end smoke test (dev server + interactions)

Manual verification of the DoD. There's no React component test framework in the repo, so visual states, drag-and-drop, override flow, and re-resolution are checked against a running dev server with a real (dev-branch) database. Use a low-traffic, throwaway client slug.

**Files:** none changed — verification only.

- [ ] **Step 1: Pick a target client slug**

Run: `npx tsx --env-file=.env.local -e "import('./lib/db/client').then(async ({ db }) => { const { clients } = await import('./lib/db/schema'); const rows = await db.select({ slug: clients.slug, name: clients.name }).from(clients).limit(20); console.log(rows); })"`
Expected: prints up to 20 `{ slug, name }` rows. Pick one to use below. Replace `<SLUG>` in subsequent steps.

- [ ] **Step 2: Seed a small `DashboardConfig` for that client**

The triplewhale leaf adapter is a deterministic stub (per #1), so this seed will resolve without external credentials.

Run (substitute `<SLUG>`):

```
npx tsx --env-file=.env.local -e "
import('./lib/db/client').then(async ({ db }) => {
  const { eq } = await import('drizzle-orm')
  const { clients } = await import('./lib/db/schema')
  const cfg = {
    defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' },
    blocks: [
      { id: 'a', name: 'Blended ROAS', format: 'number',   binding: { source: 'triplewhale', metric: 'blended_roas' }, range: null },
      { id: 'b', name: 'Ad Spend',     format: 'currency', binding: { source: 'triplewhale', metric: 'ad_spend' },     range: null },
      { id: 'c', name: 'Conv Rate',    format: 'percent',  binding: { source: 'triplewhale', metric: 'conv_rate' },    range: { dateRange: 'last_7_days', compareRange: null } },
      { id: 'd', name: 'Sessions',     format: 'count',    binding: { source: 'triplewhale', metric: 'sessions' },     range: null },
    ],
  }
  await db.update(clients).set({ dashboardConfig: cfg, updatedAt: new Date() }).where(eq(clients.slug, '<SLUG>'))
  console.log('seeded')
})
"
```

Expected: prints `seeded`.

- [ ] **Step 3: Start dev server**

Run: `npm run dev`
Expected: server up on `http://localhost:3000`.

- [ ] **Step 4: Sign in and verify the empty-dashboard state**

Open: `http://localhost:3000/dashboard/<SLUG>/configurable-dashboard` after clearing the seeded config:

Before opening, clear the config:
```
npx tsx --env-file=.env.local -e "
import('./lib/db/client').then(async ({ db }) => {
  const { eq } = await import('drizzle-orm')
  const { clients } = await import('./lib/db/schema')
  await db.update(clients).set({ dashboardConfig: null }).where(eq(clients.slug, '<SLUG>'))
})"
```

Expected: page renders "No blocks yet" empty state.

- [ ] **Step 5: Re-seed and verify the resolved grid**

Re-run Step 2's seed. Reload the page.

Expected: four metric blocks render with stub values. Block C ("Conv Rate") shows a `Detached · Last 7 Days` badge and no delta (its `compareRange` is `null`). Blocks A, B, D show deltas with up/down arrows and brand-green / `#FF4444` colors.

- [ ] **Step 6: Exercise the global control Apply semantics**

Click the date range button → pick `Last 90 Days` → toggle Compare To → pick `Previous Year` → click **Apply**.

Expected:
- URL updates to `?dateRange=last_90_days&compareRange=previous_year` in a single push.
- Blocks A, B, D re-resolve (skeletons flash then values update).
- Block C still shows `Detached · Last 7 Days` with no delta — global change ignored.

- [ ] **Step 7: Toggle Compare To off**

Open the picker again, toggle Compare To off, Apply.

Expected: URL becomes `?dateRange=last_90_days&compareRange=`. Deltas on A, B, D disappear.

- [ ] **Step 8: Override a block range**

On block A (inheriting), click the kebab → "Override range…" → pick `Last 14 Days`, Previous Period → Apply.

Expected: popover closes. Block A re-renders with a `Detached · Last 14 Days` badge and a delta (since Previous Period was selected). Persists across reload.

- [ ] **Step 9: Reset block C via the badge**

Click block C's `Detached · Last 7 Days` badge → confirm Reset.

Expected: badge disappears, C now inherits the current global range. Persists across reload.

- [ ] **Step 10: Drag-and-drop reorder**

Drag block D before block A.

Expected: order persists across reload. Confirm via:
```
npx tsx --env-file=.env.local -e "
import('./lib/db/queries').then(async ({ getDashboardConfig }) => {
  const cfg = await getDashboardConfig('<SLUG>')
  console.log(cfg?.blocks.map(b => b.id))
})"
```

- [ ] **Step 11: Delete with confirmation**

Click block B's kebab → "Delete block" → confirm.

Expected: block B removed from the grid and persisted.

- [ ] **Step 12: Viewer mode (canEdit = false)**

Sign in as a non-INTERNAL_ADMIN, non-matching CLIENT_ADMIN user (or temporarily edit your session). Reload the page.

Expected: no kebab buttons, no drag affordance, detach badges visible but non-interactive.

- [ ] **Step 13: Reset the dev DB**

```
npx tsx --env-file=.env.local -e "
import('./lib/db/client').then(async ({ db }) => {
  const { eq } = await import('drizzle-orm')
  const { clients } = await import('./lib/db/schema')
  await db.update(clients).set({ dashboardConfig: null }).where(eq(clients.slug, '<SLUG>'))
})"
```

- [ ] **Step 14: Production build sanity**

Run: `npm run build`
Expected: succeeds. No new ESLint errors.

- [ ] **Step 15: Final commit (if any tiny fixes surfaced)**

```bash
git status
# if there are fixes:
git add -p
git commit -m "fix(dashboard): smoke-test cleanups"
```

---

## Definition of Done — checklist

- [ ] A dashboard route renders a client's `DashboardConfig` as a grid of Metric Blocks. (Task 8)
- [ ] Each block shows name / formatted number / delta (hidden when no comparison) and a correct state for each `BlockError`. (Tasks 3, 4, 9)
- [ ] Global control batches Date Range + Compare To and applies on **Apply**, re-resolving inheriting blocks only. (Tasks 5, 9 step 6)
- [ ] A block can override the range, shows a detach badge, and resets to inherit via the badge. (Tasks 4, 9 steps 8–9)
- [ ] Blocks reorder via drag-and-drop and delete with confirmation; layout persists through `saveDashboardConfig`. (Tasks 6, 9 steps 10–11)
- [ ] Brand-coherent; loading/empty/error states covered. (Tasks 3, 4)
- [ ] No edits to frozen #1 / #2 files. (verified by `git diff --stat` at end)
