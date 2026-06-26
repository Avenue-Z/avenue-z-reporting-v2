# Bar + Line Block Kinds — Design (Sub-project #3)

**Status:** Draft v1 — R&D
**Date:** 2026-06-25
**Branch:** `feat/configurable-dashboard-rnd`
**Source:** Sub-project #3 of [2026-06-24-self-service-blocks-and-layout-design.md](./2026-06-24-self-service-blocks-and-layout-design.md)
**Depends on:** [2026-06-25-resolver-polymorphism-design.md](./2026-06-25-resolver-polymorphism-design.md) (sub-project #2 — must ship first)
**Predecessor specs:**
- `2026-06-24-self-service-blocks-and-layout-design.md` (Foundation, shipped)
- `2026-06-24-progressive-block-streaming-design.md` (Paul's streaming pattern — extended here for charts)
- `2026-06-23-supermetrics-dimension-filters-design.md` (`getSmFields` dimension discovery — reused for builder)

---

## 1. Summary

Land the first two non-KPI block kinds — **bar chart** and **line chart** — end-to-end:

1. **Page-route dispatcher** gains `case 'bar'` and `case 'line'` branches alongside today's `'kpi'`.
2. **`<BarBlock>` and `<LineBlock>` renderers** wrap the existing `components/charts/bar-chart.tsx` and `components/charts/area-chart.tsx` (Recharts-based, proven in production reports). They consume `GroupedResult` and `SeriesResult` from sub-project #2.
3. **Shared chrome** — Paul's kebab-menu + range-popover + detach-badge logic, currently inline in `MetricBlockShell`, is extracted into `<BlockChrome>` so KPI, bar, and line blocks share one source of truth for the per-block edit affordances.
4. **Streaming preserved** — bar/line bodies stream the chart in via Suspense exactly like Paul's `<BlockValue>` pattern. The block's name + chrome render instantly; the chart renders when the resolver promise resolves.
5. **Per-kind manual builders** — `BarBuilder` (leaf + dimension picker) and `LineBuilder` (leaf + granularity picker) plug into the existing add-block dialog as new source modes.
6. **Add-block dialog gains a kind step** — first question is now "what kind of block?" (KPI / Bar / Line / coming-soon for table/narrative/header) before source/builder selection.

After #3 ships, an analyst can build "ROAS by channel" (bar) and "Spend over time" (line) blocks **by hand** through the UI, drag/resize them on the RGL grid, and have them stream onto the dashboard. Replicates 60–70% of the source deck's visual vocabulary. NL inference of kind lands in sub-project #5.

---

## 2. Key decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Chart library | **Recharts** (already installed `^3.7.0`) via existing `components/charts/{bar-chart,area-chart}.tsx` | Six chart wrappers already exist and ship in five report sections (TikTok / LinkedIn / Shopify / Reddit / Paid Search). Zero new charting deps |
| Chrome extraction | Move the kebab + popover + range-override logic from `MetricBlockShell` (Paul's) into a new `<BlockChrome>` server-friendly client component. `MetricBlockShell` keeps the KPI-shaped body and consumes `<BlockChrome>` | Avoids duplicating 200+ lines of popover code across 6 block kinds. One source of truth |
| Per-block body card | Each kind's body is its own card component (`KpiBlockBody`, `BarBlockBody`, `LineBlockBody`) inside `<BlockChrome>` | The chart card needs more vertical space, different padding, axis labels — different layout from KPI tile. Extracting a generic body would create dead abstraction |
| Streaming for charts | Same Suspense pattern as `<BlockValue>`. `<BarBlock>` server component awaits `groupedPromise`; `<LineBlock>` awaits `seriesPromise`. While unresolved, render `<ChartSkeleton>` (new) | Identical streaming behavior across all block kinds — analyst sees the block frame instantly, chart paints when data arrives |
| Chart sizing | Charts render at `height = "100%"` inside their card; card height comes from the RGL `h × rowHeight (60px) − chrome`. Recharts `ResponsiveContainer` already handles this | Today's report-section charts use `height={300}` (fixed). For the grid we want resize-driven sizing. `ResponsiveContainer` natively does this when given a fixed-height parent |
| Bar orientation | **Horizontal bars** (categories on Y axis, value on X axis). Recharts `layout="vertical"` | Matches the deck's "by country / by channel" ranked breakdowns. Vertical column charts can land as a flag later if requested |
| Target / ceiling on bar | Render via Recharts `<ReferenceLine x={target} stroke={green} />` and `<ReferenceLine x={ceiling} stroke={orange} />`. **Both optional.** Only drawn if the binding has the field | Mirrors the deck's slide 2 "Target 250 / Ceiling 280" overlay. No extra block kind needed |
| Compare overlay on bar | Per-bar prev-period overlay rendered as a lighter-shaded companion bar (Recharts `<Bar dataKey="prevValue">`). Only rendered when any row has a `prevValue` | Deck shows this for paid-search KPIs; same pattern on grouped works one-to-one |
| Compare overlay on line | Second `<Area>` series at reduced opacity (`fillOpacity={0.1}`, `strokeOpacity={0.4}`). Only rendered when any point has a `prevValue` | Standard "prior period as background" pattern; visually intuitive |
| Series x-axis labels | Format buckets via `date-fns` `format()` with a granularity-aware pattern (`MMM d` for day; `'wk' w` for week; `MMM yy` for month) | Raw ISO is unreadable in a chart. `date-fns` already a dep |
| Bar dimension picker | Reuse the **existing** `dimOpts` list `LeafBuilder` already fetches from `getSmFields` (sub-project A-23). New `<DimensionPicker>` is a thin wrapper over `<SearchCombobox>` | Discovery already works; only UI is "expose to the builder" |
| Line granularity picker | New `<GranularityRadio>` — three pills (Day / Week / Month). State lives in the line draft | Trivial UI; doesn't need a combobox |
| Multi-leaf line (e.g. revenue + spend on one chart) | **v1 single-leaf only**. `LineBuilder` produces exactly one `LeafBinding`. Multi-leaf line is a v2 extension that adds an array of leaves to the binding | Single leaf covers every line chart in the deck. Multi-leaf can land cleanly later without breaking the v1 shape |
| Add-block dialog kind step | New first step **"Block kind"** (KPI / Bar / Line / Coming Soon Table / Coming Soon Narrative / Coming Soon Header) before source/mode/build | Self-service primacy: the analyst decides what they want to see, then picks data — not the other way around |
| Kind drop-down for header / narrative / table | Greyed "Coming in v2" rows in the kind step | Visible roadmap without dead-end clicks |

### Architecture: kind-dispatch + body-per-kind + shared chrome

```
                ┌──────────────────────────────────────────┐
                │ app/.../page.tsx — renderBlockNode(block)│
                │   switch (block.kind ?? 'kpi') {          │
                │     case 'kpi':  KpiBlock                 │
                │     case 'bar':  BarBlock                 │
                │     case 'line': LineBlock                │
                │     default:     UnsupportedBlockState    │
                │   }                                       │
                └────────────────────┬─────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
  ┌──────────┐               ┌──────────────┐             ┌───────────────┐
  │ KpiBlock │               │   BarBlock   │             │   LineBlock   │
  │ (Paul's  │               │   (NEW)      │             │   (NEW)       │
  │ shell)   │               │              │             │               │
  └─────┬────┘               └──────┬───────┘             └───────┬───────┘
        │                           │                             │
        │ <BlockChrome>             │ <BlockChrome>               │ <BlockChrome>
        │   <KpiBlockBody>          │   <BarBlockBody>            │   <LineBlockBody>
        │     <Suspense>            │     <Suspense>              │     <Suspense>
        │       <BlockValue/>       │       <BarChart data .../> │       <AreaChart data .../>
        │     <BlockDelta/>         │     <ChartSkeleton/>        │     <ChartSkeleton/>
        │     …                     │   </BlockBody>              │   </BlockBody>
        │   </KpiBlockBody>         │ </BlockChrome>              │ </BlockChrome>
        │ </BlockChrome>            │                             │
```

`<BlockChrome>` is shared. Each kind owns its body. Each kind streams its data via Suspense.

---

## 3. Type contracts (re-exports + new)

Most contracts are inherited from sub-project #2. The new public types in this sub-project are about the chart-data shape passed into the existing Recharts wrappers.

```ts
// Re-used from #2:
import type { GroupedResult, SeriesResult, Granularity } from '@/lib/dashboard/types'

// NEW — chart-input shapes the bodies build from resolver results.
// These mirror what components/charts/bar-chart.tsx and area-chart.tsx already accept.
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

Adapters between `GroupedResult` → `BarChartInput` and `SeriesResult` → `LineChartInput` are pure functions, exported, unit-tested.

---

## 4. Renderer designs

### 4.1 `<BarBlock>` (server component, async)

```
components/dashboard/blocks/bar-block.tsx
```

```tsx
import { Suspense } from 'react'
import type { GroupedResult, PersistedBlock, DashboardConfig } from '@/lib/dashboard/types'
import { BlockChrome } from '../block-chrome'
import { BarBlockBody } from './bar-block-body'
import { ChartSkeleton } from '../chart-skeleton'

export interface BarBlockProps {
  block: PersistedBlock
  groupedPromise: Promise<GroupedResult>
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}

export async function BarBlock(props: BarBlockProps) {
  return (
    <BlockChrome {...props}>
      <Suspense fallback={<ChartSkeleton kind="bar" />}>
        <BarBlockBody
          name={props.block.name}
          groupedPromise={props.groupedPromise}
          target={props.block.target}
          ceiling={props.block.ceiling}
          format={props.block.format}
        />
      </Suspense>
    </BlockChrome>
  )
}
```

`<BarBlockBody>` is the async server component that awaits `groupedPromise`:

```tsx
async function BarBlockBody({ name, groupedPromise, target, ceiling, format }) {
  const r = await groupedPromise
  if (!r.ok) return <BlockBodyError name={name} error={r.error} />
  if (r.rows.length === 0) return <BlockBodyError name={name} error="no-data" />
  const input = toBarChartInput(r, target, ceiling, format)
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 h-full">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <div className="mt-3 h-[calc(100%-2rem)]">
        <BarChart
          data={input.data}
          xKey="dim"
          yKeys={input.hasCompare
            ? [{ key: 'value', label: 'Current' }, { key: 'prevValue', label: 'Prior', color: 'rgba(255,255,255,0.25)' }]
            : [{ key: 'value' }]}
          // Horizontal bars; reference lines for target/ceiling on the value axis.
          orientation="horizontal"
          referenceLines={[
            ...(input.target  !== undefined ? [{ x: input.target,  color: '#5DD39E', label: `Target ${input.target}`  }] : []),
            ...(input.ceiling !== undefined ? [{ x: input.ceiling, color: '#FF8A3D', label: `Ceiling ${input.ceiling}` }] : []),
          ]}
        />
      </div>
    </div>
  )
}
```

The `<BarChart>` component (existing) needs two **additive optional props** to support this: `orientation?: 'horizontal' | 'vertical'` (default vertical = current behavior) and `referenceLines?: { x: number; color: string; label?: string }[]`. Both default to "unused" — zero impact on its current consumers (TikTok, LinkedIn, etc.).

### 4.2 `<LineBlock>` (server component, async)

Identical structural pattern, swapped for `seriesPromise: Promise<SeriesResult>` and `<AreaChart>`. `<AreaChart>` also gets two additive optional props: an x-axis tick formatter and a `compareDataKey?: string` so the second series renders dimmed.

```tsx
async function LineBlockBody({ name, seriesPromise, format }) {
  const r = await seriesPromise
  if (!r.ok) return <BlockBodyError name={name} error={r.error} />
  if (r.points.length === 0) return <BlockBodyError name={name} error="no-data" />
  const input = toLineChartInput(r, format)
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 h-full">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <div className="mt-3 h-[calc(100%-2rem)]">
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

### 4.3 `<BlockChrome>` — extracted shared wrapper

Today the kebab + popover + range-override-popover lives in two places: `metric-block.tsx`'s `BlockShell` inner function (Paul's) and our deleted `kpi-block.tsx`. Sub-project #3 extracts it into one file.

```
components/dashboard/block-chrome.tsx
```

```tsx
'use client'

import { useState, useTransition, type ReactNode } from 'react'
// … same imports as today's MetricBlockShell

export interface BlockChromeProps {
  block: PersistedBlock
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
  children: ReactNode                      // the kind-specific body
}

export function BlockChrome({ block, canEdit, slug, config, activeDefault, children }: BlockChromeProps) {
  // — all the popover state, save logic, drift badge, detach badge, confirm rows —
  // (verbatim port of today's `BlockShell` from metric-block.tsx)
  return (
    <div className="relative h-full">
      {children}
      {canEdit && <KebabPopover ... />}
    </div>
  )
}
```

`MetricBlockShell` (KPI body) keeps existing prop signature but its body is reduced to:

```tsx
export function MetricBlockShell({ block, value, delta, sub, ...rest }: MetricBlockShellProps) {
  return (
    <BlockChrome block={block} {...rest}>
      <KpiBlockBody name={block.name} value={value} delta={delta} sub={sub} isOverridden={block.range !== null} />
    </BlockChrome>
  )
}
```

This is a pure refactor of Paul's code — no behavior change for KPI blocks. The single-source-of-truth chrome serves bar, line, and every future kind.

### 4.4 `<ChartSkeleton>` (new)

Shimmer rectangle matching the chart's footprint:

```tsx
export function ChartSkeleton({ kind }: { kind: 'bar' | 'line' }) {
  return (
    <div
      className="h-full w-full animate-pulse rounded-lg bg-white/[0.04]"
      aria-busy="true"
      aria-label={`Loading ${kind} chart`}
    />
  )
}
```

Lives in `components/dashboard/chart-skeleton.tsx`. Two variants in case bar/line want distinct shimmer shapes later; for v1 they're identical.

### 4.5 `<BlockBodyError>` (new)

Same shape as Paul's `<BlockValueError>` but card-sized for chart bodies — title + small body, used by both `BarBlockBody` and `LineBlockBody`:

```tsx
export function BlockBodyError({ name, error, slug }: { name: string; error: BlockError; slug: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 h-full flex flex-col">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <div className="mt-auto"><BlockValueError error={error} slug={slug} /></div>
    </div>
  )
}
```

Lives in `metric-block-states.tsx` (Paul's file) — reuses his `BlockValueError`'s copy table.

---

## 5. Pure adapters (data shape conversion)

```
lib/dashboard/charts.ts                    # NEW: pure conversion helpers
```

```ts
import { format as formatDate } from 'date-fns'
import type { GroupedResult, SeriesResult, MetricFormat, Granularity } from './types'
import type { BarChartInput, LineChartInput } from '@/components/dashboard/blocks/types'

/** Convert a GroupedResult into the BarChart's data shape. Pulls the (sole, v1)
 *  dim key out of each row's `dim` object and re-keys to a flat `dim` string. */
export function toBarChartInput(
  r: Extract<GroupedResult, { ok: true }>,
  target: number | undefined,
  ceiling: number | undefined,
  format: MetricFormat,
): BarChartInput

/** Convert a SeriesResult into the LineChart's data shape. Adds a formatted
 *  `bucketLabel` per point (date-fns) suitable for x-axis ticks. */
export function toLineChartInput(
  r: Extract<SeriesResult, { ok: true }>,
  format: MetricFormat,
): LineChartInput

/** Granularity-aware x-axis tick format string. */
export function bucketLabelPattern(g: Granularity): string {
  if (g === 'day') return 'MMM d'         // Jun 24
  if (g === 'week') return "'Wk' w"       // Wk 26
  return 'MMM yy'                          // Jun 26
}
```

Pure functions, fully unit-tested in `lib/dashboard/charts.test.ts`. No React, no fetch — just shape mapping.

---

## 6. Page-route dispatcher

Extends today's `renderBlockNode` in `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`:

```tsx
function renderBlockNode(block, activeDefault, slug, canEdit, config) {
  const kind = block.kind ?? 'kpi'
  switch (kind) {
    case 'kpi': {
      // — unchanged: spin valuePromise + prevPromise, hand to MetricBlockShell
    }
    case 'bar': {
      const eff = block.range ?? activeDefault
      // resolveGroupedBlock honors prev semantics internally — single promise.
      const groupedPromise = resolveGroupedBlock(block, eff, { slug })
      return <BarBlock block={block} groupedPromise={groupedPromise} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault} />
    }
    case 'line': {
      const eff = block.range ?? activeDefault
      const seriesPromise = resolveSeriesBlock(block, eff, { slug })
      return <LineBlock block={block} seriesPromise={seriesPromise} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault} />
    }
    default:
      return <UnsupportedBlockState kind={kind} name={block.name} />
  }
}
```

`resolveGroupedBlock` and `resolveSeriesBlock` already handle current + compare inside the function (per sub-project #2's design). The page route just hands off one promise per kind.

---

## 7. Add-block dialog: kind step + per-kind builders

### 7.1 Updated dialog flow

```
[Step 1] Block kind        → KPI | Bar chart | Line chart | (Coming v2: Table, Narrative, Header)
[Step 2] Source            → Supermetrics | TripleWhale | Aggregate (KPI only) | Calculated (KPI only)
[Step 3] Mode              → Describe with AI | Build manually
[Step 4] Prompt OR Build   → (NL flow OR manual form, kind-aware)
[Step 5] Preview & confirm → live-resolved preview card
```

The dialog component (`components/dashboard/add-block/add-block-dialog.tsx`) gains:
- A `kind: BlockKind` state (default `'kpi'`).
- A first step that lists the six kinds (3 active + 3 coming-soon greyed).
- A kind-aware step-2 list — `bar`/`line` only show `Supermetrics` and `TripleWhale`; `aggregate`/`calculated` greyed with tooltip "KPI only in v1."
- A kind-aware step-4 — passes the kind through to `<ManualBlockForm>`, which dispatches to `<LeafBuilder>` (KPI), `<CalculatedBuilder>` (calculated), `<BarBuilder>` (bar — leaf + dim picker), or `<LineBuilder>` (line — leaf + granularity picker).
- A kind-aware preview — bar/line preview cards spin a fresh `groupedPromise`/`seriesPromise` and stream the chart, exactly like the dashboard does.

### 7.2 `<BarBuilder>` (manual)

```
components/dashboard/add-block/bar-builder.tsx
```

```tsx
'use client'
import { LeafBuilder } from './leaf-builder'
import { DimensionPicker } from './dimension-picker'
import type { LeafDraft } from './build-config'

export interface BarDraft {
  source: 'bar'
  leaf: LeafDraft                            // SM or TW leaf
  dimension: string                          // single dim column id
}

export function BarBuilder({ value, onChange, slug }: { value: BarDraft; onChange: (v: BarDraft) => void; slug: string }) {
  return (
    <div className="flex flex-col gap-3">
      <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={(leaf) => onChange({ ...value, leaf })} slug={slug} />
      <DimensionPicker
        leaf={value.leaf}
        slug={slug}
        value={value.dimension}
        onChange={(dimension) => onChange({ ...value, dimension })}
      />
    </div>
  )
}
```

`<DimensionPicker>` reuses the `dimOpts` array already loaded by `LeafBuilder` (it's exported once or re-fetched via `getSmFields`). For TW, the dimension picker shows a hand-curated list of pixel-joined-tvf columns (`channel`, `country`, `device`, `campaign_name`, `ad_name`, `utm_source`, `utm_campaign` — the same safe-column allowlist as filters).

### 7.3 `<LineBuilder>` (manual)

```
components/dashboard/add-block/line-builder.tsx
```

```tsx
export interface LineDraft {
  source: 'line'
  leaf: LeafDraft
  granularity: Granularity
}

export function LineBuilder({ value, onChange, slug }) {
  return (
    <div className="flex flex-col gap-3">
      <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={(leaf) => onChange({ ...value, leaf })} slug={slug} />
      <GranularityRadio value={value.granularity} onChange={(g) => onChange({ ...value, granularity: g })} />
    </div>
  )
}
```

### 7.4 `build-config.ts` extensions

```ts
// Add to ManualDraft union:
| { kind: 'bar';  name: string; format: MetricFormat; bar: BarDraft }
| { kind: 'line'; name: string; format: MetricFormat; line: LineDraft }

// New conversions:
export function barToBlockConfig(d: BarDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'>
export function lineToBlockConfig(d: LineDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'>

// isDraftComplete extended for bar (leaf complete + dimension non-empty)
// and line (leaf complete + granularity in {day, week, month}).
```

The output `BlockConfig` carries `kind: 'bar' | 'line'`, and the leaf binding has `dimensions: [bar.dimension]` (bar) or `granularity: line.granularity` (line) — exactly what sub-project #2's resolvers expect.

---

## 8. Preview card (live-streamed)

`components/dashboard/add-block/block-preview-card.tsx` exists today for KPI previews. Extend it with a kind-aware switch:

- `kind === 'kpi'` → existing `resolveBlock` + KPI render (unchanged).
- `kind === 'bar'` → `resolveGroupedBlock` + `<BarBlockBody>` (read-only — no chrome).
- `kind === 'line'` → `resolveSeriesBlock` + `<LineBlockBody>` (read-only).

Preview always renders without `<BlockChrome>` — the preview already lives in a modal with its own chrome.

---

## 9. Files

```
app/dashboard/[clientSlug]/configurable-dashboard/
  page.tsx                                   # MODIFY: renderBlockNode adds 'bar' and 'line' cases.

components/dashboard/
  block-chrome.tsx                           # CREATE: extracted shared chrome (kebab + popover + badges).
  block-chrome.test.ts                       # CREATE: pure mutation-helper tests (the popover state machine).
  chart-skeleton.tsx                         # CREATE.
  metric-block.tsx                           # MODIFY: collapse to MetricBlockShell that wraps <BlockChrome>.
  metric-block-states.tsx                    # MODIFY: + <BlockBodyError>.

  blocks/
    bar-block.tsx                            # CREATE
    bar-block-body.tsx                       # CREATE
    line-block.tsx                           # CREATE
    line-block-body.tsx                      # CREATE
    types.ts                                 # CREATE: BarChartInput, LineChartInput.

  add-block/
    add-block-dialog.tsx                     # MODIFY: kind step (new step 1); kind-aware flow.
    bar-builder.tsx                          # CREATE.
    line-builder.tsx                         # CREATE.
    dimension-picker.tsx                     # CREATE.
    granularity-radio.tsx                    # CREATE.
    build-config.ts                          # MODIFY: + BarDraft, LineDraft, barToBlockConfig, lineToBlockConfig.
    build-config.test.ts                     # MODIFY: + bar/line cases.
    block-preview-card.tsx                   # MODIFY: kind dispatch.
    manual-block-form.tsx                    # MODIFY: kind dispatch into BarBuilder / LineBuilder.

components/charts/
  bar-chart.tsx                              # MODIFY: + optional `orientation`, + optional `referenceLines`.
  bar-chart.test.ts                          # CREATE if absent: covers the prop additions (assert empty referenceLines is no-op).
  area-chart.tsx                             # MODIFY: + optional xTickFormatter, + optional compareDataKey.

lib/dashboard/
  charts.ts                                  # CREATE: toBarChartInput, toLineChartInput, bucketLabelPattern.
  charts.test.ts                             # CREATE.

  block-grid-defaults.ts                     # (unchanged — already covers bar/line w/h)
```

---

## 10. Testing strategy

All pure tests via `npx tsx` + `node:assert`.

### 10.1 Pure adapters

`lib/dashboard/charts.test.ts`:

- `toBarChartInput`: ok result with 3 rows → 3 data entries, dim key flattened to `'dim'` field.
- `toBarChartInput`: any row has `prevValue` → `hasCompare: true`; no row has → `hasCompare: false`.
- `toBarChartInput`: passes `target` / `ceiling` through verbatim from arguments.
- `toLineChartInput`: each point's `bucketLabel` matches `format(bucket, bucketLabelPattern(granularity))`.
- `toLineChartInput`: `hasCompare` true iff at least one point has `prevValue`.
- `bucketLabelPattern`: returns the documented format string per granularity.

### 10.2 Build-config

`components/dashboard/add-block/build-config.test.ts`:

- `barToBlockConfig({ leaf, dimension: 'channel' }, ...)` produces a binding with `dimensions: ['channel']` and `kind: 'bar'`.
- `lineToBlockConfig({ leaf, granularity: 'week' }, ...)` produces a binding with `granularity: 'week'` and `kind: 'line'`.
- `isDraftComplete` returns false for incomplete bar (missing dim) / line (missing granularity).
- `buildBlockConfig` round-trips both kinds.

### 10.3 Chart-component additions

`components/charts/bar-chart.test.ts`:

- With `referenceLines: undefined` the rendered tree contains zero `<ReferenceLine>` elements (assert via Recharts dry-render API or via a tiny test that imports the component and inspects React.Children — pure JS check).
- With `referenceLines: [{x: 250, color: '#5DD39E'}]` exactly one is rendered.
- (We **do not** render the chart in jsdom — Recharts uses ResizeObserver. Tests assert on the React element tree only.)

If pure-element-tree tests prove brittle, **skip** them and rely on visual smoke-test in the integration phase (§11). Don't waste time fighting Recharts internals.

### 10.4 Streaming integration

A new `components/dashboard/blocks/bar-block.test.ts` covers the **non-React** logic only:

- The `BarBlockBody`'s `r.rows.length === 0 → 'no-data'` branch.
- The `BarBlockBody`'s error mapping (`r.ok === false` falls through to `BlockBodyError`).

These are pure conditional flows, asserted by directly calling the component's logic-extracted helpers (the chart rendering itself is not asserted).

### 10.5 Page route

Smoke test only — once #3 lands, manually load a dashboard with one KPI + one bar + one line block, confirm:
- Three blocks render
- Chrome (kebab) works on each
- Drag/resize works on each
- Reload preserves layout

Live verification is the demo deliverable, not a unit test.

---

## 11. Self-service journey (end-to-end after #3)

The analyst, after #3 ships, can build the deck's slide 2 entirely in-app:

1. Open dashboard for `examplebrand`.
2. Click **+ Add block** → modal opens.
3. **Step 1 — Kind:** picks **Bar chart**.
4. **Step 2 — Source:** picks **Supermetrics**.
5. **Step 3 — Mode:** picks **Build manually**.
6. **Step 4 — Build:** picks DS = Meta Ads, metric = `Spend`, account = `act_…`, dimension = `Country`. Title: "Spend by country". Format: `currency`.
7. **Step 5 — Preview:** modal renders a live horizontal bar chart of the last 30 days' spend by country, top to bottom.
8. Clicks **Save**.
9. Block lands at `{x, y, w=6, h=4}` at the next free grid slot.
10. Analyst drags it into place, resizes it to `w=8, h=4`. Layout persists.
11. Repeats for a **Line chart** ("Spend over time, weekly") and 4 KPI blocks. Total time: ~10 minutes.

Slide 2 of the source deck is now a live dashboard.

---

## 12. Out of scope (explicit)

- Tables, narrative panels, and headers — sub-project #4. The kind step shows them as "Coming v2" greyed rows.
- NL inference of kind ("by channel" → bar). Sub-project #5.
- Multi-leaf line (revenue + spend on one chart). v2 — extends `LineDraft` and `SeriesResult` shape.
- Multi-dimension grouping (channel × country matrix). v2 — extends `GroupedRow.dim` to multi-key, requires resolver work in #2's spec (deferred there too).
- Aggregate / calculated bindings as bar or line sources. v2 — requires `resolveGrouped`/`resolveSeries` to accept non-leaf bindings.
- Bar chart with vertical (column) orientation. Flag-flip after v1 if analysts request.
- Chart export (PNG / SVG). Track for the eventual report-export feature; not a #3 deliverable.
- Per-bar / per-point click-to-drill-down. v2 — would route to a filtered KPI block view.
- A11y deep work (screen-reader chart annotation). Recharts has basic ARIA; spec-track for v2.
- **Live-streamed preview card for chart kinds**: deferred from v1 — chart blocks save directly to the dashboard and stream there. Preview-card kind dispatch is a v2 polish item.

---

## 13. Open questions

- **Recharts horizontal-bar Y-axis tick width:** when dim values are long ("United States of America"), the Y-axis labels can crowd. v1: rely on Recharts auto-wrap; if it looks bad in real data, add an axis `width={140}` prop. Verify in smoke test.
- **TW dimension allowlist:** what columns are safe and meaningful for `pixel_joined_tvf` grouping? Proposed v1 list: `channel`, `country`, `device`, `campaign_name`, `ad_name`, `utm_source`, `utm_campaign`. Validate with Paul before locking — he's closer to the TW schema.
- **Preview-card resolver cost:** the live preview hits SM/TW on every keystroke as the analyst tunes the dimension. Today's KPI preview already does this; it's cache-warm 95% of the time. If a chart preview hammers SM (grouped queries are slower), debounce the preview fetch behind a 500ms idle timer. v1: ship without debounce; add if it shows up as a real problem.
- **`BarChart` orientation prop scope:** today's `BarChart` component is used by 5 report sections — adding `orientation` widens its surface. Pure-additive change (default = vertical = today's behavior), but worth a 5-min PR self-review to confirm no rendering shift.
- **Granularity defaults per date range:** if the analyst picks "Last 7 days" and `granularity: 'month'`, the line chart renders one point. Should the builder auto-suggest granularity from the range (7d→day, 30d→day, 90d→week, 1y→month)? v1: no auto-suggest, user picks freely. Track as a UX polish item.
- **Chart skeleton size:** RGL's row height (60px) means a `h=4` card is ~220px tall after chrome. Skeleton shimmer at full body height. Confirm visually that the shimmer isn't taller than the card on initial paint.
- **Compare overlay legend:** when both current and prev bars/lines render, the chart needs a small legend ("Current" / "Prior"). Recharts has `<Legend>`. v1: render legend automatically when `hasCompare`; bottom-aligned, small.

---

## 14. Notes

- This sub-project is the **first user-visible payoff** of the multi-sub-project plan. After #1 (Foundation) and #2 (Resolver polymorphism) ship invisibly, #3 puts charts on the screen. The demo gates here.
- The chrome extraction (`<BlockChrome>`) is a pure refactor — no behavior change for KPI blocks. It's worth doing inside #3 because we're adding two more kinds that need the chrome; not extracting would mean three copies of 200 lines of popover logic. The refactor pays for itself the moment table/narrative/header land in #4.
- Both `<BarChart>` and `<AreaChart>` are touched with **additive optional props** only. Existing reports (TikTok / LinkedIn / Shopify / Reddit / Paid Search) consume them with no change. The new props default to today's behavior.
- The streaming pattern is identical to Paul's KPI streaming — same Suspense boundary, same `Promise<ResolveResult>`-shaped pattern (just `GroupedResult` / `SeriesResult` instead). One mental model across all block kinds.
- After #3 ships and analysts confirm the chart UX feels right, sub-project #4 (Table / Narrative / Header) lands on the same foundation — chrome already shared, kind dispatcher already in place, resolver modes already proven. The architectural debt is intentionally paid in #3 so #4 is fast.
- The "Coming v2" rows in the kind step are not just placeholders — they're a roadmap commitment visible to the analyst. Replacing them with real kinds in #4 means flipping a flag, not redesigning the dialog.
