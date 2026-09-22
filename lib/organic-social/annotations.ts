import type { TrendSeries } from './types'

/** One day worth calling out on a trend chart. */
export interface Peak {
  /** yyyy-mm-dd, as it appears on the series. */
  date: string
  /** That day's value on the chart. Always positive. */
  value: number
}

/**
 * The days that spiked, the way the team marks them by hand in the monthly deck.
 *
 * Only days inside the requested window count. The v2 graphs request the UTC month, which
 * has no extra day, but the Eastern window v1 sends returns a day past the month on some
 * channels, so the guard stays.
 *
 * Only positive values count, so a quiet account shows fewer annotations rather than
 * calling out a flat day. Ties go to the earlier date so the same data always produces the
 * same annotations. Neighbouring days are allowed.
 *
 * Returns nothing for a chart with more than one channel: a peak across several lines is
 * ambiguous. Returned in date order, left to right, matching the chart.
 */
export function pickPeaks(
  series: TrendSeries,
  { limit, from, to }: { limit: number; from: string; to: string },
): Peak[] {
  if (limit <= 0 || series.channels.length !== 1) return []
  const key = series.channels[0]
  const candidates: Peak[] = []
  for (const point of series.points) {
    const date = String(point.date)
    if (date < from || date > to) continue
    const value = Number(point[key])
    if (!Number.isFinite(value) || value <= 0) continue
    candidates.push({ date, value })
  }
  candidates.sort((a, b) => b.value - a.value || a.date.localeCompare(b.date))
  return candidates.slice(0, limit).sort((a, b) => a.date.localeCompare(b.date))
}
