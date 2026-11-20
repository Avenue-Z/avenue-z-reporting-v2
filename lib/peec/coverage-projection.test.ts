// lib/peec/coverage-projection.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  aggregateDomainCoverage, ownedPromptCoveragePctForModels, type ApiUrlRow,
} from './url-citations'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _n: string, fn: unknown) => fn }))
vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: async () => ({ peecCustomerProjectId: 'proj', peecYourBrand: 'Mine' }),
}))
const getUrlCitationsMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []))
vi.mock('./url-citations', async (orig) => ({
  ...(await orig<typeof import('./url-citations')>()),
  getUrlCitations: getUrlCitationsMock,
}))

import {
  projectCoverage, getCoverageProjection, EMPTY_COVERAGE_PROJECTION,
  coverageAvailable, topGapUrlKeys, warnIfProjectionLarge, GAP_URL_KEYS_LIMIT, PROJECTION_WARN_BYTES,
} from './coverage-projection'
import type { UrlCitation } from './url-citations'

const row = (url: string, prompt: string, model: string, extra: Partial<ApiUrlRow> = {}): ApiUrlRow => ({
  url, classification: 'OTHER', title: null, channel_title: null,
  prompt: { id: prompt }, model: { id: model },
  usage_count: 1, citation_count: 1, citation_avg: 1, retrievals: 1,
  retrieval_count: 1, citation_rate: 1, mentioned_brands: [], ...extra,
})

const base = {
  tagRows: [] as ApiUrlRow[], tagNameById: {}, ownedHosts: new Set(['x.com']),
  competitorDomains: new Set(['rival.com']), gapUrlKeys: new Set<string>(),
  yourBrandIds: ['me'], complete: true, duplicateRows: 0,
}

describe('projectCoverage', () => {
  const promptRows = [
    row('https://blog.x.com/a', 'p1', 'openai-0'),
    row('https://x.com/b', 'p2', 'gemini-scraper'),
    row('https://rival.com/r', 'p3', 'openai-0'),
    row('https://other.com/o', 'p4', 'openai-0'),
  ]

  it('owned prompt ids include a prompt cited only via an owned subdomain, overall and per engine', () => {
    const p = projectCoverage({ ...base, promptRows })
    expect(p.ownedPromptIds.sort()).toEqual(['p1', 'p2'])
    expect(p.ownedPromptIdsByModel.ChatGPT).toEqual(['p1'])
    expect(p.ownedPromptIdsByModel.Gemini).toEqual(['p2'])
  })

  it('promptIdsByUrlKey keeps owned and gap url keys and drops the rest', () => {
    const p = projectCoverage({ ...base, promptRows, gapUrlKeys: new Set(['other.com/o']) })
    expect(Object.keys(p.promptIdsByUrlKey).sort()).toEqual(['blog.x.com/a', 'other.com/o', 'x.com/b'])
  })

  it('promptIdsByDomain keeps owned and competitor hosts only (and the by-model map)', () => {
    const p = projectCoverage({ ...base, promptRows })
    expect(Object.keys(p.promptIdsByDomain).sort()).toEqual(['blog.x.com', 'rival.com', 'x.com'])
    expect(Object.keys(p.promptIdsByDomainByModel ?? {}).sort()).toEqual(['blog.x.com', 'rival.com', 'x.com'])
  })

  it('ranks competitor-naming urls first, then by citations; caps at 3 with a more count', () => {
    const rows = [
      row('https://s1.com/a', 'p', 'openai-0', { citation_count: 50 }),
      row('https://s2.com/a', 'p', 'openai-0', { citation_count: 40 }),
      row('https://s3.com/a', 'p', 'openai-0', { citation_count: 30 }),
      row('https://naming.com/a', 'p', 'openai-0', { citation_count: 1, mentioned_brands: [{ id: 'comp' }] }),
      row('https://x.com/own', 'p', 'openai-0', { citation_count: 99 }),
    ]
    const o = projectCoverage({ ...base, promptRows: rows }).otherSitesByPrompt.p
    expect(o.urls.map((u) => u.urlKey)).toEqual(['naming.com/a', 's1.com/a', 's2.com/a'])
    expect(o.urls[0].namesCompetitor).toBe(true)
    expect(o.urls[1].namesCompetitor).toBe(false)
    expect(o.more).toBe(1)
  })

  it('a mention of only your own brand does not count as naming a competitor', () => {
    const rows = [row('https://s1.com/a', 'p', 'openai-0', { mentioned_brands: [{ id: 'me' }] })]
    expect(projectCoverage({ ...base, promptRows: rows }).otherSitesByPrompt.p.urls[0].namesCompetitor).toBe(false)
  })

  it('ownedPromptCoveragePctForModels matches the full aggregate for the fixture', () => {
    const full = aggregateDomainCoverage(promptRows, [], {})
    const p = projectCoverage({ ...base, promptRows })
    for (const models of [null, ['ChatGPT'], ['Gemini']]) {
      expect(ownedPromptCoveragePctForModels(p, ['x.com'], 4, models, true))
        .toBe(ownedPromptCoveragePctForModels(full, ['x.com'], 4, models, true))
    }
  })

  it('carries complete and duplicateRows through', () => {
    const p = projectCoverage({ ...base, promptRows, complete: false, duplicateRows: 2 })
    expect(p.complete).toBe(false)
    expect(p.duplicateRows).toBe(2)
  })
})

describe('getCoverageProjection', () => {
  const PAGE = 10_000
  let promptWalks: number
  let handler: (offset: number, walk: number) => ApiUrlRow[]
  /** When set, prompt-walk pages wait for it: holds a walk in flight. */
  let gate: Promise<void> | null

  beforeEach(() => {
    getUrlCitationsMock.mockClear()
    process.env.PEEC_AI_CUSTOMER_TOKEN = 't'
    promptWalks = 0
    gate = null
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: { body?: string }) => {
      const path = String(input).replace('https://api.peec.ai/customer/v1', '').split('?')[0]
      const body = init?.body ? JSON.parse(init.body) : {}
      let data: unknown[] = []
      if (path === '/reports/urls' && body.dimensions?.includes('prompt_id')) {
        if (body.offset === 0) promptWalks++
        if (gate) await gate
        data = handler(body.offset, promptWalks)
      } else if (path === '/reports/domains') {
        data = [{ domain: 'x.com', classification: 'OWN' }]
      } else if (path === '/reports/brands') {
        data = [{ brand: { id: 'me', name: 'Mine' } }]
      }
      return { ok: true, json: async () => ({ data }) }
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  const filler = (n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => row(`https://f.com/${tag}${i}`, 'pf', 'openai-0'))
  const opts = { startDate: '2026-01-01', endDate: '2026-01-30' }

  it('a prompt that first appears after row 10,000 is present', async () => {
    handler = (offset) => offset === 0 ? filler(PAGE, 'a') : [row('https://x.com/late', 'p-late', 'openai-0')]
    const p = await getCoverageProjection('s', opts)
    expect(p.complete).toBe(true)
    expect(p.ownedPromptIds).toContain('p-late')
  })

  it('a duplicate on the first walk triggers exactly one retry, keeping the second result', async () => {
    handler = (_o, walk) => walk === 1
      ? [row('https://x.com/a', 'p1', 'openai-0'), row('https://x.com/a', 'p1', 'openai-0')]
      : [row('https://x.com/a', 'p2', 'openai-0')]
    const p = await getCoverageProjection('s', opts)
    expect(promptWalks).toBe(2)
    expect(p.duplicateRows).toBe(0)
    expect(p.ownedPromptIds).toEqual(['p2'])
  })

  it('persistent duplicates: retried once, accepted as complete, one warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    handler = () => [row('https://x.com/a', 'p1', 'openai-0'), row('https://x.com/a', 'p1', 'openai-0')]
    const p = await getCoverageProjection('s', opts)
    expect(promptWalks).toBe(2)
    expect(p.complete).toBe(true)
    expect(p.duplicateRows).toBe(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('maxPages exhausted: incomplete', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const page = filler(PAGE, 'a')
    handler = () => page
    const p = await getCoverageProjection('s', opts)
    expect(p.complete).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('gap url keys come from getUrlCitations(clientSlug) with no picker window, and survive into promptIdsByUrlKey', async () => {
    getUrlCitationsMock.mockResolvedValueOnce([
      { urlKey: 'other.com/gap', mentionsYourBrand: false, competitorBrandNames: ['Rival'] },
      { urlKey: 'other.com/mine', mentionsYourBrand: true, competitorBrandNames: ['Rival'] },
      { urlKey: 'other.com/none', mentionsYourBrand: false, competitorBrandNames: [] },
    ])
    handler = () => [
      row('https://other.com/gap', 'p1', 'openai-0'),
      row('https://other.com/mine', 'p2', 'openai-0'),
      row('https://other.com/none', 'p3', 'openai-0'),
    ]
    const p = await getCoverageProjection('s', opts)
    expect(getUrlCitationsMock).toHaveBeenCalledWith('s')
    expect(Object.keys(p.promptIdsByUrlKey)).toEqual(['other.com/gap'])
  })

  it('two concurrent calls for the same window share one walk (I1 in-flight dedupe)', async () => {
    handler = () => [row('https://x.com/a', 'p1', 'openai-0')]
    const [a, b] = await Promise.all([getCoverageProjection('s', opts), getCoverageProjection('s', opts)])
    expect(promptWalks).toBe(1)
    expect(a).toBe(b)
    // Cleared on settle: the next call walks again.
    await getCoverageProjection('s', opts)
    expect(promptWalks).toBe(2)
  })

  it('a call for a different window while one is in flight walks on its own', async () => {
    handler = () => [row('https://x.com/a', 'p1', 'openai-0')]
    let release!: () => void
    gate = new Promise<void>((r) => { release = r })
    // Started one after the other, not in the same tick: the impl's dynamic import of
    // '@/lib/db/queries' loads the real module when two first imports race in Vitest.
    const a = getCoverageProjection('s', opts)
    await vi.waitFor(() => expect(promptWalks).toBe(1))
    const b = getCoverageProjection('s', { ...opts, endDate: '2026-01-29' })
    await vi.waitFor(() => expect(promptWalks).toBe(2))
    release()
    await Promise.all([a, b])
  })

  it('exports an empty placeholder', () => {
    expect(EMPTY_COVERAGE_PROJECTION.complete).toBe(true)
    expect(EMPTY_COVERAGE_PROJECTION.otherSitesByPrompt).toEqual({})
  })
})

describe('coverageAvailable (M3)', () => {
  it('needs a complete walk with some data', () => {
    const data = { ...EMPTY_COVERAGE_PROJECTION, promptIdsByDomain: { 'x.com': ['p1'] } }
    expect(coverageAvailable(data)).toBe(true)
    expect(coverageAvailable({ ...data, complete: false })).toBe(false)
    expect(coverageAvailable(EMPTY_COVERAGE_PROJECTION)).toBe(false)
    expect(coverageAvailable({ ...EMPTY_COVERAGE_PROJECTION, tagIdsByDomain: { 'x.com': ['t'] } })).toBe(true)
  })
})

describe('topGapUrlKeys (M7)', () => {
  const c = (urlKey: string, n: number, o: Partial<UrlCitation> = {}): UrlCitation => ({
    url: `https://${urlKey}`, urlKey, domain: 'o.com', classification: 'x', title: null, citationCount: n,
    citationRate: 0, citationAvg: 0, engines: [], mentionedBrandIds: [], competitorBrandNames: ['Rival'],
    mentionsYourBrand: false, ...o,
  })
  it(`keeps only the top ${50} brand-absent competitor-naming urls by citations`, () => {
    const cits = [
      ...Array.from({ length: 60 }, (_, i) => c(`o.com/${i}`, i)),
      c('o.com/mine', 999, { mentionsYourBrand: true }),
      c('o.com/nocomp', 998, { competitorBrandNames: [] }),
    ]
    const keys = topGapUrlKeys(cits)
    expect(GAP_URL_KEYS_LIMIT).toBe(50)
    expect(keys.size).toBe(50)
    expect(keys.has('o.com/59')).toBe(true)
    expect(keys.has('o.com/10')).toBe(true)
    expect(keys.has('o.com/9')).toBe(false)
    expect(keys.has('o.com/mine')).toBe(false)
    expect(keys.has('o.com/nocomp')).toBe(false)
  })
})

describe('warnIfProjectionLarge (M9)', () => {
  afterEach(() => { vi.restoreAllMocks() })
  it('warns over 1.5 MB and stays quiet under it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnIfProjectionLarge(EMPTY_COVERAGE_PROJECTION, 's')
    expect(warn).not.toHaveBeenCalled()
    const big = { ...EMPTY_COVERAGE_PROJECTION, tagNameById: { t: 'x'.repeat(PROJECTION_WARN_BYTES) } }
    warnIfProjectionLarge(big, 's')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(PROJECTION_WARN_BYTES).toBe(1_500_000)
  })
})
