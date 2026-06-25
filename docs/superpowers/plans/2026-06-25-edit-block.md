# Edit a Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user edit an existing block in place (name, format, binding) — leaf blocks in the leaf builder, formula/aggregate/calculated in the formula builder (legacy types migrated to formula on save), preserving id/range/layout.

**Architecture:** Add unary minus to the formula engine; add reverse `binding→draft` mappers (incl. an aggregate/calculated → formula converter) and an `updateBlock` mutation; pre-seed the manual builder and add an `editing` mode to the add-block dialog, opened from a new "Edit metric…" kebab entry.

**Tech Stack:** TypeScript (strict), Next.js 15 App Router, React, `tsx` + `node:assert` tests.

## Global Constraints

- TypeScript strict; no `any` in new/changed code.
- Unary minus is additive to the parser — existing valid formulas and all error cases behave exactly as before.
- Edit preserves block `id`, `range`, and `layout`; only `name`/`format`/`binding` change.
- Saves use the warm path (`saveDashboardConfig` + `router.refresh()`; no `revalidatePath`).
- Back-compat: existing leaf/formula/aggregate/calculated bindings still resolve; editing aggregate/calculated migrates them to formula bindings.
- No type-switching in edit (leaf stays leaf); range editing stays in the existing "Set range" menu; edit uses the manual builder (not NL).
- No new npm dependency.

---

### Task 1: Unary minus in the formula engine

Additive parser/evaluator support for `-x` so negatives are first-class (`-1 * @b`, `-@a`, negative coefficients). Pure, fully tested, no consumers change.

**Files:**
- Modify: `lib/dashboard/formula/parse.ts`
- Test: `lib/dashboard/formula/parse.test.ts`
- Modify: `lib/dashboard/formula/evaluate.ts`
- Test: `lib/dashboard/formula/evaluate.test.ts`

**Interfaces:**
- Produces: `Ast` gains `{ n: 'neg'; operand: Ast }`. `parse`/`evaluate` signatures unchanged.

- [ ] **Step 1: Write failing parse tests**

In `lib/dashboard/formula/parse.test.ts`, add (the file already imports `parse`, `FormulaError`, `Ast`):
```ts
// unary minus
assert.deepEqual(parse('-@a'), { n: 'neg', operand: { n: 'ref', key: 'a' } })
assert.deepEqual(parse('-1 * @b'), { n: 'bin', op: '*', l: { n: 'neg', operand: { n: 'num', v: 1 } }, r: { n: 'ref', key: 'b' } })
// negative term mid-expression parses (was previously a "+ -" error)
{
  const ast = parse('@a + -1 * @b') as Extract<Ast, { n: 'bin' }>
  assert.equal(ast.op, '+')
  assert.equal((ast.r as Extract<Ast, { n: 'bin' }>).op, '*')
}
// binary minus then unary minus: a - (-b)
{
  const ast = parse('@a - -@b') as Extract<Ast, { n: 'bin' }>
  assert.equal(ast.op, '-')
  assert.equal((ast.r as Extract<Ast, { n: 'neg' }>).n, 'neg')
}
// a lone '-' is still an error
assert.throws(() => parse('-'), (e: unknown) => e instanceof FormulaError)
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx lib/dashboard/formula/parse.test.ts`
Expected: FAIL (no `neg` node; `-@a` currently errors).

- [ ] **Step 3: Implement unary minus in `parse.ts`**

Add the `neg` variant to `Ast`:
```ts
export type Ast =
  | { n: 'num'; v: number }
  | { n: 'ref'; key: string }
  | { n: 'neg'; operand: Ast }
  | { n: 'bin'; op: Op; l: Ast; r: Ast }
```
In `parseFactor`, handle a leading unary `-` (before the `num`/`ref`/`lp` cases). Replace the start of `parseFactor`:
```ts
  function parseFactor(): Ast {
    const t = peek()
    if (!t) throw new FormulaError('unexpected end of formula')
    if (t.t === 'op' && t.v === '-') { pos++; return { n: 'neg', operand: parseFactor() } }
    if (t.t === 'num') { pos++; return { n: 'num', v: t.v } }
    if (t.t === 'ref') { pos++; return { n: 'ref', key: t.key } }
    if (t.t === 'lp') {
      pos++
      const e = parseExpr()
      if (peek()?.t !== 'rp') throw new FormulaError('expected closing parenthesis')
      pos++
      return e
    }
    throw new FormulaError('expected a number, reference, or "("')
  }
```
(Binary `-`/`+` are still consumed by `parseExpr`'s loop between operands; the unary branch only fires when `-` appears where a *factor* is expected. `'-'` alone → `neg(parseFactor())` → inner `parseFactor` hits end-of-input → throws, so it still errors.)

- [ ] **Step 4: Run to verify parse tests pass**

Run: `npx tsx lib/dashboard/formula/parse.test.ts`
Expected: `ok`.

- [ ] **Step 5: Write failing evaluate tests**

In `lib/dashboard/formula/evaluate.test.ts`, add:
```ts
// unary minus
assert.equal(evaluate(parse('-@a'), () => 5), -5)
assert.equal(evaluate(parse('@a + -1 * @b'), (k) => (k === 'a' ? 10 : 3)), 7) // 10 + (-1*3)
assert.equal(evaluate(parse('-1 * 0.8'), () => 0), -0.8)
assert.equal(evaluate(parse('@a - -@b'), (k) => (k === 'a' ? 5 : 2)), 7)      // 5 - (-2)
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx tsx lib/dashboard/formula/evaluate.test.ts`
Expected: FAIL (no `neg` handling → "unknown formula node").

- [ ] **Step 7: Implement `neg` in `evaluate.ts`**

Add a `neg` case to the outer switch in `evaluate` (before the `bin` case):
```ts
    case 'ref': return resolve(ast.key)
    case 'neg': return -evaluate(ast.operand, resolve)
    case 'bin': {
```

- [ ] **Step 8: Run to verify evaluate tests pass**

Run: `npx tsx lib/dashboard/formula/evaluate.test.ts`
Expected: `ok`.

- [ ] **Step 9: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git commit -m "feat(dashboard): unary minus in formula engine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- lib/dashboard/formula/parse.ts lib/dashboard/formula/parse.test.ts lib/dashboard/formula/evaluate.ts lib/dashboard/formula/evaluate.test.ts
```

---

### Task 2: Reverse mappers + converter + `updateBlock`

Pure functions to turn a persisted binding back into a draft (incl. aggregate/calculated → formula), and an `updateBlock` mutation. No UI yet.

**Files:**
- Modify: `components/dashboard/add-block/build-config.ts`
- Test: `components/dashboard/add-block/build-config.test.ts`
- Modify: `components/dashboard/config-mutations.ts`
- Test: `components/dashboard/config-mutations.test.ts` (new)

**Interfaces:**
- Consumes: `parse` (`@/lib/dashboard/formula/parse`) incl. unary minus (Task 1); existing `leafToBinding`/`formulaToBinding`/`isLeafComplete`.
- Produces: `leafToDraft(b: LeafBinding): LeafDraft`; `formulaToDraft(b: FormulaBinding): FormulaDraft`; `bindingToFormulaDraft(b: AggregateBinding | CalculatedBinding): FormulaDraft`; `blockToManualDraft(block: PersistedBlock): { source: 'supermetrics' | 'triplewhale' | 'formula'; draft: ManualDraft }`; `updateBlock(config, blockId, patch: Omit<BlockConfig, 'id'>): DashboardConfig`.

- [ ] **Step 1: Write failing build-config tests**

In `components/dashboard/add-block/build-config.test.ts`, extend the `./build-config` import with `leafToDraft, formulaToDraft, bindingToFormulaDraft, blockToManualDraft`, add `import { parse } from '@/lib/dashboard/formula/parse'`, and add:
```ts
// leafToDraft round-trips through leafToBinding (supermetrics with filters)
{
  const b = { source: 'supermetrics' as const, dsId: 'SHP', metricField: 'total_sales', account: 'a', filters: [{ column: 'order_shipping_country', values: ['United States', 'Canada'] }] }
  assert.deepEqual(leafToBinding(leafToDraft(b)), b)
}
// leafToDraft round-trips (triplewhale, no filters)
{
  const b = { source: 'triplewhale' as const, metric: 'ad_spend' }
  assert.deepEqual(leafToBinding(leafToDraft(b)), b)
}
// formulaToDraft round-trips through formulaToBinding
{
  const b = { source: 'formula' as const, expr: '@a / @b', operands: { a: { kind: 'ref' as const, blockId: 'rev' }, b: { kind: 'metric' as const, leaf: { source: 'triplewhale' as const, metric: 'ad_spend' } } } }
  assert.deepEqual(formulaToBinding(formulaToDraft(b)), b)
}
// bindingToFormulaDraft: aggregate of two leaves -> "@m0 / @m1", parses
{
  const d = bindingToFormulaDraft({ source: 'aggregate', op: '/', left: { source: 'triplewhale', metric: 'revenue' }, right: { source: 'triplewhale', metric: 'ad_spend' } })
  assert.doesNotThrow(() => parse(d.expr))
  assert.equal(Object.keys(d.operands).length, 2)
}
// bindingToFormulaDraft: (rev - tax) / spend -> parses, 3 operands
{
  const d = bindingToFormulaDraft({ source: 'aggregate', op: '/',
    left: { source: 'calculated', terms: [
      { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
      { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
    ] },
    right: { source: 'triplewhale', metric: 'ad_spend' } })
  assert.doesNotThrow(() => parse(d.expr)) // negative coefficient must produce parser-valid expr
  assert.equal(Object.keys(d.operands).length, 3)
}
// bindingToFormulaDraft: standalone calculated with a negative coefficient parses
{
  const d = bindingToFormulaDraft({ source: 'calculated', terms: [
    { coefficient: 0.8, leaf: { source: 'triplewhale', metric: 'revenue' } },
    { coefficient: -1, leaf: { source: 'triplewhale', metric: 'ad_spend' } },
  ] })
  assert.doesNotThrow(() => parse(d.expr))
}
// blockToManualDraft dispatch
{
  const leafBlock = { id: 'x', name: 'Spend', format: 'currency' as const, range: null, binding: { source: 'triplewhale' as const, metric: 'ad_spend' } }
  assert.equal(blockToManualDraft(leafBlock).source, 'triplewhale')
  const aggBlock = { id: 'y', name: 'ROAS', format: 'number' as const, range: null, binding: { source: 'aggregate' as const, op: '/' as const, left: { source: 'triplewhale' as const, metric: 'revenue' }, right: { source: 'triplewhale' as const, metric: 'ad_spend' } } }
  const md = blockToManualDraft(aggBlock)
  assert.equal(md.source, 'formula')
  if (md.draft.kind === 'formula') assert.doesNotThrow(() => parse(md.draft.formula.expr))
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: FAIL (reverse mappers not exported).

- [ ] **Step 3: Implement the reverse mappers + converter**

In `components/dashboard/add-block/build-config.ts`, add `PersistedBlock` to the `./types` import, and add these exports (place after `formulaToBinding`):
```ts
export function leafToDraft(b: LeafBinding): LeafDraft {
  const filters = b.filters?.length ? { filters: b.filters.map((f) => ({ column: f.column, values: [...f.values] })) } : {}
  return b.source === 'supermetrics'
    ? { source: 'supermetrics', dsId: b.dsId, metricField: b.metricField, account: b.account, ...filters }
    : { source: 'triplewhale', metric: b.metric, ...filters }
}

export function formulaToDraft(b: FormulaBinding): FormulaDraft {
  const operands: Record<string, FormulaOperandDraft> = {}
  for (const [k, op] of Object.entries(b.operands)) {
    operands[k] = op.kind === 'ref' ? { kind: 'ref', blockId: op.blockId } : { kind: 'metric', leaf: leafToDraft(op.leaf) }
  }
  return { source: 'formula', expr: b.expr, operands }
}

/** Convert a legacy aggregate/calculated binding into an equivalent formula draft.
 *  Operand keys are unique (m0, m1, …); negative coefficients rely on unary minus. */
export function bindingToFormulaDraft(b: AggregateBinding | CalculatedBinding): FormulaDraft {
  const operands: Record<string, FormulaOperandDraft> = {}
  let n = 0
  const metricExpr = (leaf: LeafBinding): string => {
    const k = `m${n++}`
    operands[k] = { kind: 'metric', leaf: leafToDraft(leaf) }
    return `@${k}`
  }
  const calcExpr = (c: CalculatedBinding): string =>
    c.terms.map((t) => (t.coefficient === 1 ? metricExpr(t.leaf) : `${t.coefficient} * ${metricExpr(t.leaf)}`)).join(' + ')
  const operandExpr = (o: AggregateOperand): string =>
    o.source === 'calculated' ? `(${calcExpr(o)})` : metricExpr(o)
  const expr = b.source === 'calculated' ? calcExpr(b) : `${operandExpr(b.left)} ${b.op} ${operandExpr(b.right)}`
  return { source: 'formula', expr, operands }
}

export function blockToManualDraft(block: PersistedBlock): { source: 'supermetrics' | 'triplewhale' | 'formula'; draft: ManualDraft } {
  const { name, format, binding } = block
  if (binding.source === 'supermetrics' || binding.source === 'triplewhale') {
    return { source: binding.source, draft: { kind: 'leaf', name, format, leaf: leafToDraft(binding) } }
  }
  if (binding.source === 'formula') {
    return { source: 'formula', draft: { kind: 'formula', name, format, formula: formulaToDraft(binding) } }
  }
  return { source: 'formula', draft: { kind: 'formula', name, format, formula: bindingToFormulaDraft(binding) } }
}
```

- [ ] **Step 4: Run to verify build-config tests pass**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: `ok`.

- [ ] **Step 5: Write failing config-mutations test**

Create `components/dashboard/config-mutations.test.ts`:
```ts
// Run: npx tsx components/dashboard/config-mutations.test.ts
import { strict as assert } from 'node:assert'
import { updateBlock } from './config-mutations'
import type { DashboardConfig } from '@/lib/dashboard/types'

const cfg: DashboardConfig = {
  defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' },
  blocks: [
    { id: 'a', name: 'Old', format: 'number', range: { dateRange: 'last_7_days', compareRange: null }, layout: { w: 2 },
      binding: { source: 'triplewhale', metric: 'ad_spend' } },
    { id: 'b', name: 'Other', format: 'currency', range: null, binding: { source: 'triplewhale', metric: 'revenue' } },
  ],
}

// updates name/format/binding; preserves id, range, layout; leaves other blocks intact
const next = updateBlock(cfg, 'a', { name: 'New', format: 'currency', range: null, binding: { source: 'triplewhale', metric: 'revenue' } })
const a = next.blocks.find((x) => x.id === 'a')!
assert.equal(a.name, 'New')
assert.equal(a.format, 'currency')
assert.equal(a.binding.source === 'triplewhale' && a.binding.metric, 'revenue')
assert.deepEqual(a.range, { dateRange: 'last_7_days', compareRange: null }) // preserved
assert.deepEqual(a.layout, { w: 2 })                                        // preserved
assert.equal(next.blocks.find((x) => x.id === 'b')!.name, 'Other')         // untouched
console.log('ok')
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx tsx components/dashboard/config-mutations.test.ts`
Expected: FAIL (`updateBlock` not exported).

- [ ] **Step 7: Implement `updateBlock`**

In `components/dashboard/config-mutations.ts`, add:
```ts
/** Replace a block's name/format/binding by id, preserving its id, range, and layout. */
export function updateBlock(
  config: DashboardConfig,
  blockId: string,
  patch: Omit<BlockConfig, 'id'>,
): DashboardConfig {
  return {
    ...config,
    blocks: config.blocks.map((b) =>
      b.id === blockId ? { ...b, name: patch.name, format: patch.format, binding: patch.binding } : b,
    ),
  }
}
```
Add `BlockConfig` to the existing `./types` import (the file currently imports `DashboardConfig, PersistedBlock`).

- [ ] **Step 8: Run to verify config-mutations test passes**

Run: `npx tsx components/dashboard/config-mutations.test.ts`
Expected: `ok`.

- [ ] **Step 9: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git commit -m "feat(dashboard): reverse binding->draft mappers + updateBlock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts components/dashboard/config-mutations.ts components/dashboard/config-mutations.test.ts
```

---

### Task 3: Edit UI (pre-seed builder, dialog edit mode, kebab entry)

Wire the reverse mappers into a real edit flow.

**Files:**
- Modify: `components/dashboard/add-block/manual-block-form.tsx` (`initial?` draft)
- Modify: `components/dashboard/add-block/add-block-dialog.tsx` (`editing?` mode → `updateBlock`)
- Modify: `components/dashboard/metric-block.tsx` ("Edit metric…" kebab + dialog instance)

**Interfaces:**
- Consumes: `blockToManualDraft`, `updateBlock` (Task 2); `ManualDraft` type.
- Produces: `ManualBlockForm` accepts `initial?: ManualDraft`; `AddBlockDialog` accepts `editing?: PersistedBlock`.

- [ ] **Step 1: Pre-seed `ManualBlockForm` from an initial draft**

In `components/dashboard/add-block/manual-block-form.tsx`: add `initial?: ManualDraft` to the props, and seed the `useState` initializers from it. Replace the props destructure + the four state lines:
```tsx
export function ManualBlockForm({
  source,
  slug,
  pending,
  existingBlocks,
  initial,
  onConfirm,
  onBack,
}: {
  source: 'supermetrics' | 'triplewhale' | 'formula'
  slug: string
  pending: boolean
  existingBlocks: { id: string; name: string }[]
  initial?: ManualDraft
  onConfirm: (cfg: Omit<BlockConfig, 'id'>) => void
  onBack: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [format, setFormat] = useState<MetricFormat>(initial?.format ?? 'number')
  const [leaf, setLeaf] = useState<LeafDraft>(() =>
    initial?.kind === 'leaf' ? initial.leaf : (source === 'formula' ? { source: 'supermetrics', dsId: '', metricField: '', account: '' } : emptyLeaf(source)),
  )
  const [formula, setFormula] = useState<FormulaDraft>(() =>
    initial?.kind === 'formula' ? initial.formula : { source: 'formula', expr: '', operands: {} },
  )
```
Add `ManualDraft` to the existing `./build-config` import (it already imports `type LeafDraft, type FormulaDraft`).

- [ ] **Step 2: Add `editing` mode to `add-block-dialog.tsx`**

In `components/dashboard/add-block/add-block-dialog.tsx`:

Extend imports:
```ts
import { addBlock, updateBlock } from '../config-mutations'
import { blockToManualDraft } from './build-config'
import type { DashboardConfig, BlockConfig, PersistedBlock } from '@/lib/dashboard/types'
```
Add `editing` to the props and derive the seed:
```tsx
export function AddBlockDialog({ slug, config, onClose, onAdded, editing }: { slug: string; config: DashboardConfig | null; onClose: () => void; onAdded?: (b: { id: string; name: string }) => void; editing?: PersistedBlock }) {
  const router = useRouter()
  const editSeed = editing ? blockToManualDraft(editing) : null
  const [step, setStep] = useState<'pick' | 'mode' | 'prompt' | 'preview' | 'build'>(editing ? 'build' : 'pick')
  const [source, setSource] = useState<Source>(editSeed?.source ?? 'supermetrics')
```
Replace `confirmManual` so it updates when editing (and only signals `onAdded` for new blocks):
```tsx
  function confirmManual(cfg: Omit<BlockConfig, 'id'>) {
    setError(null)
    startTransition(async () => {
      const next = editing
        ? updateBlock(config ?? DEFAULT_CONFIG, editing.id, cfg)
        : addBlock(config ?? DEFAULT_CONFIG, { id: crypto.randomUUID(), ...cfg })
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) { setError(res.error); return }
      if (!editing) {
        const added = next.blocks[next.blocks.length - 1]
        onAdded?.({ id: added.id, name: added.name })
      }
      onClose(); router.refresh()
    })
  }
```
Update the dialog title and the build-step `ManualBlockForm` usage. The title line:
```tsx
          <p className="text-sm font-bold text-white">{editing ? 'Edit block' : 'Add block'}</p>
```
The build step:
```tsx
        {step === 'build' && (
          <>
            <ManualBlockForm
              source={source}
              slug={slug}
              pending={pending}
              existingBlocks={(config?.blocks ?? []).filter((b) => b.id !== editing?.id).map((b) => ({ id: b.id, name: b.name }))}
              initial={editSeed?.draft}
              onConfirm={confirmManual}
              onBack={editing ? onClose : () => setStep('mode')}
            />
            {error && <p className="mt-2 text-xs text-[#FF6666]">Error: {error}</p>}
          </>
        )}
```
(`existingBlocks` now also excludes the block being edited, so a formula can't reference itself.)

- [ ] **Step 3: Add the "Edit metric…" kebab entry in `metric-block.tsx`**

In `components/dashboard/metric-block.tsx`:

Add the import:
```ts
import { AddBlockDialog } from './add-block/add-block-dialog'
```
In `MetricBlockShell`, add open-state:
```tsx
  const [editOpen, setEditOpen] = useState(false)
```
Render the edit dialog (place it just before the component's closing — e.g. wrap the existing return in a fragment, or add as a sibling inside the top-level element). Add right after the opening of the returned `BlockShell`/root so it's always mounted when open:
```tsx
      {editOpen && (
        <AddBlockDialog slug={slug} config={config} editing={block} onClose={() => setEditOpen(false)} />
      )}
```
(Put this inside the existing returned JSX tree — e.g. as the first child of the `BlockShell` wrapper. It renders a fixed-position modal, so placement in the tree doesn't affect layout.)

Add the menu item in the `view === 'menu'` block of `BlockShell` — but `BlockShell` is a separate component that doesn't know about `setEditOpen`. Pass an `onEdit` prop through `BlockShell` (mirroring how `confirmDelete` etc. are passed). In `MetricBlockShell`'s `BlockShell` usage add `onEdit={() => { setMenuOpen(false); setEditOpen(true) }}`, add `onEdit: () => void` to `BlockShell`'s props/type, and render the menu button as the first item in `view === 'menu'`:
```tsx
                <button
                  className="px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.06]"
                  onClick={onEdit}
                >
                  Edit metric…
                </button>
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit` → clean.
Run: `npm run build` → succeeds.

- [ ] **Step 5: Manual smoke (note for executor)**

On `/dashboard/<slug>/configurable-dashboard`: open a block's kebab → "Edit metric…" → the builder opens pre-filled (a leaf block in the leaf builder; ROAS/revenue aggregate blocks open in the **formula** builder with the converted expression, e.g. `@m0 / @m1` or `(@m0 + -1 * @m1) / @m2`); change something → Save → the block re-renders with the new value, id/range/layout preserved. (Manual; not automated.)

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(dashboard): edit a block (pre-seeded builder + Edit kebab)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- components/dashboard/add-block/manual-block-form.tsx components/dashboard/add-block/add-block-dialog.tsx components/dashboard/metric-block.tsx
```

---

## Self-Review

- **Spec coverage:** unary minus (T1); leafToDraft/formulaToDraft/bindingToFormulaDraft/blockToManualDraft + updateBlock (T2); ManualBlockForm initial + dialog editing + kebab (T3). ✅
- **Placeholder scan:** none — full code in every step.
- **Type consistency:** `Ast` `neg` node used in both parse + evaluate; reverse mappers' signatures match the tests; `blockToManualDraft` returns `{ source, draft }` consumed by the dialog as `editSeed.source` / `editSeed.draft`; `updateBlock(config, id, Omit<BlockConfig,'id'>)` matches the dialog call; `ManualBlockForm` `initial?: ManualDraft` matches `editSeed.draft`.
- **Converter validity:** every converter path emits a `parse()`-valid expression (verified by tests that `parse()` the output, incl. negative coefficients — which is why Task 1 lands first).
- **Compile-green seams:** T1 additive (new Ast node + handling). T2 additive (new pure exports). T3 wires them into the UI; `tsc`+build gate.
- **Self-reference guard:** the edit dialog excludes the edited block from `existingBlocks`, so a formula can't reference itself.

## Execution Handoff

Plan saved. Recommended: **Subagent-Driven Development** — fresh subagent per task, review between tasks. Tasks are sequential (T2 depends on T1; T3 on T2).
