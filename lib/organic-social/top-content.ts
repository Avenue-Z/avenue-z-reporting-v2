import { dashClientFor, isoRange, displayChannel } from './base'
import type { MediaV2Response, MediaV2Post } from '@/lib/dash-social/types'
import type { TopContentRow } from './types'

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

export function transformTopContent(res: MediaV2Response, limit = 25): TopContentRow[] {
  return (res.data ?? [])
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
    .slice(0, limit)
}

export async function getTopContent(slug: string, dateRange: string): Promise<TopContentRow[]> {
  const { client, brandId } = await dashClientFor(slug)
  const { start, end } = isoRange(dateRange)
  const res = await client.getMedia({ brandId, startDate: start, endDate: end, limit: 100 })
  return transformTopContent(res, 25)
}
