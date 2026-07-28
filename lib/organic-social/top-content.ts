import { cache } from 'react'
import { dashClientFor, isoRange, displayChannel } from './base'
import { CHANNEL_LABEL, resolveTargets, type DashChannel } from './metrics'
import { CONTENT_METRIC, CONTENT_ENGAGEMENT_FIELD, CONTENT_IMPRESSIONS_FIELD, CONTENT_ENGAGEMENT_RATE_FIELD, CONTENT_EFFECTIVENESS_FIELD } from './content-types'
import { resolveCreative } from './creative'
import type { DashContentPost, TopContentPost } from './content-types'
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

/** The active per-platform sub-object for a channel. */
function subObject(post: DashContentPost, channel: DashChannel): Record<string, unknown> | null {
  switch (channel) {
    case 'INSTAGRAM': return post.instagram ?? null
    case 'FACEBOOK':  return post.facebook ?? null
    case 'LINKEDIN':  return post.linkedin ?? null
    case 'TWITTER':   return post.twitter ?? null
  }
}

function captionUrl(sub: Record<string, unknown> | null, channel: DashChannel): { caption: string; url: string | null } {
  if (!sub) return { caption: '', url: null }
  const capKey = channel === 'FACEBOOK' ? 'message' : channel === 'TWITTER' ? 'text' : 'caption'
  const urlKey = channel === 'LINKEDIN' ? 'linkedin_link' : channel === 'TWITTER' ? 'permalink_url' : 'url'
  return { caption: String(sub[capKey] ?? ''), url: str(sub[urlKey]) }
}

const MEDIA_TYPES = new Set(['IMAGE', 'VIDEO', 'CAROUSEL'])

/** Pure: one CONTENT item → the normalized model. Engagements read the channel's public/
 *  organic engagement field (CONTENT_ENGAGEMENT_FIELD — different per channel; a uniform key
 *  silently zeroed 3 of 4 channels). NOTE (spec 2 §3.2): the engagement-RATE variant is still
 *  NOT VERIFIED and is per-channel too (engagement_rate_public exists on IG/FB but not LI/X);
 *  it is dormant here (the interim table doesn't display rate) and is resolved before S2-C's
 *  card ships (task C1), not defaulted silently. */
export function normalizePost(post: DashContentPost, channel: DashChannel): TopContentPost {
  const sub = subObject(post, channel)
  const { caption, url } = captionUrl(sub, channel)
  const effectivenessRaw = sub?.[CONTENT_EFFECTIVENESS_FIELD[channel]]
  const rateRaw = sub?.[CONTENT_ENGAGEMENT_RATE_FIELD[channel]]
  const mediaType = MEDIA_TYPES.has(post.type) ? (post.type as TopContentPost['mediaType']) : 'IMAGE'
  return {
    id: post.id,
    channel,
    platform: displayChannel(post.source),
    publishedAt: (post.source_created_at ?? '').slice(0, 10),
    caption,
    url,
    mediaType,
    mediaGroup: post.media_group ?? null,
    creative: resolveCreative(post, channel),
    metrics: {
      effectiveness: typeof effectivenessRaw === 'number' ? effectivenessRaw : null,
      engagementRate: typeof rateRaw === 'number' ? rateRaw : null,
      engagements: n(sub?.[CONTENT_ENGAGEMENT_FIELD[channel]]),
      impressions: n(sub?.[CONTENT_IMPRESSIONS_FIELD[channel]]),
    },
    sourceType: 'organic',
  }
}

/** The seam behind which "where posts come from" lives (spec 2 §2). One getContent
 *  request per allowlisted channel with that channel's CONTENT-valid metric, normalized
 *  and engagement-sorted. Scoped (single-channel) views surface errors; Overview drops a
 *  bad channel (the M1 channel != null policy, spec 1 §4.3). */
export async function fetchTopContent(
  slug: string,
  dateRange: string,
  channel: DashChannel | null,
): Promise<TopContentPost[]> {
  const { client, brandId, channels } = await dashClientFor(slug)
  // resolveTargets (not a bare filter) so a scoped channel OUTSIDE the allowlist THROWS — the
  // frozen path (fetchTopContentFrozen) calls this directly, so a bare filter would silently
  // yield [] and blank the subpage instead of surfacing the error card (PR #168 R2 #2).
  const targets = resolveTargets(channels, channel)
  const scoped = channel != null
  const { start, end } = isoRange(dateRange)

  const perChannel = await Promise.all(
    targets.map(async (ch): Promise<TopContentPost[]> => {
      try {
        // limit 500 ≈ 16× headroom over the largest channel (LinkedIn 31); no pagination needed.
        const res = await client.getContent({
          brandId, channel: ch, metric: CONTENT_METRIC[ch],
          startDate: start, endDate: end, limit: 500,
        })
        return (res.data?.content ?? []).map((p) => normalizePost(p, ch))
      } catch (e) {
        if (scoped) throw e // scoped view surfaces the error (spec 1 §4.3)
        return []           // Overview drops the bad channel
      }
    }),
  )
  // Instagram influencer posts are UGC — absent from CONTENT (OWNED only). Pull them via
  // the INSTAGRAM_UGC surface with a UGC_*-prefixed metric (spec 2 §4.5). Instagram ONLY:
  // FACEBOOK_UGC / LINKEDIN_UGC 400. normalizePost(_, 'INSTAGRAM') reads the Instagram engagement
  // field — sum_total_engagements (CONTENT_ENGAGEMENT_FIELD.INSTAGRAM, post-reconciliation; it
  // counts reposts, unlike the old engagements_public), the same field as owned Instagram.
  const wantsInstagram = targets.includes('INSTAGRAM')
  let ugc: TopContentPost[] = []
  if (wantsInstagram) {
    try {
      const res = await client.getContent({
        brandId, channel: 'INSTAGRAM_UGC', metric: 'UGC_TOTAL_ENGAGEMENTS',
        startDate: start, endDate: end, limit: 500,
      })
      ugc = (res.data?.content ?? []).map((p) => normalizePost(p, 'INSTAGRAM'))
    } catch (e) {
      if (scoped) throw e // scoped Instagram view surfaces the error
    }
  }
  return [...perChannel.flat(), ...ugc].sort((a, b) => b.metrics.engagements - a.metrics.engagements)
}

/** INTERIM (removed in S2-C when the card gallery lands): normalized posts → the current
 *  table's row shape. `views` carries per-channel impressions (CONTENT_IMPRESSIONS_FIELD);
 *  the interim table ranks by engagements. */
export function toTopContentRows(posts: TopContentPost[]): TopContentRow[] {
  return posts.map((p) => ({
    id: p.id,
    caption: p.caption,
    platform: p.platform,
    sourceType: p.sourceType,
    publishDate: p.publishedAt,
    views: p.metrics.impressions,
    engagements: p.metrics.engagements,
    url: p.url,
  }))
}

export const getTopContent = cache(async (
  slug: string,
  dateRange: string,
  channel: DashChannel | null = null,
): Promise<PlatformTopContent[]> => {
  const posts = await fetchTopContent(slug, dateRange, channel)
  const { channels } = await dashClientFor(slug)
  const allowed = resolveTargets(channels, channel)
  return groupByPlatform(toTopContentRows(posts), 25, allowed)
})
