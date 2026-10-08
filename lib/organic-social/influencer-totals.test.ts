import { expect, test } from 'vitest'
import { influencerTotals } from './influencer-totals'

const p = (engagements: number, impressions: number) => ({ metrics: { engagements, impressions } })

test('posts, total engagements, engagements per post rounded, and total views', () => {
  expect(influencerTotals([p(10, 100), p(5, 0), p(6, 50)])).toEqual({ posts: 3, engagements: 21, perPost: 7, views: 150 })
  expect(influencerTotals([p(1, 0), p(2, 0)]).perPost).toBe(2) // 1.5 rounds up, as num() does
})

test('views are null, not 0, when no post reports any (influencer and UGC posts usually carry no reach)', () => {
  expect(influencerTotals([p(31002, 0), p(5359, 0)])).toEqual({ posts: 2, engagements: 36361, perPost: 18181, views: null })
})

test('no posts: nothing to total', () => {
  expect(influencerTotals([])).toBeNull()
})
