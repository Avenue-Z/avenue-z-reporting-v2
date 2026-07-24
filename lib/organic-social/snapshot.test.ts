import { expect, test } from 'vitest'
import { toPayload, fromSnapshot } from './snapshot'
import type { TopContentPost } from './content-types'

const post: TopContentPost = {
  id: 7, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-01',
  caption: 'hi', url: 'https://x/y', mediaType: 'VIDEO', mediaGroup: null,
  creative: { kind: 'video', src: 'https://cdn/y.mp4', poster: 'https://cdn/p.jpg' },
  metrics: { effectiveness: 12, engagementRate: 0.04, engagements: 33, impressions: 900 }, sourceType: 'influencer',
}

test('toPayload drops sourceType but keeps creative URLs + metrics', () => {
  const payload = toPayload(post)
  expect('sourceType' in payload).toBe(false)
  expect(payload.creative).toEqual(post.creative)
  expect(payload.metrics.engagements).toBe(33)
  expect(payload.metrics.impressions).toBe(900)
})

test('fromSnapshot reconstructs a TopContentPost with the live sourceType', () => {
  const back = fromSnapshot(toPayload(post), 'organic')
  expect(back.id).toBe(7)
  expect(back.sourceType).toBe('organic') // NOT the frozen influencer — designations stay live
  expect(back.creative).toEqual(post.creative)
})
