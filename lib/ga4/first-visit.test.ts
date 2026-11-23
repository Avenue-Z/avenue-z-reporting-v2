import { describe, expect, test, vi, beforeEach } from 'vitest'
import type { CalendarPage } from '@/lib/content-calendar/pages'
import { AI_REFERRER_DOMAINS } from '@/lib/constants'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _n: string, fn: unknown) => fn }))
const ga4 = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('./client', () => ({ ga4QueryUncached: ga4.run }))

import { toCalendarPages } from '@/lib/content-calendar/pages'
import {
  timingUniverse, timingAnchors, firstVisitFilters, firstVisitsFromRows, getFirstVisitDates,
  summariseTiming, timingStatus, TIMING_EMPTY_COPY, anchorKey,
} from './first-visit'

const page = (over: Partial<CalendarPage>): CalendarPage => ({
  urlKey: 'x.com/a', url: 'https://x.com/a', topic: 'T', contentType: 'Blog',
  published: true, badge: 'new', publishDate: '2026-01-01', lastOptimizedDate: null, ...over,
})

describe('timingUniverse (D-9)', () => {
  test('published New / New · Optimized pages with a URL and an ISO publish date', () => {
    const u = timingUniverse([
      page({ urlKey: 'x.com/new', url: 'https://x.com/new' }),
      page({ urlKey: 'x.com/both', url: 'https://x.com/both/', badge: 'new-optimized' }),
      page({ urlKey: 'x.com/opt', url: 'https://x.com/opt', badge: 'optimized' }),
      page({ urlKey: 'x.com/other', url: 'https://x.com/other', badge: 'other' }),
      page({ urlKey: 'x.com/draft', url: 'https://x.com/draft', published: false }),
      page({ urlKey: 'x.com/undated', url: 'https://x.com/undated', publishDate: null }),
      page({ urlKey: 'x.com/raw', url: 'https://x.com/raw', publishDate: 'early March' }),
    ])
    expect(u).toEqual([
      { path: '/new', url: 'https://x.com/new', publishDate: '2026-01-01' },
      { path: '/both', url: 'https://x.com/both/', publishDate: '2026-01-01' },
    ])
  })
})

describe('timingAnchors', () => {
  test('deduped and sorted, so the cache key is stable', () => {
    const a = timingAnchors([
      { path: '/b', url: 'u', publishDate: '2026-02-01' },
      { path: '/a', url: 'u', publishDate: '2026-01-01' },
      { path: '/b', url: 'u2', publishDate: '2026-02-01' },
    ])
    expect(a).toEqual([{ path: '/a', publishDate: '2026-01-01' }, { path: '/b', publishDate: '2026-02-01' }])
  })
})

describe('firstVisitFilters (channel rules)', () => {
  test('search: path list AND channel group exactly Organic Search', () => {
    const { search } = firstVisitFilters(['/a', '/a/'])
    expect(search).toEqual({ andGroup: { expressions: [
      { filter: { fieldName: 'pagePath', inListFilter: { values: ['/a', '/a/'] } } },
      { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { matchType: 'EXACT', value: 'Organic Search', caseSensitive: true } } },
    ] } })
  })
  test('AI: path list AND sessionSource contains any AI referrer domain (the isAiSource list), case-insensitive', () => {
    const { ai } = firstVisitFilters(['/a'])
    const or = ai!.andGroup!.expressions![1].orGroup!.expressions!
    expect(or.map((e) => e.filter!.stringFilter!.value)).toEqual([...AI_REFERRER_DOMAINS])
    expect(or.every((e) => e.filter!.fieldName === 'sessionSource'
      && e.filter!.stringFilter!.matchType === 'CONTAINS' && e.filter!.stringFilter!.caseSensitive === false)).toBe(true)
  })
})

describe('firstVisitsFromRows', () => {
  test('first day with sessions on or after each anchor, trailing-slash variants merged', () => {
    const anchors = [{ path: '/a', publishDate: '2026-01-05' }]
    const search = [
      { pagePath: '/a', date: '20260103', sessions: 4 }, // before publish: ignored
      { pagePath: '/a/', date: '20260109', sessions: 1 },
      { pagePath: '/a', date: '20260107', sessions: 0 }, // zero: ignored
      { pagePath: '/a', date: '20260110', sessions: 2 },
    ]
    const ai = [{ pagePath: '/a', date: '20260105', sessions: 1 }]
    expect(firstVisitsFromRows(anchors, search, ai)).toEqual({
      [anchorKey('/a', '2026-01-05')]: { firstSearch: '2026-01-09', firstAi: '2026-01-05' },
    })
  })
  test('no qualifying day is null', () => {
    expect(firstVisitsFromRows([{ path: '/a', publishDate: '2026-01-05' }], [], [])).toEqual({
      [anchorKey('/a', '2026-01-05')]: { firstSearch: null, firstAi: null },
    })
  })
})

describe('getFirstVisitDates', () => {
  beforeEach(() => { ga4.run.mockReset() })
  const anchors = [{ path: '/a', publishDate: '2026-01-05' }, { path: '/', publishDate: '2026-01-02' }]

  test('two filtered pagePath × date queries from the earliest publish date; derived result only', async () => {
    ga4.run.mockImplementation(async (p: { dimensionFilter: { andGroup: { expressions: { filter?: { fieldName: string } }[] } } }) => {
      const isSearch = p.dimensionFilter.andGroup.expressions[1].filter?.fieldName === 'sessionDefaultChannelGroup'
      const rows = isSearch ? [{ pagePath: '/a', date: '20260106', sessions: 3 }] : []
      return { rows, rowCount: rows.length }
    })
    const r = await getFirstVisitDates('acme', anchors, '2026-02-01')
    expect(ga4.run).toHaveBeenCalledTimes(2)
    for (const [p] of ga4.run.mock.calls) {
      expect(p).toMatchObject({ clientSlug: 'acme', dateRange: '2026-01-02,2026-02-01', metrics: ['sessions'], dimensions: ['pagePath', 'date'] })
      expect(p.dimensionFilter.andGroup.expressions[0].filter.inListFilter.values).toEqual(['/a', '/a/', '/'])
    }
    expect(r).toEqual({
      complete: true,
      byAnchor: {
        [anchorKey('/a', '2026-01-05')]: { firstSearch: '2026-01-06', firstAi: null },
        [anchorKey('/', '2026-01-02')]: { firstSearch: null, firstAi: null },
      },
    })
  })

  test('GA4 truncation (rowCount > rows returned) marks the result incomplete, never a late first visit', async () => {
    ga4.run.mockResolvedValue({ rows: [{ pagePath: '/a', date: '20260120', sessions: 1 }], rowCount: 5 })
    const r = await getFirstVisitDates('acme', anchors, '2026-02-01')
    expect(r).toEqual({ complete: false, byAnchor: {} })
  })

  test('no anchors: no GA4 call', async () => {
    expect(await getFirstVisitDates('acme', [], '2026-02-01')).toEqual({ complete: true, byAnchor: {} })
    expect(ga4.run).not.toHaveBeenCalled()
  })
})

describe('summariseTiming', () => {
  test('medians and fastest/slowest AI with their URLs, measured from each publish date', () => {
    const pages = [
      { path: '/a', url: 'https://x.com/a', publishDate: '2026-01-01' },
      { path: '/b', url: 'https://x.com/b', publishDate: '2026-01-10' },
      { path: '/c', url: 'https://x.com/c', publishDate: '2026-01-10' },
    ]
    const s = summariseTiming(pages, {
      [anchorKey('/a', '2026-01-01')]: { firstSearch: '2026-01-03', firstAi: '2026-01-02' },
      [anchorKey('/b', '2026-01-10')]: { firstSearch: '2026-01-14', firstAi: '2026-01-20' },
      [anchorKey('/c', '2026-01-10')]: { firstSearch: null, firstAi: null },
    })
    expect(s).toEqual({
      medFirstSearch: 3, medFirstAi: 5.5, fastestAi: 1, slowestAi: 10,
      fastestAiUrl: 'https://x.com/a', slowestAiUrl: 'https://x.com/b',
    })
  })
  test('nothing measured: all null', () => {
    expect(summariseTiming([], {})).toEqual({
      medFirstSearch: null, medFirstAi: null, fastestAi: null, slowestAi: null, fastestAiUrl: null, slowestAiUrl: null,
    })
  })
})

describe('timingStatus + copy (C1f)', () => {
  const ok = { complete: true, byAnchor: {} }
  test('GA4 not connected wins', () => {
    expect(timingStatus({ ga4Connected: false, calendarFailed: false, universeSize: 3, result: ok })).toBe('ga4-not-connected')
  })
  test('no New published pages', () => {
    expect(timingStatus({ ga4Connected: true, calendarFailed: false, universeSize: 0, result: null })).toBe('no-new-content')
  })
  test('failed calendar, failed fetch or truncated result are unavailable', () => {
    expect(timingStatus({ ga4Connected: true, calendarFailed: true, universeSize: 0, result: null })).toBe('unavailable')
    expect(timingStatus({ ga4Connected: true, calendarFailed: false, universeSize: 2, result: null })).toBe('unavailable')
    expect(timingStatus({ ga4Connected: true, calendarFailed: false, universeSize: 2, result: { complete: false, byAnchor: {} } })).toBe('unavailable')
  })
  test('ok', () => {
    expect(timingStatus({ ga4Connected: true, calendarFailed: false, universeSize: 2, result: ok })).toBe('ok')
  })
  test('copy is cause-specific and neutral', () => {
    expect(TIMING_EMPTY_COPY).toEqual({
      'ga4-not-connected': 'Connect GA4 to measure days to first visit.',
      'no-new-content': 'No new published content to measure yet.',
      unavailable: "Visit timing couldn't be loaded.",
    })
  })
})

describe('timingUniverse over calendar rows (review #482)', () => {
  const calRow = (over: Record<string, unknown>) => ({
    topic: 'T', url: 'https://x.com/a', contentType: 'Blog', status: 'Published', contentAction: 'new',
    publishDate: '2026-02-01', updateDate: null, matchStatus: 'unknown', aiCitations: null, aiBotVisits: null, ...over,
  }) as never
  test('Published New + unpublished Optimized stays in the universe; Planned New + Published Optimized is out', () => {
    const inU = toCalendarPages([calRow({}), calRow({ contentAction: 'optimized', status: 'In progress', publishDate: '2026-09-01' })], 'x.com')
    expect(timingUniverse(inU)).toHaveLength(1)
    const out = toCalendarPages([calRow({ status: 'Planned' }), calRow({ contentAction: 'optimized', publishDate: '2026-05-01' })], 'x.com')
    expect(timingUniverse(out)).toHaveLength(0)
  })
})
