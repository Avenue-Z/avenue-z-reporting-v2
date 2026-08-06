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

import { awQuery } from '@/lib/paid-search/base'
import { metaQuery } from '@/lib/meta/base'
import { linkedinQuery } from '@/lib/linkedin/base'
import { getClientBySlug } from '@/lib/db/queries'

const toPoints = (rows: Record<string, string>[], spendKey: string, clicksKey: string): ChannelSeriesPoint[] =>
  rows.map((r) => ({ date: r.Date, spend: Number(r[spendKey] || 0), clicks: Number(r[clicksKey] || 0) })).filter((p) => p.date)

async function getPaidSearchSeries(slug: string, dateRange: string): Promise<ChannelSeriesPoint[]> {
  return toPoints(await awQuery(slug, ['Date', 'Cost', 'Clicks'], dateRange), 'Cost', 'Clicks')
}
async function getMetaSeries(slug: string, dateRange: string): Promise<ChannelSeriesPoint[]> {
  // Meta clicks = link clicks (inline_link_clicks) — consistent with the KPI blend.
  return toPoints(await metaQuery(slug, ['Date', 'cost', 'inline_link_clicks'], dateRange), 'cost', 'inline_link_clicks')
}
async function getLinkedInSeries(slug: string, dateRange: string): Promise<ChannelSeriesPoint[]> {
  return toPoints(await linkedinQuery(slug, ['Date', 'spend', 'clicks'], dateRange), 'spend', 'clicks')
}

export async function getPaidMediaTrend(clientSlug: string, dateRange: string): Promise<PaidMediaTrend> {
  const client = await getClientBySlug(clientSlug)
  const order: ChannelKey[] = ['paid-search', 'meta', 'linkedin']
  const configured: Record<ChannelKey, boolean> = {
    'paid-search': !!client?.paidSearchConfig,
    meta: !!client?.metaConfig,
    linkedin: !!client?.linkedinConfig,
  }
  const settled = await Promise.allSettled([
    configured['paid-search'] ? getPaidSearchSeries(clientSlug, dateRange) : Promise.resolve(null),
    configured.meta ? getMetaSeries(clientSlug, dateRange) : Promise.resolve(null),
    configured.linkedin ? getLinkedInSeries(clientSlug, dateRange) : Promise.resolve(null),
  ])
  const perChannel = order
    .map((key, i) => {
      const res = settled[i]
      if (res.status !== 'fulfilled' || res.value == null) return null
      return { key, weeks: bucketToWeeks(res.value) }
    })
    .filter((c): c is { key: ChannelKey; weeks: Map<string, { spend: number; clicks: number }> } => c !== null)

  return { points: blendTrend(perChannel), channels: perChannel.map((c) => c.key) }
}
