import { expect, test } from 'vitest'
import { toPostMarks } from './post-marks'
import type { TopContentPost } from './content-types'

const post = (id: number, publishedAt: string, over: Partial<TopContentPost> = {}): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt, caption: `post ${id}`,
  url: `https://example.com/${id}`, mediaType: 'IMAGE', mediaGroup: null,
  creative: { kind: 'image', thumb: `t${id}`, full: `f${id}` },
  metrics: { effectiveness: null, engagementRate: null, engagements: 0, impressions: 0 },
  sourceType: 'organic', ...over,
})

test('one post becomes one mark carrying its date, creative and link', () => {
  const [m] = toPostMarks([post(1, '2026-08-04')])
  expect(m.date).toBe('2026-08-04')
  expect(m.count).toBe(1)
  expect(m.posts[0].creative).toEqual({ kind: 'image', thumb: 't1', full: 'f1' })
  expect(m.posts[0].url).toBe('https://example.com/1')
})

test('posts published the same day collapse into one mark', () => {
  const marks = toPostMarks([post(1, '2026-08-04'), post(2, '2026-08-04'), post(3, '2026-08-09')])
  expect(marks.map((m) => m.date)).toEqual(['2026-08-04', '2026-08-09'])
  expect(marks[0].count).toBe(2)
  expect(marks[0].posts.map((p) => p.id)).toEqual([1, 2])
})

test('marks come back in date order regardless of input order', () => {
  const marks = toPostMarks([post(3, '2026-08-20'), post(1, '2026-08-02'), post(2, '2026-08-11')])
  expect(marks.map((m) => m.date)).toEqual(['2026-08-02', '2026-08-11', '2026-08-20'])
})

// A post with no resolvable creative still marks the day. The graph is answering
// "what went live and when", and a missing thumbnail is not a reason to hide that
// something ran (resolveCreative returns null only on genuine failure).
test('a post with no creative still produces a mark', () => {
  const marks = toPostMarks([post(1, '2026-08-04', { creative: null })])
  expect(marks).toHaveLength(1)
  expect(marks[0].posts[0].creative).toBeNull()
})

// Dash has handed us a blank source_created_at before (top-content slices it off a
// timestamp). An undated post cannot be placed on a time axis, so it is dropped
// rather than silently rendered at the epoch or at today.
test('a post with no publish date is dropped, not placed arbitrarily', () => {
  const marks = toPostMarks([post(1, ''), post(2, '2026-08-04')])
  expect(marks.map((m) => m.date)).toEqual(['2026-08-04'])
})

test('no posts means no marks', () => {
  expect(toPostMarks([])).toEqual([])
})
