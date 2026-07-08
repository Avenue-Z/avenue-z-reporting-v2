# Configurable Dashboard — Engineering Overview

> The feature-level map the rest of the codebase never had. Read this before
> touching `lib/dashboard/**`, `components/dashboard/**`, or `app/actions/dashboard.ts`.
> Type definitions are the source of truth ([types.ts](./types.ts)); this doc
> explains how the pieces fit and *why*.

---

## What it is

A per-client, drag-and-arrange grid of data **blocks** (KPI tiles, bar/line
charts, tables, headings, narrative copy). Unlike the fixed per-section Reports
feature, a configurable dashboard is **data**, not code: the whole thing is one
JSON object (`DashboardConfig`) stored in the `clients.dashboard_config` jsonb
column. Internal staff (and client admins for their own client) author it in the
browser; there is no code change or redeploy to add, remove, or re-bind a block.

The same config is rendered in two places from one shared dispatcher
(`renderBlockNode`):

- **Authed** — `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx` (editable).
- **Public** — `app/share/[token]/page.tsx`, a read-only, tokened subset (see [Sharing](#sharing)).

---

## Mental model

```
DashboardConfig
  defaultRange           global date + compare range (a block may override)
  blocks[]  (PersistedBlock = BlockConfig + optional grid layout)
    kind:    kpi | bar | line | table | narrative | header
    binding: how to get the number(s)        ← the interesting part
    format:  currency | percent | count | number | multiple
    range:   per-block override, or null = inherit defaultRange
  labelOverrides         dashboard-wide dimension display renaming
```

A **binding** is a discriminated union ([types.ts](./types.ts)):

| Binding | `source` | Resolves to | Notes |
|---|---|---|---|
| Supermetrics | `supermetrics` | leaf value / grouped / series | paid + GA4 channels via the SM Data API |
| Triple Whale | `triplewhale` | leaf value / grouped / series | e-commerce metrics |
| Shopify | `shopify` | leaf value / grouped / series | raw ShopifyQL body |
| Calculated | `calculated` | leaf value | linear combo: `Σ coefficient·leaf` |
| Aggregate | `aggregate` | leaf value | binary op on two operands: `left op right` |
| Formula | `formula` | leaf value | arbitrary expression over named operands / block refs |

The first three are **leaf** bindings (`LeafBinding`) — they actually hit a data
source. The last three are **composite**: they combine leaves (or, for formula,
even reference other blocks by id) and only produce a single scalar, so they are
valid for KPI blocks only. Bar / line / table blocks require a leaf binding
(grouped/series resolution rejects composites with `invalid-metric`).

`header` and `narrative` blocks carry no real data. They still need a
schema-valid binding, so they store a **`__static__` sentinel** Supermetrics
binding that `resolveBlock` short-circuits before any resolver runs.

---

## Resolution engine

Three pure entry points in [resolve.ts](./resolve.ts), one per output shape:

- `resolveBlock` → `ResolveResult` (single value + optional `prevValue`/`delta`) — KPI.
- `resolveGroupedBlock` → `GroupedResult` (rows keyed by one dimension) — bar / table.
- `resolveSeriesBlock` → `SeriesResult` (points per time bucket) — line.

Each takes the block config, the global range, `{ slug }`, and an optional deps
bag (for injecting fake resolvers in tests). Flow:

1. Pick the effective range: `config.range ?? global`.
2. Dispatch on `binding.source`. Composites (`aggregate`/`calculated`/`formula`)
   are resolved by [aggregate.ts](./aggregate.ts) / [formula-resolve.ts](./formula-resolve.ts),
   which recursively call back into leaf resolution. Leaves go through the
   **registry** ([registry.ts](./registry.ts)) → the per-source **adapter**.
3. Adapters fetch current and compare ranges **concurrently** (`Promise.all`) and
   join them: [group-join.ts](./group-join.ts) `joinGrouped` (grouped, outer-join
   by dimension) / `alignSeries` (series).
4. Any thrown error is funnelled through `mapError` ([errors.ts](./errors.ts))
   into a `BlockError`, so a single block failing never throws to the page.

### Errors → UI states

Adapters throw typed errors (`DisconnectedError`, `NoDataError`,
`InvalidMetricError`, `DriftError`, plus source-native ones). `mapError` collapses
them to a `BlockError` (`disconnected | invalid-metric | unavailable | no-data |
rate-limited | error`). `ERROR_PRECEDENCE` + `worseError` decide which wins when
an aggregate's two operands fail differently. The block bodies render a distinct
state per `BlockError` — e.g. `disconnected` links to the Auth Hub,
`invalid-metric` signals "re-author this block," `unavailable` means the source
rejected an otherwise-valid metric (don't tell the user to re-author).

---

## Caching model

Two layers, keyed by the same primitive query identity (see the block comment in
[adapters/supermetrics.ts](./adapters/supermetrics.ts)):

- **`react cache`** — request-scoped dedupe. Two callers in one render (a formula
  pulling a ref + that referenced block's own island) share **one** in-flight fetch.
- **`unstable_cache`** — cross-request Data Cache, `revalidate: 3600`.

Cache keys are built by helpers (`smDataKey`, `buildSmGroupedKey`, `buildSmSeriesKey`).
**The raw API key is never a key part** — it is SHA-256 hashed (`keyHash`) first.
Keys always include the source id + account + metric + dimension/granularity +
ISO range + serialized filter, so nothing collides across clients or ranges.

Saving a config calls `revalidateTag('db', 'max')`. This is load-bearing:
`getDashboardConfig`/`getClientBySlug` persist for ~5 min via `cache()`, so
without the bust the next `router.refresh()` re-reads the **stale** config and the
edit appears to revert. The tag targets only the DB reads — the SM/TW Data Cache
is untagged, so a save does not cold-re-resolve every chart.

> ⚠️ `keyHash` is currently duplicated in four files
> (`adapters/{supermetrics,shopify,triplewhale}.ts`, `app/actions/dashboard.ts`).
> See the root `CLAUDE.md` follow-ups.

---

## Rendering

`renderBlockNode` ([components/dashboard/render-block.tsx](../../components/dashboard/render-block.tsx))
is the single kind dispatcher, shared by the authed page and the public share.
KPI tiles stream progressively: the value and the delta each resolve behind their
own `<Suspense>` boundary, so a slow compare-range query doesn't block the primary
number. `canEdit=false` renders the same tree with all edit chrome hidden — that's
how `/share` reuses the exact rendering path.

---

## Persistence & validation

`clients.dashboard_config` holds untrusted JSON (it can be hand-edited in the DB,
and it crosses the RSC boundary). [persistence.ts](./persistence.ts)
`parseDashboardConfig` is the **trust boundary**: it structurally validates every
block and binding before anything downstream touches it, and it is the mirror of
`types.ts`. **If you add or change a binding/field in `types.ts`, update the
parser in the same commit** — the types alone are not enforced at runtime.

Things the parser also owns:

- **Legacy normalization** — the removed `pills` kind is rewritten to `kpi` on read.
- **`dimensions` is length exactly 1 (v1)** for grouped/series — enforced here and
  re-checked in the adapters against per-source safe-column regexes.
- **Formula validation** — it actually parses the expression and cross-checks that
  every `@operand` used has a definition and vice versa.

Reads go through `getDashboardConfig` ([lib/db/queries.ts](../db/queries.ts)),
which parses on the way out and is `cache()`-wrapped.

---

## Permissions

[permissions.ts](./permissions.ts) `canEditDashboard(role, clientSlug, targetSlug)`:
all internal Avenue Z staff (`INTERNAL_ADMIN` **and** `INTERNAL_ANALYST`) may edit
any client; `CLIENT_ADMIN` only its own; everyone else no. **Every** mutating or
discovery server action in [app/actions/dashboard.ts](../../app/actions/dashboard.ts)
re-checks this gate server-side — never rely on the UI hiding a control.

> Note: this intentionally lets `INTERNAL_ANALYST` edit dashboards even though that
> role is read-only on the client-facing Reports product and admin actions. This is
> **by design** and is documented as such in the root CLAUDE.md Roles Reference — not drift.

---

## Authoring a block

Two paths, both landing on a validated `BlockConfig`:

- **Manual builders** — [components/dashboard/add-block/](../../components/dashboard/add-block/),
  one builder per kind. Field/account/dimension pickers are fed by live discovery
  server actions (`getSmFields`, `getAccountOptions`, `getTwFields`,
  `getTwDimensionValues`, `getSmDimensionValues`). **Formula and Shopify blocks are
  manual-only.**
- **Natural language** — the `proposeBlock` action routes a prompt through the
  Glean-backed NL resolvers in [nl/](./nl/) (`resolveBlockNL` / `resolveAggregateNL`),
  which return a proposal, a clarification, or an error. **NL supports
  `supermetrics`, `triplewhale`, and `aggregate` only**; `formula`/`shopify` are
  rejected server-side even if force-cast.

Saving always funnels through `saveDashboardConfig` → `parseDashboardConfig` →
DB write → `revalidateTag`. Inline copy edits (`updateBlockText`) and dimension
relabels (`updateLabelOverride`) build the next config via
[config-mutations.ts](../../components/dashboard/config-mutations.ts) and reuse the
same save (so they inherit the same auth + validation gate).

---

## Sharing

One public link per client. `saveDashboardShare` upserts a row into
`dashboard_shares` (unique on `client_slug`) and **keeps the token stable across
re-saves**, so an already-distributed URL keeps working. `block_ids` is the subset
the sharer exposed; `expires_at` null = never.

The public view rebuilds a clean layout from that subset using [share.ts](./share.ts):
`groupSections` (split blocks into header-delimited sections) → `filterSharedBlocks`
(keep selected blocks; drop a header whose section is now empty) → `reflowBlocks`
(repack into a gap-free 12-col grid). Read by token via `getDashboardShareByToken`.

---

## `dashboardOnly` clients

A client row with `dashboard_only = true` is a reporting-only host created by the
self-service "Add new report" flow — it has a configurable dashboard but is not a
real client, so `getVisibleClients` hides it from the `/dashboard` client lists.

---

## Directory map

```
lib/dashboard/
  types.ts            config model — SOURCE OF TRUTH (bindings, blocks, results)
  persistence.ts      parseDashboardConfig — runtime validation / trust boundary
  resolve.ts          resolveBlock / resolveGroupedBlock / resolveSeriesBlock
  registry.ts         leaf/grouped/series dispatch → adapters
  aggregate.ts        aggregate + calculated resolution (composites → leaves)
  formula-resolve.ts  formula resolution (operands + block refs, cycle-guarded)
  formula/            parse.ts + evaluate.ts (the formula expression language)
  group-join.ts       joinGrouped / alignSeries (current vs compare)
  errors.ts           typed errors, BlockError mapping + precedence
  format.ts           formatMetric (value → display string)
  labels.ts           dimension label-override application
  share.ts            groupSections / filterSharedBlocks / reflowBlocks
  starter-template.ts default block set for new dashboards
  permissions.ts      canEditDashboard / isInternalStaff
  retry-policy.ts, retry-controller.ts, discovery-refresh.ts   reliability helpers
  adapters/           supermetrics.ts, triplewhale.ts, shopify.ts  (the only source-touching layer)
  nl/                 Glean-backed natural-language block proposer

components/dashboard/  rendering + editing UI (renderBlockNode, builders, share dialog)
app/actions/dashboard.ts   server actions (save, propose, discovery, share) — all edit-gated
app/dashboard/[clientSlug]/configurable-dashboard/   authed page
app/share/[token]/         public read-only view
```

---

## Known gotchas

Latent bugs / tech-debt live in the root `CLAUDE.md` under **"Known Follow-ups —
Configurable Dashboard"**. The load-bearing ones for anyone in this code:

- **Shopify grouped/series `GROUP BY` clause order** — string-appending `GROUP BY`
  to a `WHERE`-bearing metric produces invalid ShopifyQL. (`adapters/shopify.ts`)
- **`alignSeries` joins by array index, not date** — mismatched bucket counts
  between current and compare ranges misalign every prior point after a gap.
  (`group-join.ts`)
- **`keyHash` duplicated in 4 files** — extract one shared helper.
- **15s SM request timeout also caps large synchronous grouped/series queries.**

Tests are the de-facto behavioral spec: nearly every `.ts` here has a sibling
`.test.ts` (`// Run: npx tsx lib/dashboard/<file>.test.ts`) with per-case comment
headers. Read them for exact edge-case behavior.
