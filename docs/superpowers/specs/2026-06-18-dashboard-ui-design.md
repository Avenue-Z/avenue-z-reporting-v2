# Configurable Dashboard — Sub-project #3 (Dashboard UI) — Design

**Status:** Approved (brainstorm)
**Date:** 2026-06-18
**Branch:** `feat/dashboard-ui` (off `feat/configurable-dashboard-rnd` HEAD)
**Parent design:** `docs/superpowers/specs/2026-06-17-configurable-dashboard-design.md`
**Handoff:** Paul's "Configurable Dashboard — Sub-project #3 (Dashboard UI)" hand-off, 2026-06-18

---

## 1. Summary

The UI layer of the Configurable Dashboard: a per-client dashboard route that
loads a stored `DashboardConfig`, resolves each block server-side via `resolveBlock`,
and renders a grid of Metric Blocks with a global time-range control and per-block
overrides. Editors can reorder via drag-and-drop, delete with confirmation, and
override (or reset) a block's range. All persistence flows through Paul's existing
`saveDashboardConfig` server action — no new server actions, no edits to `lib/db/**`
or `app/actions/dashboard.ts`.

This spec covers component breakdown, data flow, interaction semantics (Apply
batching, override/detach/reset), state coverage (loading + 5 error variants +
empty), drag-and-drop, and persistence boundaries.

---

## 2. Scope alignment with the hand-off

In scope here, one-to-one with §1 of the hand-off:

- Dashboard shell (page/route loading `DashboardConfig` and laying out the grid)
- Metric Block component (name / formatted number / delta with direction + color)
- Block states: loading skeleton, plus one each for `disconnected`, `invalid-metric`, `no-data`, `rate-limited`, `error`, plus empty-dashboard
- Global time-range control: two-column Date Range / Compare To, applies on **Apply**
- Inheritance + per-block override; detach badge; reset-to-inherit
- Delta hidden when `delta === undefined` (no-comparison case)
- Drag-and-drop reordering; delete-with-confirmation

Out of scope, deferred to other sub-projects:

- Resolution engine (#1, done)
- Persistence internals (#2, Paul; we call `getDashboardConfig` and `saveDashboardConfig`)
- Natural-language block creation / preview card (#4)
- Aggregate authoring UI (#5)
- Client portal route (`app/portal/[clientSlug]/...`) — internal admin route only in #3
- "Save current view as default" affordance for the global control

---

## 3. Frozen contracts (consumed only, never modified)

From `lib/dashboard/types.ts`:

```ts
type MetricFormat = 'currency' | 'percent' | 'count' | 'number'
type BlockError = 'disconnected' | 'invalid-metric' | 'no-data' | 'rate-limited' | 'error'
interface BlockConfig {
  id: string; name: string; binding: Binding; format: MetricFormat
  range: { dateRange: string; compareRange: string | null } | null  // null = inherit
}
type ResolveResult =
  | { ok: true; value: number; prevValue?: number; delta?: number; format: MetricFormat; formatted: string }
  | { ok: false; error: BlockError }
type PersistedBlock = BlockConfig & { layout?: { w?: number; h?: number } }
interface DashboardConfig {
  defaultRange: { dateRange: string; compareRange: string | null }
  blocks: PersistedBlock[]
}
```

From `lib/dashboard/resolve.ts`:

```ts
resolveBlock(config: BlockConfig, global: { dateRange: string; compareRange: string | null }, ctx: { slug: string }): Promise<ResolveResult>
```

From `lib/db/queries.ts` and `app/actions/dashboard.ts`:

```ts
getDashboardConfig(slug: string): Promise<DashboardConfig | null>
saveDashboardConfig(slug: string, config: DashboardConfig): Promise<{ ok: true } | { ok: false; error: string }>
```

From `lib/dashboard/permissions.ts`:

```ts
canEditDashboard(role: string, clientSlug: string | null, targetSlug: string): boolean
```

Display rule: render `formatted` directly. Use the sign of `delta` for direction
and color; if `delta` is absent, hide the delta line.

---

## 4. Route

`app/dashboard/[clientSlug]/configurable-dashboard/page.tsx` — a Server Component
that:

1. `const session = await auth()`
2. `const config = await getDashboardConfig(slug)`
3. `const canEdit = canEditDashboard(session.user.role, session.user.clientSlug, slug)`
4. Compute `activeDefault = { dateRange: searchParams.dateRange ?? config.defaultRange.dateRange, compareRange: 'compareRange' in searchParams ? (searchParams.compareRange ?? null) : config.defaultRange.compareRange }`
5. Render `<Header>` (existing pattern), then `<DashboardShell config={config} canEdit={canEdit} activeDefault={activeDefault} slug={slug}/>`

Page renders nothing if `config === null` — instead the shell shows the empty
state with copy directing the editor to add blocks (the add-block entry point
itself is #4).

URL contract: `?dateRange=<rangeKey>&compareRange=<compareKey | empty for no-compare>`.
Absent `dateRange` → use `config.defaultRange.dateRange`. Absent `compareRange`
key entirely → use `config.defaultRange.compareRange`. Present `compareRange` key
with empty value → "no comparison." This mirrors the existing `ReportDateRange`
URL contract.

Per-block resolution streams via `<Suspense>`: inside `<BlockGrid>` each block
is wrapped in a `<Suspense fallback={<MetricBlockSkeleton/>}>` boundary whose
child is a local async server component that awaits `resolveBlock(block,
activeDefault, { slug })` and renders `<MetricBlock>` with the result. Blocks
resolve in parallel and stream independently.

---

## 5. Component breakdown

```
app/dashboard/[clientSlug]/configurable-dashboard/
  page.tsx                          # RSC: load config, gate edit, set Suspense boundaries

components/dashboard/
  dashboard-shell.tsx               # client: layout for global control + grid + empty-dashboard state
  global-time-control.tsx           # client: thin wrapper over DateRangePicker (URL push)
  block-grid.tsx                    # client: @dnd-kit/sortable wrapper around the rendered blocks
  metric-block.tsx                  # client: card chrome + detach badge + per-block override popover + delete confirm
  metric-block-states.tsx           # pure presentational: skeleton + 5 error variants + empty-dashboard
```

Single-responsibility per file. Server-side fetching and resolution live in
`page.tsx`; everything else is client-interactive or pure presentational. Sticks
to Paul's §3 suggested layout.

---

## 6. Data flow

```
RSC page.tsx
  ├─ getDashboardConfig(slug)                 ─→ DashboardConfig | null
  ├─ activeDefault = URL params ?? config.defaultRange
  ├─ canEdit = canEditDashboard(role, clientSlug, slug)
  └─ <DashboardShell config canEdit activeDefault slug>
       ├─ <GlobalTimeControl activeDefault>      (client; URL push on Apply)
       └─ <BlockGrid blocks canEdit slug config> (client; dnd-kit wrapper)
            └─ for each block (server, streamed):
                 <Suspense fallback={<MetricBlockSkeleton/>}>
                   { await resolveBlock(block, activeDefault, { slug }) }
                   <MetricBlock block result canEdit slug config/>
                 </Suspense>
```

Re-resolution:

- **Global control Apply** → push new URL params → server re-renders → resolver
  re-runs for every block. Inheriting blocks (range = null) pick up the new
  range; overridden blocks ignore it because `resolveBlock` reads
  `config.range ?? global` per block.
- **Block override / reset / delete / reorder** → editor mutates a local copy of
  `DashboardConfig` → calls `saveDashboardConfig(slug, newConfig)` →
  server-action validates + writes + `revalidatePath('/', 'layout')` → RSC
  re-renders → resolver re-runs with the new persisted config.

---

## 7. Global time-range control

Reuses the existing `components/layout/date-range-picker.tsx` directly. That
picker already provides exactly what the hand-off describes:

- Two-column layout (preset list + Compare To section)
- Presets matching the hand-off list (`last_7_days` … `last_year`, `year_to_date`)
- Compare To: No Comparison (toggle off), Previous Period, Previous Year (Custom
  Range is present in the picker; for #3 we keep it — it is harmless and the
  hand-off only enumerated the required options)
- Apply button that batches and emits `onChange` + `onCompareChange` once

`<GlobalTimeControl>` is a thin client wrapper modeled on
`app/dashboard/[clientSlug]/reports/[reportSlug]/report-date-range.tsx`. On
Apply it pushes `dateRange` + `compareRange` to URL search params; the RSC
re-renders and all inheriting blocks re-resolve with the new default. The
persisted `config.defaultRange` is the initial value when the URL has no params;
the global control does NOT mutate `config.defaultRange` in v1.

---

## 8. Per-block override, detach, reset

A block's `range` is either `null` (inheriting) or `{ dateRange, compareRange }`
(overridden). The block's edit menu (visible only when `canEdit`) contains:

- **Set range…** — opens a `<DateRangePicker>` in a popover. Apply →
  `setBlockRange(blockId, { dateRange, compareRange })` → mutate
  `config.blocks[i].range`, call `saveDashboardConfig`.
- **Reset to inherit** — only enabled when `range !== null`. Sets
  `config.blocks[i].range = null`, calls `saveDashboardConfig`.
- **Delete** — opens a confirm dialog (existing `components/ui/` primitive).
  Confirm → filter out the block, call `saveDashboardConfig`.

When `block.range !== null` the block displays a small **detached badge** below
the metric name. The badge is itself the reset affordance:

- Label: `Detached · <date-range-label>` (e.g. `Detached · Last 14 Days`).
- Click → confirm popover ("Reset to inherit global range?") → reset.

Affordance visibility: drag handle, edit menu, and detach-badge action all
require `canEdit`. Viewers see the metric, the value, the delta, and a static
"Detached · …" badge with no click affordance.

---

## 9. Block states

`metric-block-states.tsx` exports pure presentational components, one per state.

| State | Visual |
|---|---|
| **Loading** | Pulse skeleton matching block dimensions; reuses the existing report-skeleton pattern (`animate-pulse rounded-lg border border-white/[0.06] bg-bg-surface`) |
| **`disconnected`** | "Not connected" headline + supporting copy linking to `/dashboard/connections` |
| **`invalid-metric`** | "Metric configuration invalid" + the block name; supporting copy points editor to re-author the block (#4 surface) |
| **`no-data`** | "No data for this range" |
| **`rate-limited`** | "Temporarily unavailable — rate limited" with subtle retry-hint copy |
| **`error`** | "Something went wrong" |
| **Empty dashboard** | Centered placeholder card: "No blocks yet" + secondary line. The actual add-block entry point is #4; #3 only renders this informative state. |

Error cards reuse the same dark surface tokens as `KpiCard` so the grid stays
visually consistent. Delta is hidden whenever `result.ok === true && result.delta
=== undefined`, satisfying the "hide on no-comparison" rule for free.

---

## 10. Metric Block visual

Borrows the visual structure of `components/charts/kpi-card.tsx` but is a
separate component (`MetricBlock`) because it owns edit chrome (drag handle,
edit menu, detach badge) that doesn't belong on the generally-shared KPI card.

Structure (top to bottom):

1. **Header row** — kicker label (`text-xs font-extrabold uppercase tracking-widest text-text-muted`) with optional drag-handle icon on hover (editors only). Edit menu (kebab) on the right (editors only).
2. **Detach badge** (only when `block.range !== null`).
3. **Value** — `text-3xl font-extrabold text-white` rendering `result.formatted` directly (no reformatting).
4. **Delta line** — only when `result.delta !== undefined`. Direction arrow + magnitude (`Math.abs(delta).toFixed(1)%`) + label `vs prior period`. Color: positive → `text-brand-green`; negative → `text-[#FF4444]`; zero → `text-text-muted`. (No invert-delta behavior in v1; the hand-off does not require it.)

Container: `rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5` —
matches existing `KpiCard`.

---

## 11. Drag-and-drop and persistence model

Library: **`@dnd-kit/core` + `@dnd-kit/sortable`** (small, accessible,
React-18-native, active maintenance; not currently in `package.json` — add as
new dep). `block-grid.tsx` wraps the rendered blocks in `SortableContext` keyed
on `block.id`. On drop, the new order produces a permuted `blocks` array; the
client calls `saveDashboardConfig(slug, { ...config, blocks: reordered })`. The
existing block resolvers re-run on revalidation.

Delete: confirmation dialog (existing UI primitive). Confirm →
`saveDashboardConfig(slug, { ...config, blocks: config.blocks.filter(b => b.id !== blockId) })`.

All four editor mutations (reorder, delete, set-range, reset-range) flow
through `saveDashboardConfig`. **No new server actions are introduced.** Paul's
existing action validates the whole config and gates by role, so the editor
client only needs to construct correct `DashboardConfig` values. This honors
"don't touch `app/actions/dashboard.ts`" from the hand-off coordination rules.

---

## 12. Coordination boundaries

- **My files:** `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx` and `components/dashboard/**`.
- **I do not edit:** `lib/db/**`, `lib/dashboard/persistence.ts`, `lib/dashboard/permissions.ts`, `lib/db/schema.ts`, `app/actions/dashboard.ts`, or any of the frozen #1 files (`lib/dashboard/{types,resolve,aggregate,registry,errors,format}.ts`, `lib/dashboard/adapters/**`).
- Uncommitted paid-search edits in the working tree are left alone.
- Branch `feat/dashboard-ui` rebases on `feat/configurable-dashboard-rnd` as #2 lands further commits.

---

## 13. Testing

Following the existing tsx-test convention (no live API calls, no env loading,
colocated `*.test.tsx` files):

- `metric-block-states.test.tsx` — each of the five `BlockError` variants
  renders the expected copy; loading skeleton has an accessible label; empty-
  dashboard renders.
- `dashboard-shell.test.tsx` — empty state when `blocks.length === 0`; non-empty
  state renders the grid; global control receives the resolved `activeDefault`.
- `metric-block.test.tsx` — header / value / delta rendered from a
  `ResolveResult`; delta hidden when `delta` is undefined; detach badge appears
  iff `block.range !== null`; the reset action calls `saveDashboardConfig` with
  `range: null` for the right block; delete confirm calls `saveDashboardConfig`
  with that block filtered out; affordances hidden when `canEdit === false`.
- `block-grid.test.tsx` — sortable keyboard reorder produces a new id order and
  calls `saveDashboardConfig` with the permuted `blocks`; ordering preserved on
  cancel.
- `global-time-control.test.tsx` — Apply pushes both URL params in one event;
  toggling Compare To off pushes `compareRange=`.

Integration of `resolveBlock` itself is already covered by #1's tests.

---

## 14. Open follow-ups (out of #3)

- "Save current view as default" affordance for the global control — would
  mutate `config.defaultRange` and persist via `saveDashboardConfig`. Cheap
  addition once #3 lands.
- Portal route mirror at `app/portal/[clientSlug]/configurable-dashboard/`.
  Read-only variant; share the `<DashboardShell>` with `canEdit={false}`.
- Add-block entry point (#4) — the empty-dashboard state copy hooks into it
  once #4 lands.
- Per-block layout sizing — `PersistedBlock.layout` is in the contract but #3
  renders a uniform grid; sizing UI deferred.

---

## 15. Notes

- `frontend:brand-coherence` applies throughout. Reused tokens only (`bg-bg-surface`, `border-white/[0.08]`, `text-text-muted`, `brand-cyan`, `brand-green`, `#FF4444`, gradient pill for Apply). No new design tokens.
- The hand-off allows refining the suggested component breakdown — the layout
  above stays one-to-one with §3 of the hand-off, except `global-time-control`
  is a thin client wrapper rather than a from-scratch picker, since the existing
  `DateRangePicker` already implements the two-column / Apply contract.
