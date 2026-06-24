import { dashClientFor, isoRange, displayChannel } from './base'
import { CHANNELS, CHANNEL_LABEL } from './metrics'
import type { MediaV2Response, MediaV2Post } from '@/lib/dash-social/types'
import type { TopContentRow, PlatformTopContent } from './types'

const n = (v: unknown): number => (typeof v === 'number' ? v : 0)

/** Extract (caption, views, engagements) from whichever per-platform sub-object is populated. */
function metricsFor(post: MediaV2Post): { caption: string; views: number; engagements: number } {
  const ig = post.instagram, fb = post.facebook, li = post.linkedin, tw = post.twitter
  if (ig) return { caption: String(ig.caption ?? ''), views: n(ig.paid_and_organic_reach) || n(ig.impressions), engagements: n(ig.engagements_public) || n(ig.like_count) + n(ig.comments_count) }
  if (fb) return { caption: String(fb.message ?? ''), views: n(fb.organic_views) || n(fb.organic_reach), engagements: n(fb.organic_engagements) }
  if (li) return { caption: String(li.caption ?? ''), views: n(li.impressions), engagements: n(li.engagements) }
  if (tw) return { caption: String(tw.text ?? ''), views: n(tw.impressions), engagements: n(tw.engagements) }
  return { caption: '', views: 0, engagements: 0 }
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
      }
    })
    .sort((a, b) => b.engagements - a.engagements)
  return limit != null ? rows.slice(0, limit) : rows
}

const PLATFORM_ORDER = CHANNELS.map((c) => CHANNEL_LABEL[c])

/**
 * Group rows into per-platform sections, in canonical order. Keeps all of a
 * platform's rows (optionally capped) so the UI can rank by either engagement
 * or views without losing a top performer in the other metric.
 */
export function groupByPlatform(rows: TopContentRow[], perPlatform?: number): PlatformTopContent[] {
  const byPlatform = new Map<string, TopContentRow[]>()
  for (const r of rows) {
    // Only the report's known platforms — skips unmapped sources like UPLOAD.
    if (!PLATFORM_ORDER.includes(r.platform)) continue
    const arr = byPlatform.get(r.platform) ?? []
    arr.push(r)
    byPlatform.set(r.platform, arr)
  }
  const rank = (p: string) => {
    const i = PLATFORM_ORDER.indexOf(p)
    return i === -1 ? PLATFORM_ORDER.length : i
  }
  return [...byPlatform.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([platform, rs]) => ({ platform, rows: perPlatform != null ? rs.slice(0, perPlatform) : rs }))
}

export async function getTopContent(slug: string, dateRange: string): Promise<PlatformTopContent[]> {
  const { client, brandId } = await dashClientFor(slug)
  const { start, end } = isoRange(dateRange)
  const res = await client.getMedia({ brandId, startDate: start, endDate: end, limit: 100 })
  // Cap at 25/platform to bound payload; the UI slices to top 5 by the active metric.
  return groupByPlatform(transformTopContent(res), 25)
}
