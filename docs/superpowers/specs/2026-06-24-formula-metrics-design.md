# Formula Metrics (with live references) — Design

**Date:** 2026-06-24
**Status:** Approved (pending spec review)
**Branch:** `feat/metric-references-rnd` (off `feat/configurable-dashboard-rnd`)
**Relates to / supersedes:** the weighted-sum `CalculatedBinding` and binary
`AggregateBinding` builders. Those bindings keep resolving (back-compat) but are
no longer the authoring path for composition.

## Goal

Let a metric be a **formula** — full arithmetic (`+ − × ÷`, parentheses,
precedence) over operands that are any mix of:

1. **References to existing dashboard blocks** (live, by block id),
2. **Newly-defined raw metrics** (inline SM/TW leaf pulls), and
3. **Numeric literal constants** (typed directly; no data source needed).

Examples: `([Total Sales] − [Tax]) / [TW Spend]`, `[US Rev] + [UK Rev] + 0.8 * [ROW Rev]`.

**Reuse** means already-pulled data is served from the existing query cache
(keyed by query + range) — no re-pull. References make this explicit: a formula
points at an existing block and reuses its exact value.

## Decisions (confirmed with user)

1. **Live references**, by block id. Editing the referenced block propagates;
   deleting it makes the referrer error.
2. A reference resolves the referenced block's binding at the **referencing
   formula's effective range/comparison** (ignores the referenced block's own
   per-block range override). Coherent arithmetic; matching ranges hit the same
   cache.
3. Operands = existing-block refs **and** new inline leaves **and** numeric
   literals.
4. Reuse = ride the existing `unstable_cache` (query+range). No bespoke reuse
   layer.
5. **Token-in-text** authoring (vs variable-mapping).
6. **Supersede** the calculated/aggregate *builders*; keep their bindings
   resolvable for already-saved blocks.
7. `÷ 0`, dangling refs, and cycles all resolve to graceful error states (no
   crash).

## Model — `lib/dashboard/types.ts` (MODIFY)

```ts
/** A formula operand referenced from the expression by a stable key. */
export type FormulaOperand =
  | { kind: 'ref'; blockId: string }       // live reference to another block
  | { kind: 'metric'; leaf: LeafBinding }   // a freshly-defined SM/TW pull

export interface FormulaBinding {
  source: 'formula'
  // Expression with stable operand placeholders, e.g. "(@a - @b) / @c" or
  // "@a + @b + 0.8 * @c". Numeric literals are constants. Operators: + - * / ( ).
  expr: string
  // Placeholder key -> operand. Keys are stable ids (NOT block names), so
  // renaming a referenced block never breaks the formula.
  operands: Record<string, FormulaOperand>
}

export type Binding = LeafBinding | CalculatedBinding | AggregateBinding | FormulaBinding
```

Constants are literals inside `expr`, not operands. `@<key>` placeholders map to
`operands[key]`.

## Expression engine — `lib/dashboard/formula/` (NEW, pure)

A small, dependency-free, fully unit-tested module:
- `tokenize(expr)` → tokens: number literals, `+ - * / ( )`, and `@key`
  operand refs. Rejects unknown characters.
- `parse(tokens)` → AST honoring precedence (`* /` over `+ -`) and parentheses.
  Surfaces a clear error on malformed input (unbalanced parens, dangling
  operator, unknown `@key`).
- `evaluate(ast, resolveOperandValue)` → number, where `resolveOperandValue(key)`
  returns the resolved operand value. Division by zero → throws a sentinel the
  resolver maps to `no-data`.
- `operandKeys(expr)` → the set of `@key`s used (for validation + cycle/ref
  discovery).

This module knows nothing about blocks or data sources — it operates on the
expression and a value-lookup callback. That keeps it trivially testable.

## Resolution — `lib/dashboard/resolve.ts`, `formula-resolve.ts` (NEW), `registry.ts`

- `resolveBlock` gains access to the **sibling blocks** so a formula can look up
  its `ref` targets. The new `deps` carry an **optional** `blocksById:
  Map<string, BlockConfig>` plus an optional `visited: Set<string>` for cycle
  detection — optional so existing `resolveBlock` callers (NL preview,
  glean-chat) keep compiling unchanged. The configurable-dashboard page builds
  `blocksById` once and passes it in. A `formula` resolved without `blocksById`
  (no caller provides refs) errors on any `ref` operand — acceptable since only
  the dashboard authors formulas in v1.
- `resolveFormula(binding, range, deps)`:
  - `parse(binding.expr)`.
  - Resolve each operand **at the formula's range** (the rule above), via the
    existing cached path:
    - `metric` → resolve the leaf (`resolveLeaf`) — cache-keyed by query+range.
    - `ref` → look up `blocksById[blockId]`; missing → error
      `'invalid-metric'` ("references a removed metric"); else resolve **that
      block's binding** at the formula's range, threading `visited` (with the
      current block id added) — cache reuse is automatic when ranges match.
  - **Cycle detection:** if a `ref` target is already in `visited` → error
    (`'error'`, "circular reference"). Self-reference is the depth-1 case.
  - `evaluate` the AST; `÷ 0` → `'no-data'`; any operand error → propagate
    (worst error via `worseError`).
  - `prevValue` (for the streamed delta) follows the same path at the compare
    range — `prevValue` present iff every operand has a prev.
- `resolveBlock` routes `binding.source === 'formula'` → `resolveFormula`.
  `registry.resolveLeaf` is unchanged (leaves only).

### Interaction with progressive streaming (Feature C)
Unchanged shape: the page resolves a formula block's value once (shared
`valuePromise`) and its delta separately; both run through `resolveFormula`.
Operand resolution rides the same `unstable_cache`, so a formula referencing an
on-screen block reuses that block's already-streamed value.

## Persistence — `lib/dashboard/persistence.ts` (MODIFY)

`parseBinding` gains a `'formula'` branch → `parseFormula`:
- `expr` is a non-empty string; it must `tokenize`/`parse` without error.
- `operands` is an object whose keys exactly match `operandKeys(expr)` (no
  missing, no extra); each value is a valid `ref` (`blockId` non-empty string)
  or `metric` (`leaf` via `parseLeaf`).
- Numeric literals are validated by the parser (finite).
Existing `leaf`/`calculated`/`aggregate` parsing is unchanged (back-compat).

## UI — `components/dashboard/add-block/` (MODIFY + NEW)

- **NEW `formula-builder.tsx`** — the token-in-text editor:
  - A formula input where operands render as **tokens** showing the operand's
    name; operators, parentheses, and numeric constants are typed.
  - **"+ Add metric"** inserts a token: choose an **existing block** (→ `ref`,
    excludes the current block to block self-ref) or **"New metric"** (→ the
    existing `LeafBuilder`, producing a `metric` operand).
  - Live validation: parse the draft, show parse errors inline; flag unknown/
    empty tokens; disable save until it parses.
- **`manual-block-form.tsx`** (MODIFY) — replace the `calculated` and
  `aggregate` modes with a single **`formula`** mode rendering `FormulaBuilder`.
- **`add-block-dialog.tsx`** (MODIFY) — `SOURCES` replaces "Calculated (weighted
  sum)" and "Aggregate (formula)" with one **"Formula"** entry (manual-only; the
  NL path is out of scope for v1).
- **`build-config.ts`** (MODIFY) — `FormulaDraft` + `formulaToBinding`
  (assemble `expr` + `operands`, dropping incomplete operands), and
  `isDraftComplete` for formulas (parses + every token complete).

## Cycles, dangling, deletion
- **Cycle** (incl. self): caught at resolve via `visited` → error card
  ("circular reference"). The picker excludes the current block; a save that
  would create a cycle is rejected by validation.
- **Dangling** (ref target deleted): operand resolution returns
  `'invalid-metric'` → the formula shows the graceful error state.
- **Deleting a referenced block:** the delete flow warns if other blocks
  reference it (best-effort; the referrer still degrades gracefully if deleted
  anyway).

## Out of scope (v1)
- NL/"Describe with AI" generation of formulas (manual builder only).
- Cross-dashboard references.
- New authoring via the calculated/aggregate builders (removed; bindings still
  resolve).
- Functions/aggregations beyond `+ − × ÷` (e.g. `min`, `sum()`), unary minus is
  supported only as `0 - x` unless trivially addable.

## Testing
- **Expression engine** (pure, exhaustive): tokenize/parse/evaluate — precedence,
  parentheses, nested, `÷ 0` sentinel, malformed (unbalanced parens, dangling
  operator, unknown `@key`), `operandKeys`.
- **`resolveFormula`** (fake operand resolver): const-only, ref + metric mix,
  prev-iff-all, worst-error propagation, dangling ref → invalid-metric, cycle →
  error, self-ref → error.
- **`parseFormula`**: valid; operand/placeholder mismatch rejected; bad leaf
  rejected; non-parseable expr rejected; round-trip.
- **`build-config`**: `formulaToBinding` (incomplete operand drop), completeness.
UI verified by `tsc --noEmit` + `npm run build` + manual, per repo convention.

## File structure
```
lib/dashboard/
  types.ts                 # MODIFY: + FormulaOperand, FormulaBinding, Binding union
  formula/
    parse.ts               # NEW: tokenize + parse + operandKeys (pure)
    evaluate.ts            # NEW: evaluate(ast, resolveOperandValue) (pure)
    parse.test.ts          # NEW
    evaluate.test.ts       # NEW
  formula-resolve.ts       # NEW: resolveFormula (refs, leaves, cycle detection)
  formula-resolve.test.ts  # NEW
  resolve.ts               # MODIFY: blocksById + visited; route 'formula'
  persistence.ts           # MODIFY: parseFormula
  persistence.test.ts      # MODIFY
components/dashboard/
  add-block/
    formula-builder.tsx    # NEW: token-in-text editor
    build-config.ts        # MODIFY: FormulaDraft, formulaToBinding, completeness
    build-config.test.ts   # MODIFY
    manual-block-form.tsx  # MODIFY: formula mode (replaces calculated/aggregate)
    add-block-dialog.tsx   # MODIFY: "Formula" source (replaces the two)
app/dashboard/[clientSlug]/configurable-dashboard/
  page.tsx                 # MODIFY: build blocksById, pass to resolution
```

## Global constraints
- TypeScript strict; no `any` in new/changed code.
- All SM/TW calls stay server-side; formula resolution runs server-side via the
  existing cached resolvers.
- Operand placeholders use **stable keys**, not block names (rename-safe).
- Reuse rides the existing `unstable_cache` (query+range) — no new cache layer.
- Backward compatible: `leaf`/`calculated`/`aggregate` blocks parse and resolve
  unchanged; no data migration.
- Manual builder only; NL path untouched.
- No new npm dependency (hand-rolled parser).
```
