// lib/peec/url-citations.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  resolveYourBrandIds,
  mergeUrlCitations,
  aggregateDomainCoverage,
  domainPromptIds,
  domainTagIds,
  domainTagNames,
  urlTagNames,
  urlPromptIds,
  avgCitationsByDomain,
  ownedPromptCoveragePct,
  ownedPromptCoveragePctForModels,
  isPositiveDelta,
  fetchAllPages,
  pickCitationsForUrls,
  countDuplicateUrlKeys,
  type ApiUrlRow,
  type DomainCoverage,
} from './url-citations'
import { urlJoinKey } from '@/lib/url'

const row = (url: string, extra: Partial<ApiUrlRow>): ApiUrlRow => ({
  url, classification: 'LISTICLE', title: null, channel_title: null,
  usage_count: 1, citation_count: 1, citation_avg: 1, retrievals: 1,
  retrieval_count: 1, citation_rate: 1, mentioned_brands: [], ...extra,
})

describe('resolveYourBrandIds', () => {
  const brands = [
    { brand: { id: 'kw_self', name: 'Avenue Z' } },
    { brand: { id: 'kw_comp', name: 'Edelman' } },
  ]

  it('matches brand name case-insensitively to its id(s)', () => {
    expect(resolveYourBrandIds(brands, 'avenue z')).toEqual(['kw_self'])
  })

  it('returns [] for an unknown name or an empty string', () => {
    expect(resolveYourBrandIds(brands, 'Unknown')).toEqual([])
    expect(resolveYourBrandIds(brands, '')).toEqual([])
  })
})

describe('mergeUrlCitations', () => {
  const base: ApiUrlRow[] = [{
    url: 'https://www.avenuez.com/Blog/Post/', classification: 'LISTICLE', title: 'T',
    channel_title: null, usage_count: 10, citation_count: 30, citation_avg: 3,
    retrievals: 10, retrieval_count: 10, citation_rate: 3,
    mentioned_brands: [{ id: 'kw_self' }, { id: 'kw_comp' }],
  }]
  const perEngine: ApiUrlRow[] = [
    { ...base[0], model_channel: { id: 'openai-0' } },
    { ...base[0], model_channel: { id: 'perplexity-0' } },
  ]
  const brandNameById = new Map([['kw_self', 'Avenue Z'], ['kw_comp', 'Edelman']])

  it('merges base rows with per-engine rows into typed citations', () => {
    const merged = mergeUrlCitations(base, perEngine, ['kw_self'], brandNameById)
    expect(merged.length).toBe(1)
    expect(merged[0].urlKey).toBe('avenuez.com/blog/post')
    expect(merged[0].domain).toBe('avenuez.com')
    expect(merged[0].citationCount).toBe(30)
    expect(merged[0].mentionsYourBrand).toBe(true)
    expect(merged[0].engines.sort()).toEqual(['ChatGPT', 'Perplexity'])
    expect(merged[0].competitorBrandNames).toEqual(['Edelman'])
    expect(merged[0].citationAvg).toBe(3)
  })

  it('marks a competitor-only URL as not mentioning your brand', () => {
    const compRow: ApiUrlRow[] = [{ ...base[0], url: 'https://edelman.com/x', mentioned_brands: [{ id: 'kw_comp' }] }]
    const compMerged = mergeUrlCitations(compRow, [], ['kw_self'], brandNameById)
    expect(compMerged[0].mentionsYourBrand).toBe(false)
    expect(compMerged[0].competitorBrandNames).toEqual(['Edelman'])
  })

  it('carries retrievals through', () => {
    const testBase: ApiUrlRow = {
      url: 'https://www.linkedin.com/posts/renaissancebenefits_x-activity-7482499263831371776-tv03',
      classification: 'owned', title: 'X', channel_title: null,
      usage_count: 0, citation_count: 8, citation_avg: 0, retrievals: 9, retrieval_count: 9,
      citation_rate: 0, mentioned_brands: [],
    }
    const [c] = mergeUrlCitations([testBase], [], [], new Map())
    expect(c.retrievals).toBe(9)
  })
})

describe('avgCitationsByDomain', () => {
  it('is citation_count-weighted, falling back to a simple mean at zero total weight', () => {
    const posBase: ApiUrlRow[] = [
      row('https://www.acme.com/a', { citation_avg: 2, citation_count: 10 }),
      row('https://acme.com/b',     { citation_avg: 4, citation_count: 30 }), // same host, www-stripped
      row('https://solo.com/x',     { citation_avg: 5, citation_count: 7 }),
      row('https://zero.com/z',     { citation_avg: 6, citation_count: 0 }),  // all weights 0
    ]
    const byDom = avgCitationsByDomain(mergeUrlCitations(posBase, [], [], new Map()))
    expect(byDom['acme.com']).toBe(3.5) // (2*10 + 4*30) / 40
    expect(byDom['solo.com']).toBe(5)
    expect(byDom['zero.com']).toBe(6)   // zero total weight -> simple mean
  })
})

describe('aggregateDomainCoverage: promptIdsByDomain / tagIdsByDomain', () => {
  const promptRows: ApiUrlRow[] = [
    row('https://www.forbes.com/a', { prompt: { id: 'pr_1' } }),
    row('https://forbes.com/b',     { prompt: { id: 'pr_2' } }),   // same host, www-stripped
    row('https://forbes.com/c',     { prompt: { id: 'pr_1' } }),   // duplicate prompt, deduped
    row('https://edelman.com/x',    { prompt: { id: 'pr_3' } }),
    row('https://edelman.com/y',    {}),                            // no prompt id, ignored
  ]
  const tagRows: ApiUrlRow[] = [
    row('https://www.forbes.com/a', { tag: { id: 'tg_1' } }),
    row('https://forbes.com/b',     { tag: { id: 'tg_2' } }),
    row('https://forbes.com/d',     { tag: { id: 'tg_1' } }),       // duplicate theme, deduped
  ]
  const cov = aggregateDomainCoverage(promptRows, tagRows)

  it('groups distinct prompt ids by host, deduped and www-normalized', () => {
    expect(domainPromptIds(cov, 'forbes.com').sort()).toEqual(['pr_1', 'pr_2'])
    expect(domainPromptIds(cov, 'www.Forbes.com').sort()).toEqual(['pr_1', 'pr_2'])
    expect(domainPromptIds(cov, 'edelman.com')).toEqual(['pr_3'])
    expect(domainPromptIds(cov, 'unknown.com')).toEqual([])
  })

  it('groups distinct tag ids by host', () => {
    expect(domainTagIds(cov, 'forbes.com').sort()).toEqual(['tg_1', 'tg_2'])
    expect(domainTagIds(cov, 'edelman.com')).toEqual([])
  })

  it('computes a percentage the same way the caller does (forbes: 2 of 4 tracked prompts)', () => {
    expect(Math.round(domainPromptIds(cov, 'forbes.com').length / 4 * 100)).toBe(50)
  })
})

describe('domainTagNames / urlTagNames / urlPromptIds', () => {
  it('maps a host tag ids to display names, dropping ids with no name', () => {
    const covNamed = aggregateDomainCoverage(
      [],
      [
        row('https://www.forbes.com/a', { tag: { id: 'tg_1' } }),
        row('https://forbes.com/b',     { tag: { id: 'tg_2' } }),
        row('https://forbes.com/c',     { tag: { id: 'tg_x' } }), // no name, dropped
      ],
      { tg_1: 'Discovery', tg_2: 'Comparison' },
    )
    expect(domainTagNames(covNamed, 'forbes.com').sort()).toEqual(['Comparison', 'Discovery'])
    expect(domainTagNames(covNamed, 'www.Forbes.com').sort()).toEqual(['Comparison', 'Discovery'])
    expect(domainTagNames(covNamed, 'unknown.com')).toEqual([])
  })

  it('collects per-URL theme ids under that URL join key', () => {
    const covPerUrl = aggregateDomainCoverage(
      [],
      [
        row('https://www.forbes.com/a', { tag: { id: 'tg_1' } }),
        row('https://www.forbes.com/a', { tag: { id: 'tg_2' } }), // same URL, second theme
        row('https://forbes.com/b',     { tag: { id: 'tg_1' } }),
        row('https://forbes.com/c',     { tag: { id: 'tg_x' } }), // no name, dropped
      ],
      { tg_1: 'Discovery', tg_2: 'Comparison' },
    )
    const keyA = urlJoinKey('https://www.forbes.com/a')!
    const keyB = urlJoinKey('https://forbes.com/b')!
    const keyC = urlJoinKey('https://forbes.com/c')!
    expect(urlTagNames(covPerUrl, keyA).sort()).toEqual(['Comparison', 'Discovery'])
    expect(urlTagNames(covPerUrl, keyB)).toEqual(['Discovery'])
    expect(urlTagNames(covPerUrl, keyC)).toEqual([])
    expect(urlTagNames(covPerUrl, 'no/such/key')).toEqual([])
  })

  it('collects per-URL prompt ids under that URL join key', () => {
    const covPromptPerUrl = aggregateDomainCoverage(
      [
        row('https://www.forbes.com/a', { prompt: { id: 'pr_1' } }),
        row('https://www.forbes.com/a', { prompt: { id: 'pr_2' } }), // same URL, two prompts
        row('https://forbes.com/b',     { prompt: { id: 'pr_1' } }),
      ],
      [],
    )
    const pKeyA = urlJoinKey('https://www.forbes.com/a')!
    const pKeyB = urlJoinKey('https://forbes.com/b')!
    expect(urlPromptIds(covPromptPerUrl, pKeyA).sort()).toEqual(['pr_1', 'pr_2'])
    expect(urlPromptIds(covPromptPerUrl, pKeyB)).toEqual(['pr_1'])
    expect(urlPromptIds(covPromptPerUrl, 'no/such/key')).toEqual([])
  })
})

// ── CI-1: Content Impact "Prompt Coverage" value must react to date AND model ──
// Root cause: the KPI value was fetched with no date args (locked to a rolling
// last-30 window) and computed from unfiltered promptIdsByDomain (no model
// dimension), so only the delta pill (which did fetch a compare window) moved.
// promptIdsByDomainByModel + ownedPromptCoveragePctForModels make the value
// itself both date-reactive (via existing startDate/endDate opts) and
// model-reactive (new).
describe('aggregateDomainCoverage: promptIdsByDomainByModel', () => {
  // A prompt-coverage row now carries both prompt.id and model.id (dimensions
  // ['prompt_id','model_id']). model.id values are raw Peec scraper ids;
  // normalizeEngine() maps them to the canonical AEOModel labels.
  const modelRow = (url: string, promptId: string, modelId: string): ApiUrlRow =>
    row(url, { prompt: { id: promptId }, model: { id: modelId } })

  it('buckets distinct prompt ids per host per engine, derived from model.id', () => {
    const promptRows: ApiUrlRow[] = [
      modelRow('https://owned.com/a', 'p1', 'openai-scraper'),      // ChatGPT
      modelRow('https://owned.com/b', 'p2', 'openai-scraper'),      // ChatGPT, different prompt
      modelRow('https://owned.com/c', 'p3', 'perplexity-scraper'),  // Perplexity
      modelRow('https://competitor.com/x', 'p4', 'openai-scraper'), // different host
    ]
    const cov = aggregateDomainCoverage(promptRows, [])

    expect(cov.promptIdsByDomainByModel?.['owned.com']?.['ChatGPT']?.slice().sort()).toEqual(['p1', 'p2'])
    expect(cov.promptIdsByDomainByModel?.['owned.com']?.['Perplexity']).toEqual(['p3'])
    expect(cov.promptIdsByDomainByModel?.['competitor.com']?.['ChatGPT']).toEqual(['p4'])

    // Existing all-engines field is untouched: union across engines, ignores model.
    expect(cov.promptIdsByDomain['owned.com'].slice().sort()).toEqual(['p1', 'p2', 'p3'])
  })

  it('dedupes the same prompt cited via the same engine on two different owned URLs', () => {
    const promptRows: ApiUrlRow[] = [
      modelRow('https://owned.com/a', 'p1', 'openai-scraper'),
      modelRow('https://owned.com/b', 'p1', 'openai-scraper'), // same prompt, same engine, different URL
    ]
    const cov = aggregateDomainCoverage(promptRows, [])
    expect(cov.promptIdsByDomainByModel?.['owned.com']?.['ChatGPT']).toEqual(['p1'])
  })
})

describe('ownedPromptCoveragePctForModels', () => {
  const modelRow = (url: string, promptId: string, modelId: string): ApiUrlRow =>
    row(url, { prompt: { id: promptId }, model: { id: modelId } })

  const promptRows: ApiUrlRow[] = [
    modelRow('https://owned.com/a', 'p1', 'openai-scraper'),      // ChatGPT
    modelRow('https://owned.com/b', 'p2', 'perplexity-scraper'),  // Perplexity
    modelRow('https://blog.owned.com/c', 'p3', 'gemini-scraper'), // Gemini, owned subdomain
    modelRow('https://competitor.com/x', 'p9', 'openai-scraper'), // not owned
  ]
  const cov = aggregateDomainCoverage(promptRows, [])
  const owned = ['owned.com', 'blog.owned.com']

  it('with models=null, equals the existing all-engines union (no unintended change)', () => {
    const allEngines = ownedPromptCoveragePct(cov, owned, 10, true)
    const modelAware = ownedPromptCoveragePctForModels(cov, owned, 10, null, true)
    expect(modelAware).toBe(allEngines)
    expect(modelAware).toBe(30) // {p1,p2,p3} / 10
  })

  it('with an empty models array, also equals the all-engines union', () => {
    expect(ownedPromptCoveragePctForModels(cov, owned, 10, [], true)).toBe(30)
  })

  it('filters to only the prompt ids cited via the selected engine(s)', () => {
    // ChatGPT only -> just p1 -> 1/10 -> 10%
    expect(ownedPromptCoveragePctForModels(cov, owned, 10, ['ChatGPT'], true)).toBe(10)
    // ChatGPT + Gemini -> p1, p3 -> 2/10 -> 20%
    expect(ownedPromptCoveragePctForModels(cov, owned, 10, ['ChatGPT', 'Gemini'], true)).toBe(20)
  })

  it('unions across owned domains for the selected engine (a shared prompt counts once)', () => {
    const sharedRows: ApiUrlRow[] = [
      modelRow('https://owned.com/a', 'pX', 'openai-scraper'),
      modelRow('https://blog.owned.com/b', 'pX', 'openai-scraper'), // same prompt, same engine, other owned domain
    ]
    const sharedCov = aggregateDomainCoverage(sharedRows, [])
    expect(ownedPromptCoveragePctForModels(sharedCov, owned, 10, ['ChatGPT'], true)).toBe(10) // 1/10, not 2/10
  })

  it('returns 0 (not null) for a real zero when a selected engine has no owned-domain citations', () => {
    expect(ownedPromptCoveragePctForModels(cov, owned, 10, ['Claude'], true)).toBe(0)
  })

  it('returns null when coverage is unavailable', () => {
    expect(ownedPromptCoveragePctForModels(cov, owned, 10, ['ChatGPT'], false)).toBeNull()
  })

  it('returns null when there are no tracked prompts (avoid divide-by-zero)', () => {
    expect(ownedPromptCoveragePctForModels(cov, owned, 0, ['ChatGPT'], true)).toBeNull()
  })

  it('rounds the same way as ownedPromptCoveragePct', () => {
    // 1 of 3 tracked prompts, ChatGPT-only -> 33.33... -> rounds to 33
    expect(ownedPromptCoveragePctForModels(cov, owned, 3, ['ChatGPT'], true)).toBe(33)
  })

  it('handles a coverage object with no promptIdsByDomainByModel field gracefully (older shape)', () => {
    const legacy: DomainCoverage = {
      promptIdsByDomain: { 'owned.com': ['p1'] },
      tagIdsByDomain: {}, tagIdsByUrlKey: {}, promptIdsByUrlKey: {}, tagNameById: {},
    }
    expect(ownedPromptCoveragePctForModels(legacy, ['owned.com'], 10, ['ChatGPT'], true)).toBe(0)
    expect(ownedPromptCoveragePctForModels(legacy, ['owned.com'], 10, null, true)).toBe(10)
  })
})

// PR-2 (Paul QA, task-17): Top Editorial Opportunities is subtitled "on the
// rise", so a row must only qualify when citation share actually grew period
// over period. isPositiveDelta is the pure gate for that: strictly greater
// than zero, not gte zero, so a flat share does not count as rising.
describe('isPositiveDelta', () => {
  it('includes a clearly rising share', () => {
    expect(isPositiveDelta(12, 5)).toBe(true)
  })

  it('includes a tiny positive delta', () => {
    expect(isPositiveDelta(5.0001, 5)).toBe(true)
  })

  it('excludes a flat share (delta exactly 0)', () => {
    expect(isPositiveDelta(5, 5)).toBe(false)
  })

  it('excludes a declining share (negative delta)', () => {
    expect(isPositiveDelta(3, 5)).toBe(false)
  })

  it('includes a new appearance (0 prior share, any positive current share)', () => {
    expect(isPositiveDelta(1, 0)).toBe(true)
  })
})

// ── FB-069: paginated citation fetch ─────────────────────────────────────────
// A single limit-2000 request returned 2,000 of Renaissance's 17,081 cited URLs,
// which was enough to hide a real placement (dig-in.com) from the matchback.
// Article-level matching needs the exact URL present, so the fetch has to walk
// every page rather than trusting the first one.
describe('fetchAllPages', () => {
  it('walks pages until one comes back short', async () => {
    const pages: number[][] = [[1, 2], [3, 4], [5]]
    const offsets: number[] = []
    const out = await fetchAllPages(
      async (offset, limit) => { offsets.push(offset); return { rows: pages[offset / limit] ?? [] } },
      { pageSize: 2, maxPages: 10 },
    )
    expect(out).toEqual([1, 2, 3, 4, 5])
    expect(offsets).toEqual([0, 2, 4])
  })

  it('makes exactly one request when the first page is already short', async () => {
    let calls = 0
    const out = await fetchAllPages(
      async () => { calls++; return { rows: [1] } },
      { pageSize: 2, maxPages: 10 },
    )
    expect(calls).toBe(1)
    expect(out).toEqual([1])
  })

  it('stops at maxPages so a huge account cannot spin unbounded requests', async () => {
    let calls = 0
    const out = await fetchAllPages(
      async () => { calls++; return { rows: [1, 2] } },   // always a full page
      { pageSize: 2, maxPages: 3 },
    )
    expect(calls).toBe(3)
    expect(out).toHaveLength(6)
  })

  it('returns an empty array when the first page is empty', async () => {
    const out = await fetchAllPages(async () => ({ rows: [] }), { pageSize: 2, maxPages: 5 })
    expect(out).toEqual([])
  })
})

// ── FB-069: narrow placement-citation selection ──────────────────────────────
// The matchback is the only consumer that needs every cited URL. Rather than
// widening the shared getUrlCitations fetch (which would push the cached payload
// past Next's 2 MB limit and silently stop caching for three tabs), it walks all
// pages and keeps only the rows matching this client's placement URLs.
describe('pickCitationsForUrls', () => {
  const cite = (urlKey: string, engines: string[] = ['ChatGPT']) => ({
    url: `https://${urlKey}`, urlKey, domain: urlKey.split('/')[0],
    classification: 'editorial', title: null, citationCount: 1, citationRate: 1,
    citationAvg: 1, retrievals: 0, engines, mentionedBrandIds: [], competitorBrandNames: [],
    mentionsYourBrand: false,
  })

  it('keeps only citations whose urlKey was asked for', () => {
    const out = pickCitationsForUrls(
      [cite('a.com/1'), cite('b.com/2'), cite('c.com/3')],
      ['a.com/1', 'c.com/3'],
    )
    expect(out.map((c) => c.urlKey)).toEqual(['a.com/1', 'c.com/3'])
  })

  it('returns an empty array when nothing is asked for', () => {
    expect(pickCitationsForUrls([cite('a.com/1')], [])).toEqual([])
  })

  it('ignores requested urls that were never cited', () => {
    const out = pickCitationsForUrls([cite('a.com/1')], ['a.com/1', 'never.com/x'])
    expect(out.map((c) => c.urlKey)).toEqual(['a.com/1'])
  })

  it('dedupes repeated urlKeys so a duplicated page cannot double-count', () => {
    const out = pickCitationsForUrls(
      [cite('a.com/1', ['ChatGPT']), cite('a.com/1', ['Google'])],
      ['a.com/1'],
    )
    expect(out).toHaveLength(1)
    expect(out[0].engines.sort()).toEqual(['ChatGPT', 'Google'])
  })
})

// ── FB-069 review, finding 3: exhaustion must be distinguishable from "done" ──
describe('fetchAllPages truncation signal', () => {
  it('warns when it stops because it ran out of pages, not out of data', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await fetchAllPages(async () => ({ rows: [1, 2] }), { pageSize: 2, maxPages: 2, label: 'unit test' })
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toContain('TRUNCATED')
    expect(String(warn.mock.calls[0][0])).toContain('unit test')
    warn.mockRestore()
  })

  it('stays silent when the source genuinely runs out', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await fetchAllPages(async () => ({ rows: [1] }), { pageSize: 2, maxPages: 5 })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

// ── Review #10: a complete walk vs a gapped one ──────────────────────────────
// "0 overlapping URLs between page 0 and page 1" proves offset is honoured. It
// does NOT prove the union of the pages is the whole set: with a tie-heavy sort
// and no explicit order_by, a reorder between requests can move a row past the
// page boundary so it is never returned. Peec reports totalCount, so compare.
describe('fetchAllPages completeness check', () => {
  it('warns when fewer rows came back than the source said existed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await fetchAllPages(
      async (offset) => (offset === 0 ? { rows: [1, 2], totalCount: 5 } : { rows: [3] }),
      { pageSize: 2, maxPages: 10, label: 'gapped walk' },
    )
    expect(out).toHaveLength(3)
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toContain('INCOMPLETE')
    expect(String(warn.mock.calls[0][0])).toContain('gapped walk')
    warn.mockRestore()
  })

  it('stays silent when the row count matches what the source reported', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await fetchAllPages(
      async (offset) => (offset === 0 ? { rows: [1, 2], totalCount: 3 } : { rows: [3] }),
      { pageSize: 2, maxPages: 10 },
    )
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('stays silent when the source does not report a total', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await fetchAllPages(async () => ({ rows: [1] }), { pageSize: 2, maxPages: 5 })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

// ── Review #10, what actually works on this endpoint ─────────────────────────
// /reports/urls returns no totalCount and rejects order_by on `url` (only
// citation_count is accepted, which is the tie-heavy field in the first place).
// So neither suggested fix can settle completeness directly. But a reorder that
// pushes rows past a page boundary also pulls others backward, and THAT is
// observable: within one complete walk every base row is a distinct URL, so any
// repeated urlKey means the pagination shifted underneath us.
describe('countDuplicateUrlKeys', () => {
  const c = (urlKey: string) => ({ urlKey } as never)

  it('is zero for a clean walk', () => {
    expect(countDuplicateUrlKeys([c('a.com/1'), c('b.com/2'), c('c.com/3')])).toBe(0)
  })

  it('counts a row repeated across page boundaries', () => {
    expect(countDuplicateUrlKeys([c('a.com/1'), c('b.com/2'), c('a.com/1')])).toBe(1)
  })

  it('counts every extra occurrence, not just the fact of duplication', () => {
    expect(countDuplicateUrlKeys([c('a.com/1'), c('a.com/1'), c('a.com/1')])).toBe(2)
  })

  it('is zero for an empty set', () => {
    expect(countDuplicateUrlKeys([])).toBe(0)
  })
})
