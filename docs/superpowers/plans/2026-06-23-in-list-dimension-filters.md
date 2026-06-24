# Multi-Value (IN/OR) Dimension Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one dimension filter match several values (`channel ∈ {google-ads, facebook-ads, applovin, snapchat-ads}`) so the Kind Patches "Platform Spend" block is buildable.

**Architecture:** Change the filter model from `{ column, value: string }` to `{ column, values: string[] }`. Semantics: **OR within a row, AND across rows.** SM expands to OR-of-equalities; TripleWhale to `=`/`IN`. Two tasks: (1) backend model + persistence + adapters + draft→binding bridge (UI untouched, tree stays green, single-value works end-to-end); (2) multi-select UI.

**Tech Stack:** TypeScript (strict), Next.js 15 App Router, React client components, `tsx` + `node:assert` unit tests.

## Global Constraints

- TypeScript strict; no `any` in new/changed code.
- All SM/TW calls stay server-side; UI is client-only.
- Filter safety unchanged: SM column matches `SM_COLUMN_RE` (`/^[A-Za-z0-9_]+$/`); TW column via `isSafeColumn` (`/^[a-z0-9_]+$/`) with `escapeSqlValue` on every value.
- **Backward compatible:** legacy persisted `{ column, value }` filters still load (normalized to `{ column, values: [value] }`). No data migration.
- SM values are unquoted in the filter string; reuse the verified `==`/`OR`/parens grammar (no native `[]`).
- No new npm dependency.
- Semantics everywhere: drop empty-string values; drop a row with no column or no non-empty value.

---

### Task 1: Backend filter model — types, adapters, persistence, draft→binding bridge

Flips the shared filter type and every backend consumer. `LeafDraft` and `leaf-builder.tsx` are intentionally left on `{ column, value }`; `leafToBinding` converts single value → `[value]`, so the whole tree compiles and single-value filters work end-to-end. Multi-value is fully supported at the persistence/adapter layer after this task (a hand-written config with `values: [a, b]` resolves correctly).

**Files:**
- Modify: `lib/dashboard/types.ts:9` and `:16`
- Modify: `lib/dashboard/adapters/supermetrics.ts:11-17` (`buildSmFilter`)
- Test: `lib/dashboard/adapters/supermetrics.test.ts`
- Modify: `lib/triplewhale/queries.ts:35` (`TwFilter`) and `:50-69` (`buildMetricSql`)
- Test: `lib/triplewhale/queries.test.ts`
- Modify: `lib/dashboard/persistence.ts` (`parseLeaf` filter blocks, ~`:33-44` and `:51-62`)
- Test: `lib/dashboard/persistence.test.ts`
- Modify: `components/dashboard/add-block/build-config.ts:21-22` (LeafDraft type stays, see note) and `:29-35` (`leafToBinding`)
- Test: `components/dashboard/add-block/build-config.test.ts`

**Interfaces:**
- Produces: `SupermetricsBinding.filters?: { column: string; values: string[] }[]`, `TripleWhaleBinding.filters?: { column: string; values: string[] }[]` (consumed by Task 2 and by resolve-time adapters).
- Produces: `buildSmFilter(filters?: { column: string; values: string[] }[]): string | undefined`.
- Produces: `TwFilter = { column: string; values: string[] }`; `buildMetricSql(metric: string, filters?: TwFilter[]): string`.
- Produces: `leafToBinding(d: LeafDraft): LeafBinding` — converts draft `{ column, value }` filter rows to binding `{ column, values: [value] }`, dropping rows with empty column/value.
- Consumes: nothing new.

- [ ] **Step 1: Update the filter type in `types.ts`**

In `lib/dashboard/types.ts`, change both filter lines:

```ts
  filters?: { column: string; values: string[] }[] // OR within a row (any value), AND across rows
```

Line 9 (inside `SupermetricsBinding`) and line 16 (inside `TripleWhaleBinding`) — identical replacement.

- [ ] **Step 2: Update `buildSmFilter` tests (write failing)**

In `lib/dashboard/adapters/supermetrics.test.ts`, replace the `buildSmFilter` block (the lines using the old `{column,value}` shape) with:

```ts
// buildSmFilter: OR within a row, AND across rows; unsafe/empty dropped
assert.equal(buildSmFilter(undefined), undefined)
assert.equal(buildSmFilter([]), undefined)
assert.equal(buildSmFilter([{ column: 'order_shipping_country', values: ['United States'] }]), 'order_shipping_country == United States')
assert.equal(
  buildSmFilter([{ column: 'channel', values: ['google-ads', 'facebook-ads'] }]),
  '(channel == google-ads OR channel == facebook-ads)',
)
assert.equal(
  buildSmFilter([
    { column: 'channel', values: ['google-ads', 'facebook-ads'] },
    { column: 'order_shipping_country', values: ['United States'] },
  ]),
  '(channel == google-ads OR channel == facebook-ads) AND order_shipping_country == United States',
)
// unsafe column or all-empty values dropped
assert.equal(buildSmFilter([{ column: 'bad col', values: ['x'] }]), undefined)
assert.equal(buildSmFilter([{ column: 'a', values: [''] }]), undefined)
assert.equal(buildSmFilter([{ column: 'a', values: ['', 'x'] }]), 'a == x')
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx tsx lib/dashboard/adapters/supermetrics.test.ts`
Expected: FAIL (type error / wrong output — `buildSmFilter` still expects `value`).

- [ ] **Step 4: Implement `buildSmFilter`**

In `lib/dashboard/adapters/supermetrics.ts`, replace `buildSmFilter` (keep the `SM_COLUMN_RE` const above it):

```ts
/** Build the Supermetrics `filter` string from structured filters. Each row is
 *  one column matching ANY of its values (OR); rows are AND-combined. Values are
 *  unquoted (confirmed grammar). Unsafe columns and empty values are dropped. */
export function buildSmFilter(filters?: { column: string; values: string[] }[]): string | undefined {
  if (!filters || filters.length === 0) return undefined
  const parts: string[] = []
  for (const f of filters) {
    if (!SM_COLUMN_RE.test(f.column)) continue
    const vals = f.values.filter((v) => v !== '')
    if (vals.length === 0) continue
    parts.push(
      vals.length === 1
        ? `${f.column} == ${vals[0]}`
        : `(${vals.map((v) => `${f.column} == ${v}`).join(' OR ')})`,
    )
  }
  return parts.length ? parts.join(' AND ') : undefined
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx lib/dashboard/adapters/supermetrics.test.ts`
Expected: `ok`.

- [ ] **Step 6: Update `buildMetricSql` tests (write failing)**

In `lib/triplewhale/queries.test.ts`, replace the filter test block (around lines 23-37, the `build2`/filters/`O'Brien`/unsafe section) with:

```ts
// New tests: generic metric + filters
import { isSafeColumn, escapeSqlValue, buildMetricSql as build2 } from './queries'
assert.equal(isSafeColumn('channel'), true)
assert.equal(isSafeColumn('Bad Col'), false)
assert.equal(escapeSqlValue("O'Brien"), "O''Brien")

// single value -> `= '...'` with '-escaping
{
  const sql = build2('ad_spend', [{ column: 'channel', values: ["O'Brien"] }])
  assert.ok(sql.includes("AND channel = 'O''Brien'"))
}
// multiple values -> IN list
{
  const sql = build2('ad_spend', [{ column: 'channel', values: ['google-ads', 'facebook-ads'] }])
  assert.ok(sql.includes("AND channel IN ('google-ads', 'facebook-ads')"))
}
// empty values -> row contributes nothing
{
  const sql = build2('ad_spend', [{ column: 'channel', values: [''] }])
  assert.ok(!sql.includes('AND channel'))
}
// unsafe metric / filter column throw
assert.throws(() => build2('bad col'))
assert.throws(() => build2('ad_spend', [{ column: 'bad col', values: ['x'] }]))
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx tsx lib/triplewhale/queries.test.ts`
Expected: FAIL (type error — `TwFilter` still has `value`).

- [ ] **Step 8: Implement `TwFilter` + `buildMetricSql`**

In `lib/triplewhale/queries.ts`, change the interface (line 35):

```ts
export interface TwFilter { column: string; values: string[] }
```

And replace the `filterSql` builder inside `buildMetricSql` (lines 53-58):

```ts
  const filterSql = filters
    .map((f) => {
      if (!isSafeColumn(f.column)) throw new TwQueryError(`unsafe TripleWhale filter column: ${f.column}`)
      const vals = f.values.filter((v) => v !== '')
      if (vals.length === 0) return ''
      if (vals.length === 1) return `\n  AND ${f.column} = '${escapeSqlValue(vals[0])}'`
      return `\n  AND ${f.column} IN (${vals.map((v) => `'${escapeSqlValue(v)}'`).join(', ')})`
    })
    .join('')
```

(The column-safety check stays first, so an unsafe column still throws regardless of values — preserving current behavior.)

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx tsx lib/triplewhale/queries.test.ts`
Expected: `ok`.

- [ ] **Step 10: Update persistence tests (write failing)**

In `lib/dashboard/persistence.test.ts`:

Change the triplewhale round-trip expected output (line ~62) and add legacy + multi cases. Replace the existing TW filter test (lines ~54-62) and SM filter test (lines ~74-80) expected values from `value` to `values`, keeping legacy inputs to prove normalization, and add new-shape + multi tests. Concretely, ensure these assertions exist:

```ts
// triplewhale: legacy {column,value} normalizes to {column, values:[value]}
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'triplewhale', metric: 'spend', filters: [{ column: 'channel', value: 'facebook-ads' }] } })
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.block.binding.filters, [{ column: 'channel', values: ['facebook-ads'] }])
}
// triplewhale: new {column, values} (incl. multi) round-trips
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'triplewhale', metric: 'spend', filters: [{ column: 'channel', values: ['google-ads', 'facebook-ads'] }] } })
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.block.binding.filters, [{ column: 'channel', values: ['google-ads', 'facebook-ads'] }])
}
// supermetrics: legacy value normalizes
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ column: 'order_shipping_country', value: 'United States' }] } })
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.block.binding.filters, [{ column: 'order_shipping_country', values: ['United States'] }])
}
// malformed filter rejected (no column)
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ values: ['x'] }] } })
  assert.equal(r.ok, false)
}
```

Remove/replace the prior assertions that expected `[{ column, value }]` outputs (lines 62, 80) so they expect `values`.

- [ ] **Step 11: Run the test to verify it fails**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: FAIL (parser still emits `{column,value}`).

- [ ] **Step 12: Implement the persistence parser**

In `lib/dashboard/persistence.ts`, add a shared helper near the other parsers (after `parseRange`):

```ts
function parseFilters(v: unknown, path: string): Parsed<{ column: string; values: string[] }[]> {
  if (!Array.isArray(v)) return { ok: false, error: `${path}: expected array` }
  const out: { column: string; values: string[] }[] = []
  for (const f of v) {
    if (!isObj(f) || !isNonEmptyStr(f.column)) return { ok: false, error: `${path}: expected {column, values}[]` }
    if (Array.isArray(f.values) && f.values.every(isStr)) {
      out.push({ column: f.column, values: f.values as string[] })
    } else if (isStr(f.value)) {
      out.push({ column: f.column, values: [f.value] }) // legacy {column,value}
    } else {
      return { ok: false, error: `${path}: expected {column, values}[]` }
    }
  }
  return { ok: true, value: out }
}
```

Then in `parseLeaf`, replace BOTH inline filter blocks (the `supermetrics` branch ~lines 33-44 and the `triplewhale` branch ~lines 51-62) with:

```ts
    if (v.filters !== undefined) {
      const pf = parseFilters(v.filters, `${path}.filters`)
      if (!pf.ok) return pf
      b.filters = pf.value
    }
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: `ok`.

- [ ] **Step 14: Update build-config tests (write failing)**

In `components/dashboard/add-block/build-config.test.ts`, update the `leafToBinding` filter assertions (lines ~57-58 and ~83-84) so the OUTPUT binding uses `values` (the draft INPUT stays `{ column, value }` in this task):

```ts
// triplewhale carries non-empty filters as values arrays
{
  const b = leafToBinding({ source: 'triplewhale', metric: 'spend', filters: [{ column: 'channel', value: 'facebook-ads' }] })
  if (b.source === 'triplewhale') assert.deepEqual(b.filters, [{ column: 'channel', values: ['facebook-ads'] }])
}
// supermetrics carries cleaned filters as values arrays
{
  const b = leafToBinding({ source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ column: 'order_shipping_country', value: 'United States' }] })
  if (b.source === 'supermetrics') assert.deepEqual(b.filters, [{ column: 'order_shipping_country', values: ['United States'] }])
}
```

Leave the "empty rows dropped → undefined" and "no filters → undefined" assertions as-is (they still hold).

- [ ] **Step 15: Run the test to verify it fails**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: FAIL (`leafToBinding` still emits `{column,value}`).

- [ ] **Step 16: Implement `leafToBinding` conversion**

In `components/dashboard/add-block/build-config.ts`, keep `LeafDraft` filter fields as `{ column: string; value: string }[]` (UNCHANGED in this task — leaf-builder still depends on it). Replace the two filter-cleaning lines in `leafToBinding` (lines 31 and 34) so each produces `values`:

```ts
  if (d.source === 'supermetrics') {
    const filters = (d.filters ?? [])
      .filter((f) => f.column !== '' && f.value !== '')
      .map((f) => ({ column: f.column, values: [f.value] }))
    return { source: 'supermetrics', dsId: d.dsId, metricField: d.metricField, account: d.account, ...(filters.length ? { filters } : {}) }
  }
  const filters = (d.filters ?? [])
    .filter((f) => f.column !== '' && f.value !== '')
    .map((f) => ({ column: f.column, values: [f.value] }))
  return { source: 'triplewhale', metric: d.metric, ...(filters.length ? { filters } : {}) }
```

- [ ] **Step 17: Run the test to verify it passes**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: `ok`.

- [ ] **Step 18: Typecheck the whole tree**

Run: `npx tsc --noEmit`
Expected: clean (no output). `leaf-builder.tsx` still compiles because `LeafDraft` is unchanged.

- [ ] **Step 19: Commit**

```bash
git commit -m "feat(dashboard): multi-value filter model (backend + persistence)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- lib/dashboard/types.ts lib/dashboard/adapters/supermetrics.ts lib/dashboard/adapters/supermetrics.test.ts lib/triplewhale/queries.ts lib/triplewhale/queries.test.ts lib/dashboard/persistence.ts lib/dashboard/persistence.test.ts components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts
```

---

### Task 2: Multi-select filter UI

Adds the chips multi-select component and wires `LeafDraft` + the builder to enter multiple values. After this task the full feature works in the UI.

**Files:**
- Create: `components/dashboard/add-block/multi-select-combobox.tsx`
- Test: `components/dashboard/add-block/multi-select-combobox.test.ts`
- Modify: `components/dashboard/add-block/build-config.ts:21-22` (LeafDraft filters → `values: string[]`) and `leafToBinding` (pass values through, clean empties)
- Modify: `components/dashboard/add-block/build-config.test.ts` (draft inputs now use `values`)
- Modify: `components/dashboard/add-block/leaf-builder.tsx` (LeafBuilder SM branch, `TwLeafFields`, `SmFilterRow`, `TwFilterRow`)

**Interfaces:**
- Consumes: `ComboOption` from `./search-combobox`; binding/draft types from Task 1.
- Produces: `MultiSelectCombobox` (client component) and `toggleValue(values, v)` pure helper.
- Produces: `LeafDraft` filter rows as `{ column: string; values: string[] }[]`.

- [ ] **Step 1: Write the `toggleValue` helper test (failing)**

Create `components/dashboard/add-block/multi-select-combobox.test.ts`:

```ts
// Run: npx tsx components/dashboard/add-block/multi-select-combobox.test.ts
import { strict as assert } from 'node:assert'
import { toggleValue } from './multi-select-combobox'

assert.deepEqual(toggleValue([], 'a'), ['a'])              // add to empty
assert.deepEqual(toggleValue(['a'], 'b'), ['a', 'b'])      // add new
assert.deepEqual(toggleValue(['a', 'b'], 'a'), ['b'])      // remove existing
assert.deepEqual(toggleValue(['a'], 'a'), [])              // remove last
console.log('ok')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx components/dashboard/add-block/multi-select-combobox.test.ts`
Expected: FAIL (module/function not found).

- [ ] **Step 3: Implement `MultiSelectCombobox`**

Create `components/dashboard/add-block/multi-select-combobox.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ComboOption } from './search-combobox'

/** Toggle a value in/out of the selected list (pure; order-preserving append). */
export function toggleValue(values: string[], v: string): string[] {
  return values.includes(v) ? values.filter((x) => x !== v) : [...values, v]
}

export function MultiSelectCombobox({
  values,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  loading = false,
  allowCustom = false,
}: {
  values: string[]
  onChange: (values: string[]) => void
  options: ComboOption[]
  placeholder?: string
  disabled?: boolean
  loading?: boolean
  allowCustom?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle === ''
      ? options
      : options.filter((o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle))
  }, [q, options])

  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const trigger =
    'flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white disabled:opacity-40'

  const addCustom = () => {
    const v = q.trim()
    if (v === '' || values.includes(v)) return
    onChange([...values, v])
    setQ('')
  }

  return (
    <div className="flex-1">
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ('') }}>
        <PopoverTrigger asChild>
          <button type="button" className={trigger} disabled={disabled || loading}>
            <span className={cn('truncate', values.length === 0 && 'text-text-muted')}>
              {loading ? 'Loading…' : values.length === 0 ? placeholder : `${values.length} selected`}
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
            onKeyDown={(e) => { if (allowCustom && e.key === 'Enter') { e.preventDefault(); addCustom() } }}
            placeholder={allowCustom ? 'Search or type to add…' : 'Search…'}
            className="w-full border-b border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-text-muted"
          />
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && !allowCustom && <p className="px-3 py-2 text-xs text-text-muted">No matches</p>}
            {allowCustom && q.trim() !== '' && !options.some((o) => o.value === q.trim()) && (
              <button type="button" onClick={addCustom}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-brand-cyan hover:bg-white/[0.06]">
                Add “{q.trim()}”
              </button>
            )}
            {filtered.map((o) => {
              const checked = values.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onChange(toggleValue(values, o.value))}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-white/[0.06]',
                    checked ? 'text-brand-cyan' : 'text-white/90',
                  )}
                >
                  <span className={cn('inline-block h-3 w-3 shrink-0 rounded-sm border', checked ? 'border-brand-cyan bg-brand-cyan' : 'border-white/30')} />
                  <span className="truncate">{o.label}</span>
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
      {values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-white/90">
              {labelFor(v)}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-text-muted hover:text-white" aria-label={`Remove ${v}`}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `npx tsx components/dashboard/add-block/multi-select-combobox.test.ts`
Expected: `ok`.

- [ ] **Step 5: Update `LeafDraft` + `leafToBinding` for `values`**

In `components/dashboard/add-block/build-config.ts`, change the LeafDraft filter fields (lines 21-22):

```ts
  | { source: 'supermetrics'; dsId: string; metricField: string; account: string; filters?: { column: string; values: string[] }[] }
  | { source: 'triplewhale'; metric: string; filters?: { column: string; values: string[] }[] }
```

And change `leafToBinding` to pass values through, cleaning empties (replace the Task 1 single-value mapping):

```ts
  if (d.source === 'supermetrics') {
    const filters = (d.filters ?? [])
      .map((f) => ({ column: f.column, values: f.values.filter((v) => v !== '') }))
      .filter((f) => f.column !== '' && f.values.length > 0)
    return { source: 'supermetrics', dsId: d.dsId, metricField: d.metricField, account: d.account, ...(filters.length ? { filters } : {}) }
  }
  const filters = (d.filters ?? [])
    .map((f) => ({ column: f.column, values: f.values.filter((v) => v !== '') }))
    .filter((f) => f.column !== '' && f.values.length > 0)
  return { source: 'triplewhale', metric: d.metric, ...(filters.length ? { filters } : {}) }
```

- [ ] **Step 6: Update build-config tests for `values` drafts**

In `components/dashboard/add-block/build-config.test.ts`, change the draft INPUTS in the filter tests to use `values`, and the empty-drop tests:

```ts
// triplewhale carries non-empty filters
{
  const b = leafToBinding({ source: 'triplewhale', metric: 'spend', filters: [{ column: 'channel', values: ['facebook-ads', 'google-ads'] }] })
  if (b.source === 'triplewhale') assert.deepEqual(b.filters, [{ column: 'channel', values: ['facebook-ads', 'google-ads'] }])
}
// empty/incomplete rows dropped (no filters key)
{
  const b = leafToBinding({ source: 'triplewhale', metric: 'spend', filters: [{ column: '', values: [] }, { column: 'channel', values: [''] }] })
  if (b.source === 'triplewhale') assert.equal(b.filters, undefined)
}
// supermetrics carries cleaned filters
{
  const b = leafToBinding({ source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ column: 'order_shipping_country', values: ['United States', 'Canada'] }] })
  if (b.source === 'supermetrics') assert.deepEqual(b.filters, [{ column: 'order_shipping_country', values: ['United States', 'Canada'] }])
}
// empty SM rows dropped
{
  const b = leafToBinding({ source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ column: '', values: [] }, { column: 'order_shipping_country', values: [''] }] })
  if (b.source === 'supermetrics') assert.equal(b.filters, undefined)
}
```

- [ ] **Step 7: Run build-config test to verify it passes**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: `ok`.

- [ ] **Step 8: Wire `SmFilterRow` to multi-select**

In `components/dashboard/add-block/leaf-builder.tsx`:

Add the import:
```ts
import { MultiSelectCombobox } from './multi-select-combobox'
```

Change `SmFilterRow`'s prop/handler types (around lines 290-296) from `value: string` to `values: string[]`:
```ts
  filter: { column: string; values: string[] }
  ...
  onChange: (f: { column: string; values: string[] }) => void
```

In `SmFilterRow`'s `read()` / `loadValues()`, keep using `filter.column` (unchanged). Replace the render's value selector (the `cached ? <SearchCombobox…> : <input…>` block, lines ~338-364) with:

```tsx
      {cached ? (
        <MultiSelectCombobox
          values={filter.values}
          options={values}
          disabled={filter.column === '' || account === ''}
          loading={loading}
          placeholder="Values"
          onChange={(vs) => onChange({ column: filter.column, values: vs })}
        />
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          <MultiSelectCombobox
            values={filter.values}
            options={[]}
            allowCustom
            disabled={filter.column === '' || account === ''}
            placeholder="Type values, or load"
            onChange={(vs) => onChange({ column: filter.column, values: vs })}
          />
          <button
            type="button"
            onClick={loadValues}
            disabled={refreshing || filter.column === '' || account === ''}
            className="self-start shrink-0 rounded-md border border-white/10 px-2 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] disabled:opacity-40"
          >
            {refreshing ? 'Loading… (~1–2 min)' : 'Load values'}
          </button>
        </div>
      )}
```

And the dimension picker's `onChange` (line ~336) resets values:
```tsx
        onChange={(column) => onChange({ column, values: [] })}
```

- [ ] **Step 9: Wire `TwFilterRow` to multi-select**

In `TwFilterRow` (lines ~231-274): change prop/handler types to `values: string[]`, and replace the value `SearchCombobox` (lines ~338-346 region for TW, i.e. the second combobox) with:

```tsx
      <MultiSelectCombobox
        values={filter.values}
        options={values}
        disabled={disabled || filter.column === ''}
        loading={loading}
        placeholder="Values"
        onChange={(vs) => onChange({ column: filter.column, values: vs })}
      />
```

And the dimension picker `onChange` → `onChange({ column, values: [] })`.

- [ ] **Step 10: Update filter row creation + types in `LeafBuilder` and `TwLeafFields`**

In `LeafBuilder` SM branch (line ~141): change add-filter to
```tsx
                onClick={() => set({ filters: [...(v.filters ?? []), { column: '', values: [] }] })}
```

In `TwLeafFields` (lines ~163-195): change the `filters` prop type and the `onChange` signature to `{ column: string; values: string[] }[]`, and `addFilter`:
```ts
  filters: { column: string; values: string[] }[]
  onChange: (next: { metric: string; filters: { column: string; values: string[] }[] }) => void
  ...
  const setFilter = (i: number, f: { column: string; values: string[] }) =>
    onChange({ metric, filters: filters.map((x, j) => (j === i ? f : x)) })
  const addFilter = () => onChange({ metric, filters: [...filters, { column: '', values: [] }] })
```

The `TwLeafFields` consumer in the `triplewhale` branch of `LeafBuilder` (lines ~67-77) passes `tw.filters ?? []` and maps `next.filters` — these already flow generically and need no change beyond the types above.

- [ ] **Step 11: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 12: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 13: Commit**

```bash
git commit -m "feat(dashboard): multi-value filter UI (chips multi-select)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- components/dashboard/add-block/multi-select-combobox.tsx components/dashboard/add-block/multi-select-combobox.test.ts components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts components/dashboard/add-block/leaf-builder.tsx
```

---

## Self-Review

- **Spec coverage:** data model (T1 types), SM OR-expansion (T1 buildSmFilter), TW `=`/`IN` (T1 buildMetricSql), persistence + legacy normalize (T1 parseFilters), draft→binding clean (T1+T2 leafToBinding), multi-select UI (T2 component + leaf-builder), out-of-scope NL untouched (verified: NL emits no filters). ✅
- **Placeholder scan:** none — every step has full code and exact commands.
- **Type consistency:** filter shape `{ column, values: string[] }` used uniformly in types, TwFilter, parser, leafToBinding, draft, and component; `buildSmFilter`/`buildMetricSql`/`leafToBinding` signatures match across tasks; `toggleValue`/`MultiSelectCombobox` names consistent between component and test.
- **Compile-green seam:** T1 leaves `LeafDraft`/`leaf-builder` on `{column,value}` with `leafToBinding` converting, so `tsc` passes (Step 18); T2 migrates the draft + UI together.

## Execution Handoff

Plan saved. Recommended: **Subagent-Driven Development** — fresh subagent per task, review between tasks.
