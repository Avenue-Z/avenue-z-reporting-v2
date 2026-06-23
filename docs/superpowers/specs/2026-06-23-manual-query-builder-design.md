# Manual Query Builder — Design

**Date:** 2026-06-23
**Status:** Approved (pending spec review)
**Depends on:** the existing add-block flow (`2026-06-18-add-block-flow.md`)

## Goal

Let an editor add a dashboard block **either** by describing it in natural
language (the existing AI/NL path) **or** by building the query directly in the
UI with dropdowns. The manual path uses **live Supermetrics discovery** so
metric and account choices are real, valid values scoped to the chosen data
source — eliminating the "invalid metric" / wrong-account guesswork the NL path
can produce.

## Background / Spike Result

The app's existing Supermetrics tier (`https://api.supermetrics.com/enterprise/v2`,
Bearer key already configured as `SUPERMETRICS_API_KEY` / per-client
`smApiKeyEnvVar`) exposes live discovery — **verified with the app key**:

- `GET /enterprise/v2/query/fields?json={"ds_id":"<id>"}` → `200`
  Returns `data: [{ "@type": "ds_metric"|"ds_dimension", field_id, field_name,
  field_type, data_type, description, group_name, is_filterable, report_types }]`.
  FA returns 584 fields (356 `ds_metric`, 228 `ds_dimension`).
- `GET /enterprise/v2/query/accounts?json={"ds_id":"<id>"}` → `200`
  Returns `data: [{ ds_user, display_name, cache_time, accounts: [{ account_id:
  "act_…", account_name, group_name }] }]` — one entry per connection; the
  `account_id`s repeat across connections. Closed accounts carry
  `group_name: "CLOSED AND DISABLED ACCOUNTS"`.

Both use the same base + Bearer key the app already uses for queries. No new API
tier, OAuth, or elevated Management-API permission is required.

## Scope

**In scope (v1):**
- A mode choice (AI vs Manual) after the source is picked.
- Manual builder for **Supermetrics leaf**, **TripleWhale leaf**, and
  **Aggregate** (operator + two leaves).
- Live, cached discovery of Supermetrics **metrics** and **accounts** per data
  source, surfaced as searchable dropdowns.

**Out of scope (v1):**
- Report-type selection / GA4-property nuances beyond the account list.
- TripleWhale account selection (binding `account` stays unset).
- Recently-used memory / persistence of picker state.
- Operand-level "alternatives" suggestions.
- Dimensions (only metrics are offered; `ds_dimension` fields are filtered out).

## Decisions (confirmed with user)

1. **Mode entry point:** after picking the source, a `mode` step offers
   *Describe with AI* | *Build manually*.
2. **Supermetrics field/account input:** live discovery dropdowns (searchable).
3. **Aggregates:** supported in manual mode (operator + two leaf builders).
4. **No separate preview for manual:** the form is the editor; confirm directly.
5. **No TripleWhale account field** in v1.
6. **Free-text fallback:** if discovery fails (e.g. disconnected source), the
   metric/account inputs degrade to free-text id entry so the user is not blocked.

## Architecture

```
add-block-dialog.tsx  (state machine)
  pick ──▶ mode ──▶ (ai)     prompt ──▶ preview ──▶ confirm   [existing, unchanged]
                └──▶ (manual) build (ManualBlockForm) ──────▶ confirm   [new]

ManualBlockForm (client)
  ├─ leaf source  → LeafBuilder + name + format
  └─ aggregate    → operator <select> + LeafBuilder×2 + name + format
        │
        ▼ produces a complete BlockConfig (id assigned at confirm)
  confirm: addBlock(config ?? DEFAULT_CONFIG) → saveDashboardConfig → close + refresh

LeafBuilder (client, reusable; emits a LeafBinding)
  ├─ supermetrics: dsId <select> ──(on change)──▶ getMetricOptions / getAccountOptions
  │                     └─ metric SearchCombobox + account SearchCombobox
  └─ triplewhale: metric <select> from TwMetric enum

server actions (app/actions/dashboard.ts; auth + canEditDashboard gated)
  getMetricOptions(slug, dsId)  → smFields(apiKey, dsId)
  getAccountOptions(slug, dsId) → smAccounts(apiKey, dsId)     [cached ~3600s]

supermetrics discovery client (lib/supermetrics/discovery.ts)
  smFields(apiKey, dsId)   → GET /query/fields   → metric options
  smAccounts(apiKey, dsId) → GET /query/accounts → account options
```

### Data-fetching approach

On-demand, cached server actions. The client fetches a data source's options
only when that source/dsId is selected. Results are cached server-side
(`unstable_cache`, `revalidate: 3600`). **Cache key must include the resolved
API key (or its hash), not just `dsId`** — different clients can resolve to
different Supermetrics keys with different connected accounts, so a `dsId`-only
key would leak one workspace's accounts to another. Key = `[dsId, keyHash]`.

*Rejected:* preload-all (4 sources × hundreds of fields up front); client-side
API routes (extra infra for the same outcome).

## Components & Interfaces

### `SearchCombobox` (new, `components/dashboard/add-block/search-combobox.tsx`)
A searchable single-select built on the existing `components/ui/popover` + a
filter `<input>` + a filtered list. No new dependency.
- Props: `{ value: string; onChange: (v: string) => void; options: ComboOption[];
  placeholder?: string; disabled?: boolean; loading?: boolean }`
- `ComboOption = { value: string; label: string; group?: string; disabled?: boolean }`
- Behavior: type-to-filter on label/value; options with a `group` (e.g. closed
  accounts) render under a divider at the bottom; keyboard up/down/enter/escape.

### `LeafBuilder` (new, `components/dashboard/add-block/leaf-builder.tsx`)
- Props: `{ value: LeafDraft; onChange: (v: LeafDraft) => void; slug: string }`
- Supermetrics: `dsId` `<select>` of the 4 `DS_IDS` (label + value). On dsId
  change, calls `getMetricOptions(slug, dsId)` and `getAccountOptions(slug, dsId)`
  in a transition; shows loading; on success populates the metric + account
  `SearchCombobox`es. On failure, sets an inline error and switches metric +
  account to free-text inputs.
- TripleWhale: `metric` `<select>` whose runtime options come from
  `Object.keys(TW_METRIC_SQL)` (the `TwMetric` union has no runtime value list);
  labels are humanized from the keys.
- Emits a `LeafDraft` (see Data Model). Selecting a metric sets a suggested
  `format` (see below) unless the user already overrode it.

### `ManualBlockForm` (new, `components/dashboard/add-block/manual-block-form.tsx`)
- Props: `{ source: Source; slug: string; pending: boolean; onConfirm:
  (cfg: Omit<BlockConfig,'id'>) => void; onBack: () => void }`
- Leaf source (`supermetrics` | `triplewhale`): one `LeafBuilder` + `name`
  input + `format` `<select>`.
- Aggregate: operator `<select>` (`+ - * /`) + two `LeafBuilder`s (left/right) +
  `name` + `format`.
- Assembles a `BlockConfig` (sans `id`) and calls `onConfirm`; "Add block"
  disabled until valid.

### Dialog wiring (`add-block-dialog.tsx`, modify)
- Add `'mode'` and `'build'` to the step union.
- `pick` selecting a source advances to `'mode'`.
- `mode` → *Describe with AI* sets `step='prompt'` (existing); *Build manually*
  sets `step='build'`.
- `build` renders `ManualBlockForm`; its `onConfirm(cfgNoId)` runs the existing
  confirm logic (assign `crypto.randomUUID()`, `addBlock(config ?? DEFAULT_CONFIG)`,
  `saveDashboardConfig`, close + `router.refresh()`).

## Discovery Client (`lib/supermetrics/discovery.ts`, new)

```ts
export interface MetricOption { value: string; label: string; group?: string; dataType?: string }
export interface AccountOption { value: string; label: string; disabled?: boolean }

// GET /query/fields?json={ds_id}; keep @type==='ds_metric'; map to {value:field_id,
// label:field_name, group:group_name, dataType:data_type}.
export function parseFields(json: unknown): MetricOption[]
export async function smFields(apiKey: string, dsId: string, fetchImpl?): Promise<MetricOption[]>

// GET /query/accounts?json={ds_id}; flatten data[].accounts[]; dedupe by account_id;
// map to {value:account_id, label:account_name||account_id,
// disabled: group_name==='CLOSED AND DISABLED ACCOUNTS'}; sort active first.
export function parseAccounts(json: unknown): AccountOption[]
export async function smAccounts(apiKey: string, dsId: string, fetchImpl?): Promise<AccountOption[]>
```

- Reuses the existing `call()`/error semantics conceptually (throw `SmQueryError`
  on non-OK); both endpoints are GET with the Bearer header.
- `parseFields` / `parseAccounts` are pure and unit-tested with captured real
  fixtures.

### Format suggestion (pure helper)
`formatFromDataType(dataType?: string): MetricFormat` —
`*currency*`→`'currency'`, `*percent*`→`'percent'`, `*int*`/`*count*`→`'count'`,
else `'number'`. Applied as a default when a metric is chosen; user can override.

## Server Actions (`app/actions/dashboard.ts`, modify)

```ts
export async function getMetricOptions(slug: string, dsId: string):
  Promise<{ ok: true; options: MetricOption[] } | { ok: false; error: string }>
export async function getAccountOptions(slug: string, dsId: string):
  Promise<{ ok: true; options: AccountOption[] } | { ok: false; error: string }>
```

- Same gate as `proposeBlock`/`saveDashboardConfig`: `auth()` →
  `canEditDashboard(role, clientSlug, slug)` → else `{ ok:false, error:'forbidden'|'unauthenticated' }`.
- Resolve the SM key via the existing `resolveSmApiKey(client?.smApiKeyEnvVar,
  process.env)`; if none → `{ ok:false, error:'disconnected' }`.
- Wrap `smFields`/`smAccounts` in `unstable_cache([dsId], { revalidate: 3600 })`;
  on throw → `{ ok:false, error: mapErrorMessage(e) }` (never throws to client).

## Data Model

Reuses existing types from `@/lib/dashboard/types` — no schema change. The
manual form assembles the existing `Binding`/`BlockConfig` shapes directly:

```ts
// Draft shapes used inside the form (id/name/format live on the form, not the leaf):
type LeafDraft =
  | { source: 'supermetrics'; dsId: string; metricField: string; account: string }
  | { source: 'triplewhale'; metric: string }

// Confirm assembles:
//  leaf:      { id, name, format, range: null, binding: <LeafBinding from LeafDraft> }
//  aggregate: { id, name, format, range: null,
//               binding: { source:'aggregate', op, left:<LeafBinding>, right:<LeafBinding> } }
```

`applySelections`/`proposeBlock` are **not** used by the manual path — the form
produces the binding directly. `addBlock` + `saveDashboardConfig` are reused
unchanged.

## Error / Loading / Empty States

- **Loading:** while options load, the metric/account controls show a loading
  state and are disabled; the rest of the form remains interactive.
- **Discovery failure / disconnected:** inline error on the leaf; metric +
  account inputs fall back to free-text id entry (so a block can still be built).
- **Validation:** "Add block" disabled until: `name` non-empty; supermetrics
  leaf has `dsId` + `metricField` + `account`; triplewhale leaf has `metric`;
  aggregate requires both leaves valid.
- **Save failure:** reuse the dialog's existing error rendering.

## Testing

Env-free pure-logic tests (`npx tsx <file>.test.ts`, `node:assert` strict, final
`console.log('ok')`):
- `lib/supermetrics/discovery.test.ts` — `parseFields` (filters dimensions,
  maps ids/labels/group/dataType) and `parseAccounts` (flatten, dedupe by
  account_id, closed-account `disabled` + ordering) against captured real
  fixtures.
- `formatFromDataType` mapping cases.
- Manual `BlockConfig` assembly: a pure `buildBlockConfig(form): Omit<BlockConfig,'id'>`
  helper covering leaf (sm/tw) and aggregate, asserting the exact binding shapes.

UI components (`SearchCombobox`, `LeafBuilder`, `ManualBlockForm`, dialog wiring)
are verified by `tsc` + manual, consistent with the existing add-block UI (no
React test runner in-repo).

## File Structure

```
components/dashboard/add-block/
  search-combobox.tsx        # NEW (client)
  leaf-builder.tsx           # NEW (client)
  manual-block-form.tsx      # NEW (client)
  build-config.ts            # NEW (pure: buildBlockConfig + formatFromDataType)
  build-config.test.ts       # NEW
  add-block-dialog.tsx       # MODIFY: + mode/build steps
lib/supermetrics/
  discovery.ts               # NEW: smFields/smAccounts + parsers
  discovery.test.ts          # NEW
app/actions/
  dashboard.ts               # MODIFY: + getMetricOptions / getAccountOptions
```

## Global Constraints

- TypeScript strict; no `any` in new files.
- All Supermetrics calls server-side only; discovery client imported only by the
  server actions, never a `'use client'` file.
- Reuse `auth`, `canEditDashboard`, `resolveSmApiKey`, `addBlock`,
  `saveDashboardConfig`, `DEFAULT_CONFIG`, `DS_IDS`, `TwMetric`.
- Brand tokens match existing add-block components.
- No new npm dependency (hand-rolled combobox on existing popover).
```
