# Manual Query Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an editor add a dashboard block either by describing it in natural language (existing) or by building the query directly in the UI with live Supermetrics discovery dropdowns.

**Architecture:** The existing `add-block-dialog` state machine gains a `mode` step (AI vs Manual) after the source pick. A new `ManualBlockForm` composes a reusable `LeafBuilder` (Supermetrics: data-source `<select>` → live metric/account `SearchCombobox`es; TripleWhale: metric `<select>`) and, for aggregates, two leaf builders + an operator. Two new auth-gated server actions expose cached Supermetrics field/account discovery. The form assembles an existing `BlockConfig` directly (bypassing `proposeBlock`/`applySelections`) and reuses `addBlock` + `saveDashboardConfig`.

**Tech Stack:** Next.js 15 RSC + client components, TypeScript strict, `radix-ui` Popover (already vendored as `components/ui/popover`), `tsx` + `node:assert` for pure-logic tests. No new dependencies.

## Global Constraints

- TypeScript strict; **no `any`** in new files.
- Pure-logic tests are env-free: `npx tsx <file>.test.ts`, `node:assert` strict, wrapped in an async `main()` or top-level blocks, final `console.log('ok')`. UI components and the thin server action have **no unit tests** (no React test runner in-repo) — verified by `tsc` + manual.
- All Supermetrics calls are **server-side only**. The discovery client (`lib/supermetrics/discovery.ts`) is imported as a value only by the server action; client components may only `import type` from it.
- Reuse existing: `auth` (`@/auth`), `canEditDashboard` (`@/lib/dashboard/permissions`), `resolveSmApiKey` (`@/lib/dashboard/adapters/supermetrics`), `getClientBySlug` (`@/lib/db/queries`), `SmQueryError` (`@/lib/supermetrics/types`), `addBlock` (`components/dashboard/config-mutations`), `saveDashboardConfig` (`@/app/actions/dashboard`), `DS_IDS` (`@/lib/supermetrics/constants`), `TW_METRIC_SQL` (`@/lib/triplewhale/queries`), and the dashboard binding/`BlockConfig` types (`@/lib/dashboard/types`).
- Discovery cache key MUST include the resolved API key hash, not just `dsId` (different clients resolve to different keys with different accounts).
- Brand: match existing add-block components — `bg-bg-surface`, `border-white/10`, `border-white/[0.08]`, `text-text-muted`, `text-white`, `brand-cyan`, the gradient apply button (`from-brand-yellow via-brand-green to-brand-cyan`), panel `bg-[#1a1a1a]`, error `text-[#FF6666]`.
- Commit per task with the message shown; stage only the task's files.

---

## Inter-Component Dependency Map

```
  T1 discovery.ts          T2 build-config.ts          T4 search-combobox.tsx
  (pure parse + fetch)     (pure: drafts→BlockConfig)  (client UI, popover)
       │                        │      │                      │
       ▼                        │      │                      │
  T3 server actions             │      │                      │
  getMetric/AccountOptions      │      │                      │
  (needs T1)                    │      │                      │
       │                        │      └───────────┐          │
       └──────────┬─────────────┘                  ▼          │
                  │   (LeafDraft, formatFromDataType,   ▼      │
                  │    + getMetric/AccountOptions, MetricOption/AccountOption types,
                  ▼    + SearchCombobox)
            T5 leaf-builder.tsx  ◀──────────────────────────────┘
            (needs T1 types, T2, T3, T4)
                  │
                  ▼  (LeafBuilder, buildBlockConfig, ManualDraft)
            T6 manual-block-form.tsx
            (needs T2, T5)
                  │
                  ▼  (ManualBlockForm)
            T7 add-block-dialog.tsx (MODIFY: + mode/build steps)
            (needs T6)
```

**Edges = imports/consumes.** T3 needs T1. T5 needs T1 (types only), T2, T3, T4. T6 needs T2, T5. T7 needs T6.

### Parallelization waves

| Wave | Tasks (parallel) | Unblocked by |
|---|---|---|
| 0 | **T1 discovery**, **T2 build-config**, **T4 SearchCombobox** | nothing — 3 disjoint, independent |
| 1 | **T3 server actions** | T1 |
| 2 | **T5 LeafBuilder** | T1 (types), T2, T3, T4 |
| 3 | **T6 ManualBlockForm** | T2, T5 |
| 4 | **T7 dialog wiring** | T6 |

Wave 0 fans out the two pure modules + the standalone combobox (3-wide). The UI then assembles as a sequential chain (leaf → form → dialog), each task reviewed.

---

## File Structure

```
lib/supermetrics/
  discovery.ts                 # NEW: MetricOption/AccountOption, parseFields/parseAccounts, smFields/smAccounts
  discovery.test.ts            # NEW
components/dashboard/add-block/
  build-config.ts              # NEW: LeafDraft, ManualDraft, leafToBinding, buildBlockConfig, formatFromDataType, isDraftComplete
  build-config.test.ts         # NEW
  search-combobox.tsx          # NEW (client): SearchCombobox + ComboOption
  leaf-builder.tsx             # NEW (client): LeafBuilder
  manual-block-form.tsx        # NEW (client): ManualBlockForm
  add-block-dialog.tsx         # MODIFY: + mode/build steps + manual confirm
app/actions/
  dashboard.ts                 # MODIFY: + getMetricOptions / getAccountOptions
```

---

## Task 1: Supermetrics discovery client (`lib/supermetrics/discovery.ts`)

**Files:** Create `lib/supermetrics/discovery.ts`, `lib/supermetrics/discovery.test.ts`.

**Interfaces:**
- Consumes: `SmQueryError` (`@/lib/supermetrics/types`).
- Produces: `MetricOption`, `AccountOption` (interfaces); `parseFields(json): MetricOption[]`; `parseAccounts(json): AccountOption[]`; `smFields(apiKey, dsId, fetchImpl?): Promise<MetricOption[]>`; `smAccounts(apiKey, dsId, fetchImpl?): Promise<AccountOption[]>`.

- [ ] **Step 1: Write the failing test** — create `lib/supermetrics/discovery.test.ts`:

```ts
// Run: npx tsx lib/supermetrics/discovery.test.ts
import { strict as assert } from 'node:assert'
import { parseFields, parseAccounts, smFields, smAccounts } from './discovery'
import { SmQueryError } from './types'

const okFetch = (body: unknown): typeof fetch =>
  (async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response) as unknown as typeof fetch
const failFetch = (status: number): typeof fetch =>
  (async () => ({ ok: false, status, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch

async function main() {
  // parseFields: keep only ds_metric; map id/label/group/dataType
  {
    const opts = parseFields({ data: [
      { '@type': 'ds_dimension', field_id: 'date', field_name: 'Date', data_type: 'string.time.date', group_name: 'TIME' },
      { '@type': 'ds_metric', field_id: 'SocialSpend', field_name: 'Social spend', data_type: 'float.currency.value', group_name: 'SPEND' },
    ] })
    assert.equal(opts.length, 1)
    assert.deepEqual(opts[0], { value: 'SocialSpend', label: 'Social spend', group: 'SPEND', dataType: 'float.currency.value' })
  }

  // parseAccounts: flatten connections, dedupe by id, flag closed, sort closed last
  {
    const opts = parseAccounts({ data: [
      { accounts: [
        { account_id: 'act_1', account_name: 'Avenue Z', group_name: '' },
        { account_id: 'act_2', account_name: 'Dead', group_name: 'CLOSED AND DISABLED ACCOUNTS' },
      ] },
      { accounts: [
        { account_id: 'act_1', account_name: 'Avenue Z', group_name: '' }, // dupe
        { account_id: 'act_3', account_name: 'Begin' },
      ] },
    ] })
    assert.deepEqual(opts.map((o) => o.value), ['act_1', 'act_3', 'act_2']) // closed last
    assert.equal(opts.find((o) => o.value === 'act_2')?.disabled, true)
    assert.equal(opts.find((o) => o.value === 'act_3')?.label, 'Begin')
  }

  // smFields/smAccounts use injected fetch
  {
    const f = await smFields('k', 'FA', okFetch({ data: [{ '@type': 'ds_metric', field_id: 'cost', field_name: 'Cost' }] }))
    assert.equal(f[0].value, 'cost')
    const a = await smAccounts('k', 'FA', okFetch({ data: [{ accounts: [{ account_id: 'act_9', account_name: 'Nine' }] }] }))
    assert.equal(a[0].value, 'act_9')
  }

  // non-ok throws SmQueryError
  await assert.rejects(smFields('k', 'FA', failFetch(403)), (e: unknown) => e instanceof SmQueryError)

  console.log('ok')
}
main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/supermetrics/discovery.test.ts`
Expected: FAIL with `Cannot find module './discovery'`

- [ ] **Step 3: Write the implementation** — create `lib/supermetrics/discovery.ts`:

```ts
/**
 * Supermetrics live discovery — server-side only. Lists the metrics and
 * connected accounts for a data source, for the manual query builder.
 * Verified endpoints (Bearer key): GET /query/fields and GET /query/accounts.
 */
import { SmQueryError } from './types'

const BASE = 'https://api.supermetrics.com/enterprise/v2'
const CLOSED_GROUP = 'CLOSED AND DISABLED ACCOUNTS'

export interface MetricOption { value: string; label: string; group?: string; dataType?: string }
export interface AccountOption { value: string; label: string; disabled?: boolean }

interface FieldRow { '@type'?: string; field_id?: string; field_name?: string; data_type?: string; group_name?: string }
interface AccountConn { accounts?: { account_id?: string; account_name?: string; group_name?: string }[] }

/** Keep only metrics (drop dimensions); map to {value,label,group,dataType}. */
export function parseFields(json: unknown): MetricOption[] {
  const data = (json as { data?: FieldRow[] }).data ?? []
  return data
    .filter((f): f is FieldRow & { field_id: string } => f['@type'] === 'ds_metric' && typeof f.field_id === 'string')
    .map((f) => ({ value: f.field_id, label: f.field_name || f.field_id, group: f.group_name || undefined, dataType: f.data_type }))
}

/** Flatten connections' accounts, dedupe by account_id, flag closed, sort active first. */
export function parseAccounts(json: unknown): AccountOption[] {
  const data = (json as { data?: AccountConn[] }).data ?? []
  const seen = new Set<string>()
  const out: AccountOption[] = []
  for (const conn of data) {
    for (const a of conn.accounts ?? []) {
      if (!a.account_id || seen.has(a.account_id)) continue
      seen.add(a.account_id)
      out.push({ value: a.account_id, label: a.account_name || a.account_id, disabled: a.group_name === CLOSED_GROUP })
    }
  }
  return out.sort((a, b) => Number(a.disabled ?? false) - Number(b.disabled ?? false))
}

async function getJson(endpoint: string, dsId: string, apiKey: string, fetchImpl: typeof fetch): Promise<unknown> {
  const url = `${BASE}/${endpoint}?json=${encodeURIComponent(JSON.stringify({ ds_id: dsId }))}`
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!res.ok) throw new SmQueryError(`Supermetrics ${res.status}`, res.status)
  return res.json()
}

export async function smFields(apiKey: string, dsId: string, fetchImpl: typeof fetch = fetch): Promise<MetricOption[]> {
  return parseFields(await getJson('query/fields', dsId, apiKey, fetchImpl))
}

export async function smAccounts(apiKey: string, dsId: string, fetchImpl: typeof fetch = fetch): Promise<AccountOption[]> {
  return parseAccounts(await getJson('query/accounts', dsId, apiKey, fetchImpl))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/supermetrics/discovery.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/supermetrics/discovery.ts lib/supermetrics/discovery.test.ts
git commit -m "feat(dashboard): supermetrics field + account discovery client"
```

---

## Task 2: Manual draft → BlockConfig helpers (`components/dashboard/add-block/build-config.ts`)

**Files:** Create `components/dashboard/add-block/build-config.ts`, `components/dashboard/add-block/build-config.test.ts`.

**Interfaces:**
- Consumes: `BlockConfig`, `LeafBinding`, `AggregateBinding`, `MetricFormat` (`@/lib/dashboard/types`).
- Produces: `LeafDraft`, `ManualDraft` (types); `leafToBinding(d): LeafBinding`; `buildBlockConfig(d): Omit<BlockConfig,'id'>`; `formatFromDataType(dataType?): MetricFormat`; `isLeafComplete(d): boolean`; `isDraftComplete(d): boolean`.

- [ ] **Step 1: Write the failing test** — create `components/dashboard/add-block/build-config.test.ts`:

```ts
// Run: npx tsx components/dashboard/add-block/build-config.test.ts
import { strict as assert } from 'node:assert'
import { buildBlockConfig, formatFromDataType, isDraftComplete, leafToBinding, type ManualDraft } from './build-config'

// leafToBinding: supermetrics + triplewhale
{
  assert.deepEqual(leafToBinding({ source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' }),
    { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' })
  assert.deepEqual(leafToBinding({ source: 'triplewhale', metric: 'revenue' }),
    { source: 'triplewhale', metric: 'revenue' })
}

// buildBlockConfig: leaf (supermetrics)
{
  const d: ManualDraft = { kind: 'leaf', name: 'FB Spend', format: 'currency', leaf: { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' } }
  const cfg = buildBlockConfig(d)
  assert.equal('id' in cfg, false)
  assert.equal(cfg.name, 'FB Spend'); assert.equal(cfg.format, 'currency'); assert.equal(cfg.range, null)
  assert.equal(cfg.binding.source, 'supermetrics')
  if (cfg.binding.source === 'supermetrics') assert.equal(cfg.binding.metricField, 'SocialSpend')
}

// buildBlockConfig: aggregate (revenue / spend)
{
  const d: ManualDraft = { kind: 'aggregate', name: 'Blended ROAS', format: 'number', op: '/',
    left: { source: 'triplewhale', metric: 'revenue' },
    right: { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' } }
  const cfg = buildBlockConfig(d)
  assert.equal(cfg.binding.source, 'aggregate')
  if (cfg.binding.source === 'aggregate') {
    assert.equal(cfg.binding.op, '/')
    assert.equal(cfg.binding.left.source, 'triplewhale')
    assert.equal(cfg.binding.right.source, 'supermetrics')
  }
}

// formatFromDataType
{
  assert.equal(formatFromDataType('float.currency.value'), 'currency')
  assert.equal(formatFromDataType('float.percentage.value'), 'percent')
  assert.equal(formatFromDataType('int.value'), 'count')
  assert.equal(formatFromDataType('string.text.value'), 'number')
  assert.equal(formatFromDataType(undefined), 'number')
}

// isDraftComplete: name required; leaf/aggregate completeness
{
  assert.equal(isDraftComplete({ kind: 'leaf', name: '', format: 'number', leaf: { source: 'triplewhale', metric: 'revenue' } }), false)
  assert.equal(isDraftComplete({ kind: 'leaf', name: 'X', format: 'number', leaf: { source: 'supermetrics', dsId: 'FA', metricField: '', account: 'act_1' } }), false)
  assert.equal(isDraftComplete({ kind: 'leaf', name: 'X', format: 'number', leaf: { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' } }), true)
  assert.equal(isDraftComplete({ kind: 'aggregate', name: 'X', format: 'number', op: '/', left: { source: 'triplewhale', metric: 'revenue' }, right: { source: 'triplewhale', metric: '' } }), false)
}

console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: FAIL with `Cannot find module './build-config'`

- [ ] **Step 3: Write the implementation** — create `components/dashboard/add-block/build-config.ts`:

```ts
import type { BlockConfig, LeafBinding, AggregateBinding, MetricFormat } from '@/lib/dashboard/types'

/** A single leaf's manual selections. */
export type LeafDraft =
  | { source: 'supermetrics'; dsId: string; metricField: string; account: string }
  | { source: 'triplewhale'; metric: string }

/** The whole manual form's state. */
export type ManualDraft =
  | { kind: 'leaf'; name: string; format: MetricFormat; leaf: LeafDraft }
  | { kind: 'aggregate'; name: string; format: MetricFormat; op: AggregateBinding['op']; left: LeafDraft; right: LeafDraft }

export function leafToBinding(d: LeafDraft): LeafBinding {
  return d.source === 'supermetrics'
    ? { source: 'supermetrics', dsId: d.dsId, metricField: d.metricField, account: d.account }
    : { source: 'triplewhale', metric: d.metric }
}

/** Assemble the final block config (id is assigned later, at confirm). */
export function buildBlockConfig(d: ManualDraft): Omit<BlockConfig, 'id'> {
  const binding =
    d.kind === 'leaf'
      ? leafToBinding(d.leaf)
      : { source: 'aggregate' as const, op: d.op, left: leafToBinding(d.left), right: leafToBinding(d.right) }
  return { name: d.name, format: d.format, range: null, binding }
}

/** Best-guess format from a Supermetrics field data_type (user can override). */
export function formatFromDataType(dataType?: string): MetricFormat {
  const t = (dataType ?? '').toLowerCase()
  if (t.includes('currency')) return 'currency'
  if (t.includes('percent')) return 'percent'
  if (t.includes('int')) return 'count'
  return 'number'
}

export function isLeafComplete(d: LeafDraft): boolean {
  return d.source === 'supermetrics'
    ? d.dsId !== '' && d.metricField !== '' && d.account !== ''
    : d.metric !== ''
}

export function isDraftComplete(d: ManualDraft): boolean {
  if (d.name.trim() === '') return false
  return d.kind === 'leaf' ? isLeafComplete(d.leaf) : isLeafComplete(d.left) && isLeafComplete(d.right)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts
git commit -m "feat(dashboard): manual draft → BlockConfig helpers"
```

---

## Task 3: Discovery server actions (`app/actions/dashboard.ts`)

**Files:** Modify `app/actions/dashboard.ts`.

**Interfaces:**
- Consumes: `smFields`, `smAccounts`, `MetricOption`, `AccountOption` (T1, `@/lib/supermetrics/discovery`); `resolveSmApiKey` (`@/lib/dashboard/adapters/supermetrics`); `getClientBySlug` (`@/lib/db/queries`); `auth`, `canEditDashboard` (already imported); `unstable_cache` (`next/cache`); `createHash` (`node:crypto`).
- Produces: `getMetricOptions(slug, dsId): Promise<{ ok: true; options: MetricOption[] } | { ok: false; error: string }>`; `getAccountOptions(slug, dsId): Promise<{ ok: true; options: AccountOption[] } | { ok: false; error: string }>`.

**Note:** thin auth + cache + discovery dispatch; verified by the tsc gate (no unit test — parsing is covered by T1). `'use server'` requires every export to be an async function — do **not** add exported types here; the result objects are returned inline.

- [ ] **Step 1: Add imports** — in `app/actions/dashboard.ts`, change the `next/cache` import and add the new ones. Existing line 4 is `import { revalidatePath } from 'next/cache'`; replace it with:

```ts
import { revalidatePath, unstable_cache } from 'next/cache'
import { createHash } from 'node:crypto'
```

Then add, alongside the other imports:

```ts
import { getClientBySlug } from '@/lib/db/queries'
import { resolveSmApiKey } from '@/lib/dashboard/adapters/supermetrics'
import { smFields, smAccounts, type MetricOption, type AccountOption } from '@/lib/supermetrics/discovery'
```

- [ ] **Step 2: Add the actions** — append to `app/actions/dashboard.ts`:

```ts
const keyHash = (apiKey: string) => createHash('sha256').update(apiKey).digest('hex').slice(0, 16)

async function resolveKeyForSlug(slug: string): Promise<string | undefined> {
  const client = await getClientBySlug(slug)
  return resolveSmApiKey(client?.smApiKeyEnvVar, process.env)
}

/** Live Supermetrics metric options for a data source. Same edit gate as save; cached per (dsId, key). */
export async function getMetricOptions(
  slug: string,
  dsId: string,
): Promise<{ ok: true; options: MetricOption[] } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const apiKey = await resolveKeyForSlug(slug)
  if (!apiKey) return { ok: false, error: 'disconnected' }
  try {
    const options = await unstable_cache(
      () => smFields(apiKey, dsId),
      ['sm-fields', dsId, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, options }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'discovery failed' }
  }
}

/** Live Supermetrics account options for a data source. Same edit gate as save; cached per (dsId, key). */
export async function getAccountOptions(
  slug: string,
  dsId: string,
): Promise<{ ok: true; options: AccountOption[] } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const apiKey = await resolveKeyForSlug(slug)
  if (!apiKey) return { ok: false, error: 'disconnected' }
  try {
    const options = await unstable_cache(
      () => smAccounts(apiKey, dsId),
      ['sm-accounts', dsId, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, options }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'discovery failed' }
  }
}
```

- [ ] **Step 3: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "app/actions/dashboard" || echo "actions ok"`
Expected: `actions ok`

- [ ] **Step 4: Commit**

```bash
git add app/actions/dashboard.ts
git commit -m "feat(dashboard): getMetricOptions/getAccountOptions discovery actions"
```

---

## Task 4: Searchable combobox (`components/dashboard/add-block/search-combobox.tsx`)

**Files:** Create `components/dashboard/add-block/search-combobox.tsx` (client).

**Interfaces:**
- Consumes: `Popover`, `PopoverTrigger`, `PopoverContent` (`@/components/ui/popover`); `cn` (`@/lib/utils`).
- Produces: `ComboOption` (interface); `SearchCombobox` component with props `{ value: string; onChange: (v: string) => void; options: ComboOption[]; placeholder?: string; disabled?: boolean; loading?: boolean }`.

**Note:** UI — verified by `tsc` + manual.

- [ ] **Step 1: Write the component** — create `components/dashboard/add-block/search-combobox.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ComboOption { value: string; label: string; group?: string; disabled?: boolean }

export function SearchCombobox({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  loading = false,
}: {
  value: string
  onChange: (v: string) => void
  options: ComboOption[]
  placeholder?: string
  disabled?: boolean
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const match =
      needle === ''
        ? options
        : options.filter((o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle))
    return [...match].sort((a, b) => Number(a.disabled ?? false) - Number(b.disabled ?? false))
  }, [q, options])

  const trigger =
    'flex w-full items-center justify-between rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white disabled:opacity-40'

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ('') }}>
      <PopoverTrigger asChild>
        <button type="button" className={trigger} disabled={disabled || loading}>
          <span className={cn(!selected && 'text-text-muted')}>
            {loading ? 'Loading…' : selected ? selected.label : placeholder}
          </span>
          <span className="text-text-muted">▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] border-white/[0.08] bg-[#1a1a1a] p-0 text-white"
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full border-b border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-text-muted"
        />
        <div className="max-h-60 overflow-y-auto py-1">
          {filtered.length === 0 && <p className="px-3 py-2 text-xs text-text-muted">No matches</p>}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); setQ('') }}
              className={cn(
                'flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-white/[0.06]',
                o.value === value ? 'text-brand-cyan' : o.disabled ? 'text-text-muted' : 'text-white/90',
              )}
            >
              <span>{o.label}</span>
              {o.disabled && <span className="text-[10px] uppercase tracking-widest text-text-muted">closed</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "search-combobox" || echo "combobox ok"`
Expected: `combobox ok`

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/add-block/search-combobox.tsx
git commit -m "feat(dashboard): searchable combobox (popover-based)"
```

---

## Task 5: Leaf builder (`components/dashboard/add-block/leaf-builder.tsx`)

**Files:** Create `components/dashboard/add-block/leaf-builder.tsx` (client).

**Interfaces:**
- Consumes: `DS_IDS` (`@/lib/supermetrics/constants`); `TW_METRIC_SQL` (`@/lib/triplewhale/queries`); `getMetricOptions`, `getAccountOptions` (T3, `@/app/actions/dashboard`); `SearchCombobox`, `ComboOption` (T4); `formatFromDataType`, `LeafDraft` (T2, `./build-config`); `MetricFormat` (`@/lib/dashboard/types`); `MetricOption`, `AccountOption` (T1, type-only, `@/lib/supermetrics/discovery`).
- Produces: `LeafBuilder` component with props `{ source: 'supermetrics' | 'triplewhale'; value: LeafDraft; onChange: (v: LeafDraft) => void; slug: string; onSuggestFormat?: (f: MetricFormat) => void }`.

**Note:** UI — verified by `tsc` + manual. All hooks are declared unconditionally before any early return (rules of hooks). Supermetrics options load via the T3 actions on data-source change; on a `!ok` metric result the metric/account inputs fall back to free-text id entry.

- [ ] **Step 1: Write the component** — create `components/dashboard/add-block/leaf-builder.tsx`:

```tsx
'use client'

import type React from 'react'
import { useEffect, useState, useTransition } from 'react'
import { DS_IDS } from '@/lib/supermetrics/constants'
import { TW_METRIC_SQL } from '@/lib/triplewhale/queries'
import { getMetricOptions, getAccountOptions } from '@/app/actions/dashboard'
import { SearchCombobox, type ComboOption } from './search-combobox'
import { formatFromDataType, type LeafDraft } from './build-config'
import type { MetricFormat } from '@/lib/dashboard/types'

const DS_OPTIONS: { value: string; label: string }[] = [
  { value: DS_IDS.GA4, label: 'Google Analytics 4' },
  { value: DS_IDS.GOOGLE_ADS, label: 'Google Ads' },
  { value: DS_IDS.META, label: 'Meta (Facebook) Ads' },
  { value: DS_IDS.LINKEDIN, label: 'LinkedIn Ads' },
]
const TW_OPTIONS: ComboOption[] = Object.keys(TW_METRIC_SQL).map((m) => ({ value: m, label: humanize(m) }))

function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'

export function LeafBuilder({
  source,
  value,
  onChange,
  slug,
  onSuggestFormat,
}: {
  source: 'supermetrics' | 'triplewhale'
  value: LeafDraft
  onChange: (v: LeafDraft) => void
  slug: string
  onSuggestFormat?: (f: MetricFormat) => void
}) {
  const sm = value.source === 'supermetrics' ? value : null
  const dsId = sm?.dsId ?? ''

  const [metricOpts, setMetricOpts] = useState<ComboOption[]>([])
  const [acctOpts, setAcctOpts] = useState<ComboOption[]>([])
  const [dataTypeByMetric, setDataTypeByMetric] = useState<Record<string, string | undefined>>({})
  const [err, setErr] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()

  useEffect(() => {
    if (source !== 'supermetrics' || dsId === '') {
      setMetricOpts([]); setAcctOpts([]); setDataTypeByMetric({}); setErr(null)
      return
    }
    setErr(null)
    startLoad(async () => {
      const [m, a] = await Promise.all([getMetricOptions(slug, dsId), getAccountOptions(slug, dsId)])
      if (m.ok) {
        setMetricOpts(m.options.map((o) => ({ value: o.value, label: o.label, group: o.group })))
        setDataTypeByMetric(Object.fromEntries(m.options.map((o) => [o.value, o.dataType])))
      } else {
        setErr(m.error); setMetricOpts([]); setDataTypeByMetric({})
      }
      setAcctOpts(a.ok ? a.options.map((o) => ({ value: o.value, label: o.label, disabled: o.disabled })) : [])
    })
  }, [source, dsId, slug])

  if (source === 'triplewhale') {
    const metric = value.source === 'triplewhale' ? value.metric : ''
    return (
      <Field label="Metric">
        <SearchCombobox
          value={metric}
          options={TW_OPTIONS}
          placeholder="Select metric"
          onChange={(m) => onChange({ source: 'triplewhale', metric: m })}
        />
      </Field>
    )
  }

  const v = sm ?? { source: 'supermetrics' as const, dsId: '', metricField: '', account: '' }
  const set = (patch: Partial<Extract<LeafDraft, { source: 'supermetrics' }>>) =>
    onChange({ source: 'supermetrics', dsId: v.dsId, metricField: v.metricField, account: v.account, ...patch })

  return (
    <div className="flex flex-col gap-3">
      <Field label="Data source">
        <select className={ctrl} value={v.dsId} onChange={(e) => set({ dsId: e.target.value, metricField: '', account: '' })}>
          <option value="">Select data source…</option>
          {DS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      {err ? (
        <>
          <p className="text-xs text-[#FF6666]">Discovery unavailable ({err}). Enter ids manually.</p>
          <Field label="Metric field">
            <input className={ctrl} value={v.metricField} onChange={(e) => set({ metricField: e.target.value })} placeholder="e.g. SocialSpend" />
          </Field>
          <Field label="Account">
            <input className={ctrl} value={v.account} onChange={(e) => set({ account: e.target.value })} placeholder="e.g. act_123…" />
          </Field>
        </>
      ) : (
        <>
          <Field label="Metric">
            <SearchCombobox
              value={v.metricField}
              options={metricOpts}
              disabled={v.dsId === ''}
              loading={loading}
              placeholder="Select metric"
              onChange={(metricField) => { set({ metricField }); onSuggestFormat?.(formatFromDataType(dataTypeByMetric[metricField])) }}
            />
          </Field>
          <Field label="Account">
            <SearchCombobox
              value={v.account}
              options={acctOpts}
              disabled={v.dsId === ''}
              loading={loading}
              placeholder="Select account"
              onChange={(account) => set({ account })}
            />
          </Field>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">{label}</span>
      {children}
    </label>
  )
}
```

- [ ] **Step 2: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "leaf-builder" || echo "leaf ok"`
Expected: `leaf ok`

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/add-block/leaf-builder.tsx
git commit -m "feat(dashboard): leaf builder (discovery dropdowns + free-text fallback)"
```

---

## Task 6: Manual block form (`components/dashboard/add-block/manual-block-form.tsx`)

**Files:** Create `components/dashboard/add-block/manual-block-form.tsx` (client).

**Interfaces:**
- Consumes: `LeafBuilder` (T5); `buildBlockConfig`, `isDraftComplete`, `LeafDraft`, `ManualDraft` (T2, `./build-config`); `BlockConfig`, `MetricFormat` (`@/lib/dashboard/types`).
- Produces: `ManualBlockForm` component with props `{ source: 'supermetrics' | 'triplewhale' | 'aggregate'; slug: string; pending: boolean; onConfirm: (cfg: Omit<BlockConfig,'id'>) => void; onBack: () => void }`.

**Note:** UI — verified by `tsc` + manual. Switching an aggregate operand's source resets that operand's draft.

- [ ] **Step 1: Write the component** — create `components/dashboard/add-block/manual-block-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { LeafBuilder } from './leaf-builder'
import { buildBlockConfig, isDraftComplete, type LeafDraft, type ManualDraft } from './build-config'
import type { BlockConfig, MetricFormat } from '@/lib/dashboard/types'

type LeafSource = 'supermetrics' | 'triplewhale'
type Op = '+' | '-' | '*' | '/'

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
  source,
  slug,
  pending,
  onConfirm,
  onBack,
}: {
  source: 'supermetrics' | 'triplewhale' | 'aggregate'
  slug: string
  pending: boolean
  onConfirm: (cfg: Omit<BlockConfig, 'id'>) => void
  onBack: () => void
}) {
  const [name, setName] = useState('')
  const [format, setFormat] = useState<MetricFormat>('number')
  const [leaf, setLeaf] = useState<LeafDraft>(() => emptyLeaf(source === 'aggregate' ? 'supermetrics' : source))
  const [op, setOp] = useState<Op>('/')
  const [leftSource, setLeftSource] = useState<LeafSource>('triplewhale')
  const [rightSource, setRightSource] = useState<LeafSource>('supermetrics')
  const [left, setLeft] = useState<LeafDraft>(() => emptyLeaf('triplewhale'))
  const [right, setRight] = useState<LeafDraft>(() => emptyLeaf('supermetrics'))

  const draft: ManualDraft =
    source === 'aggregate'
      ? { kind: 'aggregate', name, format, op, left, right }
      : { kind: 'leaf', name, format, leaf }

  return (
    <div className="flex flex-col gap-3">
      <p className={labelCls}>Build manually · {source}</p>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Name</span>
        <input className={ctrl} value={name} onChange={(e) => setName(e.target.value)} placeholder="Block name" />
      </label>

      {source !== 'aggregate' && (
        <LeafBuilder source={source} value={leaf} onChange={setLeaf} slug={slug} onSuggestFormat={setFormat} />
      )}

      {source === 'aggregate' && (
        <>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Operator</span>
            <select className={ctrl} value={op} onChange={(e) => setOp(e.target.value as Op)}>
              {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <Operand title="Left" src={leftSource} onSrc={(s) => { setLeftSource(s); setLeft(emptyLeaf(s)) }} value={left} onChange={setLeft} slug={slug} />
          <Operand title="Right" src={rightSource} onSrc={(s) => { setRightSource(s); setRight(emptyLeaf(s)) }} value={right} onChange={setRight} slug={slug} />
        </>
      )}

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
  title,
  src,
  onSrc,
  value,
  onChange,
  slug,
}: {
  title: string
  src: LeafSource
  onSrc: (s: LeafSource) => void
  value: LeafDraft
  onChange: (v: LeafDraft) => void
  slug: string
}) {
  return (
    <div className="rounded-md border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={labelCls}>{title}</span>
        <select
          className="rounded-md border border-white/10 bg-bg-surface px-2 py-1 text-xs text-white"
          value={src}
          onChange={(e) => onSrc(e.target.value as LeafSource)}
        >
          <option value="supermetrics">Supermetrics</option>
          <option value="triplewhale">TripleWhale</option>
        </select>
      </div>
      <LeafBuilder source={src} value={value} onChange={onChange} slug={slug} />
    </div>
  )
}
```

- [ ] **Step 2: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "manual-block-form" || echo "form ok"`
Expected: `form ok`

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/add-block/manual-block-form.tsx
git commit -m "feat(dashboard): manual block form (leaf + aggregate builders)"
```

---

## Task 7: Dialog wiring — mode + build steps (`components/dashboard/add-block/add-block-dialog.tsx`)

**Files:** Modify `components/dashboard/add-block/add-block-dialog.tsx`.

**Interfaces:**
- Consumes: `ManualBlockForm` (T6); `addBlock` (`../config-mutations`), `saveDashboardConfig` (`@/app/actions/dashboard`), `DEFAULT_CONFIG` (existing in this file); `BlockConfig` (`@/lib/dashboard/types`).
- Produces: updated `AddBlockDialog` (same props) with a `mode` step (AI vs Manual) after `pick` and a `build` step rendering `ManualBlockForm`.

**Note:** UI — verified by `tsc` + the full pure-test suite + manual.

- [ ] **Step 1: Add imports** — add to the import block of `add-block-dialog.tsx`:

```tsx
import { ManualBlockForm } from './manual-block-form'
import type { BlockConfig } from '@/lib/dashboard/types'
```

- [ ] **Step 2: Extend the step union** — change:

```tsx
  const [step, setStep] = useState<'pick' | 'prompt' | 'preview'>('pick')
```
to:
```tsx
  const [step, setStep] = useState<'pick' | 'mode' | 'prompt' | 'preview' | 'build'>('pick')
```

- [ ] **Step 3: Route the source pick to the mode step** — in the `step === 'pick'` block, change the button handler:

```tsx
              <button key={s.value} onClick={() => { setSource(s.value); setStep('prompt') }}
```
to:
```tsx
              <button key={s.value} onClick={() => { setSource(s.value); setStep('mode') }}
```

- [ ] **Step 4: Add the manual confirm handler** — add this function next to the existing `confirm`:

```tsx
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
```

- [ ] **Step 5: Render the mode + build steps** — insert these two blocks between the `step === 'pick'` block and the `step === 'prompt'` block:

```tsx
        {step === 'mode' && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">How to build it · {source}</p>
            <button onClick={() => setStep('prompt')}
              className="rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 hover:bg-white/[0.04]">
              Describe with AI
            </button>
            <button onClick={() => setStep('build')}
              className="rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 hover:bg-white/[0.04]">
              Build manually
            </button>
            <button className="mt-1 self-start rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={() => setStep('pick')} disabled={pending}>Back</button>
          </div>
        )}

        {step === 'build' && (
          <>
            <ManualBlockForm source={source} slug={slug} pending={pending} onConfirm={confirmManual} onBack={() => setStep('mode')} />
            {error && <p className="mt-2 text-xs text-[#FF6666]">Error: {error}</p>}
          </>
        )}
```

- [ ] **Step 6: Point the AI step's Back at the mode step** — in the `step === 'prompt'` block, change `onClick={() => setStep('pick')}` to `onClick={() => setStep('mode')}`.

- [ ] **Step 7: Type-check + full pure-test suite**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "components/dashboard/add-block|app/actions/dashboard" || echo "no new type errors"
npx tsx lib/supermetrics/discovery.test.ts
npx tsx components/dashboard/add-block/build-config.test.ts
```
Expected: `no new type errors`, and both tests print `ok`.

- [ ] **Step 8: Production build (de-risk the preview)**

Run: `npm run build 2>&1 | tail -5`
Expected: build completes; the `configurable-dashboard` route compiles.

- [ ] **Step 9: Commit**

```bash
git add components/dashboard/add-block/add-block-dialog.tsx
git commit -m "feat(dashboard): mode step + manual build path in add-block dialog"
```

---

## Self-Review

**Spec coverage** (against `2026-06-23-manual-query-builder-design.md`):
- Mode choice after source pick → T7 (`mode` step). ✅
- Manual Supermetrics leaf via live discovery dropdowns → T5 + T3 + T1. ✅
- Manual TripleWhale leaf (enum dropdown, no account) → T5 (`TW_OPTIONS`). ✅
- Manual aggregate (operator + two leaf builders) → T6. ✅
- Live field/account discovery client (`/query/fields`, `/query/accounts`, parse/dedupe/closed-last) → T1. ✅
- Auth-gated, cached server actions (key includes API-key hash) → T3. ✅
- Searchable combobox, no new dep → T4. ✅
- Format suggestion from `data_type` → T2 (`formatFromDataType`), applied in T5. ✅
- No separate preview for manual; confirm via `crypto.randomUUID()` → `addBlock(config ?? DEFAULT_CONFIG)` → `saveDashboardConfig` → close + refresh → T7. ✅
- Manual path bypasses `proposeBlock`/`applySelections` → T6/T7 (uses `buildBlockConfig`). ✅
- Error/loading/empty + free-text fallback on discovery failure → T5; validation gate → T6 (`isDraftComplete`). ✅
- Testing: pure tsx tests for parsers + assembly (T1, T2); UI via tsc + build (T4–T7). ✅
- Out of scope (report types/GA4 properties, TW accounts, recently-used, operand alternatives, dimensions) → none included. ✅

**Placeholder scan:** none. ✅

**Type consistency:** `LeafDraft`/`ManualDraft`/`buildBlockConfig`/`isDraftComplete`/`formatFromDataType` (T2) consumed identically in T5/T6; `MetricOption`/`AccountOption` (T1) consumed by T3 (value) and T5 (type-only); `getMetricOptions`/`getAccountOptions` return `{ok:true;options} | {ok:false;error}` in T3 and are destructured as such in T5; `SearchCombobox`/`ComboOption` (T4) used in T5; `ManualBlockForm` props (T6) match the T7 call site; `onConfirm` emits `Omit<BlockConfig,'id'>` (T6) and T7's `confirmManual` consumes exactly that, spreading an `id` to form a `BlockConfig`/`PersistedBlock` for `addBlock`. ✅

**Out-of-band:** stage only each task's listed files; leave unrelated working-tree edits (paid-search, infra fixes) unstaged.
```
