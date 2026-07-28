import { cache } from 'react'
import { dashClientFor, isoRange, displayChannel } from './base'
import { CHANNEL_LABEL, resolveTargets, type DashChannel } from './metrics'
import type { MediaV2Response, MediaV2Post } from '@/lib/dash-social/types'
import type { TopContentRow, PlatformTopContent } from './types'

const n = (v: unknown): number => (typeof v === 'number' ? v : 0)
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/** Extract (caption, views, engagements, url) from whichever per-platform sub-object is populated. */
function metricsFor(post: MediaV2Post): { caption: string; views: number; engagements: number; url: string | null } {
  const ig = post.instagram, fb = post.facebook, li = post.linkedin, tw = post.twitter
  if (ig) return { caption: String(ig.caption ?? ''), views: n(ig.paid_and_organic_reach) || n(ig.impressions), engagements: n(ig.engagements_public) || n(ig.like_count) + n(ig.comments_count), url: str(ig.url) }
  if (fb) return { caption: String(fb.message ?? ''), views: n(fb.organic_views) || n(fb.organic_reach), engagements: n(fb.organic_engagements), url: str(fb.url) }
  if (li) return { caption: String(li.caption ?? ''), views: n(li.impressions), engagements: n(li.engagements), url: str(li.linkedin_link) }
  if (tw) return { caption: String(tw.text ?? ''), views: n(tw.impressions), engagements: n(tw.engagements), url: str(tw.permalink_url) }
  return { caption: '', views: 0, engagements: 0, url: null }
}

export function transformTopContent(res: MediaV2Response, limit?: number): TopContentRow[] {
  const rows = (res.data ?? [])
    .map((post): TopContentRow => {
      const m = metricsFor(post)
      return {
        id: post.id,
        caption: m.caption,
        platform: displayChannel(post.source),
        sourceType: 'organic',
        publishDate: (post.source_created_at ?? '').slice(0, 10),
        views: m.views,
        engagements: m.engagements,
        url: m.url,
      }
    })
    .sort((a, b) => b.engagements - a.engagements)
  return limit != null ? rows.slice(0, limit) : rows
}

/**
 * Group rows into per-platform sections, ordered and filtered by `allowed`.
 * Comparison is in LABEL space — `allowed` holds DashChannel enums ('TWITTER')
 * while rows[].platform holds display labels ('X'), bridged via CHANNEL_LABEL.
 */
export function groupByPlatform(
  rows: TopContentRow[],
  perPlatform: number | undefined,
  allowed: DashChannel[],
): PlatformTopContent[] {
  const order = allowed.map((c) => CHANNEL_LABEL[c]) // ['Instagram','X',…]
  const byPlatform = new Map<string, TopContentRow[]>()
  for (const r of rows) {
    if (!order.includes(r.platform)) continue // skips unmapped sources like UPLOAD
    const arr = byPlatform.get(r.platform) ?? []
    arr.push(r)
    byPlatform.set(r.platform, arr)
  }
  const rank = (p: string) => {
    const i = order.indexOf(p)
    return i === -1 ? order.length : i
  }
  return [...byPlatform.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([platform, rs]) => ({ platform, rows: perPlatform != null ? rs.slice(0, perPlatform) : rs }))
}

export const getTopContent = cache(async (
  slug: string,
  dateRange: string,
  channel: DashChannel | null = null,
): Promise<PlatformTopContent[]> => {
  const { client, brandId, channels } = await dashClientFor(slug)
  const allowed = resolveTargets(channels, channel)
  const { start, end } = isoRange(dateRange)
  // The media/v2 request is unchanged (the endpoint has no channel param); only the transform is scoped.
  const res = await client.getMedia({ brandId, startDate: start, endDate: end, limit: 100 })
  return groupByPlatform(transformTopContent(res), 25, allowed)
})
