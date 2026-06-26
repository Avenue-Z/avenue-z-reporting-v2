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
