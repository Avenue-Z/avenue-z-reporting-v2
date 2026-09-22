import { expect, test } from 'vitest'
import { handleMatchesNoAuthor, missingAuthors, ownedPostLimit, parseOwnHandles, partitionByAuthor, withViewsBasisRate } from './outline-top-content'

const P = (id: number, over: Record<string, unknown> = {}) => ({ id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-08-02',
  caption: '', url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null, sourceType: 'organic',
  metrics: { effectiveness: null, engagementRate: 0.01, engagements: 3, impressions: 30 }, ...over }) as never

test('own handles are read from config as lowercase without @; anything else is none', () => {
  expect(parseOwnHandles({ brandId: 1, ownHandles: { instagram: '@Brand_Handle' } })).toEqual({ INSTAGRAM: 'brand_handle' })
  expect(parseOwnHandles({ ownHandles: { instagram: ' @@Brand_Handle ' } })).toEqual({ INSTAGRAM: 'brand_handle' })
  expect(parseOwnHandles({ ownHandles: { instagram: '@' } })).toEqual({})
  for (const c of [{ brandId: 1 }, null, { ownHandles: 'x' }, { ownHandles: { instagram: 5 } }]) expect(parseOwnHandles(c)).toEqual({})
})
test('author rule: another author is a collab post; the client itself is not; unknown falls back to #ad', () => {
  const own = { INSTAGRAM: 'brand_handle' }
  const posts = [P(1, { author: 'creator_one' }), P(2, { author: 'brand_handle' }), P(3, { caption: 'yay #ad' }), P(4)]
  const { owned, influencer } = partitionByAuthor(posts, new Map(), own)
  expect(influencer.map((p: { id: number }) => p.id)).toEqual([1, 3])
  expect(owned.map((p: { id: number }) => p.id)).toEqual([2, 4])
  expect(partitionByAuthor([P(1, { author: 'creator_one' })], new Map([[1, 'organic']]), own).owned.map((p: { id: number }) => p.id)).toEqual([1])
  expect(partitionByAuthor([P(1, { author: 'creator_one' })], new Map(), {}).owned.map((p: { id: number }) => p.id)).toEqual([1])
})
test('Instagram card rate is engagements over views; no views is no rate; other channels untouched', () => {
  const [ig, igNoViews, fb] = withViewsBasisRate([P(1), P(2, { metrics: { effectiveness: null, engagementRate: 0.5, engagements: 3, impressions: 0 } }), P(3, { channel: 'FACEBOOK' })])
  expect([ig.metrics.engagementRate, igNoViews.metrics.engagementRate, fb.metrics.engagementRate]).toEqual([0.1, null, 0.01])
})
test('owned posts per row: the pin threshold, default 5, whole numbers 1 to 50 only', () => {
  expect([ownedPostLimit(undefined), ownedPostLimit(6), ownedPostLimit(0), ownedPostLimit(51), ownedPostLimit(4.5)]).toEqual([5, 6, 5, 5, 5])
})
test('missing authors: an own handle is set, Instagram posts exist, none carries an author', () => {
  expect(missingAuthors([P(1)], { INSTAGRAM: 'brand_handle' })).toBe(true)
  expect(missingAuthors([P(1, { author: 'brand_handle' })], { INSTAGRAM: 'brand_handle' })).toBe(false)
  expect(missingAuthors([P(1)], {})).toBe(false)
  expect(missingAuthors([], { INSTAGRAM: 'brand_handle' })).toBe(false)
})
test('a stale or mistyped own handle: posts carry authors but none is the handle, so it is not trusted', () => {
  const own = { INSTAGRAM: 'old_handle' }
  expect(handleMatchesNoAuthor([P(1, { author: 'brand_handle' }), P(2, { author: 'creator_one' }), P(3)], own)).toBe(true)
  expect(handleMatchesNoAuthor([P(1, { author: 'old_handle' }), P(2, { author: 'creator_one' })], own)).toBe(false)
  expect(handleMatchesNoAuthor([P(1), P(2)], own)).toBe(false)
  expect(handleMatchesNoAuthor([P(1, { author: 'brand_handle' })], {})).toBe(false)
  expect(handleMatchesNoAuthor([P(1, { author: 'brand_handle', channel: 'FACEBOOK' })], own)).toBe(false)
})
