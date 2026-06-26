// lib/dashboard/resolve.ts
import type {
  BlockConfig, Granularity, GroupedResult, GroupedRow, LeafAttempt, LeafBinding, LeafValue,
  ResolveResult, SeriesPoint, SeriesResult,
} from './types'
import {
  resolveLeaf as defaultResolveLeaf,
  resolveGrouped as defaultResolveGrouped,
  resolveSeries as defaultResolveSeries,
} from './registry'
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

export type GroupedResolver = (
  b: LeafBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
) => Promise<GroupedRow[]>

export type SeriesResolver = (
  b: LeafBinding,
  granularity: Granularity,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
) => Promise<SeriesPoint[]>

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
  // Defensive guard: static-kind blocks (header/narrative) carry a __static__ sentinel
  // binding that must never reach a real resolver (see BlockKind JSDoc in types.ts).
  if (config.binding.source === 'supermetrics' && config.binding.dsId === '__static__') {
    return { ok: false, error: 'invalid-metric' }
  }
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

/** Grouped resolution: dim breakdown per leaf binding. Aggregate, calculated, and
 *  formula bindings are rejected with invalid-metric (v1: leaf only). */
export async function resolveGroupedBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
  deps: { resolveGrouped?: GroupedResolver } = {},
): Promise<GroupedResult> {
  if (config.binding.source !== 'supermetrics' && config.binding.source !== 'triplewhale' && config.binding.source !== 'shopify') {
    return { ok: false, error: 'invalid-metric' }
  }
  const range = config.range ?? global
  const resolve = deps.resolveGrouped ?? defaultResolveGrouped
  try {
    const rows = await resolve(config.binding, ctx, range.dateRange, range.compareRange)
    return { ok: true, rows, format: config.format }
  } catch (e) {
    return { ok: false, error: mapError(e) }
  }
}

/** Time-series resolution: bucketed metric per leaf binding. Granularity required.
 *  Aggregate, calculated, and formula bindings are rejected with invalid-metric. */
export async function resolveSeriesBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
  deps: { resolveSeries?: SeriesResolver } = {},
): Promise<SeriesResult> {
  if (config.binding.source !== 'supermetrics' && config.binding.source !== 'triplewhale' && config.binding.source !== 'shopify') {
    return { ok: false, error: 'invalid-metric' }
  }
  const granularity = config.binding.granularity
  if (!granularity) return { ok: false, error: 'invalid-metric' }

  const range = config.range ?? global
  const resolve = deps.resolveSeries ?? defaultResolveSeries
  try {
    const points = await resolve(config.binding, granularity, ctx, range.dateRange, range.compareRange)
    return { ok: true, points, format: config.format, granularity }
  } catch (e) {
    return { ok: false, error: mapError(e) }
  }
}
