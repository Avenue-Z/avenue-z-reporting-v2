# Self-Service Blocks Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the polymorphism scaffolding for the configurable dashboard — `kind` discriminator on blocks, `{x, y, w, h}` grid layout, `react-grid-layout` swap, kind-dispatching page route, and a KPI v2 renderer (on top of `components/charts/kpi-card.tsx`) with optional sub-label and target/ceiling annotations.

**Architecture:** Sub-project #1 of the design spec in [docs/superpowers/specs/2026-06-24-self-service-blocks-and-layout-design.md](../specs/2026-06-24-self-service-blocks-and-layout-design.md). Five tasks, in order: (1) schema + persistence — adds `kind`, `subLabel`/`target`/`ceiling`, full `BlockLayout`; (2) pure layout helpers — `applyLayoutChange` + per-kind defaults; (3) new renderers — `KpiBlock` (on top of `KpiCard`) + `UnsupportedBlock` for forward-compat; (4) page-route dispatcher — swap hardcoded `<MetricBlock>` for `switch (kind)`, delete the old `metric-block.tsx`; (5) `react-grid-layout` swap — rewrite `block-grid.tsx` to drag-place-resize with debounced persistence. Compile-green at every commit; existing dashboards render identically until a user drags/resizes.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19 client components, `tsx` + `node:assert` unit tests, `react-grid-layout` ^1.4.4 (new dep in Task 5 only).

## Global Constraints

- Branch is `feat/tc-dashboard-self-service-dash-system` (stacked on `feat/configurable-dashboard-rnd`). Do NOT change base; do NOT touch parent branch.
- TypeScript strict; no `any` in new or changed code.
- Tests are pure (no live API calls, no `.env` loading); run via `npx tsx <file>` using `node:assert` strict mode. Match the style of [lib/dashboard/persistence.test.ts](../../../lib/dashboard/persistence.test.ts) and [components/dashboard/config-mutations.test.ts](../../../components/dashboard/config-mutations.test.ts) — IIFE blocks, no test runner.
- Backward compatible: an existing block with no `kind` parses as `kind: 'kpi'`; an existing block with no `layout` parses without `layout` (auto-pack happens at render time in Task 5).
- No new runtime dependency before Task 5. Task 5 is the only task that touches `package.json`.
- One commit per task, conventional prefix `feat(dashboard): …` or `refactor(dashboard): …`, footer:
  ```
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  ```
- Each task ends with `npx tsc --noEmit` clean before commit.

---

### Task 1: Schema discriminator + persistence parser

Adds `BlockKind`, full `BlockLayout`, and optional KPI annotations to the block schema; tightens the persistence parser to accept the new fields and reject malformed layouts. No renderer or grid changes — pure data-layer.

After this task, a hand-written config with `kind`/`layout`/`subLabel`/`target`/`ceiling` parses and persists; existing configs continue to parse unchanged.

**Files:**
- Modify: `lib/dashboard/types.ts:1-69` (add `BlockKind`, `BlockLayout`, extend `BlockConfig`, retype `PersistedBlock.layout`)
- Modify: `lib/dashboard/persistence.ts:109-142` (parse `kind`, `subLabel`/`target`/`ceiling`, tighten `layout`)
- Test: `lib/dashboard/persistence.test.ts` (append cases)

**Interfaces:**
- Produces: `BlockKind = 'kpi' | 'bar' | 'line' | 'table' | 'narrative' | 'header'`.
- Produces: `BlockLayout = { x: number; y: number; w: number; h: number }` (all four required; non-negative finite numbers).
- Produces: `BlockConfig` extended with optional `kind?: BlockKind`, `subLabel?: string`, `target?: number`, `ceiling?: number`. Omitted `kind` ⇒ resolver/renderer treats the block as `'kpi'`.
- Produces: `PersistedBlock.layout?: BlockLayout` (replaces the old loose `{w?, h?}` shape).
- Consumes: existing `isObj`, `isStr`, `isNonEmptyStr` helpers in `persistence.ts`.

- [ ] **Step 1: Extend `types.ts`**

Open `lib/dashboard/types.ts`. Replace lines 38–63 (`BlockConfig` through `PersistedBlock`) with:

```ts
/** Block kind discriminator. Default at parse/render time is 'kpi' for back-compat. */
export type BlockKind = 'kpi' | 'bar' | 'line' | 'table' | 'narrative' | 'header'

/** Full grid layout: required when present. Missing layout = "auto-pack on next save". */
export interface BlockLayout {
  x: number
  y: number
  w: number
  h: number
}

export interface BlockConfig {
  id: string
  name: string
  /** Renderer + resolver mode. Omitted = 'kpi' (back-compat). */
  kind?: BlockKind
  binding: Binding
  format: MetricFormat
  range: { dateRange: string; compareRange: string | null } | null
  /** KPI-only annotations (ignored by other kinds). */
  subLabel?: string
  /** Green when value ≥ target and < ceiling. */
  target?: number
  /** Orange when value ≥ ceiling. */
  ceiling?: number
}

export type BlockError = 'disconnected' | 'invalid-metric' | 'no-data' | 'rate-limited' | 'error'

/** Raw output of a single leaf resolution. prevValue present iff a comparison is active. */
export interface LeafValue {
  value: number
  prevValue?: number
}

/** Internal: outcome of attempting one leaf (success carries LeafValue, failure carries a BlockError). */
export type LeafAttempt = ({ ok: true } & LeafValue) | { ok: false; error: BlockError }

/** Public resolver output — drives the Metric Block UI states. */
export type ResolveResult =
  | { ok: true; value: number; prevValue?: number; delta?: number; format: MetricFormat; formatted: string }
  | { ok: false; error: BlockError }

/** A persisted block = a resolvable BlockConfig plus optional grid layout. */
export type PersistedBlock = BlockConfig & { layout?: BlockLayout }
```

Note: lines 1–36 (`MetricFormat` through `Binding`) and lines 64–69 (`DashboardConfig`) stay untouched.

- [ ] **Step 2: Write failing persistence tests**

Open `lib/dashboard/persistence.test.ts`. Insert the following block at the bottom, immediately before `console.log('ok')`:

```ts
// kind: omitted → parses (back-compat); the persisted block has no kind field.
{
  const r = parseBlockConfig(block(sm))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.block.kind, undefined)
}
// kind: 'bar' parses (renderer not yet implemented; schema is forward-compatible).
{
  const r = parseBlockConfig({ ...block(sm), kind: 'bar' })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.block.kind, 'bar')
}
// kind: 'wat' rejected with expected-one-of error.
{
  const r = parseBlockConfig({ ...block(sm), kind: 'wat' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error.includes('kind'), true)
}

// layout: full {x,y,w,h} parses.
{
  const r = parseBlockConfig({ ...block(sm), layout: { x: 0, y: 0, w: 3, h: 2 } })
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.block.layout, { x: 0, y: 0, w: 3, h: 2 })
}
// layout: partial {w,h} rejected (full layout required when present).
{
  const r = parseBlockConfig({ ...block(sm), layout: { w: 3, h: 2 } })
  assert.equal(r.ok, false)
}
// layout: negative x rejected.
{
  const r = parseBlockConfig({ ...block(sm), layout: { x: -1, y: 0, w: 3, h: 2 } })
  assert.equal(r.ok, false)
}
// layout: omitted parses to undefined (auto-pack target).
{
  const r = parseBlockConfig(block(sm))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.block.layout, undefined)
}

// KPI annotations: subLabel / target / ceiling round-trip.
{
  const r = parseBlockConfig({ ...block(sm), subLabel: '13-wk avg kr251', target: 250, ceiling: 280 })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.block.subLabel, '13-wk avg kr251')
    assert.equal(r.block.target, 250)
    assert.equal(r.block.ceiling, 280)
  }
}
// KPI annotations: non-finite target rejected.
{
  const r = parseBlockConfig({ ...block(sm), target: Number.NaN })
  assert.equal(r.ok, false)
}
// KPI annotations: non-string subLabel rejected.
{
  const r = parseBlockConfig({ ...block(sm), subLabel: 42 })
  assert.equal(r.ok, false)
}
```

- [ ] **Step 3: Run to verify failure**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: FAIL (parser does not yet know about `kind`, full `layout`, or KPI annotations).

- [ ] **Step 4: Extend the parser**

Open `lib/dashboard/persistence.ts`. Replace `parseBlockConfig` (currently lines 109–142) with:

```ts
const BLOCK_KINDS: BlockKind[] = ['kpi', 'bar', 'line', 'table', 'narrative', 'header']

function parseLayout(v: unknown, path: string): Parsed<BlockLayout> {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  const { x, y, w, h } = v
  const okN = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0
  if (!okN(x) || !okN(y) || !okN(w) || !okN(h)) {
    return { ok: false, error: `${path}: expected { x, y, w, h } as non-negative finite numbers` }
  }
  return { ok: true, value: { x: x as number, y: y as number, w: w as number, h: h as number } }
}

export function parseBlockConfig(
  v: unknown,
  path = 'block',
): { ok: true; block: PersistedBlock } | { ok: false; error: string } {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  if (!isNonEmptyStr(v.id)) return { ok: false, error: `${path}.id: expected non-empty string` }
  if (!isNonEmptyStr(v.name)) return { ok: false, error: `${path}.name: expected non-empty string` }
  if (!FORMATS.includes(v.format as MetricFormat)) return { ok: false, error: `${path}.format: expected one of ${FORMATS.join(',')}` }

  let kind: BlockKind | undefined
  if (v.kind !== undefined) {
    if (!BLOCK_KINDS.includes(v.kind as BlockKind)) {
      return { ok: false, error: `${path}.kind: expected one of ${BLOCK_KINDS.join(',')}` }
    }
    kind = v.kind as BlockKind
  }

  let range: PersistedBlock['range'] = null
  if (v.range !== null) {
    const r = parseRange(v.range, `${path}.range`)
    if (!r.ok) return r
    range = r.value
  }

  let layout: BlockLayout | undefined
  if (v.layout !== undefined) {
    const pl = parseLayout(v.layout, `${path}.layout`)
    if (!pl.ok) return pl
    layout = pl.value
  }

  // KPI annotations — accepted on every kind (silently unused on non-kpi kinds).
  let subLabel: string | undefined
  if (v.subLabel !== undefined) {
    if (!isStr(v.subLabel)) return { ok: false, error: `${path}.subLabel: expected string` }
    subLabel = v.subLabel
  }
  let target: number | undefined
  if (v.target !== undefined) {
    if (typeof v.target !== 'number' || !Number.isFinite(v.target)) return { ok: false, error: `${path}.target: expected finite number` }
    target = v.target
  }
  let ceiling: number | undefined
  if (v.ceiling !== undefined) {
    if (typeof v.ceiling !== 'number' || !Number.isFinite(v.ceiling)) return { ok: false, error: `${path}.ceiling: expected finite number` }
    ceiling = v.ceiling
  }

  const binding = parseBinding(v.binding, `${path}.binding`)
  if (!binding.ok) return binding

  const block: PersistedBlock = { id: v.id, name: v.name, format: v.format as MetricFormat, binding: binding.value, range }
  if (kind !== undefined) block.kind = kind
  if (layout !== undefined) block.layout = layout
  if (subLabel !== undefined) block.subLabel = subLabel
  if (target !== undefined) block.target = target
  if (ceiling !== undefined) block.ceiling = ceiling
  return { ok: true, block }
}
```

Extend the type import at the top of `persistence.ts` (currently the first import block) to add `BlockKind` and `BlockLayout`:

```ts
import type {
  AggregateBinding, AggregateOperand, Binding, BlockKind, BlockLayout, CalculatedBinding, DashboardConfig, LeafBinding,
  MetricFormat, PersistedBlock, SupermetricsBinding, TripleWhaleBinding,
} from './types'
```

- [ ] **Step 5: Run to verify pass**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: `ok`.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Existing consumers of `PersistedBlock.layout` — none in production code; the old shape was `{w?, h?}` and unused by `block-grid.tsx`.)

- [ ] **Step 7: Commit**

```bash
git add lib/dashboard/types.ts lib/dashboard/persistence.ts lib/dashboard/persistence.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): block kind discriminator + full layout schema

Adds BlockKind ('kpi'|'bar'|'line'|'table'|'narrative'|'header'), full
BlockLayout {x,y,w,h}, and optional KPI annotations (subLabel, target,
ceiling) to the block schema. Persistence parser accepts the new fields
and rejects malformed layouts; existing configs continue to parse with
kind/layout omitted (back-compat).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pure layout helpers — `applyLayoutChange` + per-kind defaults

Adds two pure, unit-testable helpers that the RGL grid (Task 5) will consume. Nothing renders these yet; this task is reviewable on its own as "the math is correct."

**Files:**
- Modify: `components/dashboard/config-mutations.ts` (append `applyLayoutChange`)
- Modify: `components/dashboard/config-mutations.test.ts` (append cases)
- Create: `components/dashboard/block-grid-defaults.ts`
- Create: `components/dashboard/block-grid-defaults.test.ts`

**Interfaces:**
- Consumes: `DashboardConfig`, `BlockKind`, `BlockLayout` (Task 1).
- Produces: `applyLayoutChange(config: DashboardConfig, layout: { i: string; x: number; y: number; w: number; h: number }[]): DashboardConfig` — pure, returns a new config with `block.layout` updated for every matching `i`. Blocks not in `layout` are returned untouched.
- Produces: `DEFAULT_LAYOUT: Record<BlockKind, { w: number; h: number; minW: number; minH: number }>` — per-kind default size + minimums. All `w` ≤ 12 (12-col grid).

- [ ] **Step 1: Write failing `applyLayoutChange` tests**

Open `components/dashboard/config-mutations.test.ts`. Extend the import line (currently line 5–11):

```ts
import {
  reorderBlocks,
  removeBlock,
  setBlockRange,
  resetBlockRange,
  addBlock,
  applyLayoutChange,
} from './config-mutations'
```

Append before `console.log('ok')`:

```ts
// applyLayoutChange: writes {x,y,w,h} to matching blocks; unmatched blocks untouched.
{
  const next = applyLayoutChange(base, [
    { i: 'a', x: 0, y: 0, w: 3, h: 2 },
    { i: 'c', x: 6, y: 0, w: 6, h: 4 },
  ])
  assert.deepEqual(next.blocks[0].layout, { x: 0, y: 0, w: 3, h: 2 })
  assert.equal(next.blocks[1].layout, undefined, "block 'b' had no layout entry — untouched")
  assert.deepEqual(next.blocks[2].layout, { x: 6, y: 0, w: 6, h: 4 })
}
// applyLayoutChange: ignores layout entries with no matching block id.
{
  const next = applyLayoutChange(base, [
    { i: 'a', x: 0, y: 0, w: 3, h: 2 },
    { i: 'ghost', x: 0, y: 0, w: 3, h: 2 },
  ])
  assert.equal(next.blocks.length, 3)
  assert.deepEqual(next.blocks[0].layout, { x: 0, y: 0, w: 3, h: 2 })
}
// applyLayoutChange: immutable — input config not mutated.
{
  const before = JSON.stringify(base)
  applyLayoutChange(base, [{ i: 'a', x: 0, y: 0, w: 3, h: 2 }])
  assert.equal(JSON.stringify(base), before, 'input must be unchanged')
}
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx components/dashboard/config-mutations.test.ts`
Expected: FAIL (`applyLayoutChange` not exported).

- [ ] **Step 3: Implement `applyLayoutChange`**

Open `components/dashboard/config-mutations.ts`. Append at the bottom of the file:

```ts
export function applyLayoutChange(
  config: DashboardConfig,
  layout: { i: string; x: number; y: number; w: number; h: number }[],
): DashboardConfig {
  const byId = new Map(layout.map((l) => [l.i, l]))
  const blocks = config.blocks.map((b) => {
    const l = byId.get(b.id)
    if (!l) return b
    return { ...b, layout: { x: l.x, y: l.y, w: l.w, h: l.h } }
  })
  return { ...config, blocks }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx components/dashboard/config-mutations.test.ts`
Expected: `ok`.

- [ ] **Step 5: Create per-kind defaults**

Create `components/dashboard/block-grid-defaults.ts`:

```ts
import type { BlockKind } from '@/lib/dashboard/types'

/** Per-kind default grid sizing on the 12-column desktop grid. `w`/`h` are the
 *  initial size assigned to a newly-placed (or auto-packed) block; `minW`/`minH`
 *  are the user-resize floors enforced by react-grid-layout. */
export const DEFAULT_LAYOUT: Record<BlockKind, { w: number; h: number; minW: number; minH: number }> = {
  kpi:       { w: 3,  h: 2, minW: 2, minH: 2 },   // 4-per-row — matches today's lg:grid-cols-4 visual
  bar:       { w: 6,  h: 4, minW: 4, minH: 3 },
  line:      { w: 6,  h: 4, minW: 4, minH: 3 },
  table:     { w: 8,  h: 5, minW: 4, minH: 3 },
  narrative: { w: 12, h: 3, minW: 4, minH: 2 },
  header:    { w: 12, h: 1, minW: 4, minH: 1 },
}

/** Desktop grid column count. Kept here so DEFAULT_LAYOUT and the grid agree. */
export const GRID_COLS_LG = 12
```

- [ ] **Step 6: Write the defaults test**

Create `components/dashboard/block-grid-defaults.test.ts`:

```ts
// components/dashboard/block-grid-defaults.test.ts
// Run: npx tsx components/dashboard/block-grid-defaults.test.ts
import { strict as assert } from 'node:assert'
import type { BlockKind } from '@/lib/dashboard/types'
import { DEFAULT_LAYOUT, GRID_COLS_LG } from './block-grid-defaults'

const ALL_KINDS: BlockKind[] = ['kpi', 'bar', 'line', 'table', 'narrative', 'header']

// Every BlockKind has an entry.
for (const k of ALL_KINDS) {
  const entry = DEFAULT_LAYOUT[k]
  assert.ok(entry, `DEFAULT_LAYOUT missing entry for kind '${k}'`)
}

// w/h/minW/minH are positive integers; w ≤ GRID_COLS_LG; minW ≤ w; minH ≤ h.
for (const k of ALL_KINDS) {
  const { w, h, minW, minH } = DEFAULT_LAYOUT[k]
  assert.ok(Number.isInteger(w) && w > 0, `${k}.w must be positive integer`)
  assert.ok(Number.isInteger(h) && h > 0, `${k}.h must be positive integer`)
  assert.ok(Number.isInteger(minW) && minW > 0, `${k}.minW must be positive integer`)
  assert.ok(Number.isInteger(minH) && minH > 0, `${k}.minH must be positive integer`)
  assert.ok(w <= GRID_COLS_LG, `${k}.w (${w}) must fit the ${GRID_COLS_LG}-col grid`)
  assert.ok(minW <= w, `${k}.minW must be ≤ w`)
  assert.ok(minH <= h, `${k}.minH must be ≤ h`)
}

console.log('ok')
```

- [ ] **Step 7: Run the defaults test**

Run: `npx tsx components/dashboard/block-grid-defaults.test.ts`
Expected: `ok`.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add components/dashboard/config-mutations.ts components/dashboard/config-mutations.test.ts components/dashboard/block-grid-defaults.ts components/dashboard/block-grid-defaults.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): pure layout helpers (applyLayoutChange + per-kind defaults)

Adds applyLayoutChange(config, layout[]) — pure, immutable; returns a new
config with block.layout patched for every matching block id. Adds the
DEFAULT_LAYOUT map (per-kind w/h/minW/minH) and GRID_COLS_LG. No consumer
yet; both helpers ship behind the RGL swap in task 5.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: KpiBlock renderer + UnsupportedBlock fallback

Builds the new KPI v2 renderer alongside (not replacing yet) `MetricBlock`. `KpiBlock` keeps every responsibility of `MetricBlock` (kebab menu, range override popover, detach badge, delete confirm, error states) but delegates the value/delta/sub-label presentation to `components/charts/kpi-card.tsx`, and adds optional target/ceiling color annotations. Also adds `UnsupportedBlockState` — the graceful fallback the page-route dispatcher returns for any unknown `kind` in Task 4.

The pure color rule is extracted to its own helper so it can be unit-tested without a React renderer (matching this repo's `tsx`-only test convention).

After this task, the new files exist and compile, but nothing imports them yet. Old `MetricBlock` keeps rendering.

**Files:**
- Modify: `components/charts/kpi-card.tsx` (additive: optional `valueClassName` prop)
- Create: `components/dashboard/blocks/kpi-annotations.ts`
- Create: `components/dashboard/blocks/kpi-annotations.test.ts`
- Create: `components/dashboard/blocks/kpi-block.tsx`
- Create: `components/dashboard/blocks/unsupported-block.tsx`

**Interfaces:**
- Consumes: `KpiCard`, `MetricBlockErrorState`, `PersistedBlock`, `ResolveResult`, `DashboardConfig`, the existing config-mutations (`setBlockRange`, `resetBlockRange`, `removeBlock`), and `saveDashboardConfig`.
- Produces: `kpiAnnotationColor(value: number, target?: number, ceiling?: number): 'target' | 'ceiling' | null` — pure helper.
- Produces: `KpiBlock` React component with the **same prop shape** as today's `MetricBlock`:
  `{ block: PersistedBlock; result: ResolveResult; canEdit: boolean; slug: string; config: DashboardConfig; activeDefault: { dateRange: string; compareRange: string | null } }`. This is the contract Task 4's dispatcher relies on — exact match means the dispatcher only changes the imported symbol, not the prop shape.
- Produces: `UnsupportedBlockState({ kind, name }: { kind: string; name: string })` — minimal card-shaped fallback.
- Produces: optional `valueClassName?: string` prop on `KpiCard` (purely additive — no existing caller affected).

- [ ] **Step 1: Add `valueClassName` prop to `KpiCard`**

Open `components/charts/kpi-card.tsx`. Extend `KpiCardProps` and apply the className to the value `<p>`. Replace the file with:

```tsx
import { cn } from '@/lib/utils'

interface KpiCardProps {
  title: string
  value: string | number
  delta?: number
  /** When true, a negative delta is displayed green (lower = better, e.g. bounce rate) */
  invertDelta?: boolean
  prefix?: string
  suffix?: string
  tooltip?: string
  /** Label shown after the delta %. Defaults to "vs prior period". */
  deltaLabel?: string
  /** Secondary line shown below the delta, e.g. "2,483 in 2025". */
  subValue?: string
  /** Optional className applied to the main value text (e.g. for target/ceiling color). */
  valueClassName?: string
}

export function KpiCard({
  title,
  value,
  delta,
  invertDelta = false,
  prefix,
  suffix,
  tooltip,
  deltaLabel = 'vs prior period',
  subValue,
  valueClassName,
}: KpiCardProps) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5">

      <div className="flex items-center gap-1.5">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">
          {title}
        </p>
        {tooltip && (
          <div className="group relative flex-shrink-0">
            <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
              ?
            </span>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
              {tooltip}
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
            </div>
          </div>
        )}
      </div>

      <p className={cn('mt-2 text-3xl font-extrabold text-white', valueClassName)}>
        {prefix}
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix}
      </p>

      {delta !== undefined && (
        <p
          className={cn(
            'mt-1 text-sm font-bold',
            invertDelta
              ? delta < 0 ? 'text-brand-green' : delta > 0 ? 'text-[#FF4444]' : 'text-text-muted'
              : delta > 0 ? 'text-brand-green' : delta < 0 ? 'text-[#FF4444]' : 'text-text-muted'
          )}
        >
          {delta > 0 ? '↑' : delta < 0 ? '↓' : '—'}{' '}
          {Math.abs(delta).toFixed(1)}% {deltaLabel}
        </p>
      )}

      {subValue && (
        <p className="mt-0.5 text-xs text-text-muted">{subValue}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write failing kpi-annotations test**

Create `components/dashboard/blocks/kpi-annotations.test.ts`:

```ts
// components/dashboard/blocks/kpi-annotations.test.ts
// Run: npx tsx components/dashboard/blocks/kpi-annotations.test.ts
import { strict as assert } from 'node:assert'
import { kpiAnnotationColor } from './kpi-annotations'

// No target, no ceiling → null.
assert.equal(kpiAnnotationColor(100), null)

// Value ≥ ceiling → 'ceiling' (ceiling wins, even if target is also met).
assert.equal(kpiAnnotationColor(300, 250, 280), 'ceiling')
assert.equal(kpiAnnotationColor(280, 250, 280), 'ceiling', 'boundary: ≥ ceiling')

// Value ≥ target and < ceiling → 'target'.
assert.equal(kpiAnnotationColor(260, 250, 280), 'target')
assert.equal(kpiAnnotationColor(250, 250, 280), 'target', 'boundary: ≥ target')

// Value < target → null.
assert.equal(kpiAnnotationColor(240, 250, 280), null)

// Target only (no ceiling): still works.
assert.equal(kpiAnnotationColor(300, 250), 'target')
assert.equal(kpiAnnotationColor(200, 250), null)

// Ceiling only (no target): only 'ceiling' or null possible.
assert.equal(kpiAnnotationColor(300, undefined, 280), 'ceiling')
assert.equal(kpiAnnotationColor(200, undefined, 280), null)

// Non-finite value → null (defensive; resolver shouldn't deliver NaN but be safe).
assert.equal(kpiAnnotationColor(Number.NaN, 250, 280), null)

console.log('ok')
```

- [ ] **Step 3: Run to verify failure**

Run: `npx tsx components/dashboard/blocks/kpi-annotations.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 4: Implement the pure annotation helper**

Create `components/dashboard/blocks/kpi-annotations.ts`:

```ts
/** Decide which color band a KPI value falls into. Ceiling wins over target.
 *  - value ≥ ceiling          → 'ceiling' (orange)
 *  - value ≥ target & < ceil  → 'target'  (green)
 *  - otherwise                → null      (default white) */
export function kpiAnnotationColor(
  value: number,
  target?: number,
  ceiling?: number,
): 'target' | 'ceiling' | null {
  if (!Number.isFinite(value)) return null
  if (ceiling !== undefined && value >= ceiling) return 'ceiling'
  if (target !== undefined && value >= target) return 'target'
  return null
}

/** Tailwind class to apply to the KPI value text for each band. Literal hex
 *  matches the design spec (ceiling: paid-search accent orange; target: brand-green). */
export const KPI_ANNOTATION_CLASS: Record<'target' | 'ceiling', string> = {
  target: 'text-[#5DD39E]',
  ceiling: 'text-[#FF8A3D]',
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx tsx components/dashboard/blocks/kpi-annotations.test.ts`
Expected: `ok`.

- [ ] **Step 6: Create `UnsupportedBlockState`**

Create `components/dashboard/blocks/unsupported-block.tsx`:

```tsx
/** Graceful fallback for any block.kind that has no renderer yet. Lets new
 *  kinds ship in the schema before their renderers ship (task 4's dispatcher
 *  returns this for the default case). */
export function UnsupportedBlockState({ kind, name }: { kind: string; name: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/[0.15] bg-bg-surface px-6 py-5 min-h-[140px]">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <p className="mt-2 text-sm text-white/70">
        Block type <span className="font-mono text-white/90">{kind}</span> isn’t available in this version.
      </p>
      <p className="mt-1 text-xs text-text-muted">Delete this block or wait for the next release.</p>
    </div>
  )
}
```

- [ ] **Step 7: Create `KpiBlock`**

Create `components/dashboard/blocks/kpi-block.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { KpiCard } from '@/components/charts/kpi-card'
import { saveDashboardConfig } from '@/app/actions/dashboard'
import { getMainLabel } from '@/components/layout/date-range-picker'
import { setBlockRange, resetBlockRange, removeBlock } from '../config-mutations'
import { MetricBlockErrorState } from '../metric-block-states'
import { kpiAnnotationColor, KPI_ANNOTATION_CLASS } from './kpi-annotations'
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

export interface KpiBlockProps {
  block: PersistedBlock
  result: ResolveResult
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}

export function KpiBlock({ block, result, canEdit, slug, config, activeDefault }: KpiBlockProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'range' | 'confirm-delete' | 'confirm-reset'>('menu')
  const [draftDate, setDraftDate] = useState<string>(block.range?.dateRange ?? activeDefault.dateRange)
  const [draftCompare, setDraftCompare] = useState<string | null>(
    block.range?.compareRange ?? activeDefault.compareRange,
  )
  const [pending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const isOverridden = block.range !== null
  const activeCompare = block.range ? block.range.compareRange : activeDefault.compareRange
  const deltaLabel =
    activeCompare === 'previous_year'
      ? 'vs prior year'
      : activeCompare && activeCompare.startsWith('custom:')
        ? 'vs comparison'
        : 'vs prior period'

  function closeMenu() {
    setMenuOpen(false)
    setView('menu')
    setErrorMsg(null)
  }
  function runSave(nextConfig: DashboardConfig) {
    startTransition(async () => {
      const res = await saveDashboardConfig(slug, nextConfig)
      if (!res.ok) { setErrorMsg(res.error); return }
      closeMenu()
    })
  }
  function applyOverride() {
    runSave(setBlockRange(config, block.id, { dateRange: draftDate, compareRange: draftCompare }))
  }
  function confirmReset() { runSave(resetBlockRange(config, block.id)) }
  function confirmDelete() { runSave(removeBlock(config, block.id)) }

  const overrideLabel = isOverridden ? getMainLabel(block.range!.dateRange) : null
  const badge = isOverridden ? (
    <DetachBadge
      label={overrideLabel!}
      canEdit={canEdit}
      onReset={() => { setView('confirm-reset'); setMenuOpen(true) }}
    />
  ) : null

  if (!result.ok) {
    return (
      <BlockShell
        name={block.name} canEdit={canEdit} menuOpen={menuOpen} setMenuOpen={setMenuOpen}
        view={view} setView={setView} pending={pending} errorMsg={errorMsg}
        isOverridden={isOverridden} draftDate={draftDate} setDraftDate={setDraftDate}
        draftCompare={draftCompare} setDraftCompare={setDraftCompare}
        applyOverride={applyOverride} confirmDelete={confirmDelete} confirmReset={confirmReset}
      >
        <div className="flex flex-col gap-2">
          {badge}
          <MetricBlockErrorState name={block.name} error={result.error} slug={slug} />
        </div>
      </BlockShell>
    )
  }

  const band = kpiAnnotationColor(result.value, block.target, block.ceiling)
  const valueClassName = band ? KPI_ANNOTATION_CLASS[band] : undefined

  return (
    <BlockShell
      name={block.name} canEdit={canEdit} menuOpen={menuOpen} setMenuOpen={setMenuOpen}
      view={view} setView={setView} pending={pending} errorMsg={errorMsg}
      isOverridden={isOverridden} draftDate={draftDate} setDraftDate={setDraftDate}
      draftCompare={draftCompare} setDraftCompare={setDraftCompare}
      applyOverride={applyOverride} confirmDelete={confirmDelete} confirmReset={confirmReset}
    >
      <div className="flex flex-col gap-2">
        {badge}
        <KpiCard
          title={block.name}
          value={result.formatted}
          delta={result.delta}
          deltaLabel={deltaLabel}
          subValue={block.subLabel}
          valueClassName={valueClassName}
        />
      </div>
    </BlockShell>
  )
}

function DetachBadge({ label, canEdit, onReset }: { label: string; canEdit: boolean; onReset: () => void }) {
  const cls =
    'inline-flex w-fit rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-cyan'
  if (canEdit) {
    return <button onClick={onReset} className={`${cls} hover:bg-brand-cyan/20`}>Detached · {label}</button>
  }
  return <span className={cls}>Detached · {label}</span>
}

// Same chrome as today's MetricBlock — kebab + popover for range / reset / delete.
function BlockShell({
  name, canEdit, isOverridden, menuOpen, setMenuOpen, view, setView, pending, errorMsg,
  draftDate, setDraftDate, draftCompare, setDraftCompare,
  applyOverride, confirmDelete, confirmReset, children,
}: {
  name: string; canEdit: boolean; isOverridden: boolean
  menuOpen: boolean; setMenuOpen: (v: boolean) => void
  view: 'menu' | 'range' | 'confirm-delete' | 'confirm-reset'
  setView: (v: 'menu' | 'range' | 'confirm-delete' | 'confirm-reset') => void
  pending: boolean; errorMsg: string | null
  draftDate: string; setDraftDate: (v: string) => void
  draftCompare: string | null; setDraftCompare: (v: string | null) => void
  applyOverride: () => void; confirmDelete: () => void; confirmReset: () => void
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      {children}
      {canEdit && (
        <Popover open={menuOpen} onOpenChange={(open) => (open ? setMenuOpen(true) : (setMenuOpen(false), setView('menu')))}>
          <PopoverTrigger asChild>
            <button aria-label={`Edit ${name}`}
              className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-white/10 hover:text-white">⋯</button>
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
                  <button className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40" onClick={applyOverride} disabled={pending}>
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

function ConfirmRow({
  question, confirmLabel, destructive = false, pending, onCancel, onConfirm,
}: {
  question: string; confirmLabel: string; destructive?: boolean; pending: boolean
  onCancel: () => void; onConfirm: () => void
}) {
  return (
    <div className="flex flex-col gap-3 p-2">
      <p className="text-[13px] text-white/90">{question}</p>
      <div className="flex justify-end gap-2">
        <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={onCancel} disabled={pending}>Cancel</button>
        <button
          className={cn('rounded-md px-3 py-1.5 text-xs font-bold',
            destructive ? 'bg-[#FF4444]/80 text-white hover:bg-[#FF4444]' : 'bg-brand-cyan text-black hover:opacity-90')}
          onClick={onConfirm} disabled={pending}>
          {pending ? 'Working…' : confirmLabel}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Build**

Run: `npm run build`
Expected: build succeeds. (New files compile but have no importers yet — that's fine; tree-shake doesn't strip RSC client modules at this stage, but they aren't yet referenced from any route either, so build doesn't bundle them.)

- [ ] **Step 10: Commit**

```bash
git add components/charts/kpi-card.tsx components/dashboard/blocks/kpi-annotations.ts components/dashboard/blocks/kpi-annotations.test.ts components/dashboard/blocks/kpi-block.tsx components/dashboard/blocks/unsupported-block.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): KpiBlock v2 (on KpiCard) + UnsupportedBlock fallback

Adds KpiBlock — drop-in replacement for MetricBlock that renders via
components/charts/kpi-card.tsx and supports the new sub-label and
target/ceiling annotations. Target turns the value green; ceiling turns
it orange (ceiling wins). Adds UnsupportedBlockState — graceful card
for any unknown block.kind, used by the page dispatcher in the next
task. Old MetricBlock kept; not yet referenced by the page route.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Page-route dispatcher + remove `MetricBlock`

Swaps the hardcoded `<MetricBlock>` in the configurable-dashboard page route for a `kind`-dispatching switch. `'kpi'` → `KpiBlock`; default → `UnsupportedBlockState`. After this commit, all existing dashboards render via `KpiBlock` (visually identical thanks to `KpiCard` matching the prior layout) and `metric-block.tsx` is deleted.

**Files:**
- Modify: `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx:1-117`
- Delete: `components/dashboard/metric-block.tsx`
- Modify (comment cleanup only): `components/dashboard/block-grid.tsx:29` and `components/dashboard/dashboard-shell.tsx:15` — stale `<MetricBlock>` references in JSDoc.

**Interfaces:**
- Consumes: `KpiBlock` and `UnsupportedBlockState` from Task 3.
- Produces: no exports change. `ResolvedBlockIsland`'s outward contract (RSC that renders a block) is unchanged.

- [ ] **Step 1: Confirm no other importer of `MetricBlock`**

Run: `grep -rn "from '@/components/dashboard/metric-block'" --include='*.ts' --include='*.tsx'`
Expected output: exactly one line — `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx:10:import { MetricBlock } from '@/components/dashboard/metric-block'`. If anything else shows up, STOP and inspect — this plan assumed a single importer.

- [ ] **Step 2: Update the page route to dispatch by kind**

Open `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`. Replace lines 10 (import) and 92–116 (`ResolvedBlockIsland`):

Change line 10 from:
```ts
import { MetricBlock } from '@/components/dashboard/metric-block'
```
to:
```ts
import { KpiBlock } from '@/components/dashboard/blocks/kpi-block'
import { UnsupportedBlockState } from '@/components/dashboard/blocks/unsupported-block'
```

Replace the entire `ResolvedBlockIsland` function (currently lines 92–116) with:

```tsx
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
  const kind = block.kind ?? 'kpi'
  switch (kind) {
    case 'kpi': {
      const result = await resolveBlock(block, activeDefault, { slug })
      return (
        <KpiBlock
          block={block}
          result={result}
          canEdit={canEdit}
          slug={slug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
    // 'bar' | 'line' | 'table' | 'narrative' | 'header' arrive in sub-projects #3–#4.
    default:
      return <UnsupportedBlockState kind={kind} name={block.name} />
  }
}
```

- [ ] **Step 3: Clean up stale comments**

Open `components/dashboard/block-grid.tsx`. Replace line 29:
```ts
  /** Rendered child per block (the resolved <MetricBlock>). */
```
with:
```ts
  /** Rendered child per block (the resolved block renderer, e.g. <KpiBlock>). */
```

Open `components/dashboard/dashboard-shell.tsx`. Replace line 15:
```ts
  /** Map of block id → rendered server island (the Suspense-wrapped <MetricBlock>). */
```
with:
```ts
  /** Map of block id → rendered server island (the Suspense-wrapped block renderer). */
```

- [ ] **Step 4: Delete the old `MetricBlock`**

Run: `rm components/dashboard/metric-block.tsx`

- [ ] **Step 5: Re-verify no stale references remain**

Run: `grep -rn "MetricBlock\b" --include='*.ts' --include='*.tsx'`
Expected: empty output (or only matches inside committed docs/markdown — those are fine; the grep is restricted to .ts/.tsx).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/[clientSlug]/configurable-dashboard/page.tsx components/dashboard/block-grid.tsx components/dashboard/dashboard-shell.tsx components/dashboard/metric-block.tsx
git commit -m "$(cat <<'EOF'
refactor(dashboard): page-route dispatcher by block.kind; drop MetricBlock

ResolvedBlockIsland now switches on block.kind (default 'kpi'). 'kpi'
renders the new KpiBlock; any other kind renders UnsupportedBlockState
so unknown kinds in the schema never crash the page. The old
MetricBlock is removed — KpiBlock is now the sole KPI renderer.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `react-grid-layout` swap

Replaces the @dnd-kit 1D reorder grid with `react-grid-layout`'s responsive drag-place-resize grid. Adds the runtime dependency. Auto-packs blocks without `layout` at their per-kind default size on first render, and on editor sessions writes the packed layout back via the existing `saveDashboardConfig` action.

After this task, the user can drag and resize blocks; positions persist; viewers see the same layout but can't edit it.

**Files:**
- Modify: `package.json` (add `react-grid-layout` and `@types/react-grid-layout`)
- Rewrite: `components/dashboard/block-grid.tsx`

**Interfaces:**
- Consumes: `applyLayoutChange` and `DEFAULT_LAYOUT`/`GRID_COLS_LG` from Task 2; `saveDashboardConfig` from `@/app/actions/dashboard`; existing `BlockGridProps`.
- Produces: no exports change. `BlockGridProps` unchanged. `<BlockGrid>` consumers (`DashboardShell`) work unmodified.

- [ ] **Step 1: Install `react-grid-layout`**

Run: `npm install react-grid-layout@^1.4.4`
Run: `npm install --save-dev @types/react-grid-layout@^1.3.5`
Expected: both install cleanly. `package.json` shows new entries; lockfile updated.

- [ ] **Step 2: Verify the install**

Run: `node -e "console.log(require('react-grid-layout/package.json').version)"`
Expected: a version string starting with `1.4`.

- [ ] **Step 3: Rewrite `block-grid.tsx`**

Replace the contents of `components/dashboard/block-grid.tsx` with:

```tsx
'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { Responsive, WidthProvider, type Layout, type Layouts } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { saveDashboardConfig } from '@/app/actions/dashboard'
import { applyLayoutChange } from './config-mutations'
import { DEFAULT_LAYOUT, GRID_COLS_LG } from './block-grid-defaults'
import type { BlockKind, DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

const ResponsiveGrid = WidthProvider(Responsive)

const BREAKPOINTS = { lg: 1200, md: 768, sm: 0 }
const COLS = { lg: GRID_COLS_LG, md: 8, sm: 4 }
const ROW_HEIGHT = 60
const SAVE_DEBOUNCE_MS = 300

export interface BlockGridProps {
  blocks: PersistedBlock[]
  canEdit: boolean
  slug: string
  config: DashboardConfig
  /** Rendered child per block (the resolved block renderer, e.g. <KpiBlock>). */
  renderBlock: (block: PersistedBlock) => ReactNode
}

/** Build the RGL Layout array for the lg breakpoint, auto-packing unplaced
 *  blocks (no `layout`) at their per-kind default size, left-to-right then
 *  top-to-bottom. Placed blocks keep their persisted `{x, y, w, h}`. */
function buildLgLayout(blocks: PersistedBlock[]): Layout[] {
  let cursorX = 0
  let cursorY = 0
  return blocks.map((b) => {
    const kind: BlockKind = b.kind ?? 'kpi'
    const def = DEFAULT_LAYOUT[kind]
    if (b.layout) {
      return { i: b.id, x: b.layout.x, y: b.layout.y, w: b.layout.w, h: b.layout.h, minW: def.minW, minH: def.minH }
    }
    if (cursorX + def.w > GRID_COLS_LG) { cursorX = 0; cursorY += def.h }
    const item: Layout = { i: b.id, x: cursorX, y: cursorY, w: def.w, h: def.h, minW: def.minW, minH: def.minH }
    cursorX += def.w
    return item
  })
}

export function BlockGrid({ blocks, canEdit, slug, config, renderBlock }: BlockGridProps) {
  const [pending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasPersistedOnMount = useRef(false)

  const lgLayout = useMemo(() => buildLgLayout(blocks), [blocks])
  const layouts: Layouts = useMemo(() => ({ lg: lgLayout }), [lgLayout])

  /** Debounced save: RGL fires onLayoutChange on every step of a drag/resize;
   *  coalesce into a single saveDashboardConfig call. */
  const scheduleSave = (nextLg: Layout[]) => {
    if (!canEdit) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const next = applyLayoutChange(config, nextLg.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })))
      startTransition(async () => {
        const res = await saveDashboardConfig(slug, next)
        if (!res.ok) setErrorMsg(res.error)
      })
    }, SAVE_DEBOUNCE_MS)
  }

  /** On mount, if there are any unplaced blocks (no persisted layout), the
   *  packed layout we just computed is divergent from what's stored — write it
   *  back exactly once so subsequent loads are stable. Editors only. */
  useEffect(() => {
    if (!canEdit || hasPersistedOnMount.current) return
    const hasUnplaced = blocks.some((b) => !b.layout)
    if (!hasUnplaced) return
    hasPersistedOnMount.current = true
    scheduleSave(lgLayout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const handleLayoutChange = (_current: Layout[], all: Layouts) => {
    if (!all.lg) return
    scheduleSave(all.lg)
  }

  return (
    <>
      {errorMsg && (
        <p className="mb-3 text-xs text-[#FF6666]" role="alert">
          Save failed: {errorMsg}
        </p>
      )}
      <ResponsiveGrid
        className={pending ? 'opacity-90' : undefined}
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        margin={[20, 20]}
        isDraggable={canEdit}
        isResizable={canEdit}
        onLayoutChange={handleLayoutChange}
        compactType="vertical"
        preventCollision={false}
        draggableCancel=".block-no-drag"
      >
        {blocks.map((b) => (
          <div key={b.id} className={canEdit ? 'cursor-grab' : undefined}>
            <div className="block-no-drag h-full">{renderBlock(b)}</div>
          </div>
        ))}
      </ResponsiveGrid>
    </>
  )
}
```

Notes:
- The `block-no-drag` selector inside each grid cell stops RGL from claiming clicks targeted at the block chrome (kebab menu, popover buttons, the detach badge). The outer cell wrapper handles drag.
- `draggableCancel` is the standard RGL escape hatch for "click me, don't drag me." We use this rather than `draggableHandle` because today's `KpiBlock` doesn't have a dedicated drag-handle UI yet — every cell is draggable except the inner chrome. Adding a visible handle is a polish-pass item, not a blocker.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Smoke-test locally**

This task introduces real UI behavior — typecheck alone can't verify it. Run the dev server and verify:

Run: `npm run dev`

In a browser, sign in and navigate to a configurable dashboard (e.g. `/dashboard/<some-client>/configurable-dashboard`). Confirm:

1. The page renders without console errors.
2. The grid lays out at the same visual cadence as before (4 KPIs per row at desktop width).
3. **As an editor:** dragging a block moves it; releasing it snaps to grid; refreshing the page preserves the new position.
4. **As an editor:** the resize handle at the lower-right of a block lets you grow/shrink it; the new size persists across refresh.
5. **As an editor:** clicking the kebab menu (⋯) opens the popover (i.e., RGL does NOT swallow the click).
6. **As a viewer (open as a client account or simulate):** no drag handles, no resize handles, position read-only.

If anything in 1–6 fails, fix in place rather than committing.

Run: stop the dev server (Ctrl+C).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json components/dashboard/block-grid.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): drag-place-resize grid via react-grid-layout

Replaces the @dnd-kit 1D-reorder grid with react-grid-layout's
responsive drag-place-resize grid. Per-block {x, y, w, h} now drives
position and size; debounced (300ms) persistence via saveDashboardConfig.
Blocks without a stored layout auto-pack at their per-kind default size
on first render; editors persist that packing once on mount so
subsequent loads are stable. Viewers see the same grid read-only.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Push and update PR**

Run: `git push`
Expected: branch advances; PR #76 picks up the new commits.

Run: `gh pr view 76 --json url,additions,deletions,changedFiles` (sanity-check the PR diff is the expected size — roughly +1000/-200 for the full sub-project #1).

---

## Self-Review

**1. Spec coverage** — every section of [docs/superpowers/specs/2026-06-24-self-service-blocks-and-layout-design.md §4](../specs/2026-06-24-self-service-blocks-and-layout-design.md) is covered:
- §4.1 Schema changes → Task 1 (`BlockKind`, `BlockLayout`, KPI annotations).
- §4.2 Persistence parser → Task 1 (parse `kind`, `subLabel`/`target`/`ceiling`; tighten `layout`).
- §4.3 Layout system + §4.4 `applyLayoutChange` → Task 2 (pure helper) + Task 5 (wired into RGL grid).
- §4.5 Migration (unplaced blocks auto-pack and persist) → Task 5 (mount-effect persists once for editors).
- §4.6 Per-kind defaults → Task 2 (`DEFAULT_LAYOUT`, `GRID_COLS_LG`).
- §4.7 Page route dispatcher → Task 4.
- §4.8 KPI v2 renderer (on `KpiCard`, with `subLabel`/`target`/`ceiling`) → Task 3.
- §4.9 File list → matches Task 1–5 file lists exactly.
- §4.10 Testing → Task 1 (persistence cases), Task 2 (`applyLayoutChange`, defaults), Task 3 (`kpiAnnotationColor`). KPI block rendering tests are excluded per "pure tests only" convention; the testable pure logic (color band) is unit-tested instead.
- §4.11 Out-of-scope items respected (no other kinds, no resolver changes, no NL changes, no TripleWhale/SM adapter changes).

**2. Placeholder scan** — none. Every code step shows the actual code; every command step shows the actual command and expected outcome.

**3. Type consistency** — `BlockKind`, `BlockLayout`, `KpiBlockProps`, `applyLayoutChange`, `DEFAULT_LAYOUT`, `GRID_COLS_LG`, `kpiAnnotationColor`, `KPI_ANNOTATION_CLASS`, `UnsupportedBlockState` all defined in one task and consumed by name in subsequent tasks. `KpiBlockProps` exactly matches the prior `MetricBlockProps` shape so Task 4's dispatcher swap is a single import + symbol change.

**4. Compile-green seams** —
- Task 1: schema changes are additive (`kind?`, `subLabel?`, `target?`, `ceiling?` all optional); the `layout?: BlockLayout` retype is structurally widening for the only field anyone writes (no prod code writes `layout` today — `block-grid.tsx` ignores it).
- Task 2: pure additions; nothing references them yet.
- Task 3: new files; nothing references them yet.
- Task 4: single import swap + delete; grep step (4.1) gates against unexpected importers.
- Task 5: dep install + single-file rewrite; `BlockGridProps` shape unchanged so `DashboardShell` is unaffected.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-24-self-service-blocks-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task with the writing-plans → subagent-driven-development pattern; review between tasks; fast iteration. Best when you want each commit independently scrutinized before the next task starts.

**2. Inline Execution** — execute all five tasks in this session using `superpowers:executing-plans`, with checkpoints between tasks. Best when you want to keep the work in one head and ship the whole sub-project in one sitting.

Which approach?
