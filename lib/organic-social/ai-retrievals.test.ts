import { expect, test } from 'vitest'
import { computeRetrievals, isOwnedLinkedIn } from './ai-retrievals'
import type { TopContentPost } from './content-types'

const post = (id: number, url: string): TopContentPost => ({
  id, channel: 'LINKEDIN', platform: 'LinkedIn', publishedAt: '2026-06-01', caption: '', url,
  mediaType: 'IMAGE', mediaGroup: null, creative: null,
  metrics: { effectiveness: null, engagementRate: null, engagements: 0, impressions: 0 }, sourceType: 'organic',
})

test('matched post gets its retrievals; unmatched gets 0; no workspace => null', () => {
  const posts = [post(1, 'https://www.linkedin.com/feed/update/urn:li:ugcPost:1'), post(2, 'https://www.linkedin.com/feed/update/urn:li:ugcPost:2')]
  const resolvedKeyByPostId = new Map([[1, 'linkedin.com/posts/x-activity-11'], [2, 'linkedin.com/posts/x-activity-22']])
  const retrievalsByKey = new Map([['linkedin.com/posts/x-activity-11', 34]])
  const withWs = computeRetrievals(posts, resolvedKeyByPostId, retrievalsByKey, true)
  expect(withWs.get(1)).toBe(34)
  expect(withWs.get(2)).toBe(0)                 // resolved but not cited => 0
  const noWs = computeRetrievals(posts, resolvedKeyByPostId, retrievalsByKey, false)
  expect(noWs.get(1)).toBeNull()                // no Peec workspace => N/A
})

test('unresolved post (no canonical key) => null (renders as —)', () => {
  const posts = [post(3, 'https://www.linkedin.com/feed/update/urn:li:ugcPost:3')]
  const r = computeRetrievals(posts, new Map(), new Map(), true)
  expect(r.get(3)).toBeNull()
})

test('owned post by handle path', () => {
  expect(isOwnedLinkedIn('linkedin.com/posts/renaissancebenefits_x-activity-1', null, 'renaissancebenefits')).toBe(true)
})
test('owned pulse by company author', () => {
  expect(isOwnedLinkedIn('linkedin.com/pulse/some-article-3w0rc', 'https://www.linkedin.com/company/renaissancebenefits', 'renaissancebenefits')).toBe(true)
})
test('third-party pulse (personal author) is NOT owned', () => {
  expect(isOwnedLinkedIn('linkedin.com/pulse/untapped-gold-howell-nmlce', 'https://www.linkedin.com/in/roger-g-howell', 'renaissancebenefits')).toBe(false)
})
test('a competitor company pulse is NOT owned', () => {
  expect(isOwnedLinkedIn('linkedin.com/pulse/x-tolbert', 'https://www.linkedin.com/company/berinieportal', 'renaissancebenefits')).toBe(false)
})
test('owned pulse by company author survives a tracking query string (urlJoinKey strips it)', () => {
  expect(isOwnedLinkedIn('linkedin.com/pulse/some-article-3w0rc', 'https://www.linkedin.com/company/renaissancebenefits?trk=abc', 'renaissancebenefits')).toBe(true)
})
