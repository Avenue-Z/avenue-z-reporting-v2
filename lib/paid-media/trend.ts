import type { ChannelKey } from './overview'

export interface ChannelSeriesPoint { date: string; spend: number; clicks: number } // 'YYYY-MM-DD'
export interface TrendPoint { week: string; label: string; channels: Partial<Record<ChannelKey, { spend: number; clicks: number }>> }
export interface PaidMediaTrend { points: TrendPoint[]; channels: ChannelKey[] }

/** Monday (UTC) of the week containing `date`, as 'YYYY-MM-DD'. */
export function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  const day = d.getUTCDay() // 0=Sun … 6=Sat
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().slice(0, 10)
}

function weekLabel(weekKey: string): string {
  return new Date(weekKey + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function bucketToWeeks(points: ChannelSeriesPoint[]): Map<string, { spend: number; clicks: number }> {
  const weeks = new Map<string, { spend: number; clicks: number }>()
  for (const p of points) {
    if (!p.date) continue
    const key = weekStart(p.date)
    const acc = weeks.get(key) ?? { spend: 0, clicks: 0 }
    acc.spend += p.spend
    acc.clicks += p.clicks
    weeks.set(key, acc)
  }
  return weeks
}

export function blendTrend(perChannel: Array<{ key: ChannelKey; weeks: Map<string, { spend: number; clicks: number }> }>): TrendPoint[] {
  const allWeeks = new Set<string>()
  for (const c of perChannel) for (const w of c.weeks.keys()) allWeeks.add(w)
  return [...allWeeks]
    .sort((a, b) => a.localeCompare(b))
    .map((week) => {
      const channels: TrendPoint['channels'] = {}
      for (const c of perChannel) {
        const v = c.weeks.get(week)
        if (v) channels[c.key] = v
      }
      return { week, label: weekLabel(week), channels }
    })
}
