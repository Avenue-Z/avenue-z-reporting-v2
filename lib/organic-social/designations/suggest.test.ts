import { expect, test } from 'vitest'
import { suggestDesignation } from './suggest'
import type { TopContentPost } from '../content-types'

const post = (caption: string): TopContentPost => ({
  id: 1, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-01',
  caption, url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null,
  metrics: { effectiveness: null, engagementRate: null, engagements: 0, impressions: 0 }, sourceType: 'organic',
})

test('#ad as a complete token suggests influencer', () => {
  expect(suggestDesignation(post('Loving this #ad thanks'))).toBe('influencer')
})
test('#ad is case-insensitive', () => {
  expect(suggestDesignation(post('gifted #AD'))).toBe('influencer')
})
test('#sponsored also suggests influencer', () => {
  expect(suggestDesignation(post('#Sponsored post'))).toBe('influencer')
})
test('#adventure and #advice do NOT match (token, not substring)', () => {
  expect(suggestDesignation(post('our #adventure begins'))).toBe('organic')
  expect(suggestDesignation(post('quick #advice here'))).toBe('organic')
})
test('no tag suggests organic', () => {
  expect(suggestDesignation(post('just a normal caption'))).toBe('organic')
})
test('#ad at end of caption matches', () => {
  expect(suggestDesignation(post('great product #ad'))).toBe('influencer')
})
