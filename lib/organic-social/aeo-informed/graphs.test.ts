// lib/organic-social/aeo-informed/graphs.test.ts
import { describe, it, expect } from 'vitest'
import { platformOf, buildCitationGraph, buildUsedAsSource } from './graphs'
import type { PeecUrlRow } from './types'
import type { BrandChannels } from './ownership'

const brands: BrandChannels[] = [
  { id: 'b_ren', name: 'Renaissance', isOwn: true, slugs: ['renaissancebenefits', 'renbenefits'] },
  { id: 'b_unum', name: 'Unum', isOwn: false, slugs: ['unum'] },
]
const row = (url: string, date: string, o: Partial<PeecUrlRow> = {}): PeecUrlRow => ({
  url, date, classification: null, title: null, channel_title: 'Renaissance Life & Health', citation_count: 0, retrieval_count: 1,
  citation_position: null, citation_position_sum: 0, citation_position_count: 0, mentioned_brands: [], ...o,
})
const LI = 'https://www.linkedin.com/pulse/own-article'
const base = { brands, ownBrandId: 'b_ren', ownBrandName: 'Renaissance', from: '2026-09-03', weeks: 4, asOf: '2026-11-08' }

describe('platformOf', () => {
  it.each([
    ['https://www.linkedin.com/pulse/x', 'linkedin'], ['https://linkedin.com/in/x', 'linkedin'],
    ['https://www.youtube.com/watch?v=a', 'youtube'], ['https://m.youtube.com/watch?v=a', 'youtube'], ['https://youtu.be/abc', 'youtube'],
    ['https://www.instagram.com/p/a', 'instagram'], ['https://www.tiktok.com/@a/video/1', 'tiktok'],
    ['https://www.reddit.com/r/x', 'reddit'], ['https://old.reddit.com/r/x', 'reddit'], ['https://ads.reddit.com/x', 'reddit'],
  ])('%s is %s', (url, p) => expect(platformOf(url)).toBe(p))
  it.each(['https://notlinkedin.com/x', 'https://linkedin.com.evil.example/x', 'https://www.facebook.com/x', 'not a url', ''])('%s has no platform', (u) => expect(platformOf(u)).toBeNull())
})

describe('buildCitationGraph', () => {
  it('sums own citations into 7-day buckets that start on the chart start (a Thursday), not on Mondays', () => {
    const rows = [row(LI, '2026-09-03', { citation_count: 10 }), row(LI, '2026-09-09', { citation_count: 5 }), row(LI, '2026-09-10', { citation_count: 7 }), row(LI, '2026-09-25', { citation_count: 2 })]
    const pts = buildCitationGraph({ ...base, graphId: 'citations_linkedin', platforms: ['linkedin'], rows })
    expect(pts.map((p) => [p.weekStart, p.weekEnd, p.value])).toEqual([
      ['2026-09-03', '2026-09-09', 15], ['2026-09-10', '2026-09-16', 7], ['2026-09-17', '2026-09-23', 0], ['2026-09-24', '2026-09-30', 2],
    ])
    expect(pts.every((p) => p.series === 'Renaissance' && p.unit === 'citations' && p.graphId === 'citations_linkedin')).toBe(true)
  })
  it('leaves out other brands\' channels and other platforms', () => {
    const rows = [
      row(LI, '2026-09-03', { citation_count: 4 }),
      row('https://www.linkedin.com/pulse/third', '2026-09-03', { citation_count: 99, channel_title: 'Roger G. Howell' }),
      row('https://www.youtube.com/watch?v=a', '2026-09-03', { citation_count: 50 }),
    ]
    const li = buildCitationGraph({ ...base, graphId: 'citations_linkedin', platforms: ['linkedin'], rows })
    expect(li[0].value).toBe(4)
    const all = buildCitationGraph({ ...base, graphId: 'citations_all', platforms: ['linkedin', 'youtube', 'instagram', 'tiktok', 'reddit'], rows })
    expect(all[0].value).toBe(54)
  })
  it('owns a post by the registered handle in the path even with no channel title', () => {
    const rows = [row('https://www.linkedin.com/posts/renaissancebenefits_x', '2026-09-03', { citation_count: 3, channel_title: null })]
    expect(buildCitationGraph({ ...base, graphId: 'citations_linkedin', platforms: ['linkedin'], rows })[0].value).toBe(3)
  })
  it('a platform with no own source in the window is null in every bucket ("No source data"), not zeros', () => {
    const rows = [row(LI, '2026-09-03', { citation_count: 4 })]
    const ig = buildCitationGraph({ ...base, graphId: 'citations_instagram', platforms: ['instagram'], rows })
    expect(ig).toHaveLength(4)
    expect(ig.every((p) => p.value === null)).toBe(true)
  })
  it('an own row that was never retrieved does not count as a source', () => {
    const rows = [row('https://www.instagram.com/renbenefits/p/a', '2026-09-03', { retrieval_count: 0, citation_count: 0 })]
    expect(buildCitationGraph({ ...base, graphId: 'citations_instagram', platforms: ['instagram'], rows }).every((p) => p.value === null)).toBe(true)
  })
  it('rows outside the graph window do not make a platform "have data"', () => {
    const rows = [row('https://www.instagram.com/renbenefits/p/a', '2026-08-08', { citation_count: 1 })]
    expect(buildCitationGraph({ ...base, graphId: 'citations_instagram', platforms: ['instagram'], rows }).every((p) => p.value === null)).toBe(true)
  })
  it('drops buckets after asOf and flags the one that crosses it as partial', () => {
    const pts = buildCitationGraph({ ...base, asOf: '2026-09-20', graphId: 'citations_linkedin', platforms: ['linkedin'], rows: [row(LI, '2026-09-18', { citation_count: 1 })] })
    expect(pts.map((p) => [p.weekStart, p.partial])).toEqual([['2026-09-03', false], ['2026-09-10', false], ['2026-09-17', true]])
  })
  it('rejects a weeks count below 1', () => {
    expect(() => buildCitationGraph({ ...base, weeks: 0, graphId: 'citations_all', platforms: ['linkedin'], rows: [] })).toThrow(RangeError)
  })
})

describe('buildUsedAsSource', () => {
  const chatRow = (url: string, date: string, chat: string, o: Partial<PeecUrlRow> = {}) => row(url, date, { chat: { id: chat }, ...o })
  const chats = new Map<string, number>()
  for (let d = 3; d <= 30; d++) chats.set(`2026-09-${String(d).padStart(2, '0')}`, 100)
  it('counts a chat once per bucket even when it retrieved two own URLs, over that bucket\'s chats', () => {
    const rows = [
      chatRow(LI, '2026-09-03', 'c1'), chatRow('https://www.linkedin.com/posts/renbenefits_x', '2026-09-03', 'c1'),
      chatRow(LI, '2026-09-04', 'c2'), chatRow(LI, '2026-09-11', 'c3'),
    ]
    const pts = buildUsedAsSource({ ...base, chatsByDay: chats, rows })
    expect(pts[0]).toMatchObject({ graphId: 'used_as_source_all', unit: 'percent', weekStart: '2026-09-03', value: 2 / 700 })
    expect(pts[1].value).toBeCloseTo(1 / 700, 12)
    expect(pts[2].value).toBe(0)
  })
  it('does not count a chat that only retrieved someone else\'s page', () => {
    const rows = [chatRow('https://www.linkedin.com/pulse/third', '2026-09-03', 'c1', { channel_title: 'Roger G. Howell' }), chatRow(LI, '2026-09-04', 'c2')]
    expect(buildUsedAsSource({ ...base, chatsByDay: chats, rows })[0].value).toBeCloseTo(1 / 700, 12)
  })
  it('a bucket with no chats at all is null, never NaN', () => {
    const pts = buildUsedAsSource({ ...base, chatsByDay: new Map(), rows: [chatRow(LI, '2026-09-03', 'c1')] })
    expect(pts.every((p) => p.value === null)).toBe(true)
  })
  it('the partial bucket uses only the days up to asOf in its denominator', () => {
    const pts = buildUsedAsSource({ ...base, asOf: '2026-09-11', chatsByDay: chats, rows: [chatRow(LI, '2026-09-10', 'c1')] })
    expect(pts).toHaveLength(2)
    expect(pts[1]).toMatchObject({ partial: true })
    expect(pts[1].value).toBeCloseTo(1 / 200, 12)
  })
  it('ignores rows with no retrieval and rows with no chat id', () => {
    const rows = [chatRow(LI, '2026-09-03', 'c1', { retrieval_count: 0 }), row(LI, '2026-09-03')]
    expect(buildUsedAsSource({ ...base, chatsByDay: chats, rows }).every((p) => p.value === 0 || p.value === null)).toBe(true)
  })
  it('is null in every bucket when the five platforms have no own source in the window', () => {
    expect(buildUsedAsSource({ ...base, chatsByDay: chats, rows: [] }).every((p) => p.value === null)).toBe(true)
  })
})
