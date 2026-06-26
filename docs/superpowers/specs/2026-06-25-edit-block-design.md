# Edit a Block — Design

**Date:** 2026-06-25
**Status:** Approved (pending spec review)
**Branch:** `feat/metric-references-rnd` (or a child off it)
**Relates to:** the formula-metrics feature and the add-block builder. Adds the
ability to re-author an existing block in place (name, format, and binding),
including legacy aggregate/calculated blocks (migrated to formulas on edit).

## Goal

Let a user edit an existing block instead of delete-and-recreate: change its
**name**, **format**, and **binding** (metric / formula), with the block's
**id, per-block range override, and layout preserved**.

## Decisions (confirmed with user)

1. **Editor by type (Option 1):** leaf blocks edit in the **leaf builder**;
   formula/aggregate/calculated blocks edit in the **formula builder**. Editing
   a legacy aggregate/calculated block **converts it to an equivalent formula**
   and **saves it as a formula** (migration on edit). No dedicated
   aggregate/calculated builder is revived.
2. **Add unary minus to the formula engine** so negatives are first-class:
   `-1 * @b`, `-@a`, and negative coefficients all parse. This removes the
   prior limitation and makes the converter trivial.
3. **No type-switching in edit** (a leaf stays a leaf; to turn a leaf into a
   formula, delete + recreate). The per-block **range** is still edited via the
   existing "Set range" menu, not this form.

## Components

### 1. Unary minus in the formula engine — `lib/dashboard/formula/{parse,evaluate}.ts` (MODIFY)
- `Ast` gains `{ n: 'neg'; operand: Ast }`.
- `parseFactor` accepts an optional leading `-`: when the next token is op `-`
  at factor position, consume it and return `{ n: 'neg', operand: parseFactor() }`.
  (Binary `-` is unchanged — it's still consumed by `parseExpr`'s loop between
  operands; unary `-` only triggers where a *factor* is expected.)
- `evaluate`: `case 'neg': return -evaluate(ast.operand, resolve)`.
- This makes `-1 * @b`, `-@a`, `@a + -1 * @b`, `@a - -@b` all parse; malformed
  cases (`@a +`, `@a @b`, unbalanced parens) still error exactly as before.

### 2. Reverse mappers + converter — `components/dashboard/add-block/build-config.ts` (MODIFY)
Add the inverse of the existing `*ToBinding` functions:
- `leafToDraft(b: LeafBinding): LeafDraft` — sm/tw; filters back to `{ column, values }`.
- `formulaToDraft(b: FormulaBinding): FormulaDraft` — `expr` passthrough;
  operands `ref`→`{ kind:'ref', blockId }`, `metric`→`{ kind:'metric', leaf: leafToDraft }`.
- `bindingToFormulaDraft(b: AggregateBinding | CalculatedBinding): FormulaDraft`
  — the converter:
  - **calculated** `{ terms:[{coefficient, leaf}] }` → operands `@t0…@tN` (each a
    `metric` from its leaf); `expr` = the terms joined by ` + ` as
    `${coefficient} * @tK` (coefficient 1 simplified to `@tK`; negatives like
    `-1 * @tK` now parse thanks to unary minus).
  - **aggregate** `{ op, left, right }` → `@a <op> @b`; a leaf operand becomes a
    `metric` operand; a **calculated** operand is flattened to a parenthesized
    sub-expression with its own operands, e.g. `(rev−tax)/spend` →
    `(@a - @b) / @c`. Operand keys are unique across the whole expression.
- `blockToManualDraft(block: PersistedBlock): { source: 'supermetrics' | 'triplewhale' | 'formula'; draft: ManualDraft }`
  — top-level dispatch used by the edit dialog:
  - leaf → `{ source: leaf.source, draft: { kind:'leaf', name, format, leaf: leafToDraft } }`
  - formula → `{ source:'formula', draft: { kind:'formula', name, format, formula: formulaToDraft } }`
  - aggregate/calculated → `{ source:'formula', draft: { kind:'formula', name, format, formula: bindingToFormulaDraft } }`

### 3. `updateBlock` — `components/dashboard/config-mutations.ts` (MODIFY)
```ts
export function updateBlock(config: DashboardConfig, blockId: string, patch: Omit<BlockConfig, 'id'>): DashboardConfig
```
Replace the matching block, **preserving `id`, `range`, and `layout`**, updating
`name`/`format`/`binding` from `patch`. (`range`/`layout` come from the existing
block, not the patch.)

### 4. Pre-seed the builder — `components/dashboard/add-block/manual-block-form.tsx` (MODIFY)
`ManualBlockForm` gains an optional `initial?: ManualDraft`. Its `useState`
initializers read from `initial` when present (name, format, and the leaf or
formula draft for the matching kind); otherwise empty as today.

### 5. Edit mode in the dialog — `components/dashboard/add-block/add-block-dialog.tsx` (MODIFY)
`AddBlockDialog` gains an optional `editing?: PersistedBlock`. When set:
- Start at the `build` step (skip pick/mode/prompt).
- Derive `{ source, draft }` via `blockToManualDraft(editing)` and pass `source`
  + `initial={draft}` to `ManualBlockForm`.
- `confirmManual(cfg)` calls `updateBlock(config, editing.id, cfg)` →
  `saveDashboardConfig` → `router.refresh()` → `onClose()`. **No** optimistic-add
  signal (the value changes; the edited island re-resolves and streams its new
  value).
- Title reads "Edit block" when editing.

### 6. Kebab entry — `components/dashboard/metric-block.tsx` (MODIFY)
`MetricBlockShell`'s menu gains **"Edit metric…"** (above "Set range"). It opens
an `AddBlockDialog` instance with `editing={block}` (the shell has `block`,
`config`, `slug`). Local `editing` open-state in the shell; closes on save/cancel.

## Data flow
Kebab "Edit metric…" → dialog opens pre-seeded from the block's binding (legacy
agg/calc converted to a formula draft) → user edits → save replaces the block in
place (id/range/layout preserved) → `router.refresh()` re-resolves only what
changed (warm cache for unchanged operands).

## Out of scope (v1)
- Switching a block's editor type (leaf↔formula) during edit.
- Editing the per-block range in this form (stays in "Set range").
- Editing via the NL/"Describe with AI" path (edit is the manual builder,
  pre-seeded).

## Error / edge handling
- A binding the converter can't represent (shouldn't happen for current types)
  → fall back gracefully; the converter handles leaf/formula/aggregate/calculated
  exhaustively.
- Save failure → existing error display in the dialog; the block is unchanged.
- Editing preserves a per-block range override; if the user changed the metric
  such that the override range no longer makes sense, that's their call (range
  editing is separate).

## Testing
Pure-unit (`tsx` + `node:assert`):
- **Engine:** `parse('-@a')`, `parse('-1 * @b')`, `parse('@a + -1 * @b')`,
  `parse('@a - -@b')` produce correct ASTs; `evaluate` of negation; malformed
  cases still throw.
- **Reverse mappers:** `leafToDraft`/`formulaToDraft` round-trip
  (`draft → binding → draft` stable); `bindingToFormulaDraft` for an aggregate of
  two leaves (`@a / @b`), for `(rev−tax)/spend` (`(@a - @b) / @c`), and for a
  standalone calculated weighted-sum (incl. a negative coefficient producing an
  expr that `parse()` accepts); `blockToManualDraft` dispatch + the produced
  formula `parse()`s and its operand keys match.
- **`updateBlock`:** preserves id/range/layout; updates name/format/binding.
UI (dialog edit mode, kebab) verified by `tsc --noEmit` + `npm run build` + manual.

## File structure
```
lib/dashboard/formula/
  parse.ts                 # MODIFY: unary-minus (neg node)
  parse.test.ts            # MODIFY
  evaluate.ts              # MODIFY: eval neg
  evaluate.test.ts         # MODIFY
components/dashboard/
  config-mutations.ts      # MODIFY: + updateBlock
  add-block/
    build-config.ts        # MODIFY: leafToDraft, formulaToDraft, bindingToFormulaDraft, blockToManualDraft
    build-config.test.ts   # MODIFY
    manual-block-form.tsx  # MODIFY: initial? draft seeding
    add-block-dialog.tsx   # MODIFY: editing? mode → updateBlock
  metric-block.tsx         # MODIFY: "Edit metric…" kebab entry + dialog instance
```

## Global constraints
- TypeScript strict; no `any` in new/changed code.
- Unary minus is additive to the parser — existing valid formulas and all error
  cases behave exactly as before.
- Edit preserves block `id`, `range`, and `layout`; only name/format/binding change.
- Saves use the warm path (`saveDashboardConfig` + `router.refresh()`, no
  `revalidatePath`).
- Back-compat: existing leaf/formula/aggregate/calculated **bindings** still
  resolve; editing aggregate/calculated migrates them to formula bindings.
- No new npm dependency.
```
