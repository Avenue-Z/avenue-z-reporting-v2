// lib/dashboard/resolve.ts
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
