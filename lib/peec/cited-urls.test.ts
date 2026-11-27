// lib/peec/cited-urls.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { joinWindows } from '@/lib/aeo/cited-urls'
import type { ApiUrlRow } from './url-citations'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _n: string, fn: unknown) => fn }))
const getClientBySlug = vi.fn()
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: (s: string) => getClientBySlug(s) }))

import {
  mapPeecWindow,
  peecPageTypeLabel,
  peecSource,
  getPeecCitedUrls,
  type PeecDomainRow,
} from './cited-urls'

const urlRow = (url: string, extra: Partial<ApiUrlRow> = {}): ApiUrlRow => ({
  url, classification: 'HOW_TO_GUIDE', title: 'T', channel_title: null,
  usage_count: 1, citation_count: 1, citation_avg: 1, retrievals: 1,
  retrieval_count: 1, citation_rate: 1, mentioned_brands: [], ...extra,
})
const dom = (domain: string, classification: string | null, total = 8979): PeecDomainRow =>
  ({ domain, classification, total_chat_count: total })

describe('mapPeecWindow', () => {
  it("used % uses the window's chats", () => {
    const w = mapPeecWindow(
      [urlRow('https://www.renaissancebenefits.com/a', { retrieval_count: 1525, citation_count: 2115 })],
      [dom('renaissancebenefits.com', 'OWN')],
      true,
    )
    const out = joinWindows('peec', w, null)
    expect(out.rows[0].usedPct).toBeCloseTo(16.98, 2)
    expect(out.rows[0].citationRate).toBeCloseTo(1.3869, 3)
    expect(out.totalCitations).toBe(2115)
  })

  it('source type by host and parent', () => {
    const domains = [
      dom('renaissancebenefits.com', 'OWN'),
      dom('reddit.com', 'UGC'),
      dom('nothing.com', null),
    ]
    const w = mapPeecWindow(
      [
        urlRow('https://www.renaissancebenefits.com/blog/x'),
        urlRow('https://blog.renaissancebenefits.com/y'),
        urlRow('https://reddit.com/r/z'),
        urlRow('https://unknown.org/q'),
        urlRow('https://nothing.com/q'),
      ],
      domains,
      true,
    )
    const by = Object.fromEntries(w.rows.map((r) => [r.url, [r.sourceType, r.sourceLabel]]))
    expect(by['https://www.renaissancebenefits.com/blog/x']).toEqual(['own', 'Own'])
    expect(by['https://blog.renaissancebenefits.com/y']).toEqual(['own', 'Own'])
    expect(by['https://reddit.com/r/z']).toEqual(['third_party', 'UGC'])
    expect(by['https://unknown.org/q']).toEqual(['third_party', 'Other'])
    expect(by['https://nothing.com/q']).toEqual(['third_party', 'Other'])
  })

  it('maps every classification', () => {
    const m = new Map([
      ['a.com', 'COMPETITOR'], ['b.com', 'CORPORATE'], ['c.com', 'EDITORIAL'],
      ['d.com', 'REFERENCE'], ['e.com', 'INSTITUTIONAL'],
    ])
    expect(peecSource('a.com', m)).toEqual({ sourceType: 'competitor', sourceLabel: 'Competitor' })
    expect(peecSource('b.com', m).sourceLabel).toBe('Corporate')
    expect(peecSource('c.com', m).sourceLabel).toBe('Editorial')
    expect(peecSource('d.com', m).sourceLabel).toBe('Reference')
    expect(peecSource('e.com', m).sourceLabel).toBe('Institutional')
  })

  it('page type labels', () => {
    expect(peecPageTypeLabel('HOW_TO_GUIDE')).toBe('How-to guide')
    expect(peecPageTypeLabel('PRODUCT_PAGE')).toBe('Product page')
    expect(peecPageTypeLabel('UGC')).toBe('UGC')
    expect(peecPageTypeLabel(null)).toBeNull()
  })

  it('null title is kept null, a keyless URL is dropped, a repeated key sums', () => {
    const w = mapPeecWindow(
      [
        urlRow('https://a.com/x', { title: null, retrieval_count: 2, citation_count: 3 }),
        urlRow('https://www.a.com/x/', { title: 'Later', retrieval_count: 5, citation_count: 7 }),
        urlRow('', {}),
      ],
      [dom('a.com', null, 100)],
      false,
    )
    expect(w.rows).toHaveLength(1)
    expect(w.rows[0].title).toBeNull()
    expect(w.rows[0].answersUsing).toBe(7)
    expect(w.rows[0].citations).toBe(10)
    expect(w.complete).toBe(false)
    expect(w.totalAnswers).toBe(100)
    expect(w.totalCitations).toBe(11) // the dropped keyless row still counts
  })
})

describe('getPeecCitedUrls', () => {
  const cur = { startDate: '2026-10-01', endDate: '2026-10-31' }
  const pri = { startDate: '2026-09-01', endDate: '2026-09-30' }
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.PEEC_AI_CUSTOMER_TOKEN = 'tok'
    getClientBySlug.mockReset()
    fetchMock = vi.fn(async (_u: string, init: { body: string }) => {
      const path = String(_u)
      const data = path.endsWith('/reports/urls')
        ? [urlRow('https://a.com/x')]
        : [dom('a.com', 'OWN')]
      void init
      return { ok: true, status: 200, json: async () => ({ data }) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('fetcher sends no prompt filter and walks both reports', async () => {
    getClientBySlug.mockResolvedValue({ peecCustomerProjectId: 'p1' })
    const out = await getPeecCitedUrls('c', cur, pri)
    const calls = fetchMock.mock.calls.map((c) => ({
      path: String(c[0]).replace('https://api.peec.ai/customer/v1', ''),
      body: JSON.parse(c[1].body),
    }))
    expect(calls.map((c) => c.path).sort()).toEqual(
      ['/reports/domains', '/reports/domains', '/reports/urls', '/reports/urls'],
    )
    for (const c of calls) {
      expect(c.body.project_id).toBe('p1')
      expect(c.body.filters).toBeUndefined()
    }
    expect(calls.map((c) => c.body.start_date).sort()).toEqual(
      ['2026-09-01', '2026-09-01', '2026-10-01', '2026-10-01'],
    )
    expect(out.compared).toBe(true)
    expect(out.rows[0].sourceType).toBe('own')
  })

  it('prior null makes two requests', async () => {
    getClientBySlug.mockResolvedValue({ peecCustomerProjectId: 'p1' })
    const out = await getPeecCitedUrls('c', cur, null)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(out.compared).toBe(false)
  })

  it('a window over 92 days is tooLong and never fetches', async () => {
    const out = await getPeecCitedUrls('c', { startDate: '2026-01-01', endDate: '2026-04-03' }, null)
    expect(out.tooLong).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no Peec project → empty, no fetch', async () => {
    getClientBySlug.mockResolvedValue({ peecCustomerProjectId: null })
    const out = await getPeecCitedUrls('c', cur, pri)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.rows).toEqual([])
    expect(out.provider).toBe('peec')
  })

  it('logs slug and dates, then rethrows', async () => {
    getClientBySlug.mockResolvedValue({ peecCustomerProjectId: 'p1' })
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getPeecCitedUrls('c', cur, null)).rejects.toThrow(/500/)
    expect(err).toHaveBeenCalledWith('[cited-sources] peec fetch failed', {
      client: 'c', start: '2026-10-01', end: '2026-10-31',
    })
    err.mockRestore()
  })
})
