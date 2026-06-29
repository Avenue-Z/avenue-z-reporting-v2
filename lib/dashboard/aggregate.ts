import type { AggregateBinding, AggregateOperand, CalculatedBinding, LeafAttempt, LeafBinding } from './types'
import { worseError } from './errors'

export type AttemptLeaf = (
  b: LeafBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
) => Promise<LeafAttempt>

function applyOp(op: AggregateBinding['op'], a: number, b: number): number | null {
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': return b === 0 ? null : a / b
  }
}

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

export async function resolveAggregate(
  binding: AggregateBinding,
  attemptLeaf: AttemptLeaf,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafAttempt> {
  const [l, r] = await Promise.all([
    resolveOperand(binding.left, attemptLeaf, ctx, dateRange, compareRange),
    resolveOperand(binding.right, attemptLeaf, ctx, dateRange, compareRange),
  ])

  if (!l.ok && !r.ok) return { ok: false, error: worseError(l.error, r.error) }
  if (!l.ok) return { ok: false, error: l.error }
  if (!r.ok) return { ok: false, error: r.error }

  const value = applyOp(binding.op, l.value, r.value)
  if (value == null) return { ok: false, error: 'no-data' } // divide-by-zero

  // prev present iff BOTH operands have prev (same active range → present iff comparison active)
  let prevValue: number | undefined
  if (l.prevValue !== undefined && r.prevValue !== undefined) {
    const p = applyOp(binding.op, l.prevValue, r.prevValue)
    prevValue = p == null ? undefined : p
  }

  return { ok: true, value, prevValue }
}
