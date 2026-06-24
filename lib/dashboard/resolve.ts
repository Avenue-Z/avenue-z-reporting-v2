// lib/dashboard/resolve.ts
import type { BlockConfig, LeafAttempt, LeafBinding, LeafValue, ResolveResult } from './types'
import { resolveLeaf as defaultResolveLeaf } from './registry'
import { resolveAggregate, resolveCalculated, type AttemptLeaf } from './aggregate'
import { mapError } from './errors'
import { computeDelta } from '@/lib/metrics'
import { formatMetric } from './format'

export type LeafResolver = (
  b: LeafBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
) => Promise<LeafValue>

export async function resolveBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
  deps: { resolveLeaf?: LeafResolver } = {},
): Promise<ResolveResult> {
  const resolveLeaf = deps.resolveLeaf ?? defaultResolveLeaf
  const range = config.range ?? global // per-block override vs. inherit

  // wraps a leaf resolution into a LeafAttempt (success | mapped error)
  const attemptLeaf: AttemptLeaf = async (b, c, dr, cr): Promise<LeafAttempt> => {
    try {
      const v = await resolveLeaf(b, c, dr, cr)
      return { ok: true, ...v }
    } catch (e) {
      return { ok: false, error: mapError(e) }
    }
  }

  const res: LeafAttempt =
    config.binding.source === 'aggregate'
      ? await resolveAggregate(config.binding, attemptLeaf, ctx, range.dateRange, range.compareRange)
      : config.binding.source === 'calculated'
        ? await resolveCalculated(config.binding, attemptLeaf, ctx, range.dateRange, range.compareRange)
        : await attemptLeaf(config.binding, ctx, range.dateRange, range.compareRange)

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
