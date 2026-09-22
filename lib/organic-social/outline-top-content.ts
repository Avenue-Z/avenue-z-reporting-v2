// Outline Top Content rules (top-content@3), per client and opt-in. Pure.
import type { TopContentPost } from './content-types'
import type { SourceType } from './types'
import { resolveDesignation } from './designations/partition'

export type OwnHandles = Partial<Record<'INSTAGRAM', string>>

/** dash_social_config.ownHandles.instagram, validated at runtime (the jsonb is untrusted). */
export function parseOwnHandles(cfg: unknown): OwnHandles {
  const h = (cfg as { ownHandles?: { instagram?: unknown } } | null)?.ownHandles
  const ig = h && typeof h === 'object' ? (h as { instagram?: unknown }).instagram : undefined
  return typeof ig === 'string' && ig.trim() ? { INSTAGRAM: ig.trim().replace(/^@/, '').toLowerCase() } : {}
}

/** Stored designation first (a team member's choice), then the author rule when both the author and
 *  the client's own handle are known (matches the decks: a post authored by someone else is a collab
 *  post), otherwise today's #ad suggestion. */
export function partitionByAuthor(posts: TopContentPost[], stored: Map<number, SourceType>, own: OwnHandles) {
  const owned: TopContentPost[] = []
  const influencer: TopContentPost[] = []
  for (const post of posts) {
    const mine = own[post.channel as 'INSTAGRAM']
    const sourceType: SourceType = stored.get(post.id)
      ?? (post.author && mine ? (post.author !== mine ? 'influencer' : 'organic') : resolveDesignation(post, stored))
    ;(sourceType === 'influencer' ? influencer : owned).push({ ...post, sourceType })
  }
  return { owned, influencer }
}

/** Instagram cards on the deck basis (D25): engagements / views, which equals Dash's per-post
 *  engagement_rate_views (probed 2026-09-21, 24 of 24). Works on frozen posts too. */
export function withViewsBasisRate(posts: TopContentPost[]): TopContentPost[] {
  return posts.map((p) => p.channel !== 'INSTAGRAM' ? p
    : { ...p, metrics: { ...p.metrics, engagementRate: p.metrics.impressions > 0 ? p.metrics.engagements / p.metrics.impressions : null } })
}

/** Owned posts per platform row (D16: five per tab), from the part pin's threshold. */
export function ownedPostLimit(threshold: number | undefined): number {
  return typeof threshold === 'number' && Number.isInteger(threshold) && threshold >= 1 && threshold <= 50 ? threshold : 5
}

/** True when the author rule cannot run: an own handle is set, Instagram posts exist, and none has an
 *  author (a window frozen before top-content@3 was pinned). The caller logs it. */
export function missingAuthors(posts: TopContentPost[], own: OwnHandles): boolean {
  const ig = posts.filter((p) => p.channel === 'INSTAGRAM')
  return Boolean(own.INSTAGRAM) && ig.length > 0 && ig.every((p) => !p.author)
}
