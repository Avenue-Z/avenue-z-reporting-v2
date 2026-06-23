# Supermetrics Dimension Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured dimension filters to the builder's Supermetrics leaf (e.g. Shopify `total_sales` where `order_shipping_country == United States`), mirroring the TripleWhale filter feature.

**Architecture:** Discovery gains Supermetrics dimensions + a dimension's distinct values. The binding's `filters` becomes structured `{column,value}[]`; the adapter builds the Supermetrics `filter` string (`col == value AND …`, values unquoted — confirmed live) and passes it to the unchanged `smQuery`. The Supermetrics leaf UI gains filter rows like the TripleWhale leaf.

**Tech Stack:** Next.js RSC + server actions, TypeScript strict, Supermetrics enterprise/v2 API (`smQuery`), `tsx` + `node:assert` for pure tests. No new dependencies.

## Global Constraints

- TypeScript strict; **no `any`** in new files.
- All Supermetrics calls server-side only; the discovery client is value-imported only by the server actions; client components use `import type` only.
- **Filter grammar (confirmed live):** `field == value` with spaces, **values unquoted** (multi-word values like `United States` work as-is), conditions joined by ` AND `. The endpoint already accepts this via `smQuery`'s `filter` param.
- **Safety:** every interpolated dimension column passes `^[A-Za-z0-9_]+$` (Supermetrics field-id charset, includes camelCase); a filter row with an unsafe column or empty value is dropped. Enforced in `buildSmFilter` and `smDimensionValues`.
- Reuse: `smQuery` (unchanged, string `filter`), `SmQueryError`/`SmResult` (`@/lib/supermetrics/types`), `getClientBySlug`, `resolveSmApiKey`, `auth`, `canEditDashboard`, `unstable_cache`+`keyHash` (already in `app/actions/dashboard.ts`), `parseDateRange` (`@/lib/ga4/client`), `SearchCombobox`/`ComboOption`, the existing `MetricOption` type.
- `filters` is **optional** on the binding and the draft (additive — nothing else breaks).
- Pure tests env-free: `npx tsx <file>.test.ts`, `node:assert` strict, final `console.log('ok')`. UI + thin actions: no unit test (tsc + build).
- Commit per task with the message shown; **path-scope each commit** (`git commit -- <files>`) — the working tree has unrelated concurrent edits; never stage them.

---

## Inter-Component Dependency Map

```
  T1 discovery.ts                         T2 data layer
  (parseDimensions, smDimensions,         (types.ts SupermetricsBinding.filters:{c,v}[]
   smDimensionValues)                      + persistence validation
       │                                   + adapters/supermetrics.ts buildSmFilter)
       │                                          │
       ▼                                          ▼
  T3 app/actions/dashboard.ts             T4 build-config.ts
  (getSmDimensions, getSmDimensionValues) (SM LeafDraft.filters? + leafToBinding)
   (needs T1)                              (needs T2's SupermetricsBinding.filters type)
       │                                          │
       └──────────────────┬───────────────────────┘
                          ▼  (+ T1 MetricOption type, already exists)
                 T5 leaf-builder.tsx (Supermetrics branch + SmFilterRow)
                 (needs T1, T3, T4)
```

**Why T2 bundles type+persistence+adapter:** changing `SupermetricsBinding.filters` from `string` to `{column,value}[]` breaks both the adapter (passes it to `smQuery`'s string param) and persistence (validates it) — they must change together to keep `tsc` green at that commit.

### Parallelization waves

| Wave | Tasks (parallel, disjoint files) | Unblocked by |
|---|---|---|
| 0 | **T1 discovery**, **T2 data layer** | nothing |
| 1 | **T3 actions** (←T1), **T4 build-config** (←T2) | wave 0 |
| 2 | **T5 leaf-builder UI** (←T1, T3, T4) | wave 1 |

---

## File Structure

```
lib/supermetrics/
  discovery.ts                 # MODIFY: + parseDimensions, smDimensions, smDimensionValues, COLUMN_RE
  discovery.test.ts            # MODIFY
lib/dashboard/
  types.ts                     # MODIFY: SupermetricsBinding.filters string -> {column,value}[]
  persistence.ts               # MODIFY: validate SM filters as {column,value}[]
  persistence.test.ts          # MODIFY
  adapters/supermetrics.ts     # MODIFY: + buildSmFilter; sumForRange uses it
  adapters/supermetrics.test.ts# MODIFY: buildSmFilter tests
app/actions/
  dashboard.ts                 # MODIFY: + getSmDimensions, getSmDimensionValues
components/dashboard/add-block/
  build-config.ts              # MODIFY: SM LeafDraft filters?; leafToBinding carries cleaned filters
  build-config.test.ts         # MODIFY
  leaf-builder.tsx             # MODIFY: Supermetrics branch filter rows (SmFilterRow)
```

---

## Task 1: SM dimension + value discovery (`lib/supermetrics/discovery.ts`)

**Files:** Modify `lib/supermetrics/discovery.ts`, `lib/supermetrics/discovery.test.ts`.

**Interfaces:**
- Consumes: existing `parseFields`-style helpers + `getJson` in this file; `smQuery` (`@/lib/supermetrics/client`), `SmQueryError` (`@/lib/supermetrics/types`, already imported).
- Produces: `parseDimensions(json): MetricOption[]`; `smDimensions(apiKey, dsId, fetchImpl?): Promise<MetricOption[]>`; `smDimensionValues(apiKey, dsId, account, column, range, opts?): Promise<string[]>`.

- [ ] **Step 1: Add the failing test** — append to `lib/supermetrics/discovery.test.ts` before its final `console.log('ok')` (add any imports to the top import group):

```ts
// --- dimensions + dimension values ---
import { parseDimensions, smDimensions, smDimensionValues } from './discovery'

// parseDimensions keeps only ds_dimension
{
  const dims = parseDimensions({ data: [
    { '@type': 'ds_metric', field_id: 'total_sales', field_name: 'Total sales' },
    { '@type': 'ds_dimension', field_id: 'order_shipping_country', field_name: 'Shipping country', group_name: 'GEO' },
  ] })
  assert.deepEqual(dims.map((d) => d.value), ['order_shipping_country'])
  assert.equal(dims[0].label, 'Shipping country')
}

const okFetch = (body: unknown): typeof fetch =>
  (async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body }) as unknown as Response) as unknown as typeof fetch

async function dimMain() {
  // smDimensions via /query/fields
  const dims = await smDimensions('k', 'SHP', okFetch({ data: [
    { '@type': 'ds_dimension', field_id: 'order_shipping_country', field_name: 'Shipping country' },
    { '@type': 'ds_metric', field_id: 'total_sales', field_name: 'Total sales' },
  ] }))
  assert.deepEqual(dims.map((d) => d.value), ['order_shipping_country'])

  // smDimensionValues: SM sync response shape (header row + value rows); dedupe non-empty first column
  const vals = await smDimensionValues('k', 'SHP', 'acct1', 'order_shipping_country',
    { startDate: '2026-05-01', endDate: '2026-06-23' },
    { fetchImpl: okFetch({ meta: { status_code: 'SUCCESS' }, data: [['Shipping country'], ['United States'], ['Canada'], [''], ['United States']] }) })
  assert.deepEqual(vals, ['United States', 'Canada'])

  // unsafe column rejected
  await assert.rejects(smDimensionValues('k', 'SHP', 'a', 'bad col', { startDate: 'x', endDate: 'y' }, { fetchImpl: okFetch({}) }))
}
dimMain()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/supermetrics/discovery.test.ts`
Expected: FAIL (`parseDimensions`/`smDimensions`/`smDimensionValues` not exported)

- [ ] **Step 3: Implement** — in `lib/supermetrics/discovery.ts`, add the `smQuery` import (next to the existing `SmQueryError` import) and append the new functions:

```ts
import { smQuery } from './client'

const COLUMN_RE = /^[A-Za-z0-9_]+$/

/** Keep only dimensions (drop metrics); map to {value,label,group}. */
export function parseDimensions(json: unknown): MetricOption[] {
  const data = (json as { data?: FieldRow[] }).data ?? []
  return data
    .filter((f): f is FieldRow & { field_id: string } => f['@type'] === 'ds_dimension' && typeof f.field_id === 'string')
    .map((f) => ({ value: f.field_id, label: f.field_name || f.field_id, group: f.group_name || undefined }))
}

export async function smDimensions(apiKey: string, dsId: string, fetchImpl: typeof fetch = fetch): Promise<MetricOption[]> {
  return parseDimensions(await getJson('query/fields', dsId, apiKey, fetchImpl))
}

/** Distinct values of a dimension for one account, via a `fields=[column]` query. */
export async function smDimensionValues(
  apiKey: string,
  dsId: string,
  account: string,
  column: string,
  range: { startDate: string; endDate: string },
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<string[]> {
  if (!COLUMN_RE.test(column)) throw new SmQueryError(`unsafe column: ${column}`)
  const result = await smQuery(
    { apiKey, dsId, dsAccounts: account, fields: [column], dateRange: `${range.startDate},${range.endDate}`, maxRows: 100 },
    opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {},
  )
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of result.rows) {
    const v = row[0]
    if (typeof v === 'string' && v !== '' && !seen.has(v)) { seen.add(v); out.push(v) }
  }
  return out
}
```

(`getJson`, `FieldRow`, `MetricOption`, `SmQueryError` already exist in this file. `smQuery` lives in `./client` and does not import discovery, so no cycle.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/supermetrics/discovery.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/supermetrics/discovery.ts lib/supermetrics/discovery.test.ts
git commit -m "feat(supermetrics): dimension + dimension-value discovery" -- lib/supermetrics/discovery.ts lib/supermetrics/discovery.test.ts
```

---

## Task 2: Structured SM filters in the data layer (types + persistence + adapter)

**Files:** Modify `lib/dashboard/types.ts`, `lib/dashboard/persistence.ts`, `lib/dashboard/persistence.test.ts`, `lib/dashboard/adapters/supermetrics.ts`, `lib/dashboard/adapters/supermetrics.test.ts`.

**Interfaces:**
- Produces: `SupermetricsBinding.filters?: { column: string; value: string }[]`; `buildSmFilter(filters?): string | undefined` (exported from the adapter); persistence validates the structured filters.

**Note:** these three files change together so `tsc` stays green (the type change breaks the adapter + persistence otherwise).

- [ ] **Step 1: Add the failing tests**

  (a) Append to `lib/dashboard/adapters/supermetrics.test.ts` before its final `console.log('ok')` (add the import to the top group):

```ts
import { buildSmFilter } from './supermetrics'
assert.equal(buildSmFilter(undefined), undefined)
assert.equal(buildSmFilter([]), undefined)
assert.equal(buildSmFilter([{ column: 'order_shipping_country', value: 'United States' }]), 'order_shipping_country == United States')
assert.equal(
  buildSmFilter([{ column: 'order_shipping_country', value: 'United States' }, { column: 'channel', value: 'google-ads' }]),
  'order_shipping_country == United States AND channel == google-ads',
)
// unsafe column or empty value dropped
assert.equal(buildSmFilter([{ column: 'bad col', value: 'x' }]), undefined)
assert.equal(buildSmFilter([{ column: 'a', value: '' }]), undefined)
```

  (b) Append to `lib/dashboard/persistence.test.ts` before its final `console.log('ok')`:

```ts
// supermetrics binding round-trips structured filters
{
  const r = parseBlockConfig({ id: 'b1', name: 'X', format: 'currency', range: null,
    binding: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ column: 'order_shipping_country', value: 'United States' }] } })
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'supermetrics') {
    assert.deepEqual(r.block.binding.filters, [{ column: 'order_shipping_country', value: 'United States' }])
  }
}
// malformed SM filter rejected
{
  const r = parseBlockConfig({ id: 'b1', name: 'X', format: 'currency', range: null,
    binding: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ column: 'x' }] } })
  assert.equal(r.ok, false)
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx lib/dashboard/adapters/supermetrics.test.ts` (FAIL: `buildSmFilter` not exported)
Run: `npx tsx lib/dashboard/persistence.test.ts` (FAIL: filters parsed as string / not validated)

- [ ] **Step 3a: Widen the type** — in `lib/dashboard/types.ts`, change the `filters` line of `SupermetricsBinding`:

```ts
  filters?: { column: string; value: string }[] // dimension equality filters (col == value, AND-combined)
```

- [ ] **Step 3b: Validate in persistence** — in `lib/dashboard/persistence.ts`, in the `parseLeaf` supermetrics branch, replace the two `v.filters` lines (the `if (v.filters !== undefined && !isStr(v.filters))` check and `if (v.filters !== undefined) b.filters = v.filters`) with:

```ts
    if (v.filters !== undefined) {
      if (!Array.isArray(v.filters)) return { ok: false, error: `${path}.filters: expected array` }
      const filters: { column: string; value: string }[] = []
      for (const f of v.filters) {
        if (!isObj(f) || !isNonEmptyStr(f.column) || !isStr(f.value)) {
          return { ok: false, error: `${path}.filters: expected {column,value}[]` }
        }
        filters.push({ column: f.column, value: f.value })
      }
      b.filters = filters
    }
```

- [ ] **Step 3c: Build the filter string in the adapter** — in `lib/dashboard/adapters/supermetrics.ts`, add `buildSmFilter` and use it in `sumForRange`:

```ts
const SM_COLUMN_RE = /^[A-Za-z0-9_]+$/

/** Build the Supermetrics `filter` string from structured filters: `col == value`
 *  joined by ` AND ` (values unquoted, per the confirmed grammar). Rows with an
 *  unsafe column or empty value are dropped. Returns undefined when nothing remains. */
export function buildSmFilter(filters?: { column: string; value: string }[]): string | undefined {
  if (!filters || filters.length === 0) return undefined
  const parts = filters
    .filter((f) => SM_COLUMN_RE.test(f.column) && f.value !== '')
    .map((f) => `${f.column} == ${f.value}`)
  return parts.length ? parts.join(' AND ') : undefined
}
```

  Then change the `filters` line inside `sumForRange`'s `smQuery({ … })` call from `filters: b.filters,` to:

```ts
    filters: buildSmFilter(b.filters),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx lib/dashboard/adapters/supermetrics.test.ts` → `ok`
Run: `npx tsx lib/dashboard/persistence.test.ts` → `ok`
Run: `npx tsc --noEmit 2>&1 | grep -E "adapters/supermetrics|dashboard/types|persistence" || echo "types ok"` → `types ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/types.ts lib/dashboard/persistence.ts lib/dashboard/persistence.test.ts lib/dashboard/adapters/supermetrics.ts lib/dashboard/adapters/supermetrics.test.ts
git commit -m "feat(dashboard): structured Supermetrics filters (type + persistence + adapter)" -- lib/dashboard/types.ts lib/dashboard/persistence.ts lib/dashboard/persistence.test.ts lib/dashboard/adapters/supermetrics.ts lib/dashboard/adapters/supermetrics.test.ts
```

---

## Task 3: SM dimension discovery actions (`app/actions/dashboard.ts`)

**Files:** Modify `app/actions/dashboard.ts`.

**Interfaces:**
- Consumes: `smDimensions`, `smDimensionValues` (T1, `@/lib/supermetrics/discovery`); existing `auth`, `canEditDashboard`, `resolveKeyForSlug`, `unstable_cache`, `keyHash`, `parseDateRange`, `type MetricOption` (already imported in this file).
- Produces: `getSmDimensions(slug, dsId)`; `getSmDimensionValues(slug, dsId, account, column)`.

**Note:** thin auth + cache + discovery dispatch; tsc-gated (parsing covered by T1). `'use server'` → only async-function exports.

- [ ] **Step 1: Add the import** — extend the existing discovery import in `app/actions/dashboard.ts`:

```ts
import { smFields, smAccounts, smDimensions, smDimensionValues, type MetricOption, type AccountOption } from '@/lib/supermetrics/discovery'
```

- [ ] **Step 2: Add the actions** — append to `app/actions/dashboard.ts`:

```ts
/** Live Supermetrics dimension options for a data source. Same edit gate as save; cached per (dsId, key). */
export async function getSmDimensions(
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
      () => smDimensions(apiKey, dsId),
      ['sm-dimensions', dsId, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, options }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'discovery failed' }
  }
}

/** Live distinct values for a Supermetrics dimension (per data source + account). */
export async function getSmDimensionValues(
  slug: string,
  dsId: string,
  account: string,
  column: string,
): Promise<{ ok: true; values: string[] } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const apiKey = await resolveKeyForSlug(slug)
  if (!apiKey) return { ok: false, error: 'disconnected' }
  const { startDate, endDate } = parseDateRange('last_30_days')
  try {
    const values = await unstable_cache(
      () => smDimensionValues(apiKey, dsId, account, column, { startDate, endDate }),
      ['sm-dim-values', dsId, account, column, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, values }
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
git commit -m "feat(dashboard): getSmDimensions/getSmDimensionValues actions" -- app/actions/dashboard.ts
```

---

## Task 4: Draft carries SM filters (`components/dashboard/add-block/build-config.ts`)

**Files:** Modify `components/dashboard/add-block/build-config.ts`, `components/dashboard/add-block/build-config.test.ts`.

**Interfaces:**
- Consumes: `SupermetricsBinding.filters` (T2, via `LeafBinding`).
- Produces: `LeafDraft` supermetrics variant gains optional `filters?: { column: string; value: string }[]`; `leafToBinding` (supermetrics) carries cleaned filters.

- [ ] **Step 1: Add the failing test** — append to `components/dashboard/add-block/build-config.test.ts` before its final `console.log('ok')`:

```ts
// supermetrics carries cleaned filters
{
  const b = leafToBinding({ source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ column: 'order_shipping_country', value: 'United States' }] })
  if (b.source === 'supermetrics') assert.deepEqual(b.filters, [{ column: 'order_shipping_country', value: 'United States' }])
}
// empty/incomplete SM filter rows dropped (no filters key)
{
  const b = leafToBinding({ source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ column: '', value: '' }, { column: 'order_shipping_country', value: '' }] })
  if (b.source === 'supermetrics') assert.equal(b.filters, undefined)
}
// no SM filters provided -> no filters key
{
  const b = leafToBinding({ source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1' })
  if (b.source === 'supermetrics') assert.equal(b.filters, undefined)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: FAIL (`filters` not on the SM draft type / not carried)

- [ ] **Step 3: Implement** — in `components/dashboard/add-block/build-config.ts`:
  1. Change the supermetrics variant of `LeafDraft`:
     ```ts
       | { source: 'supermetrics'; dsId: string; metricField: string; account: string; filters?: { column: string; value: string }[] }
     ```
  2. Replace the supermetrics branch of `leafToBinding`:
     ```ts
       if (d.source === 'supermetrics') {
         const filters = (d.filters ?? []).filter((f) => f.column !== '' && f.value !== '')
         return { source: 'supermetrics', dsId: d.dsId, metricField: d.metricField, account: d.account, ...(filters.length ? { filters } : {}) }
       }
     ```

  (`isLeafComplete` is unchanged — supermetrics completeness still requires dsId + metricField + account; filters optional.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts
git commit -m "feat(dashboard): manual draft carries Supermetrics filters" -- components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts
```

---

## Task 5: Supermetrics filter rows UI (`components/dashboard/add-block/leaf-builder.tsx`)

**Files:** Modify `components/dashboard/add-block/leaf-builder.tsx`.

**Interfaces:**
- Consumes: `getSmDimensions`, `getSmDimensionValues` (T3, `@/app/actions/dashboard`); `LeafDraft` with SM `filters?` (T4); `SearchCombobox`, `ComboOption`; existing `Field`, `ctrl`.
- Produces: the Supermetrics branch of `LeafBuilder` renders dimension filter rows; emits `LeafDraft` with `filters`.

**Note:** UI — verified by `tsc` + the full pure-test suite + manual. All hooks unconditional. The Supermetrics value loader is `dsId`+`account`-scoped, so it uses a dedicated `SmFilterRow`.

- [ ] **Step 1: Add the actions import** — extend the actions import in `leaf-builder.tsx`:

```ts
import { getTwFields, getTwDimensionValues, getMetricOptions, getAccountOptions, getSmDimensions, getSmDimensionValues } from '@/app/actions/dashboard'
```

- [ ] **Step 2: Load dimensions in the Supermetrics effect** — in `LeafBuilder`, add a dimension-options state and load it alongside metrics/accounts. Add near the other SM state:

```ts
  const [dimOpts, setDimOpts] = useState<ComboOption[]>([])
```

  Inside the existing `useEffect` (the supermetrics loader), in the success path after setting metric/account options, also load dimensions; and clear it in the reset path. Replace the effect body with:

```ts
  useEffect(() => {
    if (source !== 'supermetrics' || dsId === '') {
      setMetricOpts([]); setAcctOpts([]); setDataTypeByMetric({}); setDimOpts([]); setErr(null)
      return
    }
    setErr(null)
    startLoad(async () => {
      const [m, a, dm] = await Promise.all([getMetricOptions(slug, dsId), getAccountOptions(slug, dsId), getSmDimensions(slug, dsId)])
      if (m.ok) {
        setMetricOpts(m.options.map((o) => ({ value: o.value, label: o.label, group: o.group })))
        setDataTypeByMetric(Object.fromEntries(m.options.map((o) => [o.value, o.dataType])))
      } else {
        setErr(m.error); setMetricOpts([]); setDataTypeByMetric({})
      }
      setAcctOpts(a.ok ? a.options.map((o) => ({ value: o.value, label: o.label, disabled: o.disabled })) : [])
      setDimOpts(dm.ok ? dm.options.map((o) => ({ value: o.value, label: o.label, group: o.group })) : [])
    })
  }, [source, dsId, slug])
```

- [ ] **Step 3: Render filter rows in the Supermetrics branch** — in the non-error (`!err`) Supermetrics render, after the Account `Field`, add the filter rows + add button. Insert this immediately after the closing of the Account `<Field>` (inside the `<>…</>` of the `!err` branch):

```tsx
          {v.dsId !== '' && (
            <>
              {(v.filters ?? []).map((f, i) => (
                <SmFilterRow
                  key={i}
                  filter={f}
                  dimensions={dimOpts}
                  slug={slug}
                  dsId={v.dsId}
                  account={v.account}
                  onChange={(nf) => set({ filters: (v.filters ?? []).map((x, j) => (j === i ? nf : x)) })}
                  onRemove={() => set({ filters: (v.filters ?? []).filter((_, j) => j !== i) })}
                />
              ))}
              <button
                type="button"
                onClick={() => set({ filters: [...(v.filters ?? []), { column: '', value: '' }] })}
                className="self-start rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
              >
                + Add filter
              </button>
            </>
          )}
```

  (The `set` helper already spreads into the supermetrics draft; since `LeafDraft` now includes `filters?`, `set({ filters })` type-checks. Add `filters: v.filters` is carried automatically because `set` spreads `v`'s fields then the patch — confirm `set` includes `filters`: update `set` to preserve filters:)

```ts
  const set = (patch: Partial<Extract<LeafDraft, { source: 'supermetrics' }>>) =>
    onChange({ source: 'supermetrics', dsId: v.dsId, metricField: v.metricField, account: v.account, ...(v.filters ? { filters: v.filters } : {}), ...patch })
```

- [ ] **Step 4: Add the `SmFilterRow` component** — append to `leaf-builder.tsx`:

```tsx
function SmFilterRow({
  filter,
  dimensions,
  slug,
  dsId,
  account,
  onChange,
  onRemove,
}: {
  filter: { column: string; value: string }
  dimensions: ComboOption[]
  slug: string
  dsId: string
  account: string
  onChange: (f: { column: string; value: string }) => void
  onRemove: () => void
}) {
  const [values, setValues] = useState<ComboOption[]>([])
  const [loading, startLoad] = useTransition()

  useEffect(() => {
    if (filter.column === '' || account === '') { setValues([]); return }
    startLoad(async () => {
      const r = await getSmDimensionValues(slug, dsId, account, filter.column)
      setValues(r.ok ? r.values.map((v) => ({ value: v, label: v })) : [])
    })
  }, [filter.column, slug, dsId, account])

  return (
    <div className="flex items-center gap-2">
      <SearchCombobox
        value={filter.column}
        options={dimensions}
        placeholder="Dimension"
        onChange={(column) => onChange({ column, value: '' })}
      />
      <SearchCombobox
        value={filter.value}
        options={values}
        disabled={filter.column === '' || account === ''}
        loading={loading}
        placeholder="Value"
        onChange={(v) => onChange({ column: filter.column, value: v })}
      />
      <button type="button" onClick={onRemove} className="text-text-muted hover:text-white" aria-label="Remove filter">✕</button>
    </div>
  )
}
```

- [ ] **Step 5: Type-check + full pure-test suite**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "components/dashboard/add-block|lib/supermetrics|app/actions/dashboard|lib/dashboard" || echo "no new type errors"
npx tsx lib/supermetrics/discovery.test.ts
npx tsx lib/dashboard/adapters/supermetrics.test.ts
npx tsx lib/dashboard/persistence.test.ts
npx tsx components/dashboard/add-block/build-config.test.ts
```
Expected: `no new type errors`, and all four tests print `ok`.

- [ ] **Step 6: Production build**

Run: `npm run build 2>&1 | tail -5`
Expected: build completes; the `configurable-dashboard` route compiles.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/add-block/leaf-builder.tsx
git commit -m "feat(dashboard): Supermetrics dimension filter rows in the builder" -- components/dashboard/add-block/leaf-builder.tsx
```

---

## Self-Review

**Spec coverage** (against `2026-06-23-supermetrics-dimension-filters-design.md`):
- Dimension discovery (`parseDimensions`, `smDimensions`) → T1. ✅
- Dimension value discovery (`smDimensionValues`, dimension-as-field, dedupe/non-empty, column sanitized) → T1. ✅
- Structured binding `filters?: {column,value}[]` + persistence validation → T2. ✅
- Adapter `buildSmFilter` (`col == value` unquoted, ` AND ` join, unsafe/empty dropped) + `sumForRange` uses it; `smQuery` unchanged → T2. ✅
- Auth-gated, cached actions `getSmDimensions` / `getSmDimensionValues` → T3. ✅
- Draft carries cleaned filters → T4. ✅
- SM leaf filter-row UI (dimension + lazy account-scoped value, add/remove) → T5. ✅
- Equality/AND only; values unquoted (confirmed) → T2 (`buildSmFilter`). ✅
- Out of scope (IN-list/OR, Shopify report types, calculated metrics) → none included. ✅

**Placeholder scan:** none — the value-quoting open item from the spec was resolved (unquoted) and baked into `buildSmFilter`. ✅

**Type consistency:** `MetricOption` (existing) reused for dimensions by T1/T3; `SupermetricsBinding.filters?: {column,value}[]` (T2) consumed by the adapter (T2), persistence (T2), `leafToBinding` (T4); `getSmDimensions` returns `{ok,options:MetricOption[]}` and `getSmDimensionValues` returns `{ok,values:string[]}` (T3), destructured as such in T5; `LeafDraft` SM `filters?` (T4) consumed by T5; `SmFilterRow` value loader uses `dsId`+`account` (T5) matching `getSmDimensionValues`'s signature (T3). ✅

**Out-of-band:** path-scope every commit; leave unrelated working-tree edits unstaged.
```
