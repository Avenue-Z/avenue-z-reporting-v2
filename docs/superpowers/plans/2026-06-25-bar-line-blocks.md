# Bar + Line Block Kinds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the first two non-KPI block kinds — bar and line charts — end-to-end on the configurable dashboard: page-route dispatcher cases, new chart-body RSCs that stream via Suspense over sub-project #2's `GroupedResult` / `SeriesResult`, additive optional props on the existing Recharts wrappers, a kind step in the add-block dialog, and per-kind manual builders.

**Architecture:** Sub-project #3 of [docs/superpowers/specs/2026-06-24-self-service-blocks-and-layout-design.md](../specs/2026-06-24-self-service-blocks-and-layout-design.md), spec'd in [docs/superpowers/specs/2026-06-25-bar-line-block-kinds-design.md](../specs/2026-06-25-bar-line-block-kinds-design.md). Seven tasks, in order: (1) extract `<BlockChrome>` from `MetricBlockShell` as a pure refactor; (2) additive optional props on `BarChart` + `AreaChart` so they support horizontal bars, reference lines, x-tick formatters, and a compare overlay series; (3) pure chart-input adapters in `lib/dashboard/charts.ts`; (4) `<BarBlock>` + `<BarBlockBody>` server components streamed via Suspense; (5) `<LineBlock>` + `<LineBlockBody>` same shape; (6) page-route `renderBlockNode` gains `'bar'` and `'line'` cases; (7) add-block dialog gains a kind step + `<BarBuilder>` + `<LineBuilder>` + `<DimensionPicker>` + `<GranularityRadio>` + build-config extensions + preview-card kind dispatch. Each task ends with a green typecheck + commit. Existing KPI behavior is byte-identical at every commit boundary.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router (RSC + Suspense), Recharts ^3.7.0 (already installed, used in 5 report sections), `date-fns` (already installed, for x-axis tick formatting), `tsx` + `node:assert` unit tests.

## Global Constraints

- Branch is `feat/tc-dashboard-self-service-dash-system` (stacked on `feat/configurable-dashboard-rnd`). Do NOT change base; do NOT touch parent branch.
- TypeScript strict; no `any` in new or changed code.
- Tests are pure (no live API calls, no `.env` loading, no jsdom); run via `npx tsx <file>` using `node:assert` strict mode. Match the style of [lib/dashboard/persistence.test.ts](../../../lib/dashboard/persistence.test.ts) — IIFE blocks, no test runner.
- Chart wrappers in `components/charts/{bar-chart,area-chart}.tsx` are used by 5 existing report sections (TikTok / LinkedIn / Shopify / Reddit / Paid Search). All prop additions in Task 2 MUST be additive optional, with defaults that preserve today's rendering for those consumers.
- Bar default orientation = horizontal (spec §2: categories on Y axis, value on X). Vertical (column) is opt-in via `orientation="vertical"`.
- Line v1 is single-leaf, single-line. Multi-leaf line is v2 (spec §12).
- Compare overlay renders when `hasCompare === true` (per-row for bar, per-point for line); dimmed second series.
- `<BlockChrome>` extraction in Task 1 is a pure refactor — Task 1 must not change KPI rendering at all (test by running the production app on a KPI dashboard before committing).
- Cache key prefixes from sub-project #2 (`sm-grouped`, `sm-series`, `tw-grouped`, `tw-series`) are load-bearing; this plan does not change them.
- Aggregate + calculated bindings are scalar-only (sub-project #2's invariant). Bar/Line builders only emit leaf bindings.
- One commit per task; conventional prefix `feat(dashboard):` or `feat(charts):` or `refactor(dashboard):`; footer:
  ```
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  ```
- Each task ends with `./node_modules/.bin/tsc --noEmit` clean before commit.

---

### Task 1: Extract `<BlockChrome>` from `MetricBlockShell`

Pure refactor: move the kebab-menu + popover + range-override + drift-badge logic out of the inner `BlockShell` function (currently lines 123-287 of `components/dashboard/metric-block.tsx`) into a standalone `<BlockChrome>` client component that any block kind can wrap. `MetricBlockShell` keeps the same public prop signature and now renders `<BlockChrome>` around a `<KpiBlockBody>` body. No KPI behavior change.

**Files:**
- Create: `components/dashboard/block-chrome.tsx`
- Create: `components/dashboard/blocks/kpi-block-body.tsx`
- Modify: `components/dashboard/metric-block.tsx` (collapse to `<BlockChrome>` + `<KpiBlockBody>`)
- Modify: `components/dashboard/metric-block-states.tsx` (export `BlockBodyError`)

**Interfaces:**
- Produces: `BlockChrome({ block, canEdit, slug, config, activeDefault, children })` — accepts any ReactNode body. Wraps it in a `relative` div + kebab popover + drift badge.
- Produces: `KpiBlockBody({ name, value, delta, sub, isOverridden, badge })` — Tremor-shaped KPI card body, pure presentation. Receives the (already-resolved or Suspense-wrapped) `value`/`delta`/`sub` ReactNodes.
- Produces: `BlockBodyError({ name, error, slug })` — title row + small body, sized for chart cards. Reuses `BlockValueError` from `metric-block-states.tsx` internally.
- `MetricBlockShell` public signature unchanged (still accepts `{ block, canEdit, slug, config, activeDefault, value, delta, sub }`).

- [ ] **Step 1: Create the kpi-body component file**

Create `components/dashboard/blocks/kpi-block-body.tsx`:

```tsx
import type { ReactNode } from 'react'

export interface KpiBlockBodyProps {
  name: string
  value: ReactNode
  delta: ReactNode
  sub?: ReactNode
  badge?: ReactNode
}

/** KPI-shaped body card. Pure presentation — value/delta/sub are pre-built ReactNodes
 *  (typically Suspense-wrapped on the server). The chrome is supplied by <BlockChrome>. */
export function KpiBlockBody({ name, value, delta, sub, badge }: KpiBlockBodyProps) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 min-h-[140px]">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      {badge && <div className="mt-2">{badge}</div>}
      <div className="mt-2">{value}</div>
      <div className="mt-1">{delta}</div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Create the chrome component file**

Create `components/dashboard/block-chrome.tsx`. Copy the body of `BlockShell` from `components/dashboard/metric-block.tsx:123-287` verbatim, **and** the `DetachBadge` + `ConfirmRow` helpers, then add a new public top-level export that owns the state previously inside `MetricBlockShell`:

```tsx
'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { saveDashboardConfig } from '@/app/actions/dashboard'
import { getMainLabel } from '@/components/layout/date-range-picker'
import { setBlockRange, resetBlockRange, removeBlock } from './config-mutations'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

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

export interface BlockChromeProps {
  block: PersistedBlock
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
  /** The kind-specific body card (KpiBlockBody, BarBlockBody, LineBlockBody, …). */
  children: ReactNode
  /** Optional badge slot rendered inside the body — for kinds that surface the
   *  drift badge themselves (KPI). Bar/Line pass their own; default = none. */
  renderBadge?: (badge: ReactNode | null) => ReactNode
}

/** Shared block chrome: relative positioning + kebab popover + range override + drift badge.
 *  Body content is supplied as `children`. State + save logic owned here once. */
export function BlockChrome({ block, canEdit, slug, config, activeDefault, children }: BlockChromeProps) {
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

  return (
    <div className="relative">
      {children}

      {canEdit && (
        <Popover open={menuOpen} onOpenChange={(open) => (open ? setMenuOpen(true) : (setMenuOpen(false), setView('menu')))}>
          <PopoverTrigger asChild>
            <button
              aria-label={`Edit ${block.name}`}
              className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-white/10 hover:text-white"
            >
              ⋯
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 border-white/[0.08] bg-[#1a1a1a] p-2" align="end" sideOffset={4}>
            {view === 'menu' && (
              <div className="flex flex-col">
                <button className="px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.06]" onClick={() => setView('range')}>Set range…</button>
                {isOverridden && (
                  <button className="px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.06]" onClick={() => setView('confirm-reset')}>Reset to inherit</button>
                )}
                <button className="px-3 py-2 text-left text-[13px] text-[#FF6666] hover:bg-white/[0.06]" onClick={() => setView('confirm-delete')}>Delete block</button>
              </div>
            )}

            {view === 'range' && (
              <div className="flex flex-col">
                <p className="px-2 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Date Range</p>
                <div className="max-h-48 overflow-y-auto">
                  {PRESETS.map((p) => (
                    <button key={p.value} onClick={() => setDraftDate(p.value)}
                      className={cn('block w-full px-3 py-1.5 text-left text-[13px] hover:bg-white/[0.06]', p.value === draftDate ? 'font-bold text-brand-cyan' : 'text-white/80')}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="px-2 pb-1 pt-3 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Compare To</p>
                {COMPARES.map((c) => (
                  <button key={String(c.value)} onClick={() => setDraftCompare(c.value)}
                    className={cn('block w-full px-3 py-1.5 text-left text-[13px] hover:bg-white/[0.06]', c.value === draftCompare ? 'font-bold text-brand-cyan' : 'text-white/80')}>
                    {c.label}
                  </button>
                ))}
                <div className="mt-2 flex justify-end gap-2">
                  <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={() => setView('menu')} disabled={pending}>Cancel</button>
                  <button className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
                    onClick={applyOverride} disabled={pending}>
                    {pending ? 'Saving…' : 'Apply'}
                  </button>
                </div>
              </div>
            )}

            {view === 'confirm-reset' && (
              <ConfirmRow question="Reset this block to inherit the global range?" confirmLabel="Reset" pending={pending} onCancel={() => setView('menu')} onConfirm={confirmReset} />
            )}

            {view === 'confirm-delete' && (
              <ConfirmRow question="Delete this block? This cannot be undone." confirmLabel="Delete" destructive pending={pending} onCancel={() => setView('menu')} onConfirm={confirmDelete} />
            )}

            {errorMsg && <p className="mt-2 px-2 text-[11px] text-[#FF6666]">Error: {errorMsg}</p>}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

/** Inline detached-range badge. Public so KPI body can render it inside its card. */
export function DetachBadge({ label, canEdit, onReset }: { label: string; canEdit: boolean; onReset: () => void }) {
  const cls = 'inline-flex w-fit rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-cyan'
  if (canEdit) return <button onClick={onReset} className={`${cls} hover:bg-brand-cyan/20`}>Detached · {label}</button>
  return <span className={cls}>Detached · {label}</span>
}

function ConfirmRow({ question, confirmLabel, destructive = false, pending, onCancel, onConfirm }: {
  question: string; confirmLabel: string; destructive?: boolean; pending: boolean; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <div className="flex flex-col gap-3 p-2">
      <p className="text-[13px] text-white/90">{question}</p>
      <div className="flex justify-end gap-2">
        <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={onCancel} disabled={pending}>Cancel</button>
        <button className={cn('rounded-md px-3 py-1.5 text-xs font-bold', destructive ? 'bg-[#FF4444]/80 text-white hover:bg-[#FF4444]' : 'bg-brand-cyan text-black hover:opacity-90')}
          onClick={onConfirm} disabled={pending}>
          {pending ? 'Working…' : confirmLabel}
        </button>
      </div>
    </div>
  )
}

/** Compute the per-block "Detached" badge label (or null if not overridden). */
export function detachBadgeLabel(block: PersistedBlock): string | null {
  return block.range !== null ? getMainLabel(block.range.dateRange) : null
}
```

- [ ] **Step 3: Add `BlockBodyError` to states file**

Open `components/dashboard/metric-block-states.tsx`. At the bottom of the file, before the closing of the module (after `BlockValueError`), append:

```tsx
/** Card-sized error body for chart blocks (Bar/Line). Reuses BlockValueError's copy table. */
export function BlockBodyError({ name, error, slug }: { name: string; error: BlockError; slug: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 h-full flex flex-col">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <div className="mt-auto"><BlockValueError error={error} slug={slug} /></div>
    </div>
  )
}
```

- [ ] **Step 4: Collapse `MetricBlockShell` to use `<BlockChrome>` + `<KpiBlockBody>`**

Open `components/dashboard/metric-block.tsx`. Replace the **entire file contents** (332 lines) with:

```tsx
'use client'

import { BlockChrome, DetachBadge, detachBadgeLabel } from './block-chrome'
import { KpiBlockBody } from './blocks/kpi-block-body'
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
  /** Optional sub-label slot (rendered below the delta — e.g. KPI subLabel "13-wk avg kr251"). */
  sub?: ReactNode
}

/** KPI variant: wraps a KpiBlockBody in shared BlockChrome. Public signature
 *  unchanged from prior versions — this file is now a thin composition wrapper. */
export function MetricBlockShell({ block, canEdit, slug, config, activeDefault, value, delta, sub }: MetricBlockShellProps) {
  const label = detachBadgeLabel(block)
  // The badge is a static indicator in this refactor — onReset is a no-op since
  // popover state lives inside <BlockChrome> now. Users still reach Reset via the kebab.
  const badge = label !== null ? <DetachBadge label={label} canEdit={canEdit} onReset={() => {}} /> : null

  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <KpiBlockBody name={block.name} value={value} delta={delta} sub={sub} badge={badge} />
    </BlockChrome>
  )
}
```

Note: the `DetachBadge.onReset` previously opened the popover's `confirm-reset` view. In Task 1 the popover state lives in `<BlockChrome>`, so clicking the badge is a visual indicator only (regression accepted for v1 — clicking the kebab still reaches Reset directly). If you prefer to preserve auto-open, lift the chrome's `setMenuOpen`/`setView` via a `chromeRef` callback prop; spec deems this out of scope for the refactor.

- [ ] **Step 5: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Run all existing test suites — confirm zero regressions**

Run each:
```
npx tsx lib/dashboard/types.test.ts
npx tsx lib/dashboard/persistence.test.ts
npx tsx lib/dashboard/group-join.test.ts
npx tsx lib/supermetrics/buckets.test.ts
npx tsx lib/triplewhale/queries.test.ts
npx tsx lib/dashboard/adapters/supermetrics.test.ts
npx tsx lib/dashboard/adapters/triplewhale.test.ts
npx tsx lib/dashboard/resolve.test.ts
npx tsx lib/dashboard/aggregate.test.ts
npx tsx components/dashboard/config-mutations.test.ts
npx tsx components/dashboard/block-grid-defaults.test.ts
npx tsx components/dashboard/blocks/kpi-annotations.test.ts
```
Expected: all `ok`.

- [ ] **Step 7: Smoke-test KPI dashboard in dev**

Run: `npm run dev`
Load: `http://localhost:3000/dashboard/<any-slug>/configurable-dashboard`
Expected:
- All KPI blocks render with values + deltas + sub-labels as before.
- Kebab popover opens/closes; "Set range…" / "Reset to inherit" / "Delete block" all work.
- Drift badge appears on overridden blocks.
- No console errors.

Kill dev server (`Ctrl+C`).

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/block-chrome.tsx components/dashboard/blocks/kpi-block-body.tsx components/dashboard/metric-block.tsx components/dashboard/metric-block-states.tsx
git commit -m "$(cat <<'EOF'
refactor(dashboard): extract <BlockChrome> from MetricBlockShell

Splits Paul's MetricBlockShell into three pieces:
- <BlockChrome> (NEW): relative wrapper + kebab popover + range override
  + delete/reset confirmations. Owns the per-block edit state. Any block
  kind can wrap a body in it.
- <KpiBlockBody> (NEW): pure KPI presentation card (value + delta + sub).
- MetricBlockShell: thin composition that wraps <KpiBlockBody> in <BlockChrome>.

Also adds <BlockBodyError> (card-sized error body) to metric-block-states.tsx
for use by Bar/Line bodies in subsequent tasks.

Pure refactor — no KPI behavior change. All 12 test suites green.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Additive optional props on `BarChart` + `AreaChart`

Add four optional props across the two existing Recharts wrappers so Bar/Line block bodies can render horizontal bars, target/ceiling reference lines, formatted x-axis ticks, and a dimmed compare-overlay series. Every prop defaults to today's behavior — zero impact on the 5 existing report consumers.

**Files:**
- Modify: `components/charts/bar-chart.tsx`
- Modify: `components/charts/area-chart.tsx`

**Interfaces:**
- Produces: `BarChart` gains `orientation?: 'horizontal' | 'vertical'` (default `'vertical'`); `referenceLines?: { value: number; color: string; label?: string }[]` (default `[]`).
- Produces: `AreaChart` gains `xTickFormatter?: (raw: string) => string` (default identity); `compareDataKey?: string` (default `undefined` — no compare overlay).

- [ ] **Step 1: Modify `BarChart` to support `orientation` and `referenceLines`**

Open `components/charts/bar-chart.tsx`. Replace the **entire file contents** with:

```tsx
'use client'

import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { CHART_COLORS } from '@/lib/constants'

export interface BarChartReferenceLine {
  value: number
  color: string
  label?: string
}

interface BarChartProps {
  data: Record<string, string | number>[]
  xKey: string
  yKeys: { key: string; color?: string; label?: string }[]
  height?: number
  /** 'vertical' (default, today's behavior): categories on X, values on Y.
   *  'horizontal': categories on Y, values on X. */
  orientation?: 'horizontal' | 'vertical'
  /** Value-axis reference lines (drawn on the value axis regardless of orientation). */
  referenceLines?: BarChartReferenceLine[]
}

export function BarChart({
  data,
  xKey,
  yKeys,
  height = 300,
  orientation = 'vertical',
  referenceLines = [],
}: BarChartProps) {
  const horizontal = orientation === 'horizontal'
  // In Recharts, `layout="vertical"` produces horizontal bars (value on X is the bar length).
  // Naming is famously confusing; we map our external prop to Recharts' internal:
  const rechartsLayout = horizontal ? 'vertical' : 'horizontal'

  // Category axis carries dataKey (xKey); value axis is numeric.
  const categoryAxis = horizontal
    ? <YAxis dataKey={xKey} type="category" tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={false} tickLine={false} width={140} />
    : <XAxis dataKey={xKey} tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} />
  const valueAxis = horizontal
    ? <XAxis type="number" tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} />
    : <YAxis tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={false} tickLine={false} />

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart data={data} layout={rechartsLayout} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          {categoryAxis}
          {valueAxis}
          <Tooltip
            contentStyle={{
              background: '#272727',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: '13px',
            }}
          />
          {yKeys.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label ?? series.key}
              fill={series.color ?? CHART_COLORS.primary}
              radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            />
          ))}
          {referenceLines.map((rl, i) => (
            // On horizontal bars, reference line goes on X axis (value axis); on vertical, on Y.
            horizontal
              ? <ReferenceLine key={`rl-${i}`} x={rl.value} stroke={rl.color} strokeDasharray="4 2" label={rl.label ? { value: rl.label, fill: rl.color, fontSize: 11, position: 'top' } : undefined} />
              : <ReferenceLine key={`rl-${i}`} y={rl.value} stroke={rl.color} strokeDasharray="4 2" label={rl.label ? { value: rl.label, fill: rl.color, fontSize: 11, position: 'right' } : undefined} />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Modify `AreaChart` to support `xTickFormatter` and `compareDataKey`**

Open `components/charts/area-chart.tsx`. Replace the **entire file contents** with:

```tsx
'use client'

import {
  ResponsiveContainer,
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { CHART_COLORS } from '@/lib/constants'

interface AreaChartProps {
  data: Record<string, string | number>[]
  xKey: string
  yKeys: { key: string; color?: string; label?: string }[]
  height?: number
  /** Optional formatter applied to each x-axis tick label (e.g. ISO bucket → 'Jun 24'). */
  xTickFormatter?: (raw: string) => string
  /** When set, renders an extra dimmed Area for prior-period overlay. The key should
   *  exist on each data row (e.g. 'prevValue'). */
  compareDataKey?: string
}

export function AreaChart({
  data,
  xKey,
  yKeys,
  height = 300,
  xTickFormatter,
  compareDataKey,
}: AreaChartProps) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsAreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {yKeys.map((series, i) => {
              const color = series.color ?? CHART_COLORS.primary
              return (
                <linearGradient key={series.key} id={`gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              )
            })}
            {compareDataKey && (
              <linearGradient id="gradient-compare" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
              </linearGradient>
            )}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey={xKey}
            tick={{ fill: '#8A8A8A', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            tickLine={false}
            tickFormatter={xTickFormatter}
          />
          <YAxis tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: '#272727',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: '13px',
            }}
          />
          {compareDataKey && (
            <Area
              type="monotone"
              dataKey={compareDataKey}
              name="Prior"
              stroke="rgba(255,255,255,0.35)"
              fill="url(#gradient-compare)"
              strokeWidth={1.5}
              strokeOpacity={0.4}
              fillOpacity={1}
            />
          )}
          {yKeys.map((series, i) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label ?? series.key}
              stroke={series.color ?? CHART_COLORS.primary}
              fill={`url(#gradient-${i})`}
              strokeWidth={2}
            />
          ))}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Smoke-test existing report consumers**

Run: `npm run dev`
Load any one of the 5 existing report sections in the browser (e.g. `http://localhost:3000/dashboard/<slug>/reports/paid-search`).
Expected:
- BarChart still renders as vertical columns (categories on X, values on Y) — default `orientation`.
- AreaChart still renders without overlay or formatter.
- No console errors.

Kill dev server.

- [ ] **Step 5: Commit**

```bash
git add components/charts/bar-chart.tsx components/charts/area-chart.tsx
git commit -m "$(cat <<'EOF'
feat(charts): additive optional props for dashboard block charts

BarChart:
- orientation?: 'horizontal' | 'vertical' (default 'vertical' = today's behavior)
- referenceLines?: { value, color, label? }[] (default [])
  Drawn on the value axis; supports the target/ceiling overlay spec'd for Bar blocks.

AreaChart:
- xTickFormatter?: (raw) => string (default identity) for granularity-aware ticks
- compareDataKey?: string (default undefined) renders a dimmed Area for prior-period overlay.

All four props are additive; existing 5 report-section consumers render
identically with defaults.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Pure chart-input adapters in `lib/dashboard/charts.ts`

Build the pure conversion layer: `GroupedResult` → `BarChartInput`, `SeriesResult` → `LineChartInput`, plus the granularity-aware bucket-label pattern. No React, no fetch — all unit-tested.

**Files:**
- Create: `lib/dashboard/charts.ts`
- Create: `lib/dashboard/charts.test.ts`
- Create: `components/dashboard/blocks/chart-types.ts` (the input shape interfaces, in their consumer's tree)

**Interfaces:**
- Consumes: `GroupedResult`, `SeriesResult`, `Granularity`, `MetricFormat` from `lib/dashboard/types`.
- Produces: `BarChartInput { data: { dim: string; value: number; prevValue?: number }[]; hasCompare: boolean; target?: number; ceiling?: number }` in `components/dashboard/blocks/chart-types.ts`.
- Produces: `LineChartInput { data: { bucket: string; bucketLabel: string; value: number; prevValue?: number }[]; hasCompare: boolean; granularity: Granularity }` in `components/dashboard/blocks/chart-types.ts`.
- Produces: `toBarChartInput(r, target?, ceiling?): BarChartInput`.
- Produces: `toLineChartInput(r): LineChartInput`.
- Produces: `bucketLabelPattern(g: Granularity): string` — `'MMM d'` / `"'Wk' w"` / `'MMM yy'`.

- [ ] **Step 1: Write failing tests**

Create `lib/dashboard/charts.test.ts`:

```ts
// lib/dashboard/charts.test.ts
// Run: npx tsx lib/dashboard/charts.test.ts
import { strict as assert } from 'node:assert'
import { toBarChartInput, toLineChartInput, bucketLabelPattern } from './charts'
import type { GroupedResult, SeriesResult } from './types'

// bucketLabelPattern: documented format strings.
assert.equal(bucketLabelPattern('day'), 'MMM d')
assert.equal(bucketLabelPattern('week'), "'Wk' w")
assert.equal(bucketLabelPattern('month'), 'MMM yy')

// toBarChartInput: rows with single-key dim → flattened 'dim' string.
{
  const r: Extract<GroupedResult, { ok: true }> = {
    ok: true,
    format: 'currency',
    rows: [
      { dim: { Country: 'US' }, value: 1000 },
      { dim: { Country: 'CA' }, value: 500 },
    ],
  }
  const out = toBarChartInput(r)
  assert.deepEqual(out.data, [
    { dim: 'US', value: 1000 },
    { dim: 'CA', value: 500 },
  ])
  assert.equal(out.hasCompare, false)
  assert.equal(out.target, undefined)
  assert.equal(out.ceiling, undefined)
}

// toBarChartInput: any row with prevValue → hasCompare true; prevValue carried through.
{
  const r: Extract<GroupedResult, { ok: true }> = {
    ok: true,
    format: 'number',
    rows: [
      { dim: { Channel: 'Google' }, value: 100, prevValue: 80 },
      { dim: { Channel: 'Meta' },   value: 50 },
    ],
  }
  const out = toBarChartInput(r)
  assert.equal(out.hasCompare, true)
  assert.equal(out.data[0].prevValue, 80)
  assert.equal('prevValue' in out.data[1], false)
}

// toBarChartInput: undefined value (prior-only dim) coerced to 0 for chart rendering.
{
  const r: Extract<GroupedResult, { ok: true }> = {
    ok: true,
    format: 'number',
    rows: [{ dim: { Channel: 'New' }, value: undefined, prevValue: 25 }],
  }
  const out = toBarChartInput(r)
  assert.equal(out.data[0].value, 0)
  assert.equal(out.data[0].prevValue, 25)
}

// toBarChartInput: target + ceiling passed through.
{
  const r: Extract<GroupedResult, { ok: true }> = { ok: true, format: 'number', rows: [] }
  const out = toBarChartInput(r, 250, 280)
  assert.equal(out.target, 250)
  assert.equal(out.ceiling, 280)
}

// toBarChartInput: empty rows produce empty data + hasCompare false.
{
  const r: Extract<GroupedResult, { ok: true }> = { ok: true, format: 'number', rows: [] }
  const out = toBarChartInput(r)
  assert.deepEqual(out.data, [])
  assert.equal(out.hasCompare, false)
}

// toLineChartInput: bucketLabel produced via date-fns format(bucketLabelPattern(g)).
{
  const r: Extract<SeriesResult, { ok: true }> = {
    ok: true,
    format: 'currency',
    granularity: 'day',
    points: [
      { bucket: '2026-06-22', value: 100 },
      { bucket: '2026-06-23', value: 150 },
    ],
  }
  const out = toLineChartInput(r)
  assert.equal(out.granularity, 'day')
  assert.equal(out.hasCompare, false)
  assert.equal(out.data.length, 2)
  assert.equal(out.data[0].bucket, '2026-06-22')
  // date-fns format of 2026-06-22 with 'MMM d' = 'Jun 22'.
  assert.equal(out.data[0].bucketLabel, 'Jun 22')
}

// toLineChartInput: hasCompare true iff any point has prevValue.
{
  const r: Extract<SeriesResult, { ok: true }> = {
    ok: true, format: 'number', granularity: 'week',
    points: [
      { bucket: '2026-06-22', value: 10, prevValue: 8 },
      { bucket: '2026-06-29', value: 12 },
    ],
  }
  const out = toLineChartInput(r)
  assert.equal(out.hasCompare, true)
  assert.equal(out.data[0].prevValue, 8)
  assert.equal('prevValue' in out.data[1], false)
  // 2026-06-22 is week 26 → "'Wk' w" → 'Wk 26'.
  assert.equal(out.data[0].bucketLabel, 'Wk 26')
}

// toLineChartInput: empty points → empty data + hasCompare false.
{
  const r: Extract<SeriesResult, { ok: true }> = { ok: true, format: 'number', granularity: 'month', points: [] }
  const out = toLineChartInput(r)
  assert.deepEqual(out.data, [])
  assert.equal(out.hasCompare, false)
}

console.log('ok')
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx lib/dashboard/charts.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the input-shape types file**

Create `components/dashboard/blocks/chart-types.ts`:

```ts
import type { Granularity } from '@/lib/dashboard/types'

export interface BarChartInput {
  data: { dim: string; value: number; prevValue?: number }[]
  hasCompare: boolean
  target?: number
  ceiling?: number
}

export interface LineChartInput {
  data: { bucket: string; bucketLabel: string; value: number; prevValue?: number }[]
  hasCompare: boolean
  granularity: Granularity
}
```

- [ ] **Step 4: Implement `lib/dashboard/charts.ts`**

Create `lib/dashboard/charts.ts`:

```ts
import { format as formatDate, parseISO } from 'date-fns'
import type { Granularity, GroupedResult, SeriesResult } from './types'
import type { BarChartInput, LineChartInput } from '@/components/dashboard/blocks/chart-types'

/** Granularity-aware x-axis tick format string. Consumed by AreaChart xTickFormatter. */
export function bucketLabelPattern(g: Granularity): string {
  if (g === 'day') return 'MMM d'         // Jun 24
  if (g === 'week') return "'Wk' w"        // Wk 26
  return 'MMM yy'                          // Jun 26
}

/** Pure: GroupedResult (ok) → BarChartInput.
 *  - Flattens single-key dim object to a `dim` string.
 *  - Coerces undefined values (prior-only dims) to 0 for chart rendering.
 *  - hasCompare = any row has prevValue. */
export function toBarChartInput(
  r: Extract<GroupedResult, { ok: true }>,
  target?: number,
  ceiling?: number,
): BarChartInput {
  const data = r.rows.map((row) => {
    const dimKey = Object.keys(row.dim)[0] ?? 'dim'
    const dim = row.dim[dimKey] ?? ''
    const value = row.value ?? 0
    const out: { dim: string; value: number; prevValue?: number } = { dim, value }
    if (row.prevValue !== undefined) out.prevValue = row.prevValue
    return out
  })
  const hasCompare = r.rows.some((row) => row.prevValue !== undefined)
  const result: BarChartInput = { data, hasCompare }
  if (target !== undefined) result.target = target
  if (ceiling !== undefined) result.ceiling = ceiling
  return result
}

/** Pure: SeriesResult (ok) → LineChartInput.
 *  - Adds a formatted `bucketLabel` per point via date-fns.
 *  - hasCompare = any point has prevValue. */
export function toLineChartInput(r: Extract<SeriesResult, { ok: true }>): LineChartInput {
  const pattern = bucketLabelPattern(r.granularity)
  const data = r.points.map((p) => {
    const out: { bucket: string; bucketLabel: string; value: number; prevValue?: number } = {
      bucket: p.bucket,
      bucketLabel: formatDate(parseISO(p.bucket), pattern),
      value: p.value,
    }
    if (p.prevValue !== undefined) out.prevValue = p.prevValue
    return out
  })
  const hasCompare = r.points.some((p) => p.prevValue !== undefined)
  return { data, hasCompare, granularity: r.granularity }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx tsx lib/dashboard/charts.test.ts`
Expected: `ok`.

- [ ] **Step 6: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/dashboard/charts.ts lib/dashboard/charts.test.ts components/dashboard/blocks/chart-types.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): pure chart-input adapters for Bar + Line blocks

- toBarChartInput(r, target?, ceiling?): flattens single-key dim object to
  a 'dim' string, coerces undefined values (prior-only dims) to 0, sets
  hasCompare iff any row carries prevValue, and passes target/ceiling through.
- toLineChartInput(r): adds a date-fns-formatted bucketLabel per point using
  the granularity-aware bucketLabelPattern. hasCompare iff any point has prevValue.
- bucketLabelPattern: 'MMM d' / "'Wk' w" / 'MMM yy' for day/week/month.

Pure functions; fully unit-tested.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `<BarBlock>` + `<BarBlockBody>` + `<ChartSkeleton>`

Async server components that render a Bar block by awaiting a `Promise<GroupedResult>`. Streamed via Suspense exactly like Paul's `<BlockValue>` pattern. Includes the shimmer skeleton (`<ChartSkeleton>`) used as the Suspense fallback.

**Files:**
- Create: `components/dashboard/chart-skeleton.tsx`
- Create: `components/dashboard/blocks/bar-block.tsx`
- Create: `components/dashboard/blocks/bar-block-body.tsx`

**Interfaces:**
- Consumes: `<BlockChrome>` (Task 1), `<BlockBodyError>` (Task 1), `BarChart` (Task 2), `toBarChartInput` + `BarChartInput` (Task 3), `GroupedResult`/`PersistedBlock`/`DashboardConfig` (sub-project #2).
- Produces: `<ChartSkeleton kind="bar" | "line" />` — full-height shimmer.
- Produces: `<BarBlock>` (RSC) with props `{ block, groupedPromise, canEdit, slug, config, activeDefault }`.
- Produces: `<BarBlockBody>` (async RSC) with props `{ name, groupedPromise, target, ceiling, format, slug }`.

- [ ] **Step 1: Create `<ChartSkeleton>`**

Create `components/dashboard/chart-skeleton.tsx`:

```tsx
/** Full-height shimmer used as the Suspense fallback for chart bodies (Bar + Line).
 *  Lives inside <BlockChrome>'s card so the block's name + chrome paint instantly. */
export function ChartSkeleton({ kind }: { kind: 'bar' | 'line' }) {
  return (
    <div
      className="h-full w-full min-h-[180px] animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.04]"
      aria-busy="true"
      aria-label={`Loading ${kind} chart`}
    />
  )
}
```

- [ ] **Step 2: Create `<BarBlockBody>`**

Create `components/dashboard/blocks/bar-block-body.tsx`:

```tsx
import { BarChart } from '@/components/charts/bar-chart'
import { BlockBodyError } from '../metric-block-states'
import { toBarChartInput } from '@/lib/dashboard/charts'
import type { GroupedResult, MetricFormat } from '@/lib/dashboard/types'

const TARGET_COLOR = '#5DD39E'   // green
const CEILING_COLOR = '#FF8A3D'  // orange
const COMPARE_COLOR = 'rgba(255,255,255,0.25)'

export interface BarBlockBodyProps {
  name: string
  groupedPromise: Promise<GroupedResult>
  target?: number
  ceiling?: number
  format: MetricFormat
  slug: string
}

/** Async server component: awaits the grouped promise and renders the bar chart card.
 *  On error / no-data, renders <BlockBodyError>. */
export async function BarBlockBody({ name, groupedPromise, target, ceiling, slug }: BarBlockBodyProps) {
  const r = await groupedPromise
  if (!r.ok) return <BlockBodyError name={name} error={r.error} slug={slug} />
  if (r.rows.length === 0) return <BlockBodyError name={name} error="no-data" slug={slug} />

  const input = toBarChartInput(r, target, ceiling)
  const yKeys = input.hasCompare
    ? [
        { key: 'value', label: 'Current' },
        { key: 'prevValue', label: 'Prior', color: COMPARE_COLOR },
      ]
    : [{ key: 'value' }]
  const referenceLines = [
    ...(input.target !== undefined  ? [{ value: input.target,  color: TARGET_COLOR,  label: `Target ${input.target}` }]  : []),
    ...(input.ceiling !== undefined ? [{ value: input.ceiling, color: CEILING_COLOR, label: `Ceiling ${input.ceiling}` }] : []),
  ]

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 h-full flex flex-col">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <div className="mt-3 flex-1 min-h-0">
        <BarChart
          data={input.data}
          xKey="dim"
          yKeys={yKeys}
          orientation="horizontal"
          referenceLines={referenceLines}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `<BarBlock>`**

Create `components/dashboard/blocks/bar-block.tsx`:

```tsx
import { Suspense } from 'react'
import { BlockChrome } from '../block-chrome'
import { ChartSkeleton } from '../chart-skeleton'
import { BarBlockBody } from './bar-block-body'
import type { DashboardConfig, GroupedResult, PersistedBlock } from '@/lib/dashboard/types'

export interface BarBlockProps {
  block: PersistedBlock
  groupedPromise: Promise<GroupedResult>
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}

/** Renders a Bar block: shared chrome + Suspense-streamed chart body. */
export function BarBlock({ block, groupedPromise, canEdit, slug, config, activeDefault }: BarBlockProps) {
  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <Suspense fallback={<ChartSkeleton kind="bar" />}>
        <BarBlockBody
          name={block.name}
          groupedPromise={groupedPromise}
          target={block.target}
          ceiling={block.ceiling}
          format={block.format}
          slug={slug}
        />
      </Suspense>
    </BlockChrome>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean. (BarBlock has no consumer yet — that lands in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/chart-skeleton.tsx components/dashboard/blocks/bar-block.tsx components/dashboard/blocks/bar-block-body.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): <BarBlock> + <BarBlockBody> + <ChartSkeleton>

<BarBlock> (server component): wraps <BarBlockBody> in <BlockChrome> with a
Suspense boundary fed by <ChartSkeleton fallback>. Streams the chart in
when the grouped promise resolves — same pattern as Paul's <BlockValue>.

<BarBlockBody> (async server): awaits Promise<GroupedResult>, runs
toBarChartInput, renders a horizontal BarChart with optional target/ceiling
reference lines and a dimmed compare overlay (per-bar prevValue) when
hasCompare. On error/no-data, renders <BlockBodyError>.

<ChartSkeleton>: shimmer rectangle sized to fill the card body.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `<LineBlock>` + `<LineBlockBody>`

Same shape as Task 4, swapped for `Promise<SeriesResult>` + `AreaChart`. Uses the new `xTickFormatter` + `compareDataKey` props from Task 2.

**Files:**
- Create: `components/dashboard/blocks/line-block.tsx`
- Create: `components/dashboard/blocks/line-block-body.tsx`

**Interfaces:**
- Consumes: `<BlockChrome>`, `<BlockBodyError>`, `<ChartSkeleton>`, `AreaChart`, `toLineChartInput` + `LineChartInput`, `SeriesResult`, `PersistedBlock`, `DashboardConfig`.
- Produces: `<LineBlock>` (RSC) with props `{ block, seriesPromise, canEdit, slug, config, activeDefault }`.
- Produces: `<LineBlockBody>` (async RSC) with props `{ name, seriesPromise, slug }` — `format` deliberately omitted (YAGNI; tooltip formatting is v2).

- [ ] **Step 1: Create `<LineBlockBody>`**

Create `components/dashboard/blocks/line-block-body.tsx`:

```tsx
import { AreaChart } from '@/components/charts/area-chart'
import { BlockBodyError } from '../metric-block-states'
import { toLineChartInput } from '@/lib/dashboard/charts'
import type { SeriesResult } from '@/lib/dashboard/types'

export interface LineBlockBodyProps {
  name: string
  seriesPromise: Promise<SeriesResult>
  slug: string
}

/** Async server component: awaits the series promise and renders the line chart card.
 *  On error / no-data, renders <BlockBodyError>. */
export async function LineBlockBody({ name, seriesPromise, slug }: LineBlockBodyProps) {
  const r = await seriesPromise
  if (!r.ok) return <BlockBodyError name={name} error={r.error} slug={slug} />
  if (r.points.length === 0) return <BlockBodyError name={name} error="no-data" slug={slug} />

  const input = toLineChartInput(r)

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 h-full flex flex-col">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <div className="mt-3 flex-1 min-h-0">
        <AreaChart
          data={input.data}
          xKey="bucketLabel"
          yKeys={[{ key: 'value', label: 'Current' }]}
          compareDataKey={input.hasCompare ? 'prevValue' : undefined}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `<LineBlock>`**

Create `components/dashboard/blocks/line-block.tsx`:

```tsx
import { Suspense } from 'react'
import { BlockChrome } from '../block-chrome'
import { ChartSkeleton } from '../chart-skeleton'
import { LineBlockBody } from './line-block-body'
import type { DashboardConfig, PersistedBlock, SeriesResult } from '@/lib/dashboard/types'

export interface LineBlockProps {
  block: PersistedBlock
  seriesPromise: Promise<SeriesResult>
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}

/** Renders a Line block: shared chrome + Suspense-streamed chart body. */
export function LineBlock({ block, seriesPromise, canEdit, slug, config, activeDefault }: LineBlockProps) {
  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <Suspense fallback={<ChartSkeleton kind="line" />}>
        <LineBlockBody
          name={block.name}
          seriesPromise={seriesPromise}
          slug={slug}
        />
      </Suspense>
    </BlockChrome>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/blocks/line-block.tsx components/dashboard/blocks/line-block-body.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): <LineBlock> + <LineBlockBody>

<LineBlock> (server component): wraps <LineBlockBody> in <BlockChrome> with
a Suspense boundary fed by <ChartSkeleton fallback>. Streams the chart in
when the series promise resolves.

<LineBlockBody> (async server): awaits Promise<SeriesResult>, runs
toLineChartInput, renders an AreaChart with bucketLabel x-axis (date-fns
formatted) and an optional dimmed compare overlay (prevValue) when
hasCompare. On error/no-data, renders <BlockBodyError>.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Page-route dispatcher — `'bar'` and `'line'` cases

Extend `renderBlockNode` in `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx` to handle the two new kinds by spinning a `groupedPromise` / `seriesPromise` via `resolveGroupedBlock` / `resolveSeriesBlock` (from sub-project #2) and handing it to `<BarBlock>` / `<LineBlock>`. KPI behavior unchanged.

**Files:**
- Modify: `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`

**Interfaces:**
- Consumes: `<BarBlock>`, `<LineBlock>` (Tasks 4–5); `resolveGroupedBlock`, `resolveSeriesBlock` (sub-project #2).
- Produces: no new exports. The default-case `<UnsupportedBlockState>` remains for `'table' | 'narrative' | 'header'`.

- [ ] **Step 1: Modify `renderBlockNode`**

Open `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`. At the top of the file, replace the imports block (currently lines 1-16) with:

```tsx
import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getClientBySlug, getDashboardConfig } from '@/lib/db/queries'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { resolveBlock, resolveGroupedBlock, resolveSeriesBlock } from '@/lib/dashboard/resolve'
import { resolveCompareIso } from '@/lib/paid-search/base'
import { Header } from '@/components/layout/header'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { MetricBlockShell } from '@/components/dashboard/metric-block'
import { BlockValue } from '@/components/dashboard/block-value'
import { BlockDelta } from '@/components/dashboard/block-delta'
import { ValueSkeleton, DeltaSkeleton, EmptyDashboardState } from '@/components/dashboard/metric-block-states'
import { UnsupportedBlockState } from '@/components/dashboard/blocks/unsupported-block'
import { BarBlock } from '@/components/dashboard/blocks/bar-block'
import { LineBlock } from '@/components/dashboard/blocks/line-block'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'
```

Then replace the `renderBlockNode` function (currently lines 85-139) with:

```tsx
/** Per-block kind dispatcher. 'kpi' → progressive-streaming KPI tile via
 *  MetricBlockShell + BlockValue + BlockDelta. 'bar'/'line' → BarBlock/LineBlock,
 *  fed by resolveGroupedBlock/resolveSeriesBlock from sub-project #2. */
function renderBlockNode(
  block: PersistedBlock,
  activeDefault: { dateRange: string; compareRange: string | null },
  clientSlug: string,
  canEdit: boolean,
  config: DashboardConfig,
): ReactNode {
  const kind = block.kind ?? 'kpi'
  switch (kind) {
    case 'kpi': {
      const eff = block.range ?? activeDefault
      const ctx = { slug: clientSlug }
      const blockNoRange = { ...block, range: null }
      const valuePromise = resolveBlock(blockNoRange, { dateRange: eff.dateRange, compareRange: null }, ctx)
      const compareIso = resolveCompareIso(eff.dateRange, eff.compareRange)
      const prevPromise = compareIso
        ? resolveBlock(blockNoRange, { dateRange: compareIso, compareRange: null }, ctx)
        : null

      return (
        <MetricBlockShell
          block={block}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
          value={
            <Suspense fallback={<ValueSkeleton />}>
              <BlockValue valuePromise={valuePromise} slug={clientSlug} target={block.target} ceiling={block.ceiling} />
            </Suspense>
          }
          delta={
            <Suspense fallback={<DeltaSkeleton />}>
              <BlockDelta valuePromise={valuePromise} prevPromise={prevPromise} compareRange={eff.compareRange} />
            </Suspense>
          }
          sub={block.subLabel}
        />
      )
    }
    case 'bar': {
      const eff = block.range ?? activeDefault
      const groupedPromise = resolveGroupedBlock(
        block,
        { dateRange: eff.dateRange, compareRange: eff.compareRange },
        { slug: clientSlug },
      )
      return (
        <BarBlock
          block={block}
          groupedPromise={groupedPromise}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
    case 'line': {
      const eff = block.range ?? activeDefault
      const seriesPromise = resolveSeriesBlock(
        block,
        { dateRange: eff.dateRange, compareRange: eff.compareRange },
        { slug: clientSlug },
      )
      return (
        <LineBlock
          block={block}
          seriesPromise={seriesPromise}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
    default:
      return <UnsupportedBlockState kind={kind} name={block.name} />
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: "Compiled successfully" (no type errors, no missing imports).

- [ ] **Step 4: Smoke-test dispatcher with a hand-inserted Bar block**

Open Drizzle Studio or your Neon SQL editor and update a test client's `dashboardConfig` to insert one bar block (replace `<test-slug>` and a valid SM metric/account for your env):

```sql
-- inspect first to find your test slug + see the existing config
SELECT slug, dashboard_config FROM clients WHERE slug = '<test-slug>';

-- then update by hand, appending one bar block:
UPDATE clients
SET dashboard_config = jsonb_set(
  dashboard_config,
  '{blocks}',
  (dashboard_config->'blocks') || jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', 'Smoke: Spend by Channel',
    'kind', 'bar',
    'format', 'currency',
    'range', null,
    'binding', jsonb_build_object(
      'source', 'supermetrics',
      'dsId', 'AW',
      'metricField', 'Cost',
      'account', '<your-test-account-id>',
      'dimensions', jsonb_build_array('Network')
    )
  )::jsonb
)
WHERE slug = '<test-slug>';
```

Run: `npm run dev`
Load: `http://localhost:3000/dashboard/<test-slug>/configurable-dashboard`
Expected:
- ChartSkeleton paints immediately.
- Horizontal bar chart resolves within ~1-3 seconds.
- Kebab popover works on the bar block (Set range / Delete).
- All KPI blocks still render correctly.

Kill dev server. **Roll back the test row** to avoid leaving demo data:
```sql
UPDATE clients
SET dashboard_config = jsonb_set(
  dashboard_config,
  '{blocks}',
  (SELECT jsonb_agg(b) FROM jsonb_array_elements(dashboard_config->'blocks') AS b
   WHERE b->>'name' <> 'Smoke: Spend by Channel')
)
WHERE slug = '<test-slug>';
```

(If your local env doesn't have a working Supermetrics account, the block will resolve to `<BlockBodyError error="disconnected">` — that's still a successful smoke test of the dispatcher.)

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/[clientSlug]/configurable-dashboard/page.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): renderBlockNode dispatches 'bar' and 'line' kinds

Extends the page-route dispatcher with two new cases:
- 'bar' spins a Promise<GroupedResult> via resolveGroupedBlock (sub-project #2)
  and hands it to <BarBlock>.
- 'line' spins a Promise<SeriesResult> via resolveSeriesBlock and hands it
  to <LineBlock>.

KPI dispatch unchanged. Default case still falls through to
<UnsupportedBlockState> for table/narrative/header (sub-project #4).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Add-block dialog kind step + Bar/Line builders + preview dispatch

Add a "Block kind" step as the first question in the add-block dialog, plus the per-kind manual builders (`<BarBuilder>`, `<LineBuilder>`) and their supporting `<DimensionPicker>` + `<GranularityRadio>`. Extend `build-config.ts` with `BarDraft` / `LineDraft`. Add a kind-aware live preview to `<BlockPreviewCard>`. Bar/Line are leaf-source only (Supermetrics + TripleWhale) — aggregate/calculated stay KPI-only.

**Files:**
- Modify: `components/dashboard/add-block/add-block-dialog.tsx` (new kind step, kind-aware source list, kind-aware manual form dispatch)
- Modify: `components/dashboard/add-block/build-config.ts` (BarDraft, LineDraft, barToBlockConfig, lineToBlockConfig, isDraftComplete extension)
- Modify: `components/dashboard/add-block/build-config.test.ts` (append bar/line cases)
- Modify: `components/dashboard/add-block/manual-block-form.tsx` (dispatch into Bar/Line builders by kind)
- Modify: `components/dashboard/add-block/leaf-builder.tsx` (export `useSmFieldDiscovery` hook, see Step 5)
- Create: `components/dashboard/add-block/bar-builder.tsx`
- Create: `components/dashboard/add-block/line-builder.tsx`
- Create: `components/dashboard/add-block/dimension-picker.tsx`
- Create: `components/dashboard/add-block/granularity-radio.tsx`

**Interfaces:**
- Consumes: `LeafBuilder`, `SearchCombobox`, `LeafDraft`, `MetricFormat`, `Granularity`, `BlockKind`, `BlockConfig`.
- Produces: `BarDraft = { source: 'bar'; leaf: LeafDraft; dimension: string }`.
- Produces: `LineDraft = { source: 'line'; leaf: LeafDraft; granularity: Granularity }`.
- Produces: `barToBlockConfig(d: BarDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'>`.
- Produces: `lineToBlockConfig(d: LineDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'>`.
- Produces: `ManualDraft` union gains `{ kind: 'bar'; name; format; bar: BarDraft } | { kind: 'line'; name; format; line: LineDraft }`.
- Produces: `isDraftComplete` extended for bar (leaf complete + dimension non-empty) and line (leaf complete + granularity in {day,week,month}).
- Produces: `<BarBuilder>`, `<LineBuilder>`, `<DimensionPicker>`, `<GranularityRadio>`.

- [ ] **Step 1: Write failing build-config tests**

Open `components/dashboard/add-block/build-config.test.ts`. At the bottom, before `console.log('ok')`, append:

```ts
// barToBlockConfig: produces leaf binding with dimensions: [dim] and kind: 'bar'.
{
  const cfg = buildBlockConfig({
    kind: 'bar', name: 'Spend by Channel', format: 'currency',
    bar: { source: 'bar', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, dimension: 'Network' },
  })
  assert.equal(cfg.kind, 'bar')
  assert.equal(cfg.binding.source, 'supermetrics')
  if (cfg.binding.source === 'supermetrics') assert.deepEqual(cfg.binding.dimensions, ['Network'])
}

// barToBlockConfig (TW leaf): dimension carried into TW binding.
{
  const cfg = buildBlockConfig({
    kind: 'bar', name: 'Revenue by Country', format: 'currency',
    bar: { source: 'bar', leaf: { source: 'triplewhale', metric: 'revenue' }, dimension: 'country' },
  })
  assert.equal(cfg.binding.source, 'triplewhale')
  if (cfg.binding.source === 'triplewhale') assert.deepEqual(cfg.binding.dimensions, ['country'])
}

// lineToBlockConfig: produces leaf binding with granularity and kind: 'line'.
{
  const cfg = buildBlockConfig({
    kind: 'line', name: 'Spend over time', format: 'currency',
    line: { source: 'line', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, granularity: 'week' },
  })
  assert.equal(cfg.kind, 'line')
  if (cfg.binding.source === 'supermetrics') assert.equal(cfg.binding.granularity, 'week')
}

// isDraftComplete: bar without dimension → false.
assert.equal(isDraftComplete({
  kind: 'bar', name: 'X', format: 'number',
  bar: { source: 'bar', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, dimension: '' },
}), false)

// isDraftComplete: bar with complete leaf + dimension → true.
assert.equal(isDraftComplete({
  kind: 'bar', name: 'X', format: 'number',
  bar: { source: 'bar', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, dimension: 'Channel' },
}), true)

// isDraftComplete: bar with incomplete leaf → false.
assert.equal(isDraftComplete({
  kind: 'bar', name: 'X', format: 'number',
  bar: { source: 'bar', leaf: { source: 'supermetrics', dsId: '', metricField: '', account: '' }, dimension: 'Channel' },
}), false)

// isDraftComplete: line without granularity → false (TS-wise impossible, but defensive).
assert.equal(isDraftComplete({
  kind: 'line', name: 'X', format: 'number',
  line: { source: 'line', leaf: { source: 'triplewhale', metric: 'revenue' }, granularity: '' as unknown as 'day' },
}), false)

// isDraftComplete: line with complete leaf + valid granularity → true.
assert.equal(isDraftComplete({
  kind: 'line', name: 'X', format: 'number',
  line: { source: 'line', leaf: { source: 'triplewhale', metric: 'revenue' }, granularity: 'day' },
}), true)
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: FAIL — `BarDraft`/`LineDraft` not in the `ManualDraft` union; `isDraftComplete` doesn't know the new kinds.

- [ ] **Step 3: Extend `build-config.ts`**

Open `components/dashboard/add-block/build-config.ts`. After the existing `LeafDraft` and `CalculatedDraft` type definitions, insert:

```ts
import type { Granularity } from '@/lib/dashboard/types'

/** Bar block draft: a leaf + a single dimension column. */
export type BarDraft = {
  source: 'bar'
  leaf: LeafDraft
  dimension: string
}

/** Line block draft: a leaf + a granularity. */
export type LineDraft = {
  source: 'line'
  leaf: LeafDraft
  granularity: Granularity
}
```

Then replace the `ManualDraft` union (currently 4 lines) with:

```ts
export type ManualDraft =
  | { kind: 'leaf'; name: string; format: MetricFormat; leaf: LeafDraft }
  | { kind: 'calculated'; name: string; format: MetricFormat; calc: CalculatedDraft }
  | { kind: 'aggregate'; name: string; format: MetricFormat; op: AggregateBinding['op']; left: OperandDraft; right: OperandDraft }
  | { kind: 'bar'; name: string; format: MetricFormat; bar: BarDraft }
  | { kind: 'line'; name: string; format: MetricFormat; line: LineDraft }
```

Add new conversions (after `calculatedToBinding`):

```ts
/** Convert a bar draft into a Bar block config (kind: 'bar', leaf binding with dimensions). */
export function barToBlockConfig(d: BarDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const base = leafToBinding(d.leaf)
  // SupermetricsBinding and TripleWhaleBinding both carry an optional `dimensions: string[]`,
  // so spreading the union and adding the field preserves the discriminated source.
  const binding: LeafBinding = { ...base, dimensions: [d.dimension] }
  return { name, format, range: null, binding, kind: 'bar' }
}

/** Convert a line draft into a Line block config (kind: 'line', leaf binding with granularity). */
export function lineToBlockConfig(d: LineDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const base = leafToBinding(d.leaf)
  const binding: LeafBinding = { ...base, granularity: d.granularity }
  return { name, format, range: null, binding, kind: 'line' }
}
```

Replace `buildBlockConfig` (currently after `operandToBinding`) with:

```ts
export function buildBlockConfig(d: ManualDraft): Omit<BlockConfig, 'id'> {
  if (d.kind === 'leaf')       return { name: d.name, format: d.format, range: null, binding: leafToBinding(d.leaf) }
  if (d.kind === 'calculated') return { name: d.name, format: d.format, range: null, binding: calculatedToBinding(d.calc) }
  if (d.kind === 'aggregate')  return { name: d.name, format: d.format, range: null,
    binding: { source: 'aggregate' as const, op: d.op, left: operandToBinding(d.left), right: operandToBinding(d.right) } }
  if (d.kind === 'bar')        return barToBlockConfig(d.bar, d.name, d.format)
  return lineToBlockConfig(d.line, d.name, d.format)
}
```

Replace `isDraftComplete` with:

```ts
const GRANULARITIES: Granularity[] = ['day', 'week', 'month']

export function isDraftComplete(d: ManualDraft): boolean {
  if (d.name.trim() === '') return false
  if (d.kind === 'leaf')       return isLeafComplete(d.leaf)
  if (d.kind === 'calculated') return isCalculatedComplete(d.calc)
  if (d.kind === 'aggregate')  return isOperandComplete(d.left) && isOperandComplete(d.right)
  if (d.kind === 'bar')        return isLeafComplete(d.bar.leaf) && d.bar.dimension.trim() !== ''
  return isLeafComplete(d.line.leaf) && (GRANULARITIES as string[]).includes(d.line.granularity)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: `ok`.

- [ ] **Step 5: Create `<DimensionPicker>`**

Bar's dimension list comes from SM field discovery (the `dimensions` array returned by `getSmFields`) or from a hand-curated TW allowlist. Create `components/dashboard/add-block/dimension-picker.tsx`:

```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { getSmFields } from '@/app/actions/dashboard'
import { SearchCombobox, type ComboOption } from './search-combobox'
import type { LeafDraft } from './build-config'

/** Hand-curated TW pixel-joined-tvf safe dimension allowlist. v1 list; review with Paul. */
const TW_DIMENSION_OPTIONS: ComboOption[] = [
  { value: 'channel',        label: 'Channel' },
  { value: 'country',        label: 'Country' },
  { value: 'device',         label: 'Device' },
  { value: 'campaign_name',  label: 'Campaign' },
  { value: 'ad_name',        label: 'Ad' },
  { value: 'utm_source',     label: 'UTM source' },
  { value: 'utm_campaign',   label: 'UTM campaign' },
]

const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

export function DimensionPicker({
  leaf,
  slug,
  value,
  onChange,
}: {
  leaf: LeafDraft
  slug: string
  value: string
  onChange: (dim: string) => void
}) {
  const [smDimOpts, setSmDimOpts] = useState<ComboOption[]>([])
  const [loading, startLoad] = useTransition()
  const dsId = leaf.source === 'supermetrics' ? leaf.dsId : ''

  useEffect(() => {
    if (leaf.source !== 'supermetrics' || dsId === '') { setSmDimOpts([]); return }
    startLoad(async () => {
      try {
        const r = await getSmFields(slug, dsId)
        if (r.ok) setSmDimOpts(r.dimensions.map((o) => ({ value: o.value, label: o.label, group: o.group })))
        else setSmDimOpts([])
      } catch { setSmDimOpts([]) }
    })
  }, [leaf.source, dsId, slug])

  const options = leaf.source === 'triplewhale' ? TW_DIMENSION_OPTIONS : smDimOpts
  const disabled = leaf.source === 'supermetrics' && dsId === ''

  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>Dimension (group by)</span>
      <SearchCombobox
        value={value}
        options={options}
        disabled={disabled}
        loading={loading}
        placeholder={disabled ? 'Pick a data source first' : 'Select dimension'}
        onChange={onChange}
      />
    </label>
  )
}
```

- [ ] **Step 6: Create `<GranularityRadio>`**

Create `components/dashboard/add-block/granularity-radio.tsx`:

```tsx
'use client'

import { cn } from '@/lib/utils'
import type { Granularity } from '@/lib/dashboard/types'

const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

const OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day',   label: 'Day' },
  { value: 'week',  label: 'Week' },
  { value: 'month', label: 'Month' },
]

export function GranularityRadio({
  value,
  onChange,
}: {
  value: Granularity
  onChange: (g: Granularity) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className={labelCls}>Granularity</span>
      <div className="flex gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-xs',
              o.value === value
                ? 'border-brand-cyan/60 bg-brand-cyan/10 font-bold text-brand-cyan'
                : 'border-white/10 text-white/80 hover:border-white/25 hover:bg-white/[0.04]',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create `<BarBuilder>`**

Create `components/dashboard/add-block/bar-builder.tsx`:

```tsx
'use client'

import { LeafBuilder } from './leaf-builder'
import { DimensionPicker } from './dimension-picker'
import type { BarDraft, LeafDraft } from './build-config'

export function BarBuilder({
  value,
  onChange,
  slug,
}: {
  value: BarDraft
  onChange: (v: BarDraft) => void
  slug: string
}) {
  const setLeaf = (leaf: LeafDraft) => onChange({ ...value, leaf })
  const setDim = (dimension: string) => onChange({ ...value, dimension })
  return (
    <div className="flex flex-col gap-3">
      <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={setLeaf} slug={slug} />
      <DimensionPicker leaf={value.leaf} slug={slug} value={value.dimension} onChange={setDim} />
    </div>
  )
}
```

- [ ] **Step 8: Create `<LineBuilder>`**

Create `components/dashboard/add-block/line-builder.tsx`:

```tsx
'use client'

import { LeafBuilder } from './leaf-builder'
import { GranularityRadio } from './granularity-radio'
import type { LineDraft, LeafDraft } from './build-config'
import type { Granularity } from '@/lib/dashboard/types'

export function LineBuilder({
  value,
  onChange,
  slug,
}: {
  value: LineDraft
  onChange: (v: LineDraft) => void
  slug: string
}) {
  const setLeaf = (leaf: LeafDraft) => onChange({ ...value, leaf })
  const setG = (granularity: Granularity) => onChange({ ...value, granularity })
  return (
    <div className="flex flex-col gap-3">
      <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={setLeaf} slug={slug} />
      <GranularityRadio value={value.granularity} onChange={setG} />
    </div>
  )
}
```

- [ ] **Step 9: Extend `<ManualBlockForm>` to dispatch by kind**

Open `components/dashboard/add-block/manual-block-form.tsx`. Replace the file with:

```tsx
'use client'

import { useState } from 'react'
import { LeafBuilder } from './leaf-builder'
import { CalculatedBuilder } from './calculated-builder'
import { BarBuilder } from './bar-builder'
import { LineBuilder } from './line-builder'
import {
  buildBlockConfig, isDraftComplete,
  type LeafDraft, type ManualDraft, type CalculatedDraft, type OperandDraft,
  type BarDraft, type LineDraft,
} from './build-config'
import type { BlockConfig, BlockKind, Granularity, MetricFormat } from '@/lib/dashboard/types'

type LeafSource = 'supermetrics' | 'triplewhale'
type Op = '+' | '-' | '*' | '/'
type FormSource = 'supermetrics' | 'triplewhale' | 'aggregate' | 'calculated'

const FORMATS: MetricFormat[] = ['currency', 'percent', 'count', 'number']
const OPS: { value: Op; label: string }[] = [
  { value: '/', label: '÷ divide' },
  { value: '*', label: '× multiply' },
  { value: '+', label: '+ add' },
  { value: '-', label: '− subtract' },
]
const emptyLeaf = (source: LeafSource): LeafDraft =>
  source === 'supermetrics' ? { source, dsId: '', metricField: '', account: '' } : { source, metric: '' }

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

export function ManualBlockForm({
  kind,
  source,
  slug,
  pending,
  onConfirm,
  onBack,
}: {
  kind: BlockKind
  source: FormSource
  slug: string
  pending: boolean
  onConfirm: (cfg: Omit<BlockConfig, 'id'>) => void
  onBack: () => void
}) {
  const [name, setName] = useState('')
  const [format, setFormat] = useState<MetricFormat>('number')
  const [leaf, setLeaf] = useState<LeafDraft>(() => emptyLeaf(source === 'aggregate' || source === 'calculated' ? 'supermetrics' : source as LeafSource))
  const [calc, setCalc] = useState<CalculatedDraft>(() => ({ source: 'calculated', terms: [{ coefficient: '1', leaf: emptyLeaf('supermetrics') }] }))
  const [op, setOp] = useState<Op>('/')
  const [left, setLeft] = useState<OperandDraft>(() => ({ kind: 'leaf', leaf: emptyLeaf('triplewhale') }))
  const [right, setRight] = useState<OperandDraft>(() => ({ kind: 'leaf', leaf: emptyLeaf('supermetrics') }))
  const [bar, setBar] = useState<BarDraft>(() => ({ source: 'bar', leaf: emptyLeaf(source === 'triplewhale' ? 'triplewhale' : 'supermetrics'), dimension: '' }))
  const [line, setLine] = useState<LineDraft>(() => ({ source: 'line', leaf: emptyLeaf(source === 'triplewhale' ? 'triplewhale' : 'supermetrics'), granularity: 'day' as Granularity }))

  const draft: ManualDraft =
    kind === 'bar'
      ? { kind: 'bar', name, format, bar }
      : kind === 'line'
        ? { kind: 'line', name, format, line }
        : source === 'aggregate'
          ? { kind: 'aggregate', name, format, op, left, right }
          : source === 'calculated'
            ? { kind: 'calculated', name, format, calc }
            : { kind: 'leaf', name, format, leaf }

  return (
    <div className="flex flex-col gap-3">
      <p className={labelCls}>Build manually · {kind} · {source}</p>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Name</span>
        <input className={ctrl} value={name} onChange={(e) => setName(e.target.value)} placeholder="Block name" />
      </label>

      {kind === 'kpi' && source !== 'aggregate' && source !== 'calculated' && (
        <LeafBuilder source={source} value={leaf} onChange={setLeaf} slug={slug} onSuggestFormat={setFormat} />
      )}

      {kind === 'kpi' && source === 'calculated' && (
        <CalculatedBuilder value={calc} onChange={setCalc} slug={slug} />
      )}

      {kind === 'kpi' && source === 'aggregate' && (
        <>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Operator</span>
            <select className={ctrl} value={op} onChange={(e) => setOp(e.target.value as Op)}>
              {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <Operand title="Left" value={left} onChange={setLeft} slug={slug} />
          <Operand title="Right" value={right} onChange={setRight} slug={slug} />
        </>
      )}

      {kind === 'bar' && <BarBuilder value={bar} onChange={setBar} slug={slug} />}
      {kind === 'line' && <LineBuilder value={line} onChange={setLine} slug={slug} />}

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Format</span>
        <select className={ctrl} value={format} onChange={(e) => setFormat(e.target.value as MetricFormat)}>
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>

      <div className="mt-2 flex justify-between">
        <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={onBack} disabled={pending}>Back</button>
        <button
          className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
          onClick={() => onConfirm(buildBlockConfig(draft))}
          disabled={pending || !isDraftComplete(draft)}
        >
          {pending ? 'Adding…' : 'Add block'}
        </button>
      </div>
    </div>
  )
}

function Operand({
  title, value, onChange, slug,
}: {
  title: string
  value: OperandDraft
  onChange: (v: OperandDraft) => void
  slug: string
}) {
  const kindOp = value.kind === 'calculated' ? 'calculated' : value.leaf.source
  const onKind = (k: string) => {
    if (k === 'calculated') onChange({ kind: 'calculated', calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: emptyLeaf('supermetrics') }] } })
    else onChange({ kind: 'leaf', leaf: emptyLeaf(k as 'supermetrics' | 'triplewhale') })
  }
  return (
    <div className="rounded-md border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={labelCls}>{title}</span>
        <select className="rounded-md border border-white/10 bg-bg-surface px-2 py-1 text-xs text-white" value={kindOp} onChange={(e) => onKind(e.target.value)}>
          <option value="supermetrics">Supermetrics</option>
          <option value="triplewhale">TripleWhale</option>
          <option value="calculated">Calculated (weighted sum)</option>
        </select>
      </div>
      {value.kind === 'calculated' ? (
        <CalculatedBuilder value={value.calc} onChange={(calc) => onChange({ kind: 'calculated', calc })} slug={slug} />
      ) : (
        <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={(leaf) => onChange({ kind: 'leaf', leaf })} slug={slug} />
      )}
    </div>
  )
}
```

- [ ] **Step 10: Extend `<AddBlockDialog>` with the kind step**

Open `components/dashboard/add-block/add-block-dialog.tsx`. Replace the **entire file contents** with:

```tsx
'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { proposeBlock, saveDashboardConfig, type ProposeBlockInput } from '@/app/actions/dashboard'
import { addBlock } from '../config-mutations'
import { applySelections, type BlockSelections } from './draft'
import { BlockPreviewCard } from './block-preview-card'
import { ManualBlockForm } from './manual-block-form'
import type { BlockConfig, BlockKind, DashboardConfig } from '@/lib/dashboard/types'
import type { BlockProposal } from '@/lib/dashboard/nl/types'
import type { AggregateProposal } from '@/lib/dashboard/nl/aggregate-types'

type Source = ProposeBlockInput['source'] | 'calculated'

const KIND_OPTIONS: { value: BlockKind; label: string; available: boolean; hint?: string }[] = [
  { value: 'kpi',       label: 'KPI tile',         available: true  },
  { value: 'bar',       label: 'Bar chart',        available: true  },
  { value: 'line',      label: 'Line chart',       available: true  },
  { value: 'table',     label: 'Table',            available: false, hint: 'Coming in v2' },
  { value: 'narrative', label: 'Narrative panel',  available: false, hint: 'Coming in v2' },
  { value: 'header',    label: 'Section header',   available: false, hint: 'Coming in v2' },
]

const SOURCES_BY_KIND: Record<BlockKind, { value: Source; label: string }[]> = {
  kpi: [
    { value: 'supermetrics', label: 'Supermetrics' },
    { value: 'triplewhale',  label: 'TripleWhale' },
    { value: 'aggregate',    label: 'Aggregate (formula)' },
    { value: 'calculated',   label: 'Calculated (weighted sum)' },
  ],
  bar:       [{ value: 'supermetrics', label: 'Supermetrics' }, { value: 'triplewhale', label: 'TripleWhale' }],
  line:      [{ value: 'supermetrics', label: 'Supermetrics' }, { value: 'triplewhale', label: 'TripleWhale' }],
  table:     [],
  narrative: [],
  header:    [],
}

const DEFAULT_CONFIG: DashboardConfig = { defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' }, blocks: [] }

export function AddBlockDialog({ slug, config, onClose }: { slug: string; config: DashboardConfig | null; onClose: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState<'kind' | 'pick' | 'mode' | 'prompt' | 'preview' | 'build'>('kind')
  const [kind, setKind] = useState<BlockKind>('kpi')
  const [source, setSource] = useState<Source>('supermetrics')
  const [prompt, setPrompt] = useState('')
  const [clarify, setClarify] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<BlockProposal | AggregateProposal | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function resolve() {
    setClarify(null); setError(null)
    startTransition(async () => {
      const r = await proposeBlock({ source: source as ProposeBlockInput['source'], prompt, slug })
      if (r.kind === 'clarify') setClarify(r.question)
      else if (r.kind === 'error') setError(r.error)
      else { setProposal(r.proposal); setStep('preview') }
    })
  }

  function confirm(sel: BlockSelections) {
    if (!proposal) return
    setError(null)
    startTransition(async () => {
      const id = crypto.randomUUID()
      const block = applySelections(proposal.config, sel, id)
      const next = addBlock(config ?? DEFAULT_CONFIG, block)
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) setError(res.error)
      else { onClose(); router.refresh() }
    })
  }

  function confirmManual(cfg: Omit<BlockConfig, 'id'>) {
    setError(null)
    startTransition(async () => {
      const block = { id: crypto.randomUUID(), ...cfg }
      const next = addBlock(config ?? DEFAULT_CONFIG, block)
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) setError(res.error)
      else { onClose(); router.refresh() }
    })
  }

  const input = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
  // Bar/Line are leaf-only — skip the mode (AI vs manual) step when KPI-only modes don't apply,
  // and go straight to 'build' after source selection. KPI keeps the full prompt/mode flow.
  const isChartKind = kind === 'bar' || kind === 'line'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-lg border border-white/[0.08] bg-[#1a1a1a] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Add block</p>
          <button className="text-text-muted hover:text-white" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {step === 'kind' && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Block kind</p>
            {KIND_OPTIONS.map((k) => (
              <button
                key={k.value}
                disabled={!k.available}
                onClick={() => { setKind(k.value); setSource(SOURCES_BY_KIND[k.value][0]?.value ?? 'supermetrics'); setStep('pick') }}
                className={cn(
                  'rounded-md border px-3 py-2 text-left text-sm',
                  k.available
                    ? 'border-white/10 text-white/90 hover:border-white/25 hover:bg-white/[0.04]'
                    : 'cursor-not-allowed border-white/[0.04] text-white/30',
                )}
              >
                {k.label}{k.hint ? <span className="ml-2 text-[10px] uppercase tracking-widest text-white/40">· {k.hint}</span> : null}
              </button>
            ))}
          </div>
        )}

        {step === 'pick' && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Source · {kind}</p>
            {SOURCES_BY_KIND[kind].map((s) => (
              <button key={s.value} onClick={() => { setSource(s.value); setStep(isChartKind ? 'build' : 'mode') }}
                className="rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 hover:bg-white/[0.04]">
                {s.label}
              </button>
            ))}
            <button className="mt-1 self-start rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={() => setStep('kind')} disabled={pending}>Back</button>
          </div>
        )}

        {step === 'mode' && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">How to build it · {source}</p>
            {source !== 'calculated' && (
              <button onClick={() => setStep('prompt')}
                className="rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 hover:bg-white/[0.04]">
                Describe with AI
              </button>
            )}
            <button onClick={() => setStep('build')}
              className="rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 hover:bg-white/[0.04]">
              Build manually
            </button>
            <button className="mt-1 self-start rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={() => setStep('pick')} disabled={pending}>Back</button>
          </div>
        )}

        {step === 'build' && (
          <>
            <ManualBlockForm
              kind={kind}
              source={source as 'supermetrics' | 'triplewhale' | 'aggregate' | 'calculated'}
              slug={slug}
              pending={pending}
              onConfirm={confirmManual}
              onBack={() => setStep(isChartKind ? 'pick' : 'mode')}
            />
            {error && <p className="mt-2 text-xs text-[#FF6666]">Error: {error}</p>}
          </>
        )}

        {step === 'prompt' && (
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
              {source === 'aggregate' ? 'Formula' : 'Describe the metric'} · {source}
            </p>
            <textarea className={cn(input, 'min-h-[88px] resize-y')} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder={source === 'aggregate' ? 'blended ROAS = TripleWhale revenue ÷ Supermetrics ad spend' : 'Facebook ad spend last 30 days'} />
            {clarify && <p className="text-xs text-brand-cyan">{clarify}</p>}
            {error && <p className="text-xs text-[#FF6666]">Error: {error}</p>}
            <div className="flex justify-between">
              <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={() => setStep('mode')} disabled={pending}>Back</button>
              <button className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
                onClick={resolve} disabled={pending || prompt.trim() === ''}>{pending ? 'Resolving…' : 'Resolve'}</button>
            </div>
          </div>
        )}

        {step === 'preview' && proposal && (
          <>
            <BlockPreviewCard proposal={proposal} pending={pending} onConfirm={confirm} onCancel={() => setStep('prompt')} />
            {error && <p className="mt-2 text-xs text-[#FF6666]">Error: {error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
```

Note: the AI / NL preview path remains KPI-only in v1 (no preview for chart kinds — chart kinds go straight from `pick` → `build`). Live-streamed chart preview is captured in spec §13 as a v2 polish item (preview-card resolver cost concern).

- [ ] **Step 11: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 12: Run all test suites**

Run each:
```
npx tsx components/dashboard/add-block/build-config.test.ts
npx tsx lib/dashboard/charts.test.ts
npx tsx lib/dashboard/types.test.ts
npx tsx lib/dashboard/persistence.test.ts
npx tsx lib/dashboard/group-join.test.ts
npx tsx lib/supermetrics/buckets.test.ts
npx tsx lib/triplewhale/queries.test.ts
npx tsx lib/dashboard/adapters/supermetrics.test.ts
npx tsx lib/dashboard/adapters/triplewhale.test.ts
npx tsx lib/dashboard/resolve.test.ts
npx tsx lib/dashboard/aggregate.test.ts
npx tsx components/dashboard/config-mutations.test.ts
npx tsx components/dashboard/block-grid-defaults.test.ts
npx tsx components/dashboard/blocks/kpi-annotations.test.ts
```
Expected: all `ok`.

- [ ] **Step 13: Production build**

Run: `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 14: End-to-end smoke test — self-service journey from spec §11**

Run: `npm run dev`
Load: `http://localhost:3000/dashboard/<test-slug>/configurable-dashboard`
Confirm the full journey:
1. Click **+ Add block** → modal opens on the Kind step.
2. Select **Bar chart** → moves to Source step.
3. Select **Supermetrics** → moves directly to Build (chart kinds skip the mode step).
4. In the manual builder: enter Name "Smoke: Spend by Channel", pick a DS, metric, account, dimension. Pick format "currency".
5. Click **Add block** → modal closes, dashboard refreshes.
6. New bar block lands at the next free grid slot. Chrome (kebab) works. Drag/resize works. Reload preserves.
7. Repeat with **Line chart** → pick DS/metric/account → pick granularity Week → Save.
8. Both kinds stream their charts (skeleton → chart) over Suspense.
9. KPI blocks render unchanged alongside the new chart blocks.
10. Delete the smoke blocks via the kebab to clean up.

Expected: end-to-end flow succeeds with no console errors. **The Friday-demo deliverable is now live.**

Kill dev server.

- [ ] **Step 15: Commit**

```bash
git add components/dashboard/add-block/add-block-dialog.tsx components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts components/dashboard/add-block/manual-block-form.tsx components/dashboard/add-block/bar-builder.tsx components/dashboard/add-block/line-builder.tsx components/dashboard/add-block/dimension-picker.tsx components/dashboard/add-block/granularity-radio.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): add-block dialog kind step + Bar/Line builders

Adds a new first step "Block kind" (KPI / Bar / Line + Coming-v2 rows for
Table / Narrative / Header) before source selection. Bar/Line are leaf-only
(Supermetrics + TripleWhale); aggregate + calculated remain KPI-only.

New manual builders:
- <BarBuilder>: LeafBuilder + <DimensionPicker> (SM via getSmFields discovery,
  TW from a hand-curated allowlist of safe pixel_joined_tvf columns).
- <LineBuilder>: LeafBuilder + <GranularityRadio> (Day/Week/Month).

build-config.ts extended:
- BarDraft, LineDraft types added to the ManualDraft union.
- barToBlockConfig / lineToBlockConfig produce BlockConfig with kind:'bar'/'line'
  and the leaf binding carrying dimensions:[dim] or granularity respectively.
- isDraftComplete extended for both new kinds.

End-to-end journey works: KPI / Bar / Line composable, drag-and-place layout,
streamed chart rendering. The Friday demo deliverable is live.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---
