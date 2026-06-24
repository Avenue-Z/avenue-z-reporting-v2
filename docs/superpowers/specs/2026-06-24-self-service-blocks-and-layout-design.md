# Self-Service Blocks & Layout — Design

**Status:** Draft v1 (brainstorm-confirmed) — R&D
**Date:** 2026-06-24
**Branch:** `feat/configurable-dashboard-rnd`
**Source:** Paid-media reporting deck (slides 1–6, `Geneneral Paid Media Reporting Template.pptx`) + brainstorm transcript 2026-06-24
**Predecessor specs:**
- `2026-06-17-configurable-dashboard-design.md` (sub-projects #1–#5, complete)
- `2026-06-18-dashboard-ui-design.md` (current Metric Block grid, complete)
- `2026-06-23-manual-query-builder-design.md` (manual leaf/aggregate builder, complete)
- `2026-06-23-calculated-metric-design.md` (weighted-sum, complete)

---

## 1. Summary

Replace the paid-media analyst's **weekly slide build** (the source PPTX deck)
with a **fully self-service in-app dashboard**. The analyst should be able to
walk into the app on a Monday morning and compose a client's weekly view —
KPIs, breakdown tables, ranked bar charts, time-series trends, narrative panels —
without writing JSON, without a ticket, and without engineering involvement.

Today the configurable dashboard ships a single block shape — the **scalar KPI
tile**. This spec extends the block engine with a **polymorphic block kind
discriminator** and **five additional block kinds**: bar chart, line/area
chart, breakdown table, narrative panel, and section header. It also lifts the
current 1D drag-to-reorder grid to a true **drag-place-resize layout** powered
by `react-grid-layout`, with `{x, y, w, h}` persisted per block.

The unlock: today's "wall of tiles" becomes a real dashboard that visually
replicates the deck — built by the analyst, in the app, in minutes.

This is a **multi-sub-project build**. This document covers the **overall
architecture** and the **detailed design for sub-project #1** (foundation:
schema discriminator + drag-place-resize layout + page-route dispatcher).
Sub-projects #2–#5 (resolver polymorphism, individual block kinds, AI builder
kind inference) get their own specs as we reach them.

---

## 2. Key decisions (locked in brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Effort shape | Multi-sub-project build; ship layout foundation first as a standalone slice | Foundation is independently demo-able (existing KPI grid gains drag/resize immediately) and unblocks every subsequent block kind |
| Block-type discriminator | First-class `kind` field on `PersistedBlock` (default `'kpi'`) | Current schema has no `kind`; adding it now is cheaper than later. Default `'kpi'` keeps existing configs valid |
| Layout library | **`react-grid-layout`** (RGL) | De-facto standard for drag/resize grid dashboards; small dep; responsive variant built-in; already used by Grafana, Looker Studio, Notion. dnd-kit is wrong tool for 2D positioning |
| Chart library | **Recharts** (already installed at `^3.7.0`) | Six chart components at `components/charts/` are already built on Recharts and proven in real report sections (TikTok, LinkedIn, Shopify, Reddit, Paid Search). Reuse them; do not introduce a second charting lib |
| New block kinds (v1) | `bar`, `line`, `table`, `narrative`, `header` | Direct mapping to the deck's visual vocabulary: bar = "by channel" breakdowns; line = trend charts; table = country/channel breakdown tables; narrative = SWOT panels; header = slide titles |
| Resolver contract evolution | **Add two new modes** (`grouped`, `series`) alongside existing scalar mode — do not replace | Existing scalar resolver path is load-bearing for current KPI blocks. New modes are additive at the adapter and registry levels |
| Self-service primacy | Every new block kind ships with both **manual builder** and **NL builder** before being declared "done" | Vision is self-service. A block kind that requires writing JSON to use is not done |
| Migration | Existing dashboards (no `kind`, no `{x, y}`) load as if they were `kind: 'kpi'` and auto-pack into the new grid on first read, then persist back | Zero data loss; users see no break |
| KPI presentation | Refactor existing `MetricBlock` to render via `components/charts/kpi-card.tsx` (which has `subValue`, `tooltip`, `invertDelta` that `MetricBlock` lacks) | Eliminates parallel KPI implementations; gains deck-needed features (sub-labels, target/ceiling annotations) for free |
| Targets / ceilings | First-class fields on the KPI binding, not a separate block kind | Deck slide 2 shows "Target 250" / "Ceiling 280" as annotations on values — they're metadata, not their own visual |

### Architecture: three-mode resolver, polymorphic renderer

```
                 ┌──────────────────────────────────────────────┐
                 │ BlockConfig { kind, binding, layout, … }     │
                 └────────────────────┬─────────────────────────┘
                                      │
                              ┌───────┴────────┐
                              │ resolveBlock() │
                              │ — dispatch by  │
                              │   kind + mode  │
                              └───────┬────────┘
                                      │
       ┌──────────────────────────────┼──────────────────────────────┐
       │ SCALAR mode                  │ GROUPED mode                 │ SERIES mode
       │ (kpi)                        │ (bar, table)                 │ (line, area)
       │                              │                              │
       │ adapter.resolveLeaf()        │ adapter.resolveGrouped()     │ adapter.resolveSeries()
       │   → {value, prevValue}       │   → [{dim, value, prevVal}]  │   → [{bucket, value, prevVal}]
       └──────────────────────────────┴──────────────────────────────┘
                                      │
                       ┌──────────────┴──────────────┐
                       │ <ResolvedBlockIsland>       │
                       │ — dispatch by block.kind:   │
                       │   kpi       → <KpiBlock>     │
                       │   bar       → <BarBlock>     │
                       │   line      → <LineBlock>    │
                       │   table     → <TableBlock>   │
                       │   narrative → <NarrativeBlock>│
                       │   header    → <HeaderBlock>   │
                       └──────────────┬──────────────┘
                                      │
                       ┌──────────────┴──────────────┐
                       │ <BlockGrid> (RGL)            │
                       │ — positions blocks via       │
                       │   block.layout {x, y, w, h}  │
                       │ — drag, resize, persist      │
                       └──────────────────────────────┘
```

The current scalar path stays intact. New modes plug into the registry. Each
block kind has one renderer that consumes the resolver mode it needs. The grid
becomes positional; everything in the schema migrates.

---

## 3. Decomposition & build order

Five sub-projects. Each ships independently and is reviewed before the next.

| # | Sub-project | Touches | Demo-able after? |
|---|---|---|---|
| **1** | **Foundation** — `kind` discriminator + `react-grid-layout` swap + page-route dispatcher + KPI v2 (refactor `MetricBlock` onto `KpiCard`; add target/ceiling) | schema, persistence, page route, grid, KPI renderer | Yes — existing KPI grid gains drag/resize + sub-labels + target/ceiling |
| 2 | **Resolver polymorphism** — `resolveGrouped` + `resolveSeries` adapter contracts; Supermetrics + TripleWhale implementations; cache key namespacing | `lib/dashboard/adapters/`, `lib/dashboard/registry.ts`, `lib/dashboard/resolve.ts` | Yes — internal test pages can hit grouped/series resolvers |
| 3 | **Bar + Line block kinds** — `<BarBlock>` and `<LineBlock>` renderers wrapping `components/charts/bar-chart.tsx` and `components/charts/area-chart.tsx`; per-kind manual builders; persistence parsers | `components/dashboard/`, `components/dashboard/add-block/` | Yes — analyst can build a "ROAS by channel" bar block and a "spend over time" line block by hand |
| 4 | **Table + Narrative + Header block kinds** — `<TableBlock>` wrapping `components/charts/data-table.tsx` (multi-metric, in-cell deltas), `<NarrativeBlock>` via `react-markdown`, `<HeaderBlock>` (title + timeframe + source caption) | same as #3 | Yes — analyst can replicate slide 2 end-to-end |
| 5 | **NL kind inference** — `proposeBlock` NL pipeline learns to infer block kind from phrasing ("by channel" → bar, "over time" → line, "country breakdown" → table); per-kind validation + repair prompts | `lib/dashboard/nl/`, `app/actions/dashboard.ts` | Yes — analyst types English and gets the right kind back |

**Building #1 first** means every other sub-project lands on top of a stable
schema + dispatcher + grid. The system stays shippable at every sub-project
boundary — no half-built block kinds in the user's face.

---

## 4. Sub-project #1 — Foundation (detailed design)

**Goal:** introduce the polymorphism scaffolding — `kind` discriminator on
blocks, full `{x, y, w, h}` layout, `react-grid-layout` grid, kind-dispatching
page route, and a KPI v2 renderer that's a drop-in replacement for `MetricBlock`
with deck-required features (sub-label, target/ceiling). No new block kinds, no
new resolver modes, no NL changes — those are #2 through #5.

After #1 ships:
- Every existing dashboard renders identically *unless* the user drags or
  resizes a block. No visual regression.
- The user can drag blocks around the page and resize them; positions and
  sizes persist per client.
- KPI blocks gain optional sub-label, target, and ceiling annotations.
- The dispatcher is in place — adding a new block kind in #3/#4 means
  registering one renderer.

### 4.1 Schema changes

`lib/dashboard/types.ts`:

```ts
// NEW: block kind discriminator. Default is 'kpi' for back-compat.
export type BlockKind = 'kpi' | 'bar' | 'line' | 'table' | 'narrative' | 'header'

// NEW: full grid layout. x/y/w/h required when present; absent → "auto-pack on next save".
export interface BlockLayout { x: number; y: number; w: number; h: number }

// EXTENDED: optional kind (defaults to 'kpi' at parse time); optional KPI annotations.
export interface BlockConfig {
  id: string
  name: string
  kind?: BlockKind                       // omitted = 'kpi' (back-compat)
  binding: Binding                       // unchanged in #1; #2 extends Binding with dimensions/granularity
  format: MetricFormat
  range: { dateRange: string; compareRange: string | null } | null
  // NEW KPI-only annotations (deck slide 2: "13-wk avg kr251", "Target 250", "Ceiling 280"):
  subLabel?: string                      // free text under the value ("13-wk avg kr251")
  target?: number                        // green if value ≥ target
  ceiling?: number                       // orange if value ≥ ceiling
}

// EXTENDED: layout becomes authoritative position + size, not just hint.
export type PersistedBlock = BlockConfig & { layout?: BlockLayout }
```

`subLabel` / `target` / `ceiling` are noise for non-`kpi` kinds in #1, but
adding them now keeps the contract stable across sub-projects.

### 4.2 Persistence parser changes (`lib/dashboard/persistence.ts`)

- `parseBlockConfig` accepts optional `kind`; missing/null → `'kpi'`. Rejects
  unknown kind strings with `expected one of kpi,bar,line,table,narrative,header`.
- `parseBlockConfig` accepts optional `subLabel` (string), `target` (finite
  number), `ceiling` (finite number) on KPI blocks. Silently ignored on other
  kinds (no error — keeps the door open for future per-kind annotations
  without a parser rev each time).
- `layout` parser: **if present, requires all four** of `x`, `y`, `w`, `h` as
  finite non-negative numbers. (The current parser accepts partial `{w?, h?}`;
  this is tightened. Existing configs without `layout` continue to parse fine —
  they get auto-packed on next save, see §4.5.)

### 4.3 Layout system: `react-grid-layout` swap

Add dep:

```
"react-grid-layout": "^1.4.4"
"@types/react-grid-layout": "^1.3.5"  // dev
```

Replace `components/dashboard/block-grid.tsx` body. Today it uses
`@dnd-kit/sortable` `SortableContext` with `rectSortingStrategy` and a static
CSS grid (`grid-cols-2 lg:grid-cols-4`). It becomes:

```tsx
import { Responsive, WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const ResponsiveGrid = WidthProvider(Responsive)

const BREAKPOINTS = { lg: 1200, md: 768, sm: 0 }
const COLS = { lg: 12, md: 8, sm: 4 }                                  // 12-col on desktop
const ROW_HEIGHT = 60                                                  // px per grid row unit

export function BlockGrid({ blocks, canEdit, slug, config, renderBlock }: BlockGridProps) {
  const layouts = buildResponsiveLayouts(blocks)                       // per-breakpoint []
  const handleChange = (_layout, allLayouts) => {
    if (!canEdit) return
    const next = applyLayoutChange(config, allLayouts.lg)              // pure: see §4.4
    startTransition(() => saveDashboardConfig(slug, next))             // debounced
  }
  return (
    <ResponsiveGrid
      layouts={layouts}
      breakpoints={BREAKPOINTS}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      isDraggable={canEdit}
      isResizable={canEdit}
      onLayoutChange={handleChange}
      compactType="vertical"                                           // auto-pack on add
      preventCollision={false}
      draggableHandle=".block-drag-handle"                             // chrome on each block
    >
      {blocks.map((b) => (
        <div key={b.id} data-grid={blockGridItem(b)}>{renderBlock(b)}</div>
      ))}
    </ResponsiveGrid>
  )
}
```

Where `blockGridItem(b)` produces `{ i, x, y, w, h, minW, minH, maxW, maxH }`
with **per-kind size defaults and constraints** (see §4.6).

Viewers (`canEdit=false`) get `isDraggable={false} isResizable={false}` — same
component, gated by prop. No separate "view-only" path needed.

### 4.4 `applyLayoutChange` (pure helper)

`components/dashboard/config-mutations.ts` already has pure config mutations
(`reorderBlocks`, `setBlockRange`, `removeBlock`, `addBlock`). Add:

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

Pure, deterministic, unit-testable. The save action is the existing
`saveDashboardConfig`; no new server action required.

The save is debounced client-side (300ms) to coalesce burst events during a
drag — RGL fires `onLayoutChange` on every grid step.

### 4.5 Migration: blocks without `layout`

A block with no `layout` is "unplaced." On read, `buildResponsiveLayouts`
auto-packs unplaced blocks at default size for their `kind` (§4.6), filling
left-to-right top-to-bottom. The next `onLayoutChange` (which RGL fires on
mount once layouts are normalized) writes the packed layout back to
persistence — so a one-time read becomes a one-time write, and the user never
sees an "unplaced" state.

To avoid a save thrash for viewers (who can't write), the auto-write only
happens when `canEdit=true`. Viewers see the packed layout in the current
session but it doesn't persist until an editor next loads the page.

### 4.6 Per-kind default layouts

Constants in `components/dashboard/block-grid-defaults.ts`:

```ts
export const DEFAULT_LAYOUT: Record<BlockKind, { w: number; h: number; minW: number; minH: number }> = {
  kpi:       { w: 3,  h: 2, minW: 2, minH: 2 },   // small tile, current size
  bar:       { w: 6,  h: 4, minW: 4, minH: 3 },   // half-width chart
  line:      { w: 6,  h: 4, minW: 4, minH: 3 },
  table:     { w: 8,  h: 5, minW: 4, minH: 3 },   // wide breakdown
  narrative: { w: 12, h: 3, minW: 4, minH: 2 },   // full-width prose
  header:    { w: 12, h: 1, minW: 4, minH: 1 },   // full-width slim
}
```

`kpi.w=3` on a 12-col grid yields 4-per-row — identical to the current
`lg:grid-cols-4` visual, so existing dashboards look the same after migration.

### 4.7 Page route dispatcher (`app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`)

The `ResolvedBlockIsland` component currently hardcodes `<MetricBlock>`. It
becomes a kind dispatcher:

```tsx
async function ResolvedBlockIsland({ block, ... }) {
  const kind = block.kind ?? 'kpi'
  switch (kind) {
    case 'kpi': {
      const result = await resolveBlock(block, activeDefault, { slug })
      return <KpiBlock block={block} result={result} {...rest} />
    }
    // #3, #4: case 'bar': return <BarBlock ... /> etc. Each branch picks the right resolver mode.
    default:
      return <UnsupportedBlockState kind={kind} />            // forward-compat: never crash
  }
}
```

In #1, only `'kpi'` is implemented. `UnsupportedBlockState` is a graceful
fallback ("This block type isn't supported in this version — click to delete")
that the dispatcher returns for any unknown `kind`. This means future block
kinds can ship to schema before their renderers ship, with no runtime crash.

### 4.8 KPI v2 renderer

`components/dashboard/metric-block.tsx` is **renamed** to
`components/dashboard/blocks/kpi-block.tsx` and refactored to render via
`components/charts/kpi-card.tsx` instead of building its own value layout. It
keeps all current responsibilities (kebab menu, override popover, detach
badge, delete confirm, error states) but delegates the value/delta/sub-label
presentation to `KpiCard`.

Added behaviors:

- **Sub-label** — `block.subLabel` rendered via `KpiCard.subValue`.
- **Target / ceiling** — when `block.target` or `block.ceiling` is set and
  `result.ok`, render a small annotation row beneath the value. Color rule
  (from deck slide 2 "Orange value = above 280 SEK ceiling"):
  - `value ≥ ceiling` → value text rendered in orange (`#FF8A3D`, existing
    paid-search accent).
  - `value ≥ target` and `value < ceiling` → green (`#5DD39E`, brand-green).
  - Otherwise → default white.
- **Drag handle** — adds a small handle area at the top-left of the card chrome
  with class `block-drag-handle` (the selector RGL listens on); the rest of
  the card remains clickable (kebab menu still works during dnd because of the
  handle scoping).

`KpiBlock`'s component file lives at the new path; the page route imports
update. Existing test file `components/dashboard/metric-block.test.tsx` (if
present) moves alongside.

### 4.9 Files

```
lib/dashboard/
  types.ts                                       # MODIFY: BlockKind, BlockLayout, KPI annotations
  persistence.ts                                 # MODIFY: parse kind, subLabel/target/ceiling, full layout

components/dashboard/
  block-grid.tsx                                 # REWRITE: react-grid-layout swap
  block-grid-defaults.ts                         # CREATE: DEFAULT_LAYOUT map per kind
  config-mutations.ts                            # MODIFY: + applyLayoutChange()
  blocks/
    kpi-block.tsx                                # CREATE (rename of metric-block.tsx, refactored onto KpiCard)
    unsupported-block.tsx                        # CREATE: graceful fallback for unknown kinds
  metric-block.tsx                               # DELETE (renamed)

app/dashboard/[clientSlug]/configurable-dashboard/
  page.tsx                                       # MODIFY: ResolvedBlockIsland dispatcher; import KpiBlock

package.json                                     # MODIFY: + react-grid-layout, @types/react-grid-layout

components/dashboard/__tests__/
  block-grid.test.ts                             # CREATE: applyLayoutChange tests
  block-grid-defaults.test.ts                    # CREATE: per-kind defaults sanity
  persistence.test.ts                            # MODIFY (existing tests + new kind/layout cases)
```

### 4.10 Testing

Follow the existing `tsx` test convention (pure functions only — no live API
calls, no `.env` loading).

**Persistence** (`lib/dashboard/persistence.test.ts`):

- Block with no `kind` parses as `kind: 'kpi'`.
- Block with `kind: 'bar'` parses (renderer not yet implemented; schema is
  forward-compatible).
- Block with `kind: 'wat'` rejected with the expected-one-of error.
- Block with `layout: { x:0, y:0, w:3, h:2 }` parses.
- Block with `layout: { w:3, h:2 }` (no x/y) rejected — full layout required.
- Block with no `layout` parses as `layout: undefined` (auto-pack target).
- KPI annotations: `subLabel`, `target`, `ceiling` all round-trip; non-finite
  `target` rejected.

**Config mutation** (`components/dashboard/__tests__/block-grid.test.ts`):

- `applyLayoutChange` applies position to matching block ID; leaves unmatched
  blocks untouched; ignores layout entries with no matching block.
- `applyLayoutChange` does not mutate input (referential).

**Defaults** (`components/dashboard/__tests__/block-grid-defaults.test.ts`):

- Every `BlockKind` has an entry in `DEFAULT_LAYOUT`.
- All `w/h/minW/minH` are positive integers; all `w` ≤ 12 (fits the desktop
  grid).

**KPI block** (`components/dashboard/blocks/kpi-block.test.tsx`):

- Renders `result.formatted` as the main value.
- Renders `block.subLabel` when present; absent otherwise.
- `value ≥ ceiling` → value text has the ceiling class.
- `value ≥ target` and `< ceiling` → value text has the target class.
- `result.ok === false` → renders the existing error state for that error code.

### 4.11 Explicitly out of scope for #1

- Any block kind other than `kpi` (no bar, line, table, narrative, header
  renderers yet). The dispatcher returns `<UnsupportedBlockState />` for any
  non-`kpi` kind.
- Any change to resolver contracts. `resolveBlock` still returns
  `ResolveResult` (scalar). Grouped / series modes land in #2.
- Any change to NL proposer. `proposeBlock` still emits `kind: 'kpi'`
  implicitly. Kind inference lands in #5.
- Any change to the manual builder for non-KPI kinds. Today's
  `ManualBlockForm` continues to produce KPI blocks. Per-kind builders land
  in #3/#4.
- TripleWhale or Supermetrics adapter changes.
- Mobile UX polish beyond RGL's responsive stacking. The mobile pass is its
  own design.

---

## 5. Sub-project sketches (#2–#5)

Each gets a full spec when we reach it. These sketches lock the **interfaces**
between sub-projects so #1 can be built against stable expectations.

### 5.1 Sub-project #2 — Resolver polymorphism

**Goal:** unlock grouped + time-series data shapes at the adapter layer.

Adds to `lib/dashboard/types.ts`:

```ts
// NEW: grouped resolution shape — used by bar and table blocks.
export interface GroupedRow { dim: Record<string, string>; value: number; prevValue?: number }
export type GroupedResult = { ok: true; rows: GroupedRow[]; format: MetricFormat } | { ok: false; error: BlockError }

// NEW: time-series resolution shape — used by line and area blocks.
export type Granularity = 'day' | 'week' | 'month'
export interface SeriesPoint { bucket: string; value: number; prevValue?: number }   // bucket = ISO date of period start
export type SeriesResult = { ok: true; points: SeriesPoint[]; format: MetricFormat; granularity: Granularity } | { ok: false; error: BlockError }
```

Adds to leaf bindings:

```ts
interface SupermetricsBinding {
  // ... existing fields
  dimensions?: string[]      // NEW: GROUP BY columns (e.g. ['Channel'])
  granularity?: Granularity  // NEW: bucket size for time-series mode
}
// same shape extension on TripleWhaleBinding
```

Adds to adapter contract:

```ts
interface LeafAdapter {
  resolveLeaf(...): Promise<LeafValue>                        // existing
  resolveGrouped(b, ctx, dateRange, compareRange): Promise<GroupedRow[]>      // NEW
  resolveSeries(b, ctx, dateRange, compareRange): Promise<SeriesPoint[]>      // NEW
}
```

Implementation notes:

- **Supermetrics:** current adapter calls `smQuery` then **sums all rows** to
  produce a scalar ([adapters/supermetrics.ts:78](lib/dashboard/adapters/supermetrics.ts:78)).
  Grouped mode requests the same query *with the dimension(s) included as
  fields* and returns rows keyed by dimension instead of summing them away.
  Series mode requests a `Date` field at the requested granularity and
  buckets the rows server-side via SM's own date-grouping. **No new SM API
  shape** — SM returns the rows in this shape natively; we currently throw
  away the structure.
- **TripleWhale:** same pattern via the existing `twSql` builder
  ([lib/triplewhale/](lib/triplewhale)) — `GROUP BY dimension` for grouped,
  `GROUP BY DATE_TRUNC('day'|'week'|'month', date)` for series.
- **Caching:** new cache key namespaces `sm-grouped` and `sm-series` (current
  cache key is `sm-data`); each includes the dimensions/granularity in its key
  so grouped queries can't collide with scalar queries.
- **Drift guard:** the same `expectedAccounts` check applies; account drift
  rules don't depend on resolution mode.
- **No comparison shape:** when no `compareRange` is set, grouped/series rows
  omit `prevValue` (same rule as scalar).

### 5.2 Sub-project #3 — Bar + Line block kinds

`<BarBlock>` wraps `components/charts/bar-chart.tsx`. Consumes
`GroupedResult`. Renders one bar series per row; bar height = `row.value`;
optional `target`/`ceiling` reference lines drawn via Recharts `ReferenceLine`
(directly mapping deck slide 2's "Target 250 / Ceiling 280" annotations).
Delta vs. previous period: badge per bar (or hidden if no compare).

`<LineBlock>` wraps `components/charts/area-chart.tsx`. Consumes
`SeriesResult`. Renders one line per leaf (one metric in v1; multi-metric
deferred). Comparison period overlay rendered as a dimmed second series.

Per-kind manual builders:

- `bar-builder.tsx` — leaf + 1 dimension picker (from `getSmDimensions`,
  already built in `2026-06-23-supermetrics-dimension-filters-design.md`).
- `line-builder.tsx` — leaf + granularity picker (`day` / `week` / `month`).

Add-block dialog gains a **kind step** before source: pick KPI / Bar / Line /
Table / Narrative / Header → then source (where applicable) → then mode →
then prompt/build → preview. See §6.

### 5.3 Sub-project #4 — Table + Narrative + Header block kinds

`<TableBlock>` wraps `components/charts/data-table.tsx`. Consumes a
**multi-metric** `GroupedResult` — same dimension, multiple value columns.
Cells with `prevValue` get an in-line delta chip (replicates deck slide 3's
"`kr554,520 (-5.3%)`" pattern). Optional `totalsRow` row at the bottom.
Conditional formatting per column (above-target → green; above-ceiling →
orange) as a v1 feature on the value column.

`<NarrativeBlock>` — no binding, no resolver call. Pure markdown content
field on `BlockConfig`. Renders via `react-markdown` (already installed).
Manual edit UI: kebab → "Edit text" → modal textarea. Used for the
Overview / Strengths / Weaknesses / Opportunities panels from deck slide 6.

`<HeaderBlock>` — `{ title, timeframe?, source? }`. No binding. Renders a
title + small caption strip. Used to separate sections of the dashboard
(replicates the "Paid Social Insights · 6/1–6/7 · Holistics" header strip on
every deck slide).

### 5.4 Sub-project #5 — NL kind inference

The current `proposeBlock` server action takes
`{ source, prompt, slug }`. The `source` is currently passed in by the user
clicking a button. With multiple kinds, **the user just types** and the NL
proposer infers both kind and source.

Adds a "kind classifier" prompt to the existing Glean call (Sub-project #4 of
the prior spec already built the Glean chat transport at
`lib/dashboard/nl/glean-chat-transport.ts`). The classifier returns
`{ kind: BlockKind, source: 'supermetrics' | 'triplewhale' | 'aggregate' | 'calculated' }`
which then routes into the existing per-source proposer. Signals:

- "by channel" / "by country" / "breakdown" → `kind: 'bar'` or `'table'`
  (multi-metric vs. single-metric phrasing splits these)
- "over time" / "trend" / "weekly" / "daily" → `kind: 'line'`
- Static phrasing without dimensions ("total spend last week") → `kind: 'kpi'`
- Multi-sentence with "Strengths" / "Weaknesses" / "Opportunities" → no
  block — instead routes to `<NarrativeBlock>` with the prompt as content
  (special case)

Repair loop reuses the existing `resolveWithRepair` generic from
`lib/dashboard/nl/repair.ts`.

---

## 6. Self-service journey (what the analyst experiences end-to-end)

The vision in concrete UX, post-#5. This is the test for "is it really
self-service?"

1. **Analyst opens the dashboard** for client `examplebrand`. Sees the previous
   week's dashboard (KPIs + bar charts + tables + narrative panels).
2. Clicks **+ Add block**. Modal opens.
3. **Step 1 — Block kind.** Picks "Bar chart."
4. **Step 2 — Mode.** Picks "Describe with AI" or "Build manually."
5. **(AI path)** Types: *"new subscribers by channel last week"* → preview card
   shows a horizontal bar chart with channels ranked by subs. Two alternatives
   offered ("by country," "by campaign"). Clicks **Confirm**.
6. **(Manual path)** Picks leaf (Supermetrics → Google Ads → New Subscribers),
   picks dimension (Channel), picks date range. Preview renders. Clicks **Save**.
7. Block lands at default size (6 wide × 4 tall) at the next free grid slot.
8. Analyst **drags** it next to the country breakdown table. **Resizes** it
   from 6×4 to 8×4. The grid auto-packs other blocks out of the way.
9. Clicks kebab → "Override range" → sets to "Last 7 days" for this block only.
10. Repeats for line chart, narrative panel, header. Saves implicit on every
    interaction.
11. Client opens the dashboard URL on Monday morning. Sees the same view, read-
    only. Date range can be flipped at the top; blocks resolve live.

At no point does the analyst write JSON, edit a config file, or open a ticket.
That's the bar. Every sub-project either gets us closer to that bar or it
doesn't ship.

---

## 7. Open questions

- **Multi-metric line/area** — v1 spec assumes one metric per line block. The
  deck shows occasional multi-line ("revenue vs. spend"). Decide in #3
  whether to ship multi-leaf line blocks in v1 or defer to v2.
- **Conditional formatting expressivity** — v1 supports target/ceiling color
  for KPIs and bar/table cells. The deck implies more (e.g. "orange when
  above ceiling" on bar chart bars themselves, not just numbers). Decide
  rendering specifics in #3 (Recharts `Cell.fill` is the mechanism).
- **Narrative block AI assistance** — should the narrative block have an
  "AI summary from the data" mode? Tempting but out of scope for v1; #4
  ships the manual-edit narrative only. Track as a v2 candidate.
- **Layout undo/redo** — RGL has no built-in undo. Drag/resize is destructive
  on save. v1 ships without undo (matches the rest of the app); add an undo
  stack in v2 if analysts request it.
- **Per-client default layouts** — should a client's layout cascade from a
  template? v1: no, each client edits independently. Templates are a v2
  concept (likely related to the "agency repeatability" goal).
- **Mobile editing** — v1 ships drag/resize on desktop only (RGL responsive
  variant stacks to 1-column on `sm` breakpoint and disables drag). Editing
  on mobile is its own UX problem; deferred.
- **`compactType` behavior** — RGL's vertical compaction will reorder blocks
  on add/remove. Confirm this is acceptable (vs. preserving absolute
  positions on every interaction) with the analyst once #1 is testable. If
  not, switch to `compactType={null}` and let the user position freely.
- **Auto-save debounce window** — 300ms is a guess. Confirm with the analyst
  after #1 is in their hands.

---

## 8. Notes

- This spec **respects every existing decision** from
  `2026-06-17-configurable-dashboard-design.md`. The scalar resolver path,
  Glean-at-authoring-only model, drift guards, error precedence, and
  formatting ownership all stand. We are *extending*, not replacing.
- Recharts is already installed and battle-tested in
  `components/report-sections/{tiktok-ads,linkedin-ads,shopify-performance,
  reddit-ads,paid-search}/`. The new block renderers consume the same six
  chart primitives those reports use; we are not building a parallel chart
  stack.
- `react-grid-layout` is the only new runtime dependency introduced by this
  whole multi-sub-project effort. Everything else is library reuse +
  schema/contract evolution + new code that lives in already-established
  directories.
- The current branch already carries a `DASHBOARD_ALLOW_ALL_EDITS` override
  ([commit 43c6b12](#)) for R&D editing. That stays in for the duration of
  this work and is removed before the eventual PR-to-main merge.
- Sub-project #1 is the natural place to **add an integration smoke test**
  for the configurable dashboard page (Playwright or similar) — load the
  page with a seeded config, assert the grid renders, drag a block, assert
  position persists. We have no such test today. Track as a v1.5 follow-up;
  not required for #1 sign-off.
