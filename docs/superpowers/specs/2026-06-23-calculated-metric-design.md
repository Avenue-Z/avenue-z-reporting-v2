# Weighted-Sum Calculated Metric — Design

**Date:** 2026-06-23
**Status:** Approved (pending spec review)
**Relates to:** the manual query builder and the binary aggregate
(`AggregateBinding`). This adds a calculated (weighted-sum) metric and lets it
be a ÷ operand, unblocking the Kind Patches "Final Calculated Site Revenue"
and exact "ROAS = (rev − tax) ÷ spend".

## Goal

Express two Kind Patches metrics the current binary aggregate cannot:

1. **Final Calculated Site Revenue** — a weighted sum of ~7 shipping-country
   revenue leaves with per-country tax coefficients and Rest-of-World × 0.8.
2. **ROAS = (rev − tax) ÷ spend** — a calculated metric `(rev − tax)` divided
   by a TripleWhale spend leaf.

Both reduce to one new primitive: a **weighted sum of leaves**
(`Σ coefficientᵢ × leafᵢ`, signed coefficients), plus the ability to use that
calculated metric as an operand of the existing binary aggregate.

## Decisions (confirmed with user)

1. Primitive = **signed-coefficient weighted sum of leaves**. No standalone
   constant term, no per-term operator, terms are leaves only (not nested
   calcs/aggregates). `(rev − tax)` = `[+1×rev, −1×tax]`; ROW × 0.8 via signed
   coefficients or an explicit ROW leaf × 0.8.
2. ROAS needs a **calculated metric as a ÷ operand** → widen `AggregateBinding`
   operands to leaf-or-calculated (one level of nesting; operands are not
   themselves aggregates).
3. **Manual builder only** for v1. The NL/"Describe with AI" path stays binary
   leaf-aggregate and does not emit calculated bindings.
4. YAGNI on general formulas (arbitrary nesting / precedence) — revisit later
   if needed.

## Data model — `lib/dashboard/types.ts` (MODIFY)

```ts
export interface CalculatedBinding {
  source: 'calculated'
  terms: { coefficient: number; leaf: LeafBinding }[] // value = Σ coefficientᵢ × leafᵢ
}

export interface AggregateBinding {
  source: 'aggregate'
  left: LeafBinding | CalculatedBinding   // widened from LeafBinding
  op: '+' | '-' | '*' | '/'
  right: LeafBinding | CalculatedBinding   // widened from LeafBinding
}

export type Binding = LeafBinding | CalculatedBinding | AggregateBinding
```

`AggregateOperand = LeafBinding | CalculatedBinding` is the operand type. A
calculated binding requires `terms.length >= 1`.

## Resolution — `lib/dashboard/resolve.ts`, `aggregate.ts`, `registry.ts` (MODIFY)

- **`resolveCalculated(binding, resolveLeaf, ctx, dateRange, compareRange): Promise<LeafAttempt>`**
  (in `aggregate.ts`, beside `resolveAggregate`):
  - Resolve all `terms[].leaf` concurrently via the leaf attempter.
  - If any term fails → `{ ok: false, error: worseError(...) }` (reuse the
    existing `worseError`).
  - `value = Σ coefficientᵢ × valueᵢ`.
  - `prevValue = Σ coefficientᵢ × prevValueᵢ` **iff every term has a
    `prevValue`** (comparison active); otherwise `undefined`. Mirrors the
    aggregate's "prev present iff all operands have prev" rule.
- **Aggregate operands become leaf-or-calculated.** Introduce an operand
  resolver that dispatches: `source === 'calculated'` → `resolveCalculated`,
  else the leaf attempter. `resolveAggregate` resolves `left`/`right` through
  this operand resolver (still in parallel), then applies `op`. Divide-by-zero
  already returns `no-data` (`applyOp` returns `null`).
- **`resolveBlock`** routes `binding.source === 'calculated'` →
  `resolveCalculated`, alongside the existing `'aggregate'` branch; everything
  else stays `attemptLeaf`.
- `registry.ts` `resolveLeaf` is unchanged (still leaf-only); calculated and
  aggregate resolution sit above it and call it for each leaf.

## Persistence — `lib/dashboard/persistence.ts` (MODIFY)

- New `parseCalculated(v, path)`: validates `source === 'calculated'`, a
  non-empty `terms` array, each entry `{ coefficient: number (finite),
  leaf: <parseLeaf> }`. Errors are specific (`${path}.terms[i].coefficient:
  expected number`, etc.).
- `parseBinding` gains a `'calculated'` branch (→ `parseCalculated`) and its
  `'aggregate'` branch parses `left`/`right` as **operand** (leaf-or-calculated)
  via a small `parseOperand` helper, instead of `parseLeaf` only.
- New shape only — no migration. Existing binary aggregates (leaf operands)
  still parse unchanged.

## Draft → binding — `components/dashboard/add-block/build-config.ts` (MODIFY)

```ts
export type CalculatedDraft = {
  source: 'calculated'
  terms: { coefficient: string; leaf: LeafDraft }[] // coefficient is the raw input; parsed at build
}
export type OperandDraft =
  | { kind: 'leaf'; leaf: LeafDraft }
  | { kind: 'calculated'; calc: CalculatedDraft }
```

- `ManualDraft` gains a `'calculated'` kind (top-level Final-Revenue block) and
  the `'aggregate'` kind's `left`/`right` become `OperandDraft`.
- `calculatedToBinding(c)`: keep terms whose leaf is complete
  (`isLeafComplete`) and whose `coefficient` parses to a finite number; map to
  `{ coefficient: Number(coeff), leaf: leafToBinding(leaf) }`. Empty/blank
  coefficient defaults to `1`.
- `operandToBinding(o)`: leaf → `leafToBinding`; calculated →
  `calculatedToBinding`.
- `buildBlockConfig` handles the `'calculated'` kind and aggregate operands via
  `operandToBinding`.
- `isDraftComplete`: a calculated draft is complete iff it has ≥1 complete term;
  an aggregate is complete iff both operands are complete.

## UI — `components/dashboard/add-block/` (MODIFY + NEW)

- **NEW `calculated-builder.tsx`** — the weighted-sum editor: rows of
  **[coefficient number input] × [`LeafBuilder`]**, a remove-row ✕, and an
  "Add term" button. Reuses `LeafBuilder`, so each term gets the full
  metric/account/**multi-value-filter** UI for free. Props mirror the existing
  builder pattern (`value: CalculatedDraft`, `onChange`, `slug`).
- **`manual-block-form.tsx`** (MODIFY):
  - Add a top-level **"Calculated (weighted sum)"** mode (Final Revenue) that
    renders `CalculatedBuilder`.
  - The aggregate `Operand` component's source selector gains a third option,
    **"Calculated"**, which renders `CalculatedBuilder` for that operand
    (ROAS = ÷ with a calculated left operand). Leaf operands behave as today.
- **`add-block-dialog.tsx`** (MODIFY): add `'calculated'` to the manual source
  list (`SOURCES` / mode routing) so a standalone calculated block can be built.
  The NL/"Describe with AI" path is unchanged and not offered for calculated.

## Scope / out of scope (v1)

- **In:** standalone calculated (weighted-sum) block; calculated as a ÷ (or any
  op) operand of the binary aggregate; manual builder; persistence; resolution;
  tests.
- **Out:** NL generation of calculated bindings (`aggregate-resolve.ts`,
  `block-preview-card.tsx`/`describeAggregate` operate on the NL
  `AggregateProposal` type and are untouched); nested calc-in-calc; per-term
  operators; constants-as-terms; arbitrary formula parsing.

## Error / empty / loading states

- Calculated block with zero complete terms → incomplete (cannot save;
  `isDraftComplete` false). Persistence rejects empty `terms`.
- Any term leaf fails at resolve → the calculated metric fails with the worst
  error (`worseError`); the block shows that error state (existing UI).
- ÷ by zero (e.g. spend = 0) → `no-data` (existing aggregate behavior).
- Per-leaf loading/empty/disconnected states are the existing `LeafBuilder` /
  resolver behaviors, unchanged.

## Testing

Pure-unit (`tsx` + `node:assert`), per repo convention:
- `resolveCalculated`: weighted sum incl. negative coefficients; single term;
  prev present iff all terms have prev; one-term-fails → worst error.
- aggregate-with-calculated-operand: `(rev − tax) ÷ spend` resolves; div-by-zero
  → no-data.
- `parseBinding`/`parseCalculated`: valid terms; empty-terms reject; non-number
  coefficient reject; calculated-as-operand round-trips; legacy leaf aggregate
  still parses.
- `buildBlockConfig`/`calculatedToBinding`/`operandToBinding`: coefficient
  parsing (incl. blank→1), incomplete-term drop, leaf vs calculated operands.
UI (`calculated-builder`, `manual-block-form`) verified by `tsc --noEmit` +
`npm run build`.

## File structure

```
lib/dashboard/
  types.ts                       # MODIFY: + CalculatedBinding; widen AggregateBinding operands; Binding union
  aggregate.ts                   # MODIFY: + resolveCalculated; operand resolver for aggregate
  resolve.ts                     # MODIFY: route source:'calculated'
  persistence.ts                 # MODIFY: parseCalculated + parseOperand; parseBinding branches
components/dashboard/add-block/
  build-config.ts                # MODIFY: CalculatedDraft/OperandDraft; calculatedToBinding/operandToBinding; ManualDraft + buildBlockConfig + isDraftComplete
  calculated-builder.tsx         # NEW: weighted-sum editor (coefficient × LeafBuilder rows)
  manual-block-form.tsx          # MODIFY: calculated mode + calculated operand option
  add-block-dialog.tsx           # MODIFY: + 'calculated' manual source
```

## Global constraints

- TypeScript strict; no `any` in new/changed code.
- All SM/TW calls stay server-side; calculated/aggregate resolution runs
  server-side and calls the existing leaf resolvers (already cached/parallel).
- Reuse: `LeafBuilder`, `leafToBinding`, `worseError`, `applyOp`/`resolveAggregate`
  structure, the existing leaf resolvers and result caching.
- Backward compatible: existing leaf and binary-leaf-aggregate configs parse and
  resolve unchanged. No data migration.
- No new npm dependency.
