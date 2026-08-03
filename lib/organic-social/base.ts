// lib/organic-social/base.ts
import { cache } from 'react'
import { DashSocialClient } from '@/lib/dash-social/client'
import { getClientBySlug } from '@/lib/db/queries'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { resolveChannels, type DashChannel } from './metrics'

export { num, pct, pctCompact } from '@/lib/supermetrics/format'

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

/** React.cache-wrapped for per-render dedup (matches getClientBySlug) — callers that need
 *  both the client and the channel list (e.g. getTopContent) resolve it once, not twice. */
export const dashClientFor = cache(
  async (slug: string): Promise<{ client: DashSocialClient; brandId: number; channels: DashChannel[] }> => {
    const c = await getClientBySlug(slug)
    const cfg = c?.dashSocialConfig
    if (!cfg) throw new Error(`dash_social_config missing for ${slug}`)
    const token = process.env.DASH_API_TOKEN
    if (!token) throw new Error('Missing env var DASH_API_TOKEN')
    return { client: new DashSocialClient({ token }), brandId: cfg.brandId, channels: resolveChannels(cfg.channels) }
  },
)

/** Plain reporting window (yyyy-mm-dd) — used by the library media/v2 endpoint. */
export function isoRange(dateRange: string): { start: string; end: string } {
  const { startDate, endDate } = parseDateRange(dateRange)
  return { start: startDate, end: endDate }
}

/** Dash overview dates use midnight Eastern (e.g. 2026-06-16T04:00:00Z). */
const TZ_SUFFIX = 'T04:00:00Z'

/** Reporting window, formatted timezone-aware for Dash TOTAL_GROUPED_METRIC / GRAPH requests. */
export function isoRangeTz(dateRange: string): { start: string; end: string } {
  const { startDate, endDate } = parseDateRange(dateRange)
  return { start: startDate + TZ_SUFFIX, end: endDate + TZ_SUFFIX }
}

/** Prior-period (compare) window, timezone-aware, or null when no comparison applies. */
export function resolveCompareIso(dateRange: string, compareRange: string | null): { start: string; end: string } | null {
  const r = deriveCompareRange(dateRange, compareRange)
  return r ? { start: r.startDate + TZ_SUFFIX, end: r.endDate + TZ_SUFFIX } : null
}
