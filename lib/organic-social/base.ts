// lib/organic-social/base.ts
import { DashSocialClient } from '@/lib/dash-social/client'
import type { ReportsDataResponse } from '@/lib/dash-social/types'
import { getClientBySlug } from '@/lib/db/queries'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { CHANNELS } from './metrics'

export { num, pct } from '@/lib/supermetrics/format'

/** Dash source/channel enum -> display label. Story/variant sources fold to their base channel. */
export const CHANNEL_DISPLAY: Record<string, string> = {
  INSTAGRAM: 'Instagram', INSTAGRAM_STORY: 'Instagram', FACEBOOK: 'Facebook',
  TWITTER: 'X', LINKEDIN: 'LinkedIn', TIKTOK: 'TikTok', YOUTUBE: 'YouTube', PINTEREST: 'Pinterest',
}
export function displayChannel(source: string): string {
  if (source in CHANNEL_DISPLAY) return CHANNEL_DISPLAY[source]
  const prefix = source.split('_')[0]
  return CHANNEL_DISPLAY[prefix] ?? source
}

/** Yield [channelKey, metrics] for CHANNEL entries only — skips the data_type:'BRAND' entry. */
export function channelMetricEntries<M>(res: ReportsDataResponse<M>): Array<[string, Record<string, M>]> {
  return Object.entries(res.data ?? {})
    .filter(([, e]) => e.data_type === 'CHANNEL' && e.metrics)
    .map(([ch, e]) => [ch, e.metrics as Record<string, M>])
}

/** Resolve the reportable Dash channels, honoring an optional lowercase allowlist. */
export function dashChannelsFor(allowlist?: string[]): string[] {
  if (!allowlist?.length) return [...CHANNELS]
  const up = allowlist.map((c) => c.toUpperCase())
  return CHANNELS.filter((c) => up.includes(c))
}

export async function dashClientFor(slug: string): Promise<{ client: DashSocialClient; brandId: number; channels: string[] }> {
  const c = await getClientBySlug(slug)
  const cfg = c?.dashSocialConfig
  if (!cfg) throw new Error(`dash_social_config missing for ${slug}`)
  const token = process.env.DASH_API_TOKEN
  if (!token) throw new Error('Missing env var DASH_API_TOKEN')
  return { client: new DashSocialClient({ token }), brandId: cfg.brandId, channels: dashChannelsFor(cfg.channels) }
}

export function resolveCompareIso(dateRange: string, compareRange: string | null): { start: string; end: string } | null {
  const r = deriveCompareRange(dateRange, compareRange)
  return r ? { start: r.startDate, end: r.endDate } : null
}

export function isoRange(dateRange: string): { start: string; end: string } {
  const { startDate, endDate } = parseDateRange(dateRange)
  return { start: startDate, end: endDate }
}
