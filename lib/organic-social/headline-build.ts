// Pure headline assembly for Organic Social — no fetching, no Next/DB.
// Mirrors trend-series.ts (pure) vs trends.ts (fetcher): headlines.ts fetches,
// this builds + validates a PlatformHeadline (a KPI list) from a raw Dash metrics
// map over a given key set. Overview passes OVERVIEW_KPI_KEYS (5); a platform
// subpage passes the channel's full set. Kept pure so the guard and mapping are
// unit-testable.
import { kpiFor, metricForKey, CHANNEL_LABEL, type DashChannel } from './metrics'
import type { TotalMetric } from '@/lib/dash-social/types'
import type { PlatformHeadline, HeadlineKpi } from './types'

/** Prior-period percent change from a Dash metric's value vs. its context, or undefined. */
function delta(m: TotalMetric | undefined): number | undefined {
  if (!m) return undefined
  const cur = m.value ?? 0
  const prev = m.context
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}

/** The Dash metric names for a channel + key set, resolved through the active REPORTING_BASIS.
 *  Single source of truth for the request AND the guard — headlines.ts sends exactly this,
 *  and buildPlatformHeadline validates against it. */
export const metricNamesFor = (channel: DashChannel, keys: readonly string[]): string[] =>
  keys.map((k) => metricForKey(channel, k))

/** Assemble a PlatformHeadline (KPI list) from a channel's raw Dash metrics map over `keys`.
 *
 *  Guard (PR #173 review #1): Dash 400s a whole batch if any requested metric is invalid for
 *  the channel (WHOLE-BATCH-400, proven live), and a legitimately-empty window returns every
 *  requested key PRESENT with value:null — NOT absent. So a 200 that OMITS a requested key is a
 *  malformed/partial payload: throw (Overview drops the channel, a scoped view errors) rather
 *  than let `?? 0` render a fabricated zero on a client card. A present value:null is a genuine
 *  no-data zero and is preserved via `?? 0`. */
export function buildPlatformHeadline(
  channel: DashChannel,
  metrics: Record<string, TotalMetric>,
  keys: readonly string[],
): PlatformHeadline {
  const specs = keys.map((key) => ({ key, spec: kpiFor(channel, key), metric: metricForKey(channel, key) }))

  const absent = specs.filter(({ metric }) => !(metric in metrics)).map(({ metric }) => metric)
  if (absent.length) throw new Error(`${channel}: Dash omitted requested metric(s): ${absent.join(', ')}`)

  const kpis: HeadlineKpi[] = specs.map(({ key, spec, metric }) => {
    const m = metrics[metric]
    const raw = m?.value ?? 0
    return {
      key,
      label: spec.label,
      format: spec.format,
      value: spec.format === 'percent' ? raw * 100 : raw,
      delta: delta(m),
      footnote: spec.footnote,
    }
  })

  return { channel, label: CHANNEL_LABEL[channel], kpis }
}
