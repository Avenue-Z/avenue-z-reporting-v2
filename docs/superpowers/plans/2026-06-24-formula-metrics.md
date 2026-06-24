# Formula Metrics (with live references) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a metric be a formula (`+ − × ÷`, parentheses, numeric constants) over operands that are references to existing dashboard blocks or new inline metrics, reusing already-pulled data from cache.

**Architecture:** A pure expression engine (tokenize/parse/evaluate) plus a `FormulaBinding` resolved by `resolveFormula`, which resolves each operand at the formula's range through the existing cached resolvers (refs look up sibling blocks; cycles/dangling/÷0 → graceful errors). The add-block builder gains a "Formula" mode that supersedes the calculated/aggregate builders (those bindings still resolve for back-compat).

**Tech Stack:** TypeScript (strict), Next.js 15 App Router (RSC), `tsx` + `node:assert` unit tests.

## Global Constraints

- TypeScript strict; no `any` in new/changed code.
- All SM/TW calls server-side; formula resolution runs server-side via existing cached resolvers; reuse rides the existing `unstable_cache` (query+range) — no new cache layer.
- Operand placeholders are stable keys (`@a`), never block names (rename-safe).
- A reference resolves the referenced block's binding at the **referencing formula's** range/comparison (ignores the referenced block's own range override).
- Graceful errors: `÷ 0` → `no-data`; dangling ref → `invalid-metric`; cycle (incl. self) → `error`. Never crash.
- Backward compatible: `leaf`/`calculated`/`aggregate` bindings parse and resolve unchanged; no data migration.
- `resolveBlock`'s new ref-lookup deps are **optional** so existing callers (NL preview, glean-chat) compile unchanged.
- Manual builder only (no NL formula generation). No new npm dependency (hand-rolled parser). Supersede = remove the calculated/aggregate *builder* options, keep their bindings resolvable.

---

### Task 1: Pure expression engine

Self-contained `tokenize`/`parse`/`evaluate`/`operandKeys` — no knowledge of blocks or data. The heavily-tested core.

**Files:**
- Create: `lib/dashboard/formula/parse.ts`
- Create: `lib/dashboard/formula/evaluate.ts`
- Test: `lib/dashboard/formula/parse.test.ts`
- Test: `lib/dashboard/formula/evaluate.test.ts`

**Interfaces:**
- Produces: `Op = '+'|'-'|'*'|'/'`; `Ast = {n:'num';v:number} | {n:'ref';key:string} | {n:'bin';op:Op;l:Ast;r:Ast}`; `class FormulaError extends Error`; `tokenize(expr): Tok[]`; `parse(expr): Ast`; `operandKeys(expr): string[]` (all from `./parse`). `class DivByZeroError extends Error`; `evaluate(ast, resolve: (key:string)=>number): number` (from `./evaluate`).

- [ ] **Step 1: Write `parse.test.ts` (failing)**

Create `lib/dashboard/formula/parse.test.ts`:
```ts
// Run: npx tsx lib/dashboard/formula/parse.test.ts
import { strict as assert } from 'node:assert'
import { parse, tokenize, operandKeys, FormulaError, type Ast } from './parse'

// precedence: a + b * c  ->  a + (b*c)
{
  const ast = parse('@a + @b * @c')
  assert.deepEqual(ast, { n: 'bin', op: '+', l: { n: 'ref', key: 'a' }, r: { n: 'bin', op: '*', l: { n: 'ref', key: 'b' }, r: { n: 'ref', key: 'c' } } })
}
// parentheses override precedence: (a + b) * c
{
  const ast = parse('(@a + @b) * @c') as Extract<Ast, { n: 'bin' }>
  assert.equal(ast.op, '*')
  assert.equal((ast.l as Extract<Ast, { n: 'bin' }>).op, '+')
}
// constants are numeric literals
{
  assert.deepEqual(parse('0.8 * @r'), { n: 'bin', op: '*', l: { n: 'num', v: 0.8 }, r: { n: 'ref', key: 'r' } })
}
// left-assoc subtraction: a - b - c -> (a-b)-c
{
  const ast = parse('@a - @b - @c') as Extract<Ast, { n: 'bin' }>
  assert.equal(ast.op, '-'); assert.equal((ast.l as Extract<Ast, { n: 'bin' }>).op, '-'); assert.equal((ast.r as Extract<Ast, { n: 'ref' }>).key, 'c')
}
// operandKeys: unique refs
assert.deepEqual(operandKeys('(@a - @b) / @a').sort(), ['a', 'b'])
assert.deepEqual(operandKeys('1 + 2').sort(), [])
// tokenize rejects unknown chars
assert.throws(() => tokenize('@a & @b'), (e: unknown) => e instanceof FormulaError)
// parse rejects malformed
assert.throws(() => parse(''), (e: unknown) => e instanceof FormulaError)          // empty
assert.throws(() => parse('(@a + @b'), (e: unknown) => e instanceof FormulaError)  // unbalanced
assert.throws(() => parse('@a +'), (e: unknown) => e instanceof FormulaError)      // dangling op
assert.throws(() => parse('@a @b'), (e: unknown) => e instanceof FormulaError)     // trailing
assert.throws(() => parse('@'), (e: unknown) => e instanceof FormulaError)         // bad ref
console.log('ok')
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx lib/dashboard/formula/parse.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `parse.ts`**

Create `lib/dashboard/formula/parse.ts`:
```ts
export type Op = '+' | '-' | '*' | '/'

export type Ast =
  | { n: 'num'; v: number }
  | { n: 'ref'; key: string }
  | { n: 'bin'; op: Op; l: Ast; r: Ast }

export class FormulaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormulaError'
  }
}

type Tok =
  | { t: 'num'; v: number }
  | { t: 'op'; v: Op }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'ref'; key: string }

const REF_RE = /[A-Za-z_][A-Za-z0-9_]*/y
const NUM_RE = /\d+(\.\d+)?/y

export function tokenize(expr: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue }
    if (c === '(') { toks.push({ t: 'lp' }); i++; continue }
    if (c === ')') { toks.push({ t: 'rp' }); i++; continue }
    if (c === '+' || c === '-' || c === '*' || c === '/') { toks.push({ t: 'op', v: c }); i++; continue }
    if (c === '@') {
      REF_RE.lastIndex = i + 1
      const m = REF_RE.exec(expr)
      if (!m || m.index !== i + 1) throw new FormulaError(`bad reference at position ${i}`)
      toks.push({ t: 'ref', key: m[0] }); i = REF_RE.lastIndex; continue
    }
    if (c >= '0' && c <= '9') {
      NUM_RE.lastIndex = i
      const m = NUM_RE.exec(expr)
      if (!m) throw new FormulaError(`bad number at position ${i}`)
      toks.push({ t: 'num', v: Number(m[0]) }); i = NUM_RE.lastIndex; continue
    }
    throw new FormulaError(`unexpected character '${c}' at position ${i}`)
  }
  return toks
}

export function parse(expr: string): Ast {
  const toks = tokenize(expr)
  if (toks.length === 0) throw new FormulaError('empty formula')
  let pos = 0
  const peek = (): Tok | undefined => toks[pos]

  function parseExpr(): Ast {
    let left = parseTerm()
    for (;;) {
      const t = peek()
      if (t?.t === 'op' && (t.v === '+' || t.v === '-')) { pos++; left = { n: 'bin', op: t.v, l: left, r: parseTerm() } }
      else break
    }
    return left
  }
  function parseTerm(): Ast {
    let left = parseFactor()
    for (;;) {
      const t = peek()
      if (t?.t === 'op' && (t.v === '*' || t.v === '/')) { pos++; left = { n: 'bin', op: t.v, l: left, r: parseFactor() } }
      else break
    }
    return left
  }
  function parseFactor(): Ast {
    const t = peek()
    if (!t) throw new FormulaError('unexpected end of formula')
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

  const ast = parseExpr()
  if (pos !== toks.length) throw new FormulaError('unexpected trailing tokens')
  return ast
}

export function operandKeys(expr: string): string[] {
  const keys = new Set<string>()
  for (const t of tokenize(expr)) if (t.t === 'ref') keys.add(t.key)
  return [...keys]
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx lib/dashboard/formula/parse.test.ts`
Expected: `ok`.

- [ ] **Step 5: Write `evaluate.test.ts` (failing)**

Create `lib/dashboard/formula/evaluate.test.ts`:
```ts
// Run: npx tsx lib/dashboard/formula/evaluate.test.ts
import { strict as assert } from 'node:assert'
import { parse } from './parse'
import { evaluate, DivByZeroError } from './evaluate'

const vals: Record<string, number> = { a: 1000, b: 200, c: 250 }
const resolve = (k: string) => vals[k]

// precedence + refs: a + b * 2 = 1000 + 400 = 1400
assert.equal(evaluate(parse('@a + @b * 2'), resolve), 1400)
// parens: (a - b) / c = 800/250 = 3.2
assert.equal(evaluate(parse('(@a - @b) / @c'), resolve), 3.2)
// constants only
assert.equal(evaluate(parse('0.8 * 10'), resolve), 8)
// division by zero throws sentinel
assert.throws(() => evaluate(parse('@a / 0'), resolve), (e: unknown) => e instanceof DivByZeroError)
// resolve callback errors propagate
assert.throws(() => evaluate(parse('@missing'), () => { throw new Error('boom') }))
console.log('ok')
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx tsx lib/dashboard/formula/evaluate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement `evaluate.ts`**

Create `lib/dashboard/formula/evaluate.ts`:
```ts
import type { Ast } from './parse'

export class DivByZeroError extends Error {
  constructor() {
    super('division by zero')
    this.name = 'DivByZeroError'
  }
}

/** Evaluate an AST. `resolve(key)` supplies each operand's numeric value (it may
 *  throw to signal an unresolved operand). `÷ 0` throws DivByZeroError. */
export function evaluate(ast: Ast, resolve: (key: string) => number): number {
  switch (ast.n) {
    case 'num': return ast.v
    case 'ref': return resolve(ast.key)
    case 'bin': {
      const l = evaluate(ast.l, resolve)
      const r = evaluate(ast.r, resolve)
      switch (ast.op) {
        case '+': return l + r
        case '-': return l - r
        case '*': return l * r
        case '/':
          if (r === 0) throw new DivByZeroError()
          return l / r
      }
    }
  }
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx tsx lib/dashboard/formula/evaluate.test.ts`
Expected: `ok`.

- [ ] **Step 9: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git commit -m "feat(dashboard): pure formula expression engine (parse + evaluate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- lib/dashboard/formula/parse.ts lib/dashboard/formula/evaluate.ts lib/dashboard/formula/parse.test.ts lib/dashboard/formula/evaluate.test.ts
```

---

### Task 2: Types + resolution + page wiring

Add `FormulaBinding`/`FormulaOperand`, extract `resolveBindingValue`, add `resolveFormula` (refs, cycles, dangling), thread an optional `blocksById`/`visited` through `resolveBlock`, and have the page pass `blocksById`.

**Files:**
- Modify: `lib/dashboard/types.ts` (`FormulaOperand`, `FormulaBinding`, `Binding` union)
- Create: `lib/dashboard/formula-resolve.ts` (`resolveFormula`)
- Test: `lib/dashboard/formula-resolve.test.ts`
- Modify: `lib/dashboard/resolve.ts` (extract `resolveBindingValue`; thread deps; route formula)
- Modify: `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx` (build + pass `blocksById`)

**Interfaces:**
- Consumes: `parse` (`./formula/parse`), `evaluate`/`DivByZeroError` (`./formula/evaluate`), `worseError` (`./errors`), `AttemptLeaf` (`./aggregate`).
- Produces:
  - `FormulaOperand = { kind:'ref'; blockId:string } | { kind:'metric'; leaf:LeafBinding }`; `FormulaBinding = { source:'formula'; expr:string; operands: Record<string, FormulaOperand> }`.
  - `ResolveBindingValue = (binding: Binding, ctx: {slug:string}, dateRange: string, compareRange: string | null, deps: FormulaDeps) => Promise<LeafAttempt>` (exported from `resolve.ts`).
  - `FormulaDeps = { attemptLeaf: AttemptLeaf; resolveBindingValue: ResolveBindingValue; blocksById?: Map<string, BlockConfig>; visited: Set<string> }`.
  - `resolveFormula(binding: FormulaBinding, ctx, dateRange, compareRange, deps: FormulaDeps): Promise<LeafAttempt>` (from `formula-resolve.ts`).
  - `resolveBlock(config, global, ctx, deps?)` where `deps` additionally accepts optional `blocksById?: Map<string, BlockConfig>`.

- [ ] **Step 1: Add the types**

In `lib/dashboard/types.ts`, after `AggregateBinding`, add and extend the union:
```ts
export type FormulaOperand =
  | { kind: 'ref'; blockId: string }       // live reference to another block
  | { kind: 'metric'; leaf: LeafBinding }   // a freshly-defined SM/TW pull

export interface FormulaBinding {
  source: 'formula'
  expr: string                              // e.g. "(@a - @b) / @c"; numeric literals are constants
  operands: Record<string, FormulaOperand>  // placeholder key -> operand (keys are stable, not names)
}

export type Binding = LeafBinding | CalculatedBinding | AggregateBinding | FormulaBinding
```

- [ ] **Step 2: Write `formula-resolve.test.ts` (failing)**

Create `lib/dashboard/formula-resolve.test.ts`:
```ts
// Run: npx tsx lib/dashboard/formula-resolve.test.ts
import { strict as assert } from 'node:assert'
import { resolveFormula, type FormulaDeps } from './formula-resolve'
import type { AttemptLeaf } from './aggregate'
import type { BlockConfig, FormulaBinding, LeafAttempt } from './types'

const ctx = { slug: 'k' }
// attemptLeaf keyed by leaf identity: triplewhale.metric or supermetrics.metricField
const attemptLeaf: AttemptLeaf = async (b) => {
  const id = b.source === 'triplewhale' ? b.metric : b.metricField
  const map: Record<string, LeafAttempt> = {
    spend: { ok: true, value: 200, prevValue: 100 },
    sales: { ok: true, value: 1000, prevValue: 800 },
    tax: { ok: true, value: 200, prevValue: 150 },
  }
  return map[id] ?? { ok: false, error: 'no-data' }
}
// minimal resolveBindingValue stub: only leaf bindings appear as ref targets here
const resolveBindingValue: FormulaDeps['resolveBindingValue'] = async (binding, c, dr, cr, deps) =>
  binding.source === 'supermetrics' || binding.source === 'triplewhale'
    ? attemptLeaf(binding, c, dr, cr)
    : binding.source === 'formula'
      ? resolveFormula(binding, c, dr, cr, deps)
      : { ok: false, error: 'error' }

const baseDeps = (blocks: BlockConfig[] = []): FormulaDeps => ({
  attemptLeaf,
  resolveBindingValue,
  blocksById: new Map(blocks.map((b) => [b.id, b])),
  visited: new Set<string>(),
})

const f = (expr: string, operands: FormulaBinding['operands']): FormulaBinding => ({ source: 'formula', expr, operands })

async function run() {
  // metric operands + constant: (sales - tax) * 1 = 800; prev (800-150)=650
  {
    const b = f('(@s - @t) * 1', { s: { kind: 'metric', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'sales', account: 'a' } }, t: { kind: 'metric', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } } })
    const r = await resolveFormula(b, ctx, 'last_30_days', 'previous_period', baseDeps())
    assert.equal(r.ok && r.value, 800)
    assert.equal(r.ok && r.prevValue, 650)
  }
  // ref operand: ROAS-ish = @rev / @spend where @rev refs a block
  {
    const revBlock: BlockConfig = { id: 'rev', name: 'Rev', format: 'currency', range: null, binding: { source: 'supermetrics', dsId: 'SHP', metricField: 'sales', account: 'a' } }
    const b = f('@rev / @spend', { rev: { kind: 'ref', blockId: 'rev' }, spend: { kind: 'metric', leaf: { source: 'triplewhale', metric: 'spend' } } })
    const r = await resolveFormula(b, ctx, 'last_30_days', null, baseDeps([revBlock]))
    assert.equal(r.ok && r.value, 5) // 1000 / 200
  }
  // dangling ref -> invalid-metric
  {
    const b = f('@x + 1', { x: { kind: 'ref', blockId: 'missing' } })
    const r = await resolveFormula(b, ctx, 'last_30_days', null, baseDeps())
    assert.equal(!r.ok && r.error, 'invalid-metric')
  }
  // div by zero -> no-data
  {
    const b = f('@s / 0', { s: { kind: 'metric', leaf: { source: 'triplewhale', metric: 'spend' } } })
    const r = await resolveFormula(b, ctx, 'last_30_days', null, baseDeps())
    assert.equal(!r.ok && r.error, 'no-data')
  }
  // self / circular reference -> error
  {
    const selfBlock: BlockConfig = { id: 'self', name: 'Self', format: 'number', range: null, binding: f('@me + 1', { me: { kind: 'ref', blockId: 'self' } }) }
    const deps = baseDeps([selfBlock]); deps.visited.add('self')
    const r = await resolveFormula(selfBlock.binding as FormulaBinding, ctx, 'last_30_days', null, deps)
    assert.equal(!r.ok && r.error, 'error')
  }
  // prev present iff every operand has prev (spend has prev; a constant has none-effect) — here mix with a leaf lacking prev
  {
    const attemptNoPrev: AttemptLeaf = async () => ({ ok: true, value: 5 }) // no prevValue
    const deps: FormulaDeps = { ...baseDeps(), attemptLeaf: attemptNoPrev, resolveBindingValue: async (bnd, c, dr, cr) => attemptNoPrev(bnd as never, c, dr, cr) }
    const b = f('@x + 1', { x: { kind: 'metric', leaf: { source: 'triplewhale', metric: 'whatever' } } })
    const r = await resolveFormula(b, ctx, 'last_30_days', 'previous_period', deps)
    assert.equal(r.ok && r.value, 6)
    assert.equal(r.ok && r.prevValue, undefined)
  }
  console.log('ok')
}
run().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx tsx lib/dashboard/formula-resolve.test.ts`
Expected: FAIL (`formula-resolve` not found).

- [ ] **Step 4: Implement `formula-resolve.ts`**

Create `lib/dashboard/formula-resolve.ts`:
```ts
import { parse } from './formula/parse'
import { evaluate, DivByZeroError } from './formula/evaluate'
import { worseError } from './errors'
import type { AttemptLeaf } from './aggregate'
import type { BlockConfig, Binding, BlockError, FormulaBinding, LeafAttempt } from './types'

export type ResolveBindingValue = (
  binding: Binding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
  deps: FormulaDeps,
) => Promise<LeafAttempt>

export interface FormulaDeps {
  attemptLeaf: AttemptLeaf
  resolveBindingValue: ResolveBindingValue
  blocksById?: Map<string, BlockConfig>
  visited: Set<string>
}

export async function resolveFormula(
  binding: FormulaBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
  deps: FormulaDeps,
): Promise<LeafAttempt> {
  let ast
  try {
    ast = parse(binding.expr)
  } catch {
    return { ok: false, error: 'invalid-metric' }
  }

  // Resolve every operand to a LeafAttempt (value + optional prevValue), at THIS range.
  const keys = Object.keys(binding.operands)
  const resolved = await Promise.all(
    keys.map(async (key): Promise<LeafAttempt> => {
      const op = binding.operands[key]
      if (op.kind === 'metric') return deps.attemptLeaf(op.leaf, ctx, dateRange, compareRange)
      // ref
      if (deps.visited.has(op.blockId)) return { ok: false, error: 'error' } // cycle
      const target = deps.blocksById?.get(op.blockId)
      if (!target) return { ok: false, error: 'invalid-metric' } // dangling
      const nextDeps: FormulaDeps = { ...deps, visited: new Set(deps.visited).add(op.blockId) }
      return deps.resolveBindingValue(target.binding, ctx, dateRange, compareRange, nextDeps)
    }),
  )
  const byKey = new Map<string, LeafAttempt>(keys.map((k, i) => [k, resolved[i]]))

  const failures = resolved.filter((r) => !r.ok)
  if (failures.length > 0) {
    const error = failures.map((r) => (r.ok ? ('error' as BlockError) : r.error)).reduce((a, b) => worseError(a, b))
    return { ok: false, error }
  }

  // current value
  let value: number
  try {
    value = evaluate(ast, (k) => {
      const r = byKey.get(k)
      if (!r || !r.ok) throw new Error('unresolved operand')
      return r.value
    })
  } catch (e) {
    if (e instanceof DivByZeroError) return { ok: false, error: 'no-data' }
    return { ok: false, error: 'error' } // unknown @key in expr not present in operands, etc.
  }

  // prevValue iff every operand has a prevValue
  const hasAllPrev = keys.every((k) => {
    const r = byKey.get(k)
    return r?.ok === true && r.prevValue !== undefined
  })
  let prevValue: number | undefined
  if (hasAllPrev) {
    try {
      prevValue = evaluate(ast, (k) => {
        const r = byKey.get(k)
        if (!r || !r.ok || r.prevValue === undefined) throw new Error('unresolved prev')
        return r.prevValue
      })
    } catch {
      prevValue = undefined // e.g. ÷0 in the prior period: drop the delta, keep the value
    }
  }

  return { ok: true, value, prevValue }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx tsx lib/dashboard/formula-resolve.test.ts`
Expected: `ok`.

- [ ] **Step 6: Refactor `resolve.ts` — extract `resolveBindingValue`, thread deps, route formula**

In `lib/dashboard/resolve.ts`, replace the imports and `resolveBlock` body so the binding dispatch is a reusable `resolveBindingValue` that also handles `formula`, and `resolveBlock` seeds `blocksById`/`visited`:
```ts
import type { Binding, BlockConfig, LeafAttempt, LeafBinding, LeafValue, ResolveResult } from './types'
import { resolveLeaf as defaultResolveLeaf } from './registry'
import { resolveAggregate, resolveCalculated, type AttemptLeaf } from './aggregate'
import { resolveFormula, type FormulaDeps, type ResolveBindingValue } from './formula-resolve'
import { mapError } from './errors'
import { computeDelta } from '@/lib/metrics'
import { formatMetric } from './format'

export type LeafResolver = (
  b: LeafBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
) => Promise<LeafValue>

/** Resolve any binding to a LeafAttempt (value + optional prevValue) at one range. */
const resolveBindingValue: ResolveBindingValue = async (binding, ctx, dateRange, compareRange, deps) => {
  switch (binding.source) {
    case 'aggregate': return resolveAggregate(binding, deps.attemptLeaf, ctx, dateRange, compareRange)
    case 'calculated': return resolveCalculated(binding, deps.attemptLeaf, ctx, dateRange, compareRange)
    case 'formula': return resolveFormula(binding, ctx, dateRange, compareRange, deps)
    default: return deps.attemptLeaf(binding, ctx, dateRange, compareRange)
  }
}

export async function resolveBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
  deps: { resolveLeaf?: LeafResolver; blocksById?: Map<string, BlockConfig> } = {},
): Promise<ResolveResult> {
  const resolveLeaf = deps.resolveLeaf ?? defaultResolveLeaf
  const range = config.range ?? global

  const attemptLeaf: AttemptLeaf = async (b, c, dr, cr): Promise<LeafAttempt> => {
    try {
      const v = await resolveLeaf(b, c, dr, cr)
      return { ok: true, ...v }
    } catch (e) {
      return { ok: false, error: mapError(e) }
    }
  }

  const fdeps: FormulaDeps = {
    attemptLeaf,
    resolveBindingValue,
    blocksById: deps.blocksById,
    visited: new Set<string>([config.id]), // seed with this block so a ref back to it is a cycle
  }

  const res: LeafAttempt = await resolveBindingValue(config.binding, ctx, range.dateRange, range.compareRange, fdeps)

  if (!res.ok) return { ok: false, error: res.error }
  const delta = computeDelta(res.value, res.prevValue)
  return {
    ok: true,
    value: res.value,
    prevValue: res.prevValue,
    delta,
    format: config.format,
    formatted: formatMetric(res.value, config.format),
  }
}
```
(`resolve.test.ts` is unaffected — it injects `resolveLeaf` and uses leaf/aggregate/calculated bindings, all still routed correctly. Run it in Step 8 to confirm.)

- [ ] **Step 7: Pass `blocksById` from the page**

In `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`, build the map once before the loop and pass it in both `resolveBlock` calls:
```ts
  const blocksById = new Map(config.blocks.map((b) => [b.id, b]))
```
(place this right after `const blockNodes ...`). Then change the two `resolveBlock(...)` calls inside the loop to pass it:
```ts
    const valuePromise = resolveBlock(blockNoRange, { dateRange: eff.dateRange, compareRange: null }, ctx, { blocksById })
    const prevPromise = compareIso
      ? resolveBlock(blockNoRange, { dateRange: compareIso, compareRange: null }, ctx, { blocksById })
      : null
```
(`blocksById` maps original blocks by id so formula refs resolve their bindings; the clone's nulled range only affects the *current* block's range handling.)

- [ ] **Step 8: Verify existing resolution tests + typecheck**

Run: `npx tsx lib/dashboard/resolve.test.ts` → `ok`
Run: `npx tsx lib/dashboard/aggregate.test.ts` → `ok`
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(dashboard): FormulaBinding + resolveFormula (refs, cycles, dangling)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- lib/dashboard/types.ts lib/dashboard/formula-resolve.ts lib/dashboard/formula-resolve.test.ts lib/dashboard/resolve.ts "app/dashboard/[clientSlug]/configurable-dashboard/page.tsx"
```

---

### Task 3: Persistence

Parse + validate the formula binding.

**Files:**
- Modify: `lib/dashboard/persistence.ts` (`parseFormula` + `parseBinding` branch)
- Test: `lib/dashboard/persistence.test.ts`

**Interfaces:**
- Consumes: `operandKeys` (`./formula/parse`), `parseLeaf` (in-file), `FormulaBinding`/`FormulaOperand` types.
- Produces: a `'formula'` branch in `parseBinding`.

- [ ] **Step 1: Write failing persistence tests**

In `lib/dashboard/persistence.test.ts`, add:
```ts
// formula binding round-trips (ref + metric + constant)
{
  const r = parseBlockConfig({ id: 'b', name: 'ROAS', format: 'number', range: null,
    binding: { source: 'formula', expr: '(@a - @b) / @c',
      operands: {
        a: { kind: 'metric', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
        b: { kind: 'metric', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
        c: { kind: 'ref', blockId: 'spend-block' },
      } } })
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'formula') assert.equal(Object.keys(r.block.binding.operands).length, 3)
}
// unparseable expr rejected
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'formula', expr: '(@a + ', operands: { a: { kind: 'ref', blockId: 'x' } } } })
  assert.equal(r.ok, false)
}
// operand/placeholder mismatch rejected (expr uses @a @b but operands miss @b)
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'formula', expr: '@a + @b', operands: { a: { kind: 'ref', blockId: 'x' } } } })
  assert.equal(r.ok, false)
}
// bad operand (ref without blockId) rejected
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'formula', expr: '@a', operands: { a: { kind: 'ref' } } } })
  assert.equal(r.ok, false)
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: FAIL (`parseBinding` rejects `formula`).

- [ ] **Step 3: Implement `parseFormula`**

In `lib/dashboard/persistence.ts`: add `operandKeys` to the imports from the formula engine (`import { operandKeys } from './formula/parse'`) and the `FormulaBinding`/`FormulaOperand` types to the `./types` import. Add the helper near `parseCalculated`:
```ts
function parseFormulaOperand(v: unknown, path: string): Parsed<FormulaOperand> {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  if (v.kind === 'ref') {
    if (!isNonEmptyStr(v.blockId)) return { ok: false, error: `${path}.blockId: expected non-empty string` }
    return { ok: true, value: { kind: 'ref', blockId: v.blockId } }
  }
  if (v.kind === 'metric') {
    const leaf = parseLeaf(v.leaf, `${path}.leaf`)
    if (!leaf.ok) return leaf
    return { ok: true, value: { kind: 'metric', leaf: leaf.value } }
  }
  return { ok: false, error: `${path}.kind: expected 'ref' or 'metric'` }
}

function parseFormula(v: unknown, path: string): Parsed<FormulaBinding> {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  if (!isNonEmptyStr(v.expr)) return { ok: false, error: `${path}.expr: expected non-empty string` }
  let keys: string[]
  try {
    keys = operandKeys(v.expr) // also validates the expression parses/tokenizes
  } catch {
    return { ok: false, error: `${path}.expr: not a valid formula` }
  }
  if (!isObj(v.operands)) return { ok: false, error: `${path}.operands: expected object` }
  const operands: Record<string, FormulaOperand> = {}
  for (const key of Object.keys(v.operands)) {
    const op = parseFormulaOperand(v.operands[key], `${path}.operands.${key}`)
    if (!op.ok) return op
    operands[key] = op.value
  }
  // every @key used in expr must have an operand, and vice versa
  const provided = new Set(Object.keys(operands))
  for (const k of keys) if (!provided.has(k)) return { ok: false, error: `${path}.operands: missing operand for @${k}` }
  for (const k of provided) if (!keys.includes(k)) return { ok: false, error: `${path}.operands: unused operand @${k}` }
  return { ok: true, value: { source: 'formula', expr: v.expr, operands } }
}
```
Note: `operandKeys` calls `tokenize`, which throws `FormulaError` on a malformed expr — but it does not run the full `parse` (so unbalanced parens like `(@a + ` would tokenize fine). To reject structurally-invalid expressions, also run `parse`. Add at the top of `parseFormula`'s try block: `import { parse, operandKeys } from './formula/parse'` and call `parse(v.expr)` before `operandKeys`:
```ts
  try {
    parse(v.expr)               // full structural validation (throws on malformed)
    keys = operandKeys(v.expr)
  } catch {
    return { ok: false, error: `${path}.expr: not a valid formula` }
  }
```

Then add the branch in `parseBinding` (before the final `return parseLeaf`):
```ts
  if (v.source === 'formula') return parseFormula(v, path)
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx lib/dashboard/persistence.test.ts`
Expected: `ok`.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git commit -m "feat(dashboard): persist + validate formula bindings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- lib/dashboard/persistence.ts lib/dashboard/persistence.test.ts
```

---

### Task 4: Draft layer (build-config)

Add the `FormulaDraft` and its `formulaToBinding`/completeness, additive to `build-config.ts` (UI wired in Task 5).

**Files:**
- Modify: `components/dashboard/add-block/build-config.ts`
- Test: `components/dashboard/add-block/build-config.test.ts`

**Interfaces:**
- Consumes: `leafToBinding`, `isLeafComplete`, `LeafDraft` (in-file); `operandKeys` (`@/lib/dashboard/formula/parse`); `FormulaBinding`, `FormulaOperand` types.
- Produces: `FormulaOperandDraft`, `FormulaDraft`, `formulaToBinding(d: FormulaDraft): FormulaBinding`, `isFormulaComplete(d: FormulaDraft): boolean`; `ManualDraft` gains a `'formula'` kind; `buildBlockConfig`/`isDraftComplete` handle it.

- [ ] **Step 1: Write failing build-config tests**

In `components/dashboard/add-block/build-config.test.ts`, extend the import with `formulaToBinding` and add:
```ts
// formulaToBinding: assembles expr + operands; drops operand keys not used in expr
{
  const b = formulaToBinding({ source: 'formula', expr: '@a / @b',
    operands: {
      a: { kind: 'ref', blockId: 'rev' },
      b: { kind: 'metric', leaf: { source: 'triplewhale', metric: 'ad_spend' } },
      z: { kind: 'ref', blockId: 'unused' }, // not in expr -> dropped
    } })
  assert.equal(b.source, 'formula')
  assert.equal(b.expr, '@a / @b')
  assert.deepEqual(Object.keys(b.operands).sort(), ['a', 'b'])
}
// buildBlockConfig: formula kind
{
  const cfg = buildBlockConfig({ kind: 'formula', name: 'ROAS', format: 'number',
    formula: { source: 'formula', expr: '@a / @b', operands: { a: { kind: 'ref', blockId: 'rev' }, b: { kind: 'metric', leaf: { source: 'triplewhale', metric: 'ad_spend' } } } } })
  assert.equal(cfg.binding.source, 'formula')
}
// isDraftComplete: needs name, a parseable expr, and every used operand complete
{
  const ok = { kind: 'formula' as const, name: 'X', format: 'number' as const,
    formula: { source: 'formula' as const, expr: '@a + 1', operands: { a: { kind: 'metric' as const, leaf: { source: 'triplewhale' as const, metric: 'revenue' } } } } }
  assert.equal(isDraftComplete(ok), true)
  assert.equal(isDraftComplete({ ...ok, name: '' }), false)                                   // no name
  assert.equal(isDraftComplete({ ...ok, formula: { source: 'formula', expr: '@a + ', operands: ok.formula.operands } }), false) // bad expr
  assert.equal(isDraftComplete({ ...ok, formula: { source: 'formula', expr: '@a + @b', operands: ok.formula.operands } }), false) // @b unbound
  assert.equal(isDraftComplete({ ...ok, formula: { source: 'formula', expr: '@a', operands: { a: { kind: 'metric', leaf: { source: 'supermetrics', dsId: '', metricField: '', account: '' } } } } }), false) // incomplete metric
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: FAIL (`formulaToBinding` not exported; `kind: 'formula'` not in `ManualDraft`).

- [ ] **Step 3: Implement the formula draft layer**

In `components/dashboard/add-block/build-config.ts`:

Extend the type import to add `FormulaBinding, FormulaOperand`, and add a formula-engine import:
```ts
import type { BlockConfig, LeafBinding, AggregateBinding, AggregateOperand, CalculatedBinding, FormulaBinding, FormulaOperand, MetricFormat } from '@/lib/dashboard/types'
import { operandKeys, parse } from '@/lib/dashboard/formula/parse'
```

Add the draft types (after `OperandDraft`):
```ts
export type FormulaOperandDraft =
  | { kind: 'ref'; blockId: string }
  | { kind: 'metric'; leaf: LeafDraft }

export type FormulaDraft = {
  source: 'formula'
  expr: string
  operands: Record<string, FormulaOperandDraft>
}
```

Add `'formula'` to `ManualDraft`:
```ts
  | { kind: 'formula'; name: string; format: MetricFormat; formula: FormulaDraft }
```

Add `formulaToBinding` + completeness (after `operandToBinding`):
```ts
/** Build a formula binding: keep only operands whose key is used in the expr,
 *  converting metric drafts via leafToBinding. */
export function formulaToBinding(d: FormulaDraft): FormulaBinding {
  let used: string[]
  try { used = operandKeys(d.expr) } catch { used = [] }
  const operands: Record<string, FormulaOperand> = {}
  for (const key of used) {
    const op = d.operands[key]
    if (!op) continue
    operands[key] = op.kind === 'ref' ? { kind: 'ref', blockId: op.blockId } : { kind: 'metric', leaf: leafToBinding(op.leaf) }
  }
  return { source: 'formula', expr: d.expr, operands }
}

function isFormulaOperandComplete(op: FormulaOperandDraft): boolean {
  return op.kind === 'ref' ? op.blockId !== '' : isLeafComplete(op.leaf)
}

export function isFormulaComplete(d: FormulaDraft): boolean {
  let used: string[]
  try { parse(d.expr); used = operandKeys(d.expr) } catch { return false }
  if (used.length === 0 && d.expr.trim() === '') return false
  return used.every((k) => { const op = d.operands[k]; return !!op && isFormulaOperandComplete(op) })
}
```

Handle the kind in `buildBlockConfig`:
```ts
  const binding =
    d.kind === 'leaf'
      ? leafToBinding(d.leaf)
      : d.kind === 'calculated'
        ? calculatedToBinding(d.calc)
        : d.kind === 'formula'
          ? formulaToBinding(d.formula)
          : { source: 'aggregate' as const, op: d.op, left: operandToBinding(d.left), right: operandToBinding(d.right) }
```

Handle it in `isDraftComplete`:
```ts
  if (d.kind === 'formula') return isFormulaComplete(d.formula)
```
(place before the final aggregate `return`).

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: `ok`.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git commit -m "feat(dashboard): formula draft + formulaToBinding (build-config)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts
```

---

### Task 5: Formula builder UI (supersede calculated/aggregate builders)

Add the token-in-text `FormulaBuilder`, wire a "Formula" mode into the manual form replacing the calculated/aggregate modes, and swap the dialog source list. Existing saved calculated/aggregate blocks still resolve.

**Files:**
- Create: `components/dashboard/add-block/formula-builder.tsx`
- Modify: `components/dashboard/add-block/manual-block-form.tsx`
- Modify: `components/dashboard/add-block/add-block-dialog.tsx`

**Interfaces:**
- Consumes: `FormulaDraft`, `FormulaOperandDraft`, `LeafDraft` (`./build-config`); `LeafBuilder` (`./leaf-builder`); `parse` (`@/lib/dashboard/formula/parse`); `getAllClientBlocks` — NOT needed (blocks come from the dashboard config already in memory; the builder receives the list of existing blocks as a prop).
- Produces: `FormulaBuilder` component.

- [ ] **Step 1: Create `formula-builder.tsx`**

Create `components/dashboard/add-block/formula-builder.tsx`. The builder shows: an expression input (`@a`, numbers, `+ − × ÷ ( )`), a live parse-status line, and an operands panel — one row per `@key` used in the expression, each bound to an existing block (ref) or a new metric (LeafBuilder). Existing blocks are passed in via `existingBlocks` (id+name), excluding the block being edited (none yet on create).
```tsx
'use client'

import { useMemo } from 'react'
import { LeafBuilder } from './leaf-builder'
import { parse, operandKeys } from '@/lib/dashboard/formula/parse'
import type { FormulaDraft, FormulaOperandDraft, LeafDraft } from './build-config'

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'
const emptyLeaf = (): LeafDraft => ({ source: 'supermetrics', dsId: '', metricField: '', account: '' })

export function FormulaBuilder({
  value,
  onChange,
  slug,
  existingBlocks,
}: {
  value: FormulaDraft
  onChange: (v: FormulaDraft) => void
  slug: string
  existingBlocks: { id: string; name: string }[]
}) {
  const { keys, error } = useMemo(() => {
    try { parse(value.expr); return { keys: operandKeys(value.expr), error: null as string | null } }
    catch (e) { return { keys: [] as string[], error: e instanceof Error ? e.message : 'invalid formula' } }
  }, [value.expr])

  const setExpr = (expr: string) => onChange({ ...value, expr })
  const setOperand = (key: string, op: FormulaOperandDraft) => onChange({ ...value, operands: { ...value.operands, [key]: op } })

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Formula</span>
        <input className={ctrl} value={value.expr} onChange={(e) => setExpr(e.target.value)}
          placeholder="(@rev - @tax) / @spend" />
        <span className="text-[11px] text-text-muted">
          Reference operands as <code>@name</code>; use <code>+ - * /</code>, parentheses, and numbers (e.g. <code>0.8 * @row</code>).
        </span>
      </label>

      {value.expr.trim() !== '' && error && <p className="text-xs text-[#FF6666]">Invalid formula: {error}</p>}

      {keys.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className={labelCls}>Operands</p>
          {keys.map((key) => {
            const op = value.operands[key]
            const kind = op?.kind ?? 'ref'
            return (
              <div key={key} className="rounded-md border border-white/10 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-brand-cyan">@{key}</span>
                  <select className="rounded-md border border-white/10 bg-bg-surface px-2 py-1 text-xs text-white"
                    value={kind}
                    onChange={(e) => setOperand(key, e.target.value === 'metric' ? { kind: 'metric', leaf: emptyLeaf() } : { kind: 'ref', blockId: '' })}>
                    <option value="ref">Existing metric</option>
                    <option value="metric">New metric</option>
                  </select>
                </div>
                {(!op || op.kind === 'ref') ? (
                  <select className={ctrl} value={op?.kind === 'ref' ? op.blockId : ''}
                    onChange={(e) => setOperand(key, { kind: 'ref', blockId: e.target.value })}>
                    <option value="">Select a block…</option>
                    {existingBlocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                ) : (
                  <LeafBuilder source={op.leaf.source} value={op.leaf} onChange={(leaf) => setOperand(key, { kind: 'metric', leaf })} slug={slug} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire the Formula mode into `manual-block-form.tsx` (replacing calculated/aggregate)**

In `components/dashboard/add-block/manual-block-form.tsx`:

Replace the `CalculatedBuilder` import with the formula builder and widen the draft imports:
```ts
import { LeafBuilder } from './leaf-builder'
import { FormulaBuilder } from './formula-builder'
import { buildBlockConfig, isDraftComplete, type LeafDraft, type ManualDraft, type FormulaDraft } from './build-config'
import type { BlockConfig, MetricFormat } from '@/lib/dashboard/types'
```

Change the `source` prop type and add an `existingBlocks` prop:
```ts
export function ManualBlockForm({
  source,
  slug,
  pending,
  existingBlocks,
  onConfirm,
  onBack,
}: {
  source: 'supermetrics' | 'triplewhale' | 'formula'
  slug: string
  pending: boolean
  existingBlocks: { id: string; name: string }[]
  onConfirm: (cfg: Omit<BlockConfig, 'id'>) => void
  onBack: () => void
}) {
```

Replace the state + draft block (the `leaf`/`calc`/`op`/`left`/`right` states and the `draft` ternary) with leaf + formula only:
```ts
  const [name, setName] = useState('')
  const [format, setFormat] = useState<MetricFormat>('number')
  const [leaf, setLeaf] = useState<LeafDraft>(() => (source === 'formula' ? { source: 'supermetrics', dsId: '', metricField: '', account: '' } : emptyLeaf(source)))
  const [formula, setFormula] = useState<FormulaDraft>(() => ({ source: 'formula', expr: '', operands: {} }))

  const draft: ManualDraft =
    source === 'formula'
      ? { kind: 'formula', name, format, formula }
      : { kind: 'leaf', name, format, leaf }
```

Replace the render branches (the `source !== 'aggregate' && source !== 'calculated'` leaf block, the `calculated` block, and the entire `aggregate` block) with:
```tsx
      {source !== 'formula' && (
        <LeafBuilder source={source} value={leaf} onChange={setLeaf} slug={slug} onSuggestFormat={setFormat} />
      )}

      {source === 'formula' && (
        <FormulaBuilder value={formula} onChange={setFormula} slug={slug} existingBlocks={existingBlocks} />
      )}
```
Delete the now-unused `Operand` helper component, the `OPS` constant, the `Op` type, and the `CalculatedBuilder`/`OperandDraft`/`CalculatedDraft` imports.

- [ ] **Step 3: Swap the source list + pass existing blocks in `add-block-dialog.tsx`**

In `components/dashboard/add-block/add-block-dialog.tsx`:

Replace the `Source` type and `SOURCES` so "Formula" supersedes the two:
```ts
type Source = 'supermetrics' | 'triplewhale' | 'formula'
const SOURCES: { value: Source; label: string }[] = [
  { value: 'supermetrics', label: 'Supermetrics' },
  { value: 'triplewhale', label: 'TripleWhale' },
  { value: 'formula', label: 'Formula' },
]
```
`useState<Source>('supermetrics')` stays. In `resolve()` the cast becomes `source as ProposeBlockInput['source']` — `'formula'` never reaches it because formula is manual-only; keep the `source !== 'formula'` guard on the "Describe with AI" button (mirroring the existing calculated guard — replace `source !== 'calculated'` with `source !== 'formula'`).

Pass the existing blocks to the manual form (derive id+name from `config`):
```tsx
        {step === 'build' && (
          <>
            <ManualBlockForm
              source={source}
              slug={slug}
              pending={pending}
              existingBlocks={(config?.blocks ?? []).map((b) => ({ id: b.id, name: b.name }))}
              onConfirm={confirmManual}
              onBack={() => setStep('mode')}
            />
            {error && <p className="mt-2 text-xs text-[#FF6666]">Error: {error}</p>}
          </>
        )}
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit` → clean. (If `CalculatedBuilder`/`calculated-builder.tsx` is now unreferenced, that's fine — leave the file; existing `calculated` bindings still resolve and the component is harmless. Do NOT delete `calculated-builder.tsx` or the `calculated`/`aggregate` draft helpers in build-config — they remain valid exports.)
Run: `npm run build` → succeeds.

- [ ] **Step 5: Manual smoke (note for executor)**

On `/dashboard/<slug>/configurable-dashboard` → **+ Add block → Formula → Build manually**: type `(@rev - @tax) / @spend`; three operand rows appear; bind `@rev`/`@tax` to existing blocks or new metrics and `@spend` likewise; save. The block resolves; a bad expr shows the inline "Invalid formula"; a deleted referenced block shows the block error state; `÷ 0` shows no-data. (Manual; not automated.)

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(dashboard): formula builder UI (supersedes calculated/aggregate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- components/dashboard/add-block/formula-builder.tsx components/dashboard/add-block/manual-block-form.tsx components/dashboard/add-block/add-block-dialog.tsx
```

---

## Self-Review

- **Spec coverage:** engine (T1); FormulaBinding/operand types + resolveFormula with refs/cycles/dangling/÷0 + range rule + page blocksById (T2); persistence validate (T3); draft + formulaToBinding (T4); token-in-text builder + supersede dialog/form (T5). Reuse rides existing cache (T2 resolution through `attemptLeaf`/`resolveBindingValue`, both cached). ✅
- **Placeholder scan:** none — full code in every step.
- **Type consistency:** `FormulaOperand`/`FormulaBinding` identical across types/persistence/build-config/resolve; `FormulaDeps`/`ResolveBindingValue` defined in `formula-resolve.ts` and imported by `resolve.ts`; `resolveFormula` signature matches its test and its caller; `formulaToBinding`/`isFormulaComplete`/`FormulaDraft` names consistent T4↔T5; `existingBlocks: {id,name}[]` consistent dialog↔form↔builder.
- **Import-cycle check:** `resolve.ts` imports `formula-resolve.ts`; `formula-resolve.ts` does NOT import `resolve.ts` (it receives `resolveBindingValue` via `deps`) — no cycle.
- **Compile-green seams:** T1 standalone. T2 adds the union member AND its `resolveBindingValue` branch together (tsc stays green) + optional deps keep other `resolveBlock` callers compiling. T3/T4 additive. T5 swaps UI; leaves calculated/aggregate bindings + their build-config helpers intact for back-compat.
- **Note:** the calculated/aggregate *builders* are removed from the UI (T5) but their bindings, persistence, resolution, and build-config helpers remain — saved blocks keep working, satisfying "supersede, not break."

## Execution Handoff

Plan saved. Recommended: **Subagent-Driven Development** — fresh subagent per task, review between tasks.
