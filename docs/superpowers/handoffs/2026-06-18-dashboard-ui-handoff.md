# Hand-off: Configurable Dashboard — Sub-project #3 (Dashboard UI)

**For:** (teammate)
**From:** Paul
**Date:** 2026-06-18
**Parent design:** `docs/superpowers/specs/2026-06-17-configurable-dashboard-design.md` (overall architecture + the 5 sub-projects)

You own the **UI layer** of the Configurable Dashboard: the dashboard shell, the
grid of Metric Blocks, the Metric Block component itself, and the global
time-range control with per-block override. You build entirely against **frozen
contracts** (below), so you can start without waiting on anyone.

---

## 1. What you're building

A per-client configurable dashboard surface in the paid-media area. It loads a
stored `DashboardConfig`, renders each block by resolving its value, and lets an
editor rearrange/retarget blocks and change the time range.

**In scope for #3:**
- **Dashboard shell** — page/route that loads the client's `DashboardConfig` and lays out the grid.
- **Metric Block component** — renders one block's three subcomponents:
  1. **Metric name** (human label, e.g. "Blended ROAS")
  2. **Metric number** (the value for the block's active range, formatted by type)
  3. **Time-range delta** (comparison figure with direction + color)
- **Block states** — loading skeleton; and one clear state for each error
  (`disconnected`, `invalid-metric`, `no-data`, `rate-limited`) plus a generic
  `error`. Empty-dashboard state (no blocks yet).
- **Global time-range control** — two columns:
  - *Date Range:* Last 7/14/30/60/90 Days, This Month, Last Month, This Quarter, Last Quarter, Year to Date, Last Year
  - *Compare To:* No Comparison, Previous Period, Previous Year
  - Applies on **Apply** (not on each click) — batch range + comparison before any refetch.
- **Inheritance & per-block override:**
  - Global control sets the default; blocks inherit it.
  - A block can override range/comparison; changing the global control affects **only inheriting** blocks.
  - An overridden block shows a **small "detached" badge**; the badge is the affordance to **reset the block back to inherit**.
- **Delta behavior:** when the active comparison is "No Comparison," **hide** the delta subcomponent (don't show a zero). (`resolveBlock` already returns `delta: undefined` in that case.)
- **Drag-and-drop reordering** of blocks; **deletion requires confirmation**.

**NOT in scope (other people / sub-projects):**
- The resolution engine (#1, done) — you call it, don't build it.
- Persistence internals (#2, Paul) — you call `getDashboardConfig` / `saveDashboardConfig`.
- Natural-language block creation + the disambiguation preview card (#4).
- Cross-source aggregate authoring (#5). (Aggregate blocks still *render* via the same `resolveBlock`.)

---

## 2. Frozen contracts you code against

### From sub-project #1 (DONE & merged on this branch — `lib/dashboard/`)

```ts
// lib/dashboard/types.ts
type MetricFormat = 'currency' | 'percent' | 'count' | 'number'
type BlockError = 'disconnected' | 'invalid-metric' | 'no-data' | 'rate-limited' | 'error'

interface SupermetricsBinding { source: 'supermetrics'; dsId: string; metricField: string; account: string; expectedAccounts?: string[]; filters?: string }
interface TripleWhaleBinding  { source: 'triplewhale'; metric: string; account?: string }
type LeafBinding = SupermetricsBinding | TripleWhaleBinding
interface AggregateBinding { source: 'aggregate'; left: LeafBinding; op: '+' | '-' | '*' | '/'; right: LeafBinding }
type Binding = LeafBinding | AggregateBinding

interface BlockConfig {
  id: string
  name: string
  binding: Binding
  format: MetricFormat
  range: { dateRange: string; compareRange: string | null } | null  // null = inherit global
}

// the value of one block, ready to render — THIS is what your Metric Block component renders:
type ResolveResult =
  | { ok: true; value: number; prevValue?: number; delta?: number; format: MetricFormat; formatted: string }
  | { ok: false; error: BlockError }
```

```ts
// lib/dashboard/resolve.ts  — server-side only
function resolveBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
): Promise<ResolveResult>
```

- `formatted` is the display string (e.g. `"$12,108"`, `"12.3%"`). Render it directly — **don't reformat**.
- `delta` is a percent number; use its **sign** for up/down direction + color. Absent ⇒ hide the delta.
- A failed block returns `{ ok: false, error }` — never throws. Map each `error` to a state UI.
- `resolveBlock` is **server-side** (it fetches via REST). Call it in a Server Component / route / server action and pass the result to client components — do not call it from the browser.

`dateRange` / `compareRange` string formats (already used elsewhere in the app, see `lib/ga4/client.ts` `parseDateRange`/`deriveCompareRange` and `components/layout/date-range-picker.tsx`): preset keys like `'last_30_days'`, custom `'custom:YYYY-MM-DD,YYYY-MM-DD'`; compare = `'previous_period'` | `'previous_year'` | `null`.

### From sub-project #2 (Paul is building now — types locked here so you have a stable target)

```ts
// lib/dashboard/types.ts (added by #2)
interface DashboardConfig {
  defaultRange: { dateRange: string; compareRange: string | null }  // the global control's default
  blocks: PersistedBlock[]                                          // array order = display order
}
type PersistedBlock = BlockConfig & { layout?: { w?: number; h?: number } }

// lib/db/queries.ts (added by #2)
function getDashboardConfig(slug: string): Promise<DashboardConfig | null>   // null = not configured / corrupt

// app/actions/dashboard.ts (added by #2) — role-gated: INTERNAL_ADMIN (any) or CLIENT_ADMIN (own client)
function saveDashboardConfig(slug: string, config: DashboardConfig): Promise<{ ok: true } | { ok: false; error: string }>
```

These four signatures are the contract. **They will not change** without Paul telling you. Until #2 merges, stub `getDashboardConfig`/`saveDashboardConfig` locally (return a hand-written `DashboardConfig`) so you're never blocked.

**Rendering a dashboard** = for each `block` in `config.blocks`, call
`resolveBlock(block, config.defaultRange, { slug })`, then render the
`ResolveResult`. The block's own `range` (if non-null) already overrides
`defaultRange` *inside* `resolveBlock` — you don't merge ranges yourself; you
just edit `block.range` (null = inherit, object = override) and re-resolve.

---

## 3. Suggested component breakdown (your call to refine in design)

```
app/.../dashboard/page.tsx            # RSC: load DashboardConfig, resolve blocks, render shell
components/dashboard/
  dashboard-shell.tsx                 # grid + global control + (later) add-block entry point
  global-time-control.tsx             # 2-column Date Range / Compare To + Apply button (client)
  metric-block.tsx                    # one block: name + number + delta + detach badge + states
  metric-block-states.tsx            # loading skeleton + per-error state cards
  block-grid.tsx                      # drag-and-drop ordering, delete-with-confirm (client)
```

Keep components small and single-purpose (one responsibility each). Server
Components fetch + resolve; client components handle interaction (Apply, drag,
override, reset).

---

## 4. Coordination — how we avoid stepping on each other

- **Your files:** `components/dashboard/**` and your dashboard route under `app/**`. Paul's #2 work is in `lib/db/**`, `lib/dashboard/persistence.ts`, `app/actions/dashboard.ts`, and `lib/db/schema.ts`. **No overlap.**
- **The one shared surface** is the #2 type/function signatures in §2 — frozen here. If you need a change to them, ping Paul; don't edit `lib/dashboard/types.ts` or `lib/db/**` yourself.
- **Branch:** cut your branch from the current `feat/configurable-dashboard-rnd` HEAD (it contains the finished #1 layer). Suggested name: `feat/dashboard-ui`. Keep it rebased on that branch as #2 lands.
- **Don't touch** `lib/dashboard/{types,resolve,aggregate,registry,errors,format}.ts` or `lib/dashboard/adapters/**` — those are #1, frozen.
- There are some **unrelated, uncommitted paid-search edits** floating in the working tree on this branch — leave them; they're not yours or this feature's.

---

## 5. Skills & process (Avenue Z superpowers)

- **Start with `superpowers:brainstorming`** to design #3 before building — this hand-off is scope + contracts, not a finished design. Nail the interaction model (Apply semantics, override/detach/reset, drag-drop, states) first.
- **`frontend:brand-coherence`** applies to all of this — Avenue Z dark-first brand system, fixed color/type tokens, canonical component patterns. Use it by default.
- Reuse existing building blocks: `components/charts/kpi-card.tsx` (Tremor-style metric card with delta badge) is close to what a Metric Block needs; `components/layout/date-range-picker.tsx` already has the preset + compare option lists and the URL-param pattern.
- Then `superpowers:writing-plans` → `superpowers:subagent-driven-development` (or just TDD it), same flow Paul used for #1/#2.

---

## 6. Definition of done (#3)

- A dashboard route renders a client's `DashboardConfig` as a grid of Metric Blocks.
- Each block shows name / formatted number / delta (hidden when no comparison) and a correct state for each `BlockError`.
- Global control batches Date Range + Compare To and applies on **Apply**, re-resolving inheriting blocks only.
- A block can override the range, shows a detach badge, and resets to inherit via the badge.
- Blocks reorder via drag-and-drop and delete with confirmation; layout persists through `saveDashboardConfig`.
- Brand-coherent; loading/empty/error states covered.
