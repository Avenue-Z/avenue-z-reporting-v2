// Pure headline assembly for Organic Social Overview — no fetching, no Next/DB.
// Mirrors trend-series.ts (pure) vs trends.ts (fetcher): headlines.ts fetches,
// this builds + validates the fixed-shape PlatformHeadline from a raw Dash
// metrics map. Kept pure so the guard and mapping are unit-testable.
import { OVERVIEW_KPI_KEYS, metricForKey, kpiFor, CHANNEL_LABEL, type DashChannel } from './metrics'
import type { TotalMetric } from '@/lib/dash-social/types'
import type { PlatformHeadline } from './types'

/** Prior-period percent change from a Dash metric's value vs. its context, or undefined. */
function delta(m: TotalMetric | undefined): number | undefined {
  if (!m) return undefined
  const cur = m.value ?? 0
  const prev = m.context
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}

function pruneDeltas(d: PlatformHeadline['deltas']): PlatformHeadline['deltas'] {
  if (!d) return undefined
  const has = Object.values(d).some((v) => v !== undefined)
  return has ? d : undefined
}

/** The Dash metric names Overview requests for a channel, resolved through the
 *  active REPORTING_BASIS. Single source of truth for the request AND the guard —
 *  headlines.ts sends exactly this, and buildPlatformHeadline validates against it. */
export const overviewMetricNames = (channel: DashChannel): string[] =>
  OVERVIEW_KPI_KEYS.map((k) => metricForKey(channel, k))

/** Assemble the fixed five-field PlatformHeadline from a channel's raw Dash metrics map.
 *
 *  Guard (PR #173 review #1): Dash 400s a whole batch if any requested metric is invalid
 *  for the channel (WHOLE-BATCH-400, proven live), and a legitimately-empty window returns
 *  every requested key PRESENT with value:null — NOT absent. So a 200 that OMITS a requested
 *  key is a malformed/partial payload: throw (Overview drops the channel, a scoped view errors)
 *  rather than let `?? 0` render a fabricated zero on a client card. A present value:null is a
 *  genuine no-data zero and is preserved via `?? 0`. */
export function buildPlatformHeadline(
  channel: DashChannel,
  metrics: Record<string, TotalMetric>,
): PlatformHeadline {
  const kpis = OVERVIEW_KPI_KEYS.map((key) => ({ key, metric: metricForKey(channel, key) }))

  const absent = kpis.filter(({ metric }) => !(metric in metrics)).map(({ metric }) => metric)
  if (absent.length) throw new Error(`${channel}: Dash omitted requested metric(s): ${absent.join(', ')}`)

  const byKey = Object.fromEntries(kpis.map(({ key, metric }) => [key, metrics[metric]])) as
    Record<(typeof OVERVIEW_KPI_KEYS)[number], TotalMetric | undefined>

  const deltas = pruneDeltas({
    followers: delta(byKey.followers),
    netNewFollowers: delta(byKey.netNewFollowers),
    exposure: delta(byKey.exposure),
    engagements: delta(byKey.engagements),
    engagementRate: delta(byKey.engagementRate),
  })

  return {
    channel,
    label: CHANNEL_LABEL[channel],
    exposureLabel: kpiFor(channel, 'exposure').label,
    followers: byKey.followers?.value ?? 0,
    netNewFollowers: byKey.netNewFollowers?.value ?? 0,
    exposure: byKey.exposure?.value ?? 0,
    engagements: byKey.engagements?.value ?? 0,
    engagementRate: (byKey.engagementRate?.value ?? 0) * 100,
    deltas,
  }
}
