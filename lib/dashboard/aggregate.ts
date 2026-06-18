import type { AggregateBinding, LeafAttempt, LeafBinding } from './types'
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

export async function resolveAggregate(
  binding: AggregateBinding,
  attemptLeaf: AttemptLeaf,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafAttempt> {
  const [l, r] = await Promise.all([
    attemptLeaf(binding.left, ctx, dateRange, compareRange),
    attemptLeaf(binding.right, ctx, dateRange, compareRange),
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
