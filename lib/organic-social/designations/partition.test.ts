import { expect, test } from 'vitest'
import { partitionPosts, resolveDesignation } from './partition'
import type { TopContentPost } from '../content-types'
import type { SourceType } from '../types'

const post = (id: number, caption: string): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-01',
  caption, url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null,
  metrics: { effectiveness: null, engagementRate: null, engagements: 0, impressions: 0 }, sourceType: 'organic',
})

test('stored row wins over the #ad suggestion (can un-mark)', () => {
  const stored = new Map<number, SourceType>([[1, 'organic']])
  expect(resolveDesignation(post(1, 'gifted #ad'), stored)).toBe('organic') // NOT influencer
})
test('stored influencer wins on a plain caption', () => {
  const stored = new Map<number, SourceType>([[2, 'influencer']])
  expect(resolveDesignation(post(2, 'plain'), stored)).toBe('influencer')
})
test('no stored row falls back to the #ad suggestion', () => {
  expect(resolveDesignation(post(3, 'love this #ad'), new Map())).toBe('influencer')
})
test('no stored row + no tag falls back to organic', () => {
  expect(resolveDesignation(post(4, 'plain'), new Map())).toBe('organic')
})
test('partitionPosts splits and tags sourceType, preserving input order', () => {
  const stored = new Map<number, SourceType>([[1, 'organic']])
  const { owned, influencer } = partitionPosts(
    [post(1, '#ad'), post(3, '#ad'), post(4, 'plain')], stored,
  )
  expect(owned.map((p) => p.id)).toEqual([1, 4])
  expect(influencer.map((p) => p.id)).toEqual([3])
  expect(influencer[0].sourceType).toBe('influencer')
  expect(owned[0].sourceType).toBe('organic')
})
