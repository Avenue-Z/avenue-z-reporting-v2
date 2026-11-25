import { describe, expect, test } from 'vitest'
import {
  currentUpload, presentedUpload, monthKey, monthDate,
  toSlUpload, toSlHistory, toSlPost, toSlTrends, trimUploads, toSlMonthData, type UploadRowJson,
} from './select'
import type { SlExport, SlUpload } from './types'

// Made-up numbers only (the repo is public).
function exportFor(month: string, results = 100): SlExport {
  return {
    version: 1, topic: 'brand', month, results,
    daily: [], sentiment: { pos: 50, neu: 30, neg: 20 }, sentimentByMedia: [], themes: [],
  }
}

function upload(id: string, at: string, beforeOpen: boolean): SlUpload {
  return { id, month: '2026-11', topic: 'brand', data: exportFor('2026-11'), beforeOpen, uploadedAt: new Date(at) }
}

describe('currentUpload', () => {
  test('is null with no uploads', () => {
    expect(currentUpload([])).toBeNull()
  })

  test('picks the newest by uploadedAt, whatever the input order', () => {
    const rows = [
      upload('b', '2026-12-03T10:00:00Z', false),
      upload('c', '2026-12-05T10:00:00Z', false),
      upload('a', '2026-12-01T10:00:00Z', true),
    ]
    expect(currentUpload(rows)?.id).toBe('c')
  })

  test('on an equal time the later row in the input wins', () => {
    const rows = [upload('a', '2026-12-01T10:00:00Z', true), upload('b', '2026-12-01T10:00:00Z', true)]
    expect(currentUpload(rows)?.id).toBe('b')
  })
})

describe('presentedUpload (D5)', () => {
  test('is null with no uploads', () => {
    expect(presentedUpload([])).toBeNull()
  })

  test('picks the newest upload made before the month opened', () => {
    const rows = [
      upload('early', '2026-12-01T10:00:00Z', true),
      upload('fix', '2026-12-02T10:00:00Z', true),
      upload('after-open', '2026-12-09T10:00:00Z', false),
    ]
    expect(presentedUpload(rows)?.id).toBe('fix')
  })

  test('with no upload before the open date, the first (earliest) one', () => {
    const rows = [
      upload('second', '2026-12-10T10:00:00Z', false),
      upload('first', '2026-12-08T10:00:00Z', false),
    ]
    expect(presentedUpload(rows)?.id).toBe('first')
  })

  test('a re-upload after the open date never moves it', () => {
    const before = [upload('presented', '2026-12-01T10:00:00Z', true)]
    const after = [...before, upload('later', '2026-12-20T10:00:00Z', false)]
    expect(presentedUpload(after)?.id).toBe(presentedUpload(before)?.id)
    expect(currentUpload(after)?.id).toBe('later')
  })
})

describe('month keys', () => {
  test('a stored first-of-month date becomes YYYY-MM and back', () => {
    expect(monthKey('2026-11-01')).toBe('2026-11')
    expect(monthDate('2026-11')).toBe('2026-11-01')
  })

  test('refuses anything that is not a month', () => {
    expect(() => monthDate('2026-13')).toThrow()
    expect(() => monthDate('2026-1')).toThrow()
    expect(() => monthKey('2026-11-02')).toThrow()
  })
})

describe('row mappers', () => {
  test('toSlUpload maps a cached row (ISO time, stored date) to SlUpload', () => {
    const row: UploadRowJson = {
      id: 'u1', month: '2026-11-01', topic: 'industry', data: exportFor('2026-11'),
      beforeOpen: true, uploadedAt: '2026-12-01T15:30:00.000Z',
    }
    const u = toSlUpload(row)
    expect(u).toEqual({
      id: 'u1', month: '2026-11', topic: 'industry', data: exportFor('2026-11'),
      beforeOpen: true, uploadedAt: new Date('2026-12-01T15:30:00.000Z'),
    })
  })

  test('toSlUpload refuses an unknown topic rather than guessing', () => {
    const row = { id: 'u1', month: '2026-11-01', topic: 'paid', data: exportFor('2026-11'), beforeOpen: true, uploadedAt: '2026-12-01T00:00:00.000Z' }
    expect(() => toSlUpload(row)).toThrow(/topic/)
  })

  test('toSlHistory keeps nulls and whole percents', () => {
    expect(toSlHistory({
      month: '2026-10-01', topic: 'brand', results: 1200, uniqueAuthors: null, engagement: 3400.5, potentialReach: null,
      pos: 40, neu: 45, neg: 15, redditPos: null, redditNeu: null, redditNeg: null, source: 'delivered-deck 2026-10',
    })).toEqual({
      month: '2026-10', topic: 'brand', results: 1200, uniqueAuthors: null, engagement: 3400.5, potentialReach: null,
      pos: 40, neu: 45, neg: 15, redditPos: null, redditNeu: null, redditNeg: null, source: 'delivered-deck 2026-10',
      media: null, authors: null,
    })
  })

  test('toSlPost carries its image ids in order and refuses an unknown group', () => {
    const row = {
      id: 'p1', month: '2026-11-01', group: 'forum', platform: 'Reddit', author: 'someone', url: null,
      engagements: 12, sentiment: 'Neutral', note: '<b>as text</b>', position: 2, status: 'draft' as const, replacesId: 'p0',
    }
    expect(toSlPost(row, ['i2', 'i1'])).toEqual({ ...row, month: '2026-11', imageIds: ['i2', 'i1'] })
    expect(() => toSlPost({ ...row, group: 'video' }, [])).toThrow(/group/)
    expect(() => toSlPost({ ...row, sentiment: 'Mixed' }, [])).toThrow(/sentiment/)
  })

  test('toSlTrends: approved lists are null until the first approval', () => {
    const lists = { emerging: [{ theme: 'a b', change: '+5%' }], decreasing: [], newThemes: [{ theme: 'c d', change: null }] }
    expect(toSlTrends({
      month: '2026-11-01', emerging: lists.emerging, decreasing: [], newThemes: lists.newThemes,
      approvedEmerging: null, approvedDecreasing: null, approvedNew: null, status: 'draft',
    })).toEqual({ month: '2026-11', draft: lists, approved: null, status: 'draft' })
  })

  test('toSlTrends: a draft saved after approval keeps the approved lists (R2-11)', () => {
    const approved = { emerging: [{ theme: 'old one', change: null }], decreasing: [], newThemes: [] }
    const t = toSlTrends({
      month: '2026-11-01', emerging: [{ theme: 'new one', change: null }], decreasing: [], newThemes: [],
      approvedEmerging: approved.emerging, approvedDecreasing: [], approvedNew: [], status: 'draft',
    })
    expect(t.status).toBe('draft')
    expect(t.approved).toEqual(approved)
    expect(t.draft.emerging).toEqual([{ theme: 'new one', change: null }])
  })
})

describe('trimUploads (bounds the cached page read)', () => {
  const row = (id: string, month: string, topic: string, at: string, beforeOpen: boolean): UploadRowJson =>
    ({ id, month, topic, data: exportFor(month.slice(0, 7)), beforeOpen, uploadedAt: at })

  test('keeps only the shown and the presented upload of each month and topic', () => {
    const rows = [
      row('a', '2026-11-01', 'brand', '2026-12-01T10:00:00.000Z', true),
      row('b', '2026-11-01', 'brand', '2026-12-02T10:00:00.000Z', true),
      row('c', '2026-11-01', 'brand', '2026-12-09T10:00:00.000Z', false),
      row('d', '2026-11-01', 'brand', '2026-12-10T10:00:00.000Z', false),
      row('e', '2026-11-01', 'industry', '2026-12-01T10:00:00.000Z', true),
      row('f', '2026-10-01', 'brand', '2026-11-01T10:00:00.000Z', true),
    ]
    expect(trimUploads(rows).map((r) => r.id)).toEqual(['b', 'd', 'e', 'f'])
  })
})

describe('toSlMonthData', () => {
  test('maps every table and gives each post its image ids in order', () => {
    const data = toSlMonthData({
      uploads: [{ id: 'u', month: '2026-11-01', topic: 'brand', data: exportFor('2026-11'), beforeOpen: true, uploadedAt: '2026-12-01T00:00:00.000Z' }],
      history: [],
      posts: [
        { id: 'p1', month: '2026-11-01', group: 'social', platform: 'X', author: 'a', url: 'https://example.com/1', engagements: null, sentiment: 'Positive', note: '', position: 0, status: 'approved', replacesId: null },
        { id: 'p2', month: '2026-11-01', group: 'web', platform: 'Blog', author: 'b', url: null, engagements: 3, sentiment: 'Negative', note: 'n', position: 1, status: 'draft', replacesId: null },
      ],
      images: [{ id: 'i1', postId: 'p1' }, { id: 'i3', postId: 'p2' }, { id: 'i2', postId: 'p1' }],
      trends: null,
    })
    expect(data.uploads[0].uploadedAt).toEqual(new Date('2026-12-01T00:00:00.000Z'))
    expect(data.posts.map((p) => [p.id, p.imageIds])).toEqual([['p1', ['i1', 'i2']], ['p2', ['i3']]])
    expect(data.trends).toBeNull()
    expect(data.history).toEqual([])
  })
})

// Unit D (plan 2026-11-24): a delivered report's media counts and top authors. A row cached before the columns existed
// has neither key; a stored value that is not the exact shape is read as none, so it can never become a wrong baseline.
describe('toSlHistory media and authors', () => {
  const base = {
    month: '2026-10-01', topic: 'brand', results: 100, uniqueAuthors: null, engagement: null, potentialReach: null,
    pos: 70, neu: 20, neg: 10, redditPos: null, redditNeu: null, redditNeg: null, source: 'delivered-deck 2026-10',
  }
  test('both kept when well formed', () => {
    const h = toSlHistory({ ...base, media: [{ media: 'X', count: 12 }, { media: 'Blogs', count: 0 }], authors: [{ authorId: 'a1', name: 'Made Up', network: 'Instagram', posts: 4 }] })
    expect(h.media).toEqual([{ media: 'X', count: 12 }, { media: 'Blogs', count: 0 }])
    expect(h.authors).toEqual([{ authorId: 'a1', name: 'Made Up', network: 'Instagram', posts: 4 }])
  })
  test('a row cached before the columns existed reads as none', () => {
    expect(toSlHistory(base)).toMatchObject({ media: null, authors: null })
  })
  test.each([
    ['not a list', { media: 'X' }],
    ['a negative count', [{ media: 'X', count: -1 }]],
    ['a fraction', [{ media: 'X', count: 1.5 }]],
    ['an empty name', [{ media: '', count: 1 }]],
    ['a repeated name', [{ media: 'X', count: 1 }, { media: 'X', count: 2 }]],
    ['a missing count', [{ media: 'X' }]],
  ])('media that is %s reads as none', (_label, media) => {
    expect(toSlHistory({ ...base, media } as never).media).toBeNull()
  })
  test('authors with a bad entry read as none', () => {
    expect(toSlHistory({ ...base, authors: [{ authorId: 'a1', name: 'Made Up', network: 'Instagram', posts: -2 }] } as never).authors).toBeNull()
    expect(toSlHistory({ ...base, authors: [{ authorId: '', name: 'x', network: 'y', posts: 1 }] } as never).authors).toBeNull()
  })
})
