import { describe, expect, test } from 'vitest'
import { authorChanges, mediaChanges, pct, pointsChange, posNeu, presentedValues, prevMonth, tileChange, ytdSeries } from './compare'
import type { SlExport, SlHistory, SlTopic, SlUpload } from './types'

// Made-up numbers only (the repo is public).
type Media = { media: string; pos: number; neu: number; neg: number }
function exp(month: string, s: { pos: number; neu: number; neg: number }, extra: Partial<SlExport> = {}, topic: SlTopic = 'brand'): SlExport {
  return {
    version: 1, topic, month, results: s.pos + s.neu + s.neg, daily: [], sentiment: s,
    sentimentByMedia: [{ media: 'Other', ...s }], themes: [], ...extra,
  }
}
let n = 0
function up(data: SlExport, beforeOpen: boolean, at: string): SlUpload {
  return { id: `u${n++}`, month: data.month, topic: data.topic, data, beforeOpen, uploadedAt: new Date(at) }
}
function hist(month: string, p: { pos: number; neu: number; neg: number }, extra: Partial<SlHistory> = {}, topic: SlTopic = 'brand'): SlHistory {
  return {
    month, topic, results: 1000, uniqueAuthors: 500, engagement: 2000, potentialReach: 90000,
    ...p, redditPos: null, redditNeu: null, redditNeg: null, source: 'report', ...extra,
  }
}

describe('pct', () => {
  test('one decimal, half up, and 0 for an empty total', () => {
    expect(pct(29, 58)).toBe(50)
    expect(pct(1, 3)).toBe(33.3)
    expect(pct(2, 3)).toBe(66.7)
    expect(pct(1, 8)).toBe(12.5)
    expect(pct(1, 16)).toBe(6.3)
    expect(pct(5, 0)).toBe(0)
  })
})

describe('tileChange', () => {
  test('100 x (now / previous - 1), unrounded (KpiCard rounds it)', () => {
    expect(tileChange(556, 729)).toBeCloseTo(-23.7311, 3)
    expect(tileChange(0, 10)).toBe(-100)
    expect(tileChange(15, 10)).toBeCloseTo(50, 9)
  })
  test('a previous value that is missing, null or 0 has no change, never Infinity (R2-2)', () => {
    expect(tileChange(5, 0)).toBeUndefined()
    expect(tileChange(5, null)).toBeUndefined()
    expect(tileChange(5, undefined)).toBeUndefined()
  })
})

describe('pointsChange', () => {
  test('against a whole percent from a delivered report, now is rounded to whole first (R2-14)', () => {
    expect(pointsChange(69.2, { pct: 70, whole: true })).toBe(-1)
    expect(pointsChange(69.5, { pct: 70, whole: true })).toBe(0)
    expect(Object.is(pointsChange(70.2, { pct: 70, whole: true }), 0)).toBe(true)
  })
  test('against an upload it is one decimal, without float noise, and a drop rounds like a rise', () => {
    expect(pointsChange(69.2, { pct: 70.1, whole: false })).toBe(-0.9)
    expect(pointsChange(10.3, { pct: 10.1, whole: false })).toBe(0.2)
    expect(pointsChange(10.05, { pct: 10, whole: false })).toBe(0.1)
    expect(pointsChange(10, { pct: 10.05, whole: false })).toBe(-0.1)
  })
  test('no previous month has no change', () => {
    expect(pointsChange(50, null)).toBeNull()
  })
})

describe('prevMonth', () => {
  test('crosses the year', () => {
    expect(prevMonth('2026-01')).toBe('2025-12')
    expect(prevMonth('2026-11')).toBe('2026-10')
    expect(() => prevMonth('2026-13')).toThrow()
  })
})

describe('presentedValues', () => {
  test('a history row beats an upload, and its percents are whole', () => {
    const uploads = [up(exp('2026-10', { pos: 1, neu: 1, neg: 1 }), true, '2026-11-02')]
    const p = presentedValues('2026-10', 'brand', [hist('2026-10', { pos: 60, neu: 30, neg: 10 }, { results: 729 })], uploads)
    expect(p).toMatchObject({ source: 'history', whole: true, results: 729, pct: { pos: 60, neu: 30, neg: 10 } })
  })

  test('with no history row it is the presented upload, in one-decimal percents', () => {
    const data = exp('2026-10', { pos: 2, neu: 1, neg: 0 }, { uniqueAuthors: 7, engagement: 11, potentialReach: 13 })
    const p = presentedValues('2026-10', 'brand', [], [up(data, true, '2026-11-02')])
    expect(p).toEqual({
      source: 'upload', whole: false, results: 3, uniqueAuthors: 7, engagement: 11, potentialReach: 13,
      pct: { pos: 66.7, neu: 33.3, neg: 0 }, reddit: null,
    })
  })

  test('after-open upload is shown but not presented (D5)', () => {
    const presented = up(exp('2026-10', { pos: 10, neu: 0, neg: 0 }), true, '2026-11-02')
    const later = up(exp('2026-10', { pos: 0, neu: 10, neg: 0 }), false, '2026-11-20')
    expect(presentedValues('2026-10', 'brand', [], [presented, later])!.pct).toEqual({ pos: 100, neu: 0, neg: 0 })
  })

  test('only the month and topic asked for; null when there is neither source', () => {
    const uploads = [
      up(exp('2026-09', { pos: 1, neu: 0, neg: 0 }), true, '2026-10-02'),
      up(exp('2026-10', { pos: 1, neu: 0, neg: 0 }, {}, 'industry'), true, '2026-11-02'),
    ]
    const history = [hist('2026-10', { pos: 50, neu: 50, neg: 0 }, {}, 'industry')]
    expect(presentedValues('2026-10', 'brand', history, uploads)).toBeNull()
    expect(presentedValues('2026-10', 'industry', history, uploads)!.source).toBe('history')
  })

  test('Reddit: the history columns when all three are set, else the presented upload\'s Reddit row, else none', () => {
    const media: Media[] = [{ media: 'Reddit', pos: 1, neu: 2, neg: 1 }, { media: 'X', pos: 1, neu: 0, neg: 0 }]
    const upload = up(exp('2026-10', { pos: 2, neu: 2, neg: 1 }, { sentimentByMedia: media }), true, '2026-11-02')
    expect(presentedValues('2026-10', 'brand', [], [upload])!.reddit).toEqual({ pct: { pos: 25, neu: 50, neg: 25 }, whole: false })
    const full = hist('2026-10', { pos: 1, neu: 1, neg: 98 }, { redditPos: 20, redditNeu: 70, redditNeg: 10 })
    expect(presentedValues('2026-10', 'brand', [full], [upload])!.reddit).toEqual({ pct: { pos: 20, neu: 70, neg: 10 }, whole: true })
    const partial = hist('2026-10', { pos: 1, neu: 1, neg: 98 }, { redditPos: 20 })
    expect(presentedValues('2026-10', 'brand', [partial], [upload])).toMatchObject({ source: 'history', reddit: { pct: { pos: 25, neu: 50, neg: 25 }, whole: false } })
    expect(presentedValues('2026-10', 'brand', [partial], [])!.reddit).toBeNull()
  })
})

describe('ytdSeries', () => {
  const served = exp('2026-04', { pos: 3, neu: 3, neg: 2 }, { sentimentByMedia: [{ media: 'Reddit', pos: 1, neu: 1, neg: 2 }, { media: 'X', pos: 2, neu: 2, neg: 0 }] })

  test('January to the served month; a month with neither source is a gap, never zeros', () => {
    const history = [hist('2026-01', { pos: 60, neu: 30, neg: 10 })]
    const uploads = [up(exp('2026-03', { pos: 1, neu: 1, neg: 2 }), true, '2026-04-02')]
    const s = ytdSeries(served, history, uploads, 'all')
    expect(s.map((p) => p.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
    expect(s.map((p) => p.value)).toEqual([
      { pos: 60, neu: 30, neg: 10 },
      null,
      { pos: 25, neu: 25, neg: 50 },
      { pos: 38, neu: 38, neg: 25 },
    ])
  })

  test('each share is rounded to whole on its own, as the deck charts them (this point sums to 101)', () => {
    const last = ytdSeries(served, [], [], 'all').at(-1)!.value!
    expect(last.pos + last.neu + last.neg).toBe(101)
  })

  test('the served month comes from the served upload, even when a history row or another upload has that month', () => {
    const s = ytdSeries(served, [hist('2026-04', { pos: 1, neu: 1, neg: 98 })], [up(exp('2026-04', { pos: 0, neu: 0, neg: 9 }), true, '2026-05-02')], 'all')
    expect(s.at(-1)!.value).toEqual({ pos: 38, neu: 38, neg: 25 })
  })

  test('only the served topic; months after the served month never appear', () => {
    const history = [hist('2026-02', { pos: 50, neu: 50, neg: 0 }, {}, 'industry'), hist('2026-05', { pos: 50, neu: 50, neg: 0 })]
    const s = ytdSeries(served, history, [], 'all')
    expect(s).toHaveLength(4)
    expect(s[1].value).toBeNull()
  })

  test('Reddit: history columns, else the presented upload of that month, else a gap; the served point from its Reddit row', () => {
    const history = [
      hist('2026-01', { pos: 1, neu: 1, neg: 98 }, { redditPos: 20, redditNeu: 70, redditNeg: 10 }),
      hist('2026-02', { pos: 1, neu: 1, neg: 98 }),
    ]
    const uploads = [up(exp('2026-02', { pos: 1, neu: 1, neg: 0 }, { sentimentByMedia: [{ media: 'Reddit', pos: 1, neu: 1, neg: 0 }] }), true, '2026-03-02')]
    const s = ytdSeries(served, history, uploads, 'reddit')
    expect(s.map((p) => p.value)).toEqual([
      { pos: 20, neu: 70, neg: 10 },
      { pos: 50, neu: 50, neg: 0 },
      null,
      { pos: 25, neu: 25, neg: 50 },
    ])
  })

  test('a served export with no Reddit results has a Reddit gap, not 0/0', () => {
    const noReddit = exp('2026-01', { pos: 1, neu: 0, neg: 0 })
    expect(ytdSeries(noReddit, [], [], 'reddit')).toEqual([{ month: '2026-01', value: null }])
  })
})

describe('posNeu', () => {
  test('round(pos) + round(neu) (R2-14)', () => {
    expect(posNeu({ pos: 38, neu: 38, neg: 25 })).toBe(76)
    expect(posNeu({ pos: 37.5, neu: 37.5, neg: 25 })).toBe(76)
  })
})

describe('mediaChanges', () => {
  const prev = exp('2026-10', { pos: 30, neu: 0, neg: 0 }, { sentimentByMedia: [{ media: 'X', pos: 10, neu: 0, neg: 0 }, { media: 'Blogs', pos: 0, neu: 0, neg: 0 }, { media: 'Reddit', pos: 20, neu: 0, neg: 0 }] })
  const now = exp('2026-11', { pos: 30, neu: 0, neg: 0 }, { sentimentByMedia: [{ media: 'X', pos: 5, neu: 5, neg: 5 }, { media: 'Blogs', pos: 4, neu: 0, neg: 0 }, { media: 'Threads', pos: 6, neu: 0, neg: 0 }, { media: 'Reddit', pos: 0, neu: 0, neg: 0 }] })

  test('percent change of each media type count against the previous month presented upload', () => {
    const c = mediaChanges(now, prev)
    expect(c.X).toBeCloseTo(50, 9)
    expect(c.Reddit).toBe(-100)
  })
  test('new media type has n/a change, and so does one with no results last month', () => {
    const c = mediaChanges(now, prev)
    expect(c.Threads).toBeNull()
    expect(c.Blogs).toBeNull()
  })
  test('no upload last month: every change is n/a', () => {
    expect(mediaChanges(now, null)).toEqual({ X: null, Blogs: null, Threads: null, Reddit: null })
  })
})

describe('authorChanges', () => {
  const inf = (authorId: string, name: string, posts: number) => ({ authorId, name, network: 'X', posts, reach: 1, engagement: 1, pos: posts, neu: 0, neg: 0 })
  test('posts difference, matched by author id, not name', () => {
    const prev = exp('2026-10', { pos: 1, neu: 0, neg: 0 }, { influencers: [inf('a1', 'Old name', 4), inf('b2', 'Same name', 9)] })
    const now = exp('2026-11', { pos: 1, neu: 0, neg: 0 }, { influencers: [inf('a1', 'New name', 7), inf('c3', 'Same name', 2)] })
    expect(authorChanges(now, prev)).toEqual({ a1: 3, c3: null })
  })
  test('no upload or no influencers last month: every change is n/a; no influencers now: empty', () => {
    const now = exp('2026-11', { pos: 1, neu: 0, neg: 0 }, { influencers: [inf('a1', 'x', 1)] })
    expect(authorChanges(now, null)).toEqual({ a1: null })
    expect(authorChanges(now, exp('2026-10', { pos: 1, neu: 0, neg: 0 }))).toEqual({ a1: null })
    expect(authorChanges(exp('2026-11', { pos: 1, neu: 0, neg: 0 }), null)).toEqual({})
  })
})
