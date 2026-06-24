# Weighted-Sum Calculated Metric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a weighted-sum calculated metric (`Σ coefficientᵢ × leafᵢ`) and let it be an operand of the binary aggregate, so "Final Calculated Site Revenue" and "ROAS = (rev − tax) ÷ spend" are buildable.

**Architecture:** New `CalculatedBinding` resolved by `resolveCalculated` (parallel terms, weighted sum, prev-iff-all, worst-error). `AggregateBinding` operands widen to leaf-or-calculated, resolved via a small `resolveOperand` dispatch. Three tasks: (1) backend model + resolution + persistence (compiles green; resolves/persists calculated via literals); (2) standalone calculated block UI; (3) calculated as an aggregate operand UI.

**Tech Stack:** TypeScript (strict), Next.js 15 App Router, React client components, `tsx` + `node:assert` unit tests.

## Global Constraints

- TypeScript strict; no `any` in new/changed code.
- All SM/TW calls stay server-side; calculated/aggregate resolution runs server-side and calls the existing (cached, parallel) leaf resolvers.
- Calculated primitive: `Σ coefficientᵢ × leafᵢ`, signed coefficients, terms are LeafBindings only (no nested calc/aggregate terms), no standalone constant term.
- Aggregate operands are leaf-or-calculated (one level); operands are never aggregates.
- `prevValue` present iff EVERY term/operand has a `prevValue` (comparison active) — mirrors existing aggregate rule.
- Any term/operand failure → worst error via existing `worseError`. Divide-by-zero → `no-data` (existing `applyOp`).
- Backward compatible: existing leaf and binary-leaf-aggregate configs parse and resolve unchanged. No data migration.
- Manual builder only; the NL path (`aggregate-resolve.ts`, `block-preview-card.tsx`) is untouched.
- No new npm dependency.

---

### Task 1: Backend — model, resolution, persistence

Adds `CalculatedBinding`, widens aggregate operands, implements `resolveCalculated` + `resolveOperand`, routes calculated in `resolveBlock`, and parses calculated (standalone + as operand). UI and `build-config.ts` are untouched and keep compiling (leaf operands remain valid operands). After this task a hand-written calculated config resolves and persists.

**Files:**
- Modify: `lib/dashboard/types.ts:21-29` (AggregateBinding + Binding) — add `CalculatedBinding`, `AggregateOperand`
- Modify: `lib/dashboard/aggregate.ts` (add `resolveCalculated`, `resolveOperand`; use `resolveOperand` in `resolveAggregate`)
- Test: `lib/dashboard/aggregate.test.ts`
- Modify: `lib/dashboard/resolve.ts:35-38` (route `calculated`)
- Test: `lib/dashboard/resolve.test.ts`
- Modify: `lib/dashboard/persistence.ts` (`parseCalculated`, `parseOperand`; `parseBinding` branches)
- Test: `lib/dashboard/persistence.test.ts`

**Interfaces:**
- Produces: `CalculatedBinding = { source: 'calculated'; terms: { coefficient: number; leaf: LeafBinding }[] }`; `AggregateOperand = LeafBinding | CalculatedBinding`; `AggregateBinding.left/right: AggregateOperand`; `Binding = LeafBinding | CalculatedBinding | AggregateBinding`.
- Produces: `resolveCalculated(binding: CalculatedBinding, attemptLeaf: AttemptLeaf, ctx, dateRange, compareRange): Promise<LeafAttempt>`; `resolveOperand(operand: AggregateOperand, attemptLeaf, ctx, dateRange, compareRange): Promise<LeafAttempt>` (both in `aggregate.ts`).
- Consumes: existing `AttemptLeaf`, `worseError`, `applyOp`.

- [ ] **Step 1: Update `types.ts`**

In `lib/dashboard/types.ts`, replace the `AggregateBinding` + `Binding` block (currently lines ~21-29) with:

```ts
export interface CalculatedBinding {
  source: 'calculated'
  terms: { coefficient: number; leaf: LeafBinding }[] // value = Σ coefficientᵢ × leafᵢ
}

/** An operand of a binary aggregate: a single leaf or a weighted-sum calculation. */
export type AggregateOperand = LeafBinding | CalculatedBinding

export interface AggregateBinding {
  source: 'aggregate'
  left: AggregateOperand
  op: '+' | '-' | '*' | '/'
  right: AggregateOperand
}

export type Binding = LeafBinding | CalculatedBinding | AggregateBinding
```

- [ ] **Step 2: Write failing aggregate/calculated tests**

In `lib/dashboard/aggregate.test.ts`, update the import line and add tests before `console.log('ok')`:

Change line 4 import to:
```ts
import { resolveAggregate, resolveCalculated, type AttemptLeaf } from './aggregate'
import type { AggregateBinding, CalculatedBinding, LeafBinding } from './types'
```

Add these test blocks inside `run()` before `console.log('ok')`:
```ts
  // resolveCalculated: signed weighted sum (rev - tax)
  {
    const calc: CalculatedBinding = { source: 'calculated', terms: [
      { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
      { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
    ] }
    const byField: AttemptLeaf = async (b) =>
      b.source === 'supermetrics' && b.metricField === 'total_sales' ? { ok: true, value: 1000, prevValue: 800 }
        : { ok: true, value: 200, prevValue: 150 }
    const r = await resolveCalculated(calc, byField, { slug: 'k' }, 'last_30_days', 'previous_period')
    assert.equal(r.ok && r.value, 800)      // 1000 - 200
    assert.equal(r.ok && r.prevValue, 650)  // 800 - 150
  }

  // resolveCalculated: prev present iff EVERY term has prev
  {
    const calc: CalculatedBinding = { source: 'calculated', terms: [
      { coefficient: 2, leaf: { source: 'triplewhale', metric: 'a' } },
      { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'X', metricField: 'b', account: '1' } },
    ] }
    const r = await resolveCalculated(calc, fake({
      triplewhale: { ok: true, value: 3 },                 // no prev
      supermetrics: { ok: true, value: 4, prevValue: 9 },
    }), { slug: 'k' }, 'last_30_days', 'previous_period')
    assert.equal(r.ok && r.value, 10)        // 2*3 + 4
    assert.equal(r.ok && r.prevValue, undefined)
  }

  // resolveCalculated: one term fails → worst error (disconnected beats no-data)
  {
    const calc: CalculatedBinding = { source: 'calculated', terms: [
      { coefficient: 1, leaf: { source: 'triplewhale', metric: 'a' } },
      { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'X', metricField: 'b', account: '1' } },
    ] }
    const r = await resolveCalculated(calc, fake({
      triplewhale: { ok: false, error: 'no-data' },
      supermetrics: { ok: false, error: 'disconnected' },
    }), { slug: 'k' }, 'last_30_days', null)
    assert.equal(!r.ok && r.error, 'disconnected')
  }

  // calculated as aggregate operand: (rev - tax) / spend = (1000-200)/200 = 4
  {
    const agg: AggregateBinding = { source: 'aggregate', op: '/',
      left: { source: 'calculated', terms: [
        { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
        { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
      ] },
      right: { source: 'triplewhale', metric: 'ad_spend' } }
    const at: AttemptLeaf = async (b) =>
      b.source === 'triplewhale' ? { ok: true, value: 200 }
        : b.metricField === 'total_sales' ? { ok: true, value: 1000 } : { ok: true, value: 200 }
    const r = await resolveAggregate(agg, at, { slug: 'k' }, 'last_30_days', null)
    assert.equal(r.ok && r.value, 4)
  }
```

- [ ] **Step 3: Run to verify failure**

Run: `npx tsx lib/dashboard/aggregate.test.ts`
Expected: FAIL (`resolveCalculated` is not exported).

- [ ] **Step 4: Implement `resolveCalculated` + `resolveOperand`; use in `resolveAggregate`**

In `lib/dashboard/aggregate.ts`, update the import (line 1) to:
```ts
import type { AggregateBinding, AggregateOperand, CalculatedBinding, LeafAttempt, LeafBinding } from './types'
```

Add, after `resolveAggregate` (or before it):
```ts
/** Resolve a leaf-or-calculated operand to one LeafAttempt. */
export function resolveOperand(
  operand: AggregateOperand,
  attemptLeaf: AttemptLeaf,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafAttempt> {
  return operand.source === 'calculated'
    ? resolveCalculated(operand, attemptLeaf, ctx, dateRange, compareRange)
    : attemptLeaf(operand, ctx, dateRange, compareRange)
}

/** Weighted sum Σ coefficientᵢ × leafᵢ. prev present iff every term has prev;
 *  any term failure → worst error. */
export async function resolveCalculated(
  binding: CalculatedBinding,
  attemptLeaf: AttemptLeaf,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafAttempt> {
  const results = await Promise.all(
    binding.terms.map((t) => attemptLeaf(t.leaf, ctx, dateRange, compareRange)),
  )
  const failures = results.filter((r) => !r.ok)
  if (failures.length > 0) {
    const error = failures.map((r) => (r.ok ? 'error' : r.error)).reduce((a, b) => worseError(a, b))
    return { ok: false, error }
  }
  let value = 0
  let prevValue = 0
  let hasAllPrev = true
  results.forEach((r, i) => {
    if (!r.ok) return // unreachable: failures handled above
    value += binding.terms[i].coefficient * r.value
    if (r.prevValue === undefined) hasAllPrev = false
    else prevValue += binding.terms[i].coefficient * r.prevValue
  })
  return { ok: true, value, prevValue: hasAllPrev ? prevValue : undefined }
}
```

And in `resolveAggregate`, replace the two `attemptLeaf(binding.left/right, ...)` calls in the `Promise.all` with `resolveOperand`:
```ts
  const [l, r] = await Promise.all([
    resolveOperand(binding.left, attemptLeaf, ctx, dateRange, compareRange),
    resolveOperand(binding.right, attemptLeaf, ctx, dateRange, compareRange),
  ])
```
(Leave the rest of `resolveAggregate` unchanged.)

- [ ] **Step 5: Run to verify pass**

Run: `npx tsx lib/dashboard/aggregate.test.ts`
Expected: `ok`.

- [ ] **Step 6: Write failing resolve-route test**

In `lib/dashboard/resolve.test.ts`, add inside `run()` before its final `console.log`:
```ts
  // calculated block path: weighted sum routed through resolveBlock (100 - 25 = 75)
  {
    const fn: LeafResolver = async (b) => (b.source === 'triplewhale' ? { value: 100 } : { value: 25 })
    const calc: BlockConfig = { id: 'c', name: 'Net', format: 'number', range: null,
      binding: { source: 'calculated', terms: [
        { coefficient: 1, leaf: { source: 'triplewhale', metric: 'revenue' } },
        { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'X', metricField: 'fee', account: '1' } },
      ] } }
    const r = await resolveBlock(calc, GLOBAL, { slug: 'k' }, { resolveLeaf: fn })
    assert.equal(r.ok && r.value, 75)
  }
```

- [ ] **Step 7: Run to verify failure**

Run: `npx tsx lib/dashboard/resolve.test.ts`
Expected: FAIL (calculated routed to `attemptLeaf`, which has no calculated case → wrong result or type error).

- [ ] **Step 8: Route calculated in `resolveBlock`**

In `lib/dashboard/resolve.ts`, add the import:
```ts
import { resolveAggregate, resolveCalculated, type AttemptLeaf } from './aggregate'
```
(extend the existing `./aggregate` import to include `resolveCalculated`.)

Replace the `res` assignment (lines ~35-38) with:
```ts
  const res: LeafAttempt =
    config.binding.source === 'aggregate'
      ? await resolveAggregate(config.binding, attemptLeaf, ctx, range.dateRange, range.compareRange)
      : config.binding.source === 'calculated'
        ? await resolveCalculated(config.binding, attemptLeaf, ctx, range.dateRange, range.compareRange)
        : await attemptLeaf(config.binding, ctx, range.dateRange, range.compareRange)
```

- [ ] **Step 9: Run to verify pass**

Run: `npx tsx lib/dashboard/resolve.test.ts`
Expected: `ok`.

- [ ] **Step 10: Write failing persistence tests**

In `lib/dashboard/persistence.test.ts`, add (using the existing `parseBlockConfig` import):
```ts
// calculated binding round-trips
{
  const r = parseBlockConfig({ id: 'b', name: 'Net', format: 'currency', range: null,
    binding: { source: 'calculated', terms: [
      { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
      { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
    ] } })
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'calculated') assert.equal(r.block.binding.terms.length, 2)
}
// empty terms rejected
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null, binding: { source: 'calculated', terms: [] } })
  assert.equal(r.ok, false)
}
// non-number coefficient rejected
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'calculated', terms: [{ coefficient: 'x', leaf: { source: 'triplewhale', metric: 'revenue' } }] } })
  assert.equal(r.ok, false)
}
// calculated as aggregate operand round-trips
{
  const r = parseBlockConfig({ id: 'b', name: 'ROAS', format: 'number', range: null,
    binding: { source: 'aggregate', op: '/',
      left: { source: 'calculated', terms: [{ coefficient: 1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } }] },
      right: { source: 'triplewhale', metric: 'ad_spend' } } })
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'aggregate') assert.equal(r.block.binding.left.source, 'calculated')
}
```

- [ ] **Step 11: Run to verify failure**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: FAIL (`parseBinding` rejects `calculated`).

- [ ] **Step 12: Implement persistence parsing**

In `lib/dashboard/persistence.ts`:

Add `CalculatedBinding` and `AggregateOperand` to the type import at the top (the line importing from `./types`).

Add these helpers near `parseBinding`:
```ts
function parseCalculated(v: unknown, path: string): Parsed<CalculatedBinding> {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  if (!Array.isArray(v.terms) || v.terms.length === 0) return { ok: false, error: `${path}.terms: expected non-empty array` }
  const terms: CalculatedBinding['terms'] = []
  for (let i = 0; i < v.terms.length; i++) {
    const t = v.terms[i]
    if (!isObj(t)) return { ok: false, error: `${path}.terms[${i}]: expected object` }
    if (typeof t.coefficient !== 'number' || !Number.isFinite(t.coefficient)) {
      return { ok: false, error: `${path}.terms[${i}].coefficient: expected finite number` }
    }
    const leaf = parseLeaf(t.leaf, `${path}.terms[${i}].leaf`)
    if (!leaf.ok) return leaf
    terms.push({ coefficient: t.coefficient, leaf: leaf.value })
  }
  return { ok: true, value: { source: 'calculated', terms } }
}

function parseOperand(v: unknown, path: string): Parsed<AggregateOperand> {
  if (isObj(v) && v.source === 'calculated') return parseCalculated(v, path)
  return parseLeaf(v, path)
}
```

Replace the `parseBinding` aggregate branch's two `parseLeaf(v.left/right, ...)` calls with `parseOperand`, and add a `calculated` branch. The function becomes:
```ts
function parseBinding(v: unknown, path: string): Parsed<Binding> {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  if (v.source === 'aggregate') {
    if (!OPS.includes(v.op as AggregateBinding['op'])) return { ok: false, error: `${path}.op: expected one of ${OPS.join(',')}` }
    const left = parseOperand(v.left, `${path}.left`)
    if (!left.ok) return left
    const right = parseOperand(v.right, `${path}.right`)
    if (!right.ok) return right
    const b: AggregateBinding = { source: 'aggregate', op: v.op as AggregateBinding['op'], left: left.value, right: right.value }
    return { ok: true, value: b }
  }
  if (v.source === 'calculated') return parseCalculated(v, path)
  return parseLeaf(v, path)
}
```

- [ ] **Step 13: Run to verify pass**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: `ok`.

- [ ] **Step 14: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (`build-config.ts` still compiles: leaf operands are valid `AggregateOperand`s; it cannot yet produce calculated bindings — that's Tasks 2-3.)

- [ ] **Step 15: Commit**

```bash
git commit -m "feat(dashboard): weighted-sum calculated metric (backend + persistence)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- lib/dashboard/types.ts lib/dashboard/aggregate.ts lib/dashboard/aggregate.test.ts lib/dashboard/resolve.ts lib/dashboard/resolve.test.ts lib/dashboard/persistence.ts lib/dashboard/persistence.test.ts
```

---

### Task 2: Standalone calculated block UI

Adds the weighted-sum builder and a "Calculated" manual source, so the Final Revenue block is buildable. Additive to `build-config.ts` — the aggregate draft is NOT changed here (Task 3 does that), so `manual-block-form.tsx`'s aggregate path keeps compiling.

**Files:**
- Modify: `components/dashboard/add-block/build-config.ts` (add `CalculatedDraft`, `calculatedToBinding`, `isCalculatedComplete`; extend `ManualDraft`, `buildBlockConfig`, `isDraftComplete`)
- Test: `components/dashboard/add-block/build-config.test.ts`
- Create: `components/dashboard/add-block/calculated-builder.tsx`
- Modify: `components/dashboard/add-block/manual-block-form.tsx` (calculated mode)
- Modify: `components/dashboard/add-block/add-block-dialog.tsx` (calculated source, manual-only)

**Interfaces:**
- Consumes: `CalculatedBinding` (Task 1), `LeafBuilder`, `leafToBinding`, `isLeafComplete`.
- Produces: `CalculatedDraft = { source: 'calculated'; terms: { coefficient: string; leaf: LeafDraft }[] }`; `calculatedToBinding(c: CalculatedDraft): CalculatedBinding`; `isCalculatedComplete(c: CalculatedDraft): boolean`; `CalculatedBuilder` component (`{ value: CalculatedDraft; onChange: (v: CalculatedDraft) => void; slug: string }`).

- [ ] **Step 1: Write failing build-config tests**

In `components/dashboard/add-block/build-config.test.ts`, extend the import (line 3) to include `calculatedToBinding`:
```ts
import { buildBlockConfig, formatFromDataType, isDraftComplete, leafToBinding, calculatedToBinding, COMMON_TW_METRICS, type ManualDraft } from './build-config'
```
Add:
```ts
// calculatedToBinding: blank coeff → 1; incomplete term dropped; signs preserved
{
  const b = calculatedToBinding({ source: 'calculated', terms: [
    { coefficient: '', leaf: { source: 'triplewhale', metric: 'revenue' } },
    { coefficient: '-1', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
    { coefficient: '2', leaf: { source: 'supermetrics', dsId: '', metricField: '', account: '' } }, // incomplete → dropped
  ] })
  assert.deepEqual(b.terms, [
    { coefficient: 1, leaf: { source: 'triplewhale', metric: 'revenue' } },
    { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
  ])
}
// buildBlockConfig: calculated kind
{
  const cfg = buildBlockConfig({ kind: 'calculated', name: 'Net', format: 'currency',
    calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: { source: 'triplewhale', metric: 'revenue' } }] } })
  assert.equal(cfg.binding.source, 'calculated')
}
// isDraftComplete: calculated needs name + ≥1 complete term
{
  assert.equal(isDraftComplete({ kind: 'calculated', name: '', format: 'number', calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: { source: 'triplewhale', metric: 'revenue' } }] } }), false)
  assert.equal(isDraftComplete({ kind: 'calculated', name: 'X', format: 'number', calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: { source: 'triplewhale', metric: '' } }] } }), false)
  assert.equal(isDraftComplete({ kind: 'calculated', name: 'X', format: 'number', calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: { source: 'triplewhale', metric: 'revenue' } }] } }), true)
}
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: FAIL (`calculatedToBinding` not exported; `kind: 'calculated'` not in `ManualDraft`).

- [ ] **Step 3: Implement calculated draft logic in `build-config.ts`**

In `components/dashboard/add-block/build-config.ts`:

Extend the type import (line 1):
```ts
import type { BlockConfig, LeafBinding, AggregateBinding, CalculatedBinding, MetricFormat } from '@/lib/dashboard/types'
```

Add after `LeafDraft`:
```ts
/** Manual weighted-sum draft. `coefficient` is the raw input (parsed at build; blank → 1). */
export type CalculatedDraft = {
  source: 'calculated'
  terms: { coefficient: string; leaf: LeafDraft }[]
}
```

Extend `ManualDraft` with a calculated kind:
```ts
export type ManualDraft =
  | { kind: 'leaf'; name: string; format: MetricFormat; leaf: LeafDraft }
  | { kind: 'calculated'; name: string; format: MetricFormat; calc: CalculatedDraft }
  | { kind: 'aggregate'; name: string; format: MetricFormat; op: AggregateBinding['op']; left: LeafDraft; right: LeafDraft }
```

Add `calculatedToBinding` (after `leafToBinding`):
```ts
/** Build a calculated binding: keep terms with a complete leaf and a numeric
 *  coefficient (blank → 1); drop the rest. */
export function calculatedToBinding(c: CalculatedDraft): CalculatedBinding {
  const terms = c.terms
    .filter((t) => isLeafComplete(t.leaf))
    .map((t) => ({ coefficient: t.coefficient.trim() === '' ? 1 : Number(t.coefficient), leaf: leafToBinding(t.leaf) }))
    .filter((t) => Number.isFinite(t.coefficient))
  return { source: 'calculated', terms }
}
```

In `buildBlockConfig`, handle the calculated kind:
```ts
export function buildBlockConfig(d: ManualDraft): Omit<BlockConfig, 'id'> {
  const binding =
    d.kind === 'leaf'
      ? leafToBinding(d.leaf)
      : d.kind === 'calculated'
        ? calculatedToBinding(d.calc)
        : { source: 'aggregate' as const, op: d.op, left: leafToBinding(d.left), right: leafToBinding(d.right) }
  return { name: d.name, format: d.format, range: null, binding }
}
```

Add `isCalculatedComplete` and handle it in `isDraftComplete`:
```ts
export function isCalculatedComplete(c: CalculatedDraft): boolean {
  return c.terms.some((t) => isLeafComplete(t.leaf) && (t.coefficient.trim() === '' || Number.isFinite(Number(t.coefficient))))
}

export function isDraftComplete(d: ManualDraft): boolean {
  if (d.name.trim() === '') return false
  if (d.kind === 'leaf') return isLeafComplete(d.leaf)
  if (d.kind === 'calculated') return isCalculatedComplete(d.calc)
  return isLeafComplete(d.left) && isLeafComplete(d.right)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: `ok`.

- [ ] **Step 5: Create `calculated-builder.tsx`**

Create `components/dashboard/add-block/calculated-builder.tsx`:
```tsx
'use client'

import { LeafBuilder } from './leaf-builder'
import type { CalculatedDraft, LeafDraft } from './build-config'

type LeafSource = 'supermetrics' | 'triplewhale'
const emptyLeaf = (s: LeafSource): LeafDraft =>
  s === 'supermetrics' ? { source: s, dsId: '', metricField: '', account: '' } : { source: s, metric: '' }

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

/** Weighted-sum editor: rows of [coefficient] × [leaf]. value = Σ coefficient × leaf. */
export function CalculatedBuilder({
  value,
  onChange,
  slug,
}: {
  value: CalculatedDraft
  onChange: (v: CalculatedDraft) => void
  slug: string
}) {
  const terms = value.terms
  const setTerm = (i: number, patch: Partial<CalculatedDraft['terms'][number]>) =>
    onChange({ source: 'calculated', terms: terms.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  const addTerm = () => onChange({ source: 'calculated', terms: [...terms, { coefficient: '1', leaf: emptyLeaf('supermetrics') }] })
  const removeTerm = (i: number) => onChange({ source: 'calculated', terms: terms.filter((_, j) => j !== i) })

  return (
    <div className="flex flex-col gap-3">
      <p className={labelCls}>Weighted sum · Σ (coefficient × metric)</p>
      {terms.map((t, i) => (
        <div key={i} className="rounded-md border border-white/10 p-3">
          <div className="mb-2 flex items-center gap-2">
            <input
              className="w-20 rounded-md border border-white/10 bg-bg-surface px-2 py-1.5 text-sm text-white"
              value={t.coefficient}
              onChange={(e) => setTerm(i, { coefficient: e.target.value })}
              placeholder="× 1"
              aria-label="Coefficient"
            />
            <select
              className="rounded-md border border-white/10 bg-bg-surface px-2 py-1.5 text-xs text-white"
              value={t.leaf.source}
              onChange={(e) => setTerm(i, { leaf: emptyLeaf(e.target.value as LeafSource) })}
            >
              <option value="supermetrics">Supermetrics</option>
              <option value="triplewhale">TripleWhale</option>
            </select>
            <button type="button" onClick={() => removeTerm(i)} className="ml-auto text-text-muted hover:text-white" aria-label="Remove term">✕</button>
          </div>
          <LeafBuilder source={t.leaf.source} value={t.leaf} onChange={(leaf) => setTerm(i, { leaf })} slug={slug} />
        </div>
      ))}
      <button
        type="button"
        onClick={addTerm}
        className="self-start rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
      >
        + Add term
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Add the calculated mode to `manual-block-form.tsx`**

In `components/dashboard/add-block/manual-block-form.tsx`:

Add imports:
```ts
import { CalculatedBuilder } from './calculated-builder'
import { buildBlockConfig, isDraftComplete, type LeafDraft, type ManualDraft, type CalculatedDraft } from './build-config'
```
(extend the existing `./build-config` import to add `CalculatedDraft`.)

Widen the `source` prop type to include `'calculated'`:
```ts
  source: 'supermetrics' | 'triplewhale' | 'aggregate' | 'calculated'
```

Add calculated draft state (near the other `useState`s):
```ts
  const [calc, setCalc] = useState<CalculatedDraft>(() => ({ source: 'calculated', terms: [{ coefficient: '1', leaf: emptyLeaf('supermetrics') }] }))
```
Note: the existing `leaf` state initializer calls `emptyLeaf(source === 'aggregate' ? 'supermetrics' : source)`. Change it to also handle `'calculated'`:
```ts
  const [leaf, setLeaf] = useState<LeafDraft>(() => emptyLeaf(source === 'aggregate' || source === 'calculated' ? 'supermetrics' : source))
```

Update the `draft` computation:
```ts
  const draft: ManualDraft =
    source === 'aggregate'
      ? { kind: 'aggregate', name, format, op, left, right }
      : source === 'calculated'
        ? { kind: 'calculated', name, format, calc }
        : { kind: 'leaf', name, format, leaf }
```

Render the calculated builder — add this block alongside the existing `source !== 'aggregate'` and `source === 'aggregate'` blocks. Change the leaf-render guard so it only renders for true leaf sources, and add the calculated block:
```tsx
      {source !== 'aggregate' && source !== 'calculated' && (
        <LeafBuilder source={source} value={leaf} onChange={setLeaf} slug={slug} onSuggestFormat={setFormat} />
      )}

      {source === 'calculated' && (
        <CalculatedBuilder value={calc} onChange={setCalc} slug={slug} />
      )}
```

- [ ] **Step 7: Add the calculated source to `add-block-dialog.tsx`**

In `components/dashboard/add-block/add-block-dialog.tsx`:

Define a manual-inclusive source type and add the option. Replace the `Source` type usage and `SOURCES` list:
```ts
type Source = ProposeBlockInput['source'] | 'calculated'
const SOURCES: { value: Source; label: string }[] = [
  { value: 'supermetrics', label: 'Supermetrics' },
  { value: 'triplewhale', label: 'TripleWhale' },
  { value: 'aggregate', label: 'Aggregate (formula)' },
  { value: 'calculated', label: 'Calculated (weighted sum)' },
]
```
`useState<Source>('supermetrics')` already covers the widened type.

In the `mode` step, calculated is manual-only — do not offer "Describe with AI" for it. Replace the `mode` step's body so the AI button is hidden for calculated:
```tsx
        {step === 'mode' && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">How to build it · {source}</p>
            {source !== 'calculated' && (
              <button onClick={() => setStep('prompt')}
                className="rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 hover:bg-white/[0.04]">
                Describe with AI
              </button>
            )}
            <button onClick={() => setStep('build')}
              className="rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 hover:bg-white/[0.04]">
              Build manually
            </button>
            <button className="mt-1 self-start rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={() => setStep('pick')} disabled={pending}>Back</button>
          </div>
        )}
```
The `ManualBlockForm` is already rendered in the `build` step with `source={source}` — its widened prop type (Step 6) accepts `'calculated'`. The `resolve()`/`proposeBlock` path is only reachable from the `prompt` step, which calculated never enters, so `proposeBlock` is never called with `'calculated'` (its `ProposeBlockInput['source']` type is unchanged).

- [ ] **Step 8: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: clean.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(dashboard): standalone calculated (weighted-sum) block UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts components/dashboard/add-block/calculated-builder.tsx components/dashboard/add-block/manual-block-form.tsx components/dashboard/add-block/add-block-dialog.tsx
```

---

### Task 3: Calculated as an aggregate operand (ROAS)

Lets an aggregate operand be a calculated metric, so `(rev − tax) ÷ spend` is buildable. Changes the aggregate draft from leaf operands to leaf-or-calculated operands.

**Files:**
- Modify: `components/dashboard/add-block/build-config.ts` (add `OperandDraft`, `operandToBinding`, `isOperandComplete`; aggregate `ManualDraft` operands → `OperandDraft`; `buildBlockConfig` + `isDraftComplete`)
- Test: `components/dashboard/add-block/build-config.test.ts`
- Modify: `components/dashboard/add-block/manual-block-form.tsx` (operand picker gains "Calculated")

**Interfaces:**
- Consumes: `calculatedToBinding`, `CalculatedDraft`, `CalculatedBuilder`, `leafToBinding`, `isLeafComplete`, `isCalculatedComplete` (Task 2).
- Produces: `OperandDraft = { kind: 'leaf'; leaf: LeafDraft } | { kind: 'calculated'; calc: CalculatedDraft }`; `operandToBinding(o: OperandDraft): AggregateOperand`; `isOperandComplete(o: OperandDraft): boolean`. The aggregate `ManualDraft` variant's `left`/`right` are now `OperandDraft`.

- [ ] **Step 1: Write failing build-config tests + migrate existing aggregate tests**

In `components/dashboard/add-block/build-config.test.ts`:

Extend the import to add `operandToBinding`:
```ts
import { buildBlockConfig, formatFromDataType, isDraftComplete, leafToBinding, calculatedToBinding, operandToBinding, COMMON_TW_METRICS, type ManualDraft } from './build-config'
```

Migrate the existing aggregate `buildBlockConfig` test (currently lines ~24-34) to wrap operands as `{ kind: 'leaf', leaf: ... }`:
```ts
// buildBlockConfig: aggregate (revenue / spend), leaf operands
{
  const d: ManualDraft = { kind: 'aggregate', name: 'Blended ROAS', format: 'number', op: '/',
    left: { kind: 'leaf', leaf: { source: 'triplewhale', metric: 'revenue' } },
    right: { kind: 'leaf', leaf: { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' } } }
  const cfg = buildBlockConfig(d)
  assert.equal(cfg.binding.source, 'aggregate')
  if (cfg.binding.source === 'aggregate') {
    assert.equal(cfg.binding.left.source, 'triplewhale')
    assert.equal(cfg.binding.right.source, 'supermetrics')
  }
}
```

Migrate the existing aggregate `isDraftComplete` test (currently line ~52) to operand shape:
```ts
assert.equal(isDraftComplete({ kind: 'aggregate', name: 'X', format: 'number', op: '/', left: { kind: 'leaf', leaf: { source: 'triplewhale', metric: 'revenue' } }, right: { kind: 'leaf', leaf: { source: 'triplewhale', metric: '' } } }), false)
```

Add new operand tests:
```ts
// operandToBinding: leaf
{
  const b = operandToBinding({ kind: 'leaf', leaf: { source: 'triplewhale', metric: 'ad_spend' } })
  assert.deepEqual(b, { source: 'triplewhale', metric: 'ad_spend' })
}
// operandToBinding: calculated
{
  const b = operandToBinding({ kind: 'calculated', calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: { source: 'triplewhale', metric: 'revenue' } }] } })
  assert.equal(b.source, 'calculated')
}
// buildBlockConfig: aggregate with calculated left operand (ROAS = (rev - tax) / spend)
{
  const cfg = buildBlockConfig({ kind: 'aggregate', name: 'ROAS', format: 'number', op: '/',
    left: { kind: 'calculated', calc: { source: 'calculated', terms: [
      { coefficient: '1', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
      { coefficient: '-1', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
    ] } },
    right: { kind: 'leaf', leaf: { source: 'triplewhale', metric: 'ad_spend' } } })
  assert.equal(cfg.binding.source, 'aggregate')
  if (cfg.binding.source === 'aggregate') assert.equal(cfg.binding.left.source, 'calculated')
}
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: FAIL (`operandToBinding` not exported; aggregate `ManualDraft` still expects `LeafDraft` operands).

- [ ] **Step 3: Implement operand logic in `build-config.ts`**

In `components/dashboard/add-block/build-config.ts`:

Extend the type import to add `AggregateOperand`:
```ts
import type { BlockConfig, LeafBinding, AggregateBinding, AggregateOperand, CalculatedBinding, MetricFormat } from '@/lib/dashboard/types'
```

Add the operand draft type (after `CalculatedDraft`):
```ts
/** An aggregate operand draft: a single leaf or a weighted-sum calculation. */
export type OperandDraft =
  | { kind: 'leaf'; leaf: LeafDraft }
  | { kind: 'calculated'; calc: CalculatedDraft }
```

Change the aggregate `ManualDraft` variant's operands to `OperandDraft`:
```ts
  | { kind: 'aggregate'; name: string; format: MetricFormat; op: AggregateBinding['op']; left: OperandDraft; right: OperandDraft }
```

Add `operandToBinding` and `isOperandComplete` (after `calculatedToBinding`):
```ts
export function operandToBinding(o: OperandDraft): AggregateOperand {
  return o.kind === 'calculated' ? calculatedToBinding(o.calc) : leafToBinding(o.leaf)
}

export function isOperandComplete(o: OperandDraft): boolean {
  return o.kind === 'calculated' ? isCalculatedComplete(o.calc) : isLeafComplete(o.leaf)
}
```

Update `buildBlockConfig`'s aggregate branch to use `operandToBinding`:
```ts
      : { source: 'aggregate' as const, op: d.op, left: operandToBinding(d.left), right: operandToBinding(d.right) }
```

Update `isDraftComplete`'s aggregate line to use `isOperandComplete`:
```ts
  return isOperandComplete(d.left) && isOperandComplete(d.right)
```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: `ok`.

- [ ] **Step 5: Add the calculated operand option to `manual-block-form.tsx`**

In `components/dashboard/add-block/manual-block-form.tsx`:

Extend the `./build-config` import to add `OperandDraft`:
```ts
import { buildBlockConfig, isDraftComplete, type LeafDraft, type ManualDraft, type CalculatedDraft, type OperandDraft } from './build-config'
```

Change the aggregate operand state from `LeafDraft` to `OperandDraft` and drop the now-unused `leftSource`/`rightSource` (the `Operand` component owns its source):
```ts
  const [left, setLeft] = useState<OperandDraft>(() => ({ kind: 'leaf', leaf: emptyLeaf('triplewhale') }))
  const [right, setRight] = useState<OperandDraft>(() => ({ kind: 'leaf', leaf: emptyLeaf('supermetrics') }))
```
Remove the `leftSource`/`rightSource` `useState` lines (lines ~41-42) — they are replaced by the operand's own source selector.

Update the aggregate render block to pass operand props (replace the existing `<Operand ... />` usages):
```tsx
          <Operand title="Left" value={left} onChange={setLeft} slug={slug} />
          <Operand title="Right" value={right} onChange={setRight} slug={slug} />
```

Replace the `Operand` component at the bottom of the file with an operand-draft version offering supermetrics / triplewhale / calculated:
```tsx
function Operand({
  title,
  value,
  onChange,
  slug,
}: {
  title: string
  value: OperandDraft
  onChange: (v: OperandDraft) => void
  slug: string
}) {
  const kind = value.kind === 'calculated' ? 'calculated' : value.leaf.source
  const onKind = (k: string) => {
    if (k === 'calculated') onChange({ kind: 'calculated', calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: emptyLeaf('supermetrics') }] } })
    else onChange({ kind: 'leaf', leaf: emptyLeaf(k as 'supermetrics' | 'triplewhale') })
  }
  return (
    <div className="rounded-md border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={labelCls}>{title}</span>
        <select className="rounded-md border border-white/10 bg-bg-surface px-2 py-1 text-xs text-white" value={kind} onChange={(e) => onKind(e.target.value)}>
          <option value="supermetrics">Supermetrics</option>
          <option value="triplewhale">TripleWhale</option>
          <option value="calculated">Calculated (weighted sum)</option>
        </select>
      </div>
      {value.kind === 'calculated' ? (
        <CalculatedBuilder value={value.calc} onChange={(calc) => onChange({ kind: 'calculated', calc })} slug={slug} />
      ) : (
        <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={(leaf) => onChange({ kind: 'leaf', leaf })} slug={slug} />
      )}
    </div>
  )
}
```
Add `import { CalculatedBuilder } from './calculated-builder'` if not already present from Task 2 (it is).

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: clean.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(dashboard): calculated metric as aggregate operand (ROAS)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts components/dashboard/add-block/manual-block-form.tsx
```

---

## Self-Review

- **Spec coverage:** CalculatedBinding + widened operands (T1 types); resolveCalculated + operand dispatch (T1 aggregate/resolve); persistence parse + legacy compat (T1 persistence); standalone calculated UI (T2); calc-as-operand UI (T3). NL untouched (no task) ✅. Manual-only ✅.
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** `CalculatedBinding`/`AggregateOperand` names match across types, aggregate, persistence, build-config. `CalculatedDraft` (string coefficient) vs `CalculatedBinding` (number coefficient) — conversion in `calculatedToBinding`. `OperandDraft` (T3) replaces `LeafDraft` operands in the aggregate `ManualDraft`; T3 migrates the existing build-config aggregate tests to the operand shape. `resolveCalculated`/`resolveOperand`/`operandToBinding`/`calculatedToBinding`/`isCalculatedComplete`/`isOperandComplete` names consistent between definition and use.
- **Compile-green seams:** T1 leaves `build-config.ts`/UI untouched (leaf operands are valid `AggregateOperand`s). T2 is additive to the calculated kind (aggregate draft unchanged). T3 migrates the aggregate operand draft + its tests + the form together.

## Execution Handoff

Plan saved. Recommended: **Subagent-Driven Development** — fresh subagent per task, review between tasks.
