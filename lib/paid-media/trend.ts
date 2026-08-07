import type { ChannelKey } from './overview'

export interface ChannelSeriesPoint { date: string; spend: number; clicks: number } // 'YYYY-MM-DD'
export interface TrendPoint { date: string; channels: Partial<Record<ChannelKey, { spend: number; clicks: number }>> } // 'YYYY-MM-DD'
export interface PaidMediaTrend { points: TrendPoint[]; channels: ChannelKey[] }

/**
 * Merge per-channel daily series into date-keyed points — one row per day, with a
 * `{spend, clicks}` per channel that reported that day. Daily granularity (no weekly
 * rollup) so the x-axis label density tracks the date range, matching Organic Social's
 * trend chart. Aligned by **date string**, never array index (the codebase's
 * join-by-index hazard — CLAUDE.md open follow-ups). A channel with more than one row
 * for a date is summed defensively; normally each channel has one row per day.
 */
export function blendDaily(perChannel: Array<{ key: ChannelKey; points: ChannelSeriesPoint[] }>): TrendPoint[] {
  const byDate = new Map<string, TrendPoint>()
  for (const { key, points } of perChannel) {
    for (const p of points) {
      const row = byDate.get(p.date) ?? { date: p.date, channels: {} }
      const prev = row.channels[key]
      row.channels[key] = prev
        ? { spend: prev.spend + p.spend, clicks: prev.clicks + p.clicks }
        : { spend: p.spend, clicks: p.clicks }
      byDate.set(p.date, row)
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

import { awQuery } from '@/lib/paid-search/base'
import { metaQuery } from '@/lib/meta/base'
import { linkedinQuery } from '@/lib/linkedin/base'
import { getClientBySlug } from '@/lib/db/queries'

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/
const isValidDate = (date: string): boolean => {
  if (!DATE_SHAPE.test(date)) return false
  // Round-trip: JS Date ROLLS impossible dates over ('2026-02-30' → Mar 2, still
  // finite), so a finiteness check alone accepts them. Re-serialising and comparing
  // rejects any date the parser silently shifted.
  const d = new Date(date + 'T00:00:00Z')
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date
}

const toPoints = (rows: Record<string, string>[], spendKey: string, clicksKey: string): ChannelSeriesPoint[] =>
  // LinkedIn's Supermetrics connector returns the day dimension keyed lowercase `date`,
  // whereas Paid Search and Meta return `Date`. Fall back so no channel silently flatlines.
  rows.map((r) => ({ date: r.Date ?? r.date, spend: Number(r[spendKey] || 0), clicks: Number(r[clicksKey] || 0) })).filter((p) => isValidDate(p.date))

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
      return { key, points: res.value }
    })
    .filter((c): c is { key: ChannelKey; points: ChannelSeriesPoint[] } => c !== null)

  return { points: blendDaily(perChannel), channels: perChannel.map((c) => c.key) }
}
