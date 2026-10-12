/** The totals above the Influencer tab's cards, across the period's influencer posts (the same posts the cards show).
 *  views is null when no post reports any: influencer and UGC posts usually come back from Dash with 0 views, and a
 *  0 there would read as "nobody saw them". No posts: null, and no tiles are drawn. */
export interface InfluencerTotals { posts: number; engagements: number; perPost: number; views: number | null }

export function influencerTotals(posts: readonly { metrics: { engagements: number; impressions: number } }[]): InfluencerTotals | null {
  if (posts.length === 0) return null
  const engagements = posts.reduce((n, p) => n + p.metrics.engagements, 0)
  const views = posts.reduce((n, p) => n + p.metrics.impressions, 0)
  return { posts: posts.length, engagements, perPost: Math.round(engagements / posts.length), views: views > 0 ? views : null }
}

/** The Influencer tab's Views: a post Dash gave no views (impressions 0) takes its public views when Dash has them,
 *  which is the case for co-authored and tagged posts (spec 2026-10-09 section 5). Every other post is unchanged. */
export function withPublicViews<P extends { metrics: { impressions: number }; publicViews?: number }>(posts: readonly P[]): P[] {
  return posts.map((p) => (p.metrics.impressions === 0 && p.publicViews != null
    ? { ...p, metrics: { ...p.metrics, impressions: p.publicViews } }
    : p))
}
