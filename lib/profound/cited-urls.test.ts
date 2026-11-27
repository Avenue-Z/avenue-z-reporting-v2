// lib/profound/cited-urls.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { joinWindows } from '@/lib/aeo/cited-urls'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _n: string, fn: unknown) => fn }))
const getClientBySlug = vi.fn()
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: (s: string) => getClientBySlug(s) }))

import {
  profoundPageKey,
  parseAnswerStream,
  parseCategoryRows,
  profoundSource,
  mapProfoundWindow,
  getProfoundCitedUrls,
} from './cited-urls'

const sse = (total: number, answers: string[][]) =>
  `event: summary\ndata: ${JSON.stringify({ total_results: total, count: total, next_cursor: null })}\n\n` +
  answers.map((c) => `event: result\ndata: ${JSON.stringify({ citations: c })}\n\n`).join('')

describe('profoundPageKey', () => {
  it.each([
    ['https://www.siegemedia.com//services/geo?utm_source=chatgpt.com', 'siegemedia.com/services/geo'],
    ['https://a.com/', 'a.com'],
    ['https://a.com/?x=1', 'a.com/?x=1'],
    ['https://minuttia.com/best/#:~:text=x', 'minuttia.com/best/'],
    ['https://www.youtube.com/watch?v=abc&utm_source=x', 'youtube.com/watch?v=abc'],
    ['https://seller-us.tiktok.com/partners/us/?seller_type=2', 'seller-us.tiktok.com/partners/us/?seller_type=2'],
  ])('%s', (raw, key) => expect(profoundPageKey(raw)).toBe(key))
  it('unparseable is null', () => expect(profoundPageKey('not a url')).toBeNull())
})

describe('parseAnswerStream', () => {
  it('reads summary and results', () => {
    const out = parseAnswerStream(sse(2, [['https://a.com/'], ['https://b.com/']]))
    expect(out.totalResults).toBe(2)
    expect(out.answers).toHaveLength(2)
    expect(out.answers[0].citations).toEqual(['https://a.com/'])
  })
  it('an error event throws', () => {
    expect(() => parseAnswerStream('event: error\ndata: {"message":"x"}\n\n')).toThrow()
  })
  it('a non-JSON data line throws', () => {
    expect(() => parseAnswerStream('event: result\ndata: nope\n\n')).toThrow()
  })
})

describe('mapProfoundWindow', () => {
  const A = 'https://www.a.com/page'
  const B = 'https://b.com/x'
  it('dedupes a page within one answer', () => {
    const w = mapProfoundWindow(
      { totalResults: 3, answers: [{ citations: [A, A + '?utm_source=chatgpt.com'] }, { citations: [A] }, { citations: [B] }] },
      [],
    )
    const a = w.rows.find((r) => r.key === 'a.com/page')!
    expect(a.answersUsing).toBe(2)
    expect(a.citations).toBe(3)
    expect(w.totalAnswers).toBe(3)
    expect(w.complete).toBe(true)
    const out = joinWindows('profound', w, null)
    const row = out.rows.find((r) => r.key === 'a.com/page')!
    expect(row.usedPct).toBeCloseTo(66.7, 1)
    expect(row.citationRate).toBe(1.5)
  })
  it('category join', () => {
    const cats = [
      { url: 'a.com/page', hostname: 'a.com', category: 'owned' },
      { url: 'rival.com/x', hostname: 'rival.com', category: 'competition' },
    ]
    const w = mapProfoundWindow(
      { totalResults: 1, answers: [{ citations: ['https://a.com/page', 'https://rival.com/other', 'https://nobody.com/z'] }] },
      cats,
    )
    const by = Object.fromEntries(w.rows.map((r) => [r.key, [r.sourceType, r.sourceLabel]]))
    expect(by['a.com/page']).toEqual(['own', 'Own'])
    expect(by['rival.com/other']).toEqual(['competitor', 'Competitor'])
    expect(by['nobody.com/z']).toEqual(['third_party', 'Other'])
  })
  it('short stream is incomplete', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = mapProfoundWindow({ totalResults: 3, answers: [{ citations: [] }, { citations: [] }] }, [])
    expect(w.complete).toBe(false)
    warn.mockRestore()
  })
})

describe('profoundSource', () => {
  it.each([
    ['earned_media', 'third_party', 'Earned media'],
    ['earned_institutions', 'third_party', 'Institution'],
    ['pr_wire', 'third_party', 'PR wire'],
    ['social', 'third_party', 'Social'],
    ['weird', 'third_party', 'Other'],
  ])('%s', (c, t, l) => expect(profoundSource(c)).toEqual({ sourceType: t, sourceLabel: l }))
})

describe('parseCategoryRows', () => {
  it('honours info.query.dimensions order', () => {
    const a = parseCategoryRows({
      info: { query: { dimensions: ['citation_category', 'hostname', 'url'] } },
      data: [{ dimensions: ['owned', 'a.com', 'a.com/p'] }],
    })
    expect(a).toEqual([{ url: 'a.com/p', hostname: 'a.com', category: 'owned' }])
    const b = parseCategoryRows({
      info: { query: { dimensions: ['url', 'hostname', 'citation_category'] } },
      data: [{ dimensions: ['a.com/p', 'a.com', 'owned'] }],
    })
    expect(b).toEqual(a)
  })
})

describe('getProfoundCitedUrls', () => {
  const win = { startDate: '2026-10-01', endDate: '2026-10-31' }
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    process.env.PROFOUND_AI_ACCESS_TOKEN = 'k'
    getClientBySlug.mockResolvedValue({ profoundCategoryId: 'cat1' })
    fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/v2/prompts/answers/stream')) {
        return new Response(sse(1, [['https://a.com/p']]), { status: 200 })
      }
      return new Response(
        JSON.stringify({ info: { total_rows: 1, query: { dimensions: ['citation_category', 'hostname', 'url'] } }, data: [{ metrics: [1], dimensions: ['owned', 'a.com', 'a.com/p'] }] }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('requests carry the Visibility filter', async () => {
    const out = await getProfoundCitedUrls('c', win, null)
    expect(out.rows[0].sourceType).toBe('own')
    const calls = fetchMock.mock.calls.map(([u, init]) => [String(u), JSON.parse(init.body as string)] as const)
    const stream = calls.find(([u]) => u.includes('/v2/prompts/answers/stream'))![1]
    expect(stream.filter).toEqual({ field: 'analysis_type', op: 'is', value: 'visibility' })
    expect(stream.include).toEqual(['citations'])
    const v1 = calls.find(([u]) => u.includes('/v1/reports/citations'))![1]
    expect(v1.filters[0].field).toBe('analysis_type')
    expect(calls.some(([u]) => u.includes('/v1/reports/visibility'))).toBe(false)
  })

  it('stream request is no-store', async () => {
    await getProfoundCitedUrls('c', win, null)
    const init = fetchMock.mock.calls.find(([u]) => String(u).includes('/v2/prompts/answers/stream'))![1]
    expect(init.cache).toBe('no-store')
  })

  it('stream request carries an abort signal', async () => {
    await getProfoundCitedUrls('c', win, null)
    const init = fetchMock.mock.calls.find(([u]) => String(u).includes('/v2/prompts/answers/stream'))![1]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('prior makes two streams and one categories request', async () => {
    await getProfoundCitedUrls('c', win, { startDate: '2026-09-01', endDate: '2026-09-30' })
    const urls = fetchMock.mock.calls.map(([u]) => String(u))
    expect(urls.filter((u) => u.includes('/v2/prompts/answers/stream'))).toHaveLength(2)
    expect(urls.filter((u) => u.includes('/v1/reports/citations'))).toHaveLength(1)
  })

  it('a failing prior stream rejects the call', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    let streams = 0
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/v2/prompts/answers/stream')) {
        streams += 1
        if (streams === 2) return new Response('boom', { status: 500 })
        return new Response(sse(1, [['https://a.com/p']]), { status: 200 })
      }
      return new Response(JSON.stringify({ info: { query: { dimensions: ['citation_category', 'hostname', 'url'] } }, data: [] }), { status: 200 })
    })
    await expect(getProfoundCitedUrls('c', win, { startDate: '2026-09-01', endDate: '2026-09-30' })).rejects.toThrow(/500/)
    err.mockRestore()
  })

  it('a window over 92 days is tooLong and never fetches', async () => {
    const out = await getProfoundCitedUrls('c', { startDate: '2026-01-01', endDate: '2026-04-03' }, null)
    expect(out.tooLong).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no category id gives an empty result', async () => {
    getClientBySlug.mockResolvedValue({ profoundCategoryId: null })
    expect((await getProfoundCitedUrls('c', win, null)).rows).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a non-2xx stream logs and throws', async () => {
    fetchMock.mockImplementation(async () => new Response('too broad', { status: 503 }))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getProfoundCitedUrls('c', win, null)).rejects.toThrow(/503/)
    expect(err).toHaveBeenCalledWith('[cited-sources] profound fetch failed', {
      client: 'c', start: win.startDate, end: win.endDate, priorStart: null, priorEnd: null,
    })
    err.mockRestore()
  })
})
