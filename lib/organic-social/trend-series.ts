import type { TrendSeries, TrendPoint } from './types'

/** Merge per-channel daily maps into a recharts-ready TrendSeries.
 *  Channels whose `daily` is null are dropped; null day-values become 0. */
export function buildTrendSeries(
  perChannel: { label: string; daily: Record<string, number | null> | null }[],
): TrendSeries {
  const channels: string[] = []
  const byDate = new Map<string, TrendPoint>()
  for (const { label, daily } of perChannel) {
    if (!daily) continue
    channels.push(label)
    for (const [date, value] of Object.entries(daily)) {
      const row = byDate.get(date) ?? ({ date } as TrendPoint)
      row[label] = value ?? 0
      byDate.set(date, row)
    }
  }
  const points = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return { points, channels }
}
