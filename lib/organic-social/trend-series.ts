import type { TrendSeries, TrendPoint } from './types'

/** How a null day-value is filled when merging a channel's daily series.
 *  'zero'  — a missing day is genuinely 0 (a FLOW metric, e.g. engagement).
 *  'carry' — a missing day holds the last known value, never a fabricated 0
 *            (a STOCK metric, e.g. followers). Leading nulls (no prior value)
 *            are skipped so the line starts at the first real point. */
export type GapFill = 'zero' | 'carry'

/** Merge per-channel daily maps into a recharts-ready TrendSeries.
 *  Channels whose `daily` is null are dropped. Null day-values are filled per `gapFill`. */
export function buildTrendSeries(
  perChannel: { label: string; daily: Record<string, number | null> | null }[],
  { gapFill = 'zero' }: { gapFill?: GapFill } = {},
): TrendSeries {
  const channels: string[] = []
  const byDate = new Map<string, TrendPoint>()
  for (const { label, daily } of perChannel) {
    if (!daily) continue
    channels.push(label)
    // Sort per-channel so carry-forward sees days in chronological order.
    const dates = Object.keys(daily).sort((a, b) => a.localeCompare(b))
    let last: number | null = null
    for (const date of dates) {
      const raw = daily[date]
      let value: number
      if (raw != null) {
        value = raw
        last = raw
      } else if (gapFill === 'carry') {
        if (last == null) continue // leading null: no count to carry yet, skip the day
        value = last
      } else {
        value = 0
      }
      const row = byDate.get(date) ?? ({ date } as TrendPoint)
      row[label] = value
      byDate.set(date, row)
    }
  }
  const points = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return { points, channels }
}
