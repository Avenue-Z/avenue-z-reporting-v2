import { expect, test } from 'vitest'
import { influencerTotals, withPublicViews } from './influencer-totals'

const p = (engagements: number, impressions: number) => ({ metrics: { engagements, impressions } })

test('posts, total engagements, engagements per post rounded, and total views', () => {
  expect(influencerTotals([p(10, 100), p(5, 0), p(6, 50)])).toEqual({ posts: 3, engagements: 21, perPost: 7, views: 150 })
  expect(influencerTotals([p(1, 0), p(2, 0)])?.perPost).toBe(2) // 1.5 rounds up, as num() does
})

test('views are null, not 0, when no post reports any (influencer and UGC posts usually carry no reach)', () => {
  expect(influencerTotals([p(31002, 0), p(5359, 0)])).toEqual({ posts: 2, engagements: 36361, perPost: 18181, views: null })
})

test('no posts: nothing to total', () => {
  expect(influencerTotals([])).toBeNull()
})

test('a post with no views takes its public views; a post with views keeps them; a post with neither stays 0', () => {
  const p = (impressions: number, publicViews?: number) => ({ metrics: { engagements: 1, impressions }, ...(publicViews == null ? {} : { publicViews }) })
  expect(withPublicViews([p(0, 704013), p(2051, 2044), p(0)]).map((x) => x.metrics.impressions)).toEqual([704013, 2051, 0])
  expect(influencerTotals(withPublicViews([p(0, 704013), p(2051, 2044), p(0)]))!.views).toBe(706064)
  expect(influencerTotals(withPublicViews([p(0), p(0)]))!.views).toBeNull()
})
