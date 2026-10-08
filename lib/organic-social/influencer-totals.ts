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
