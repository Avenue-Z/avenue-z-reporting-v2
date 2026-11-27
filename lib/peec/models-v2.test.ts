import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _n: string, fn: unknown) => fn }))
vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: vi.fn(async () => ({ peecCustomerProjectId: 'or_test', peecYourBrand: 'Renaissance' })),
}))
vi.mock('./roster', () => ({ getPeecRoster: vi.fn() }))
vi.mock('./client', async (orig) => ({ ...(await orig<typeof import('./client')>()), peecPost: vi.fn() }))

import { buildPeecModels, getPeecModelsV2 } from './models-v2'
import { peecPost, type ApiBrandRow, type ApiDomainRow } from './client'
import { getPeecRoster } from './roster'

const CH = 'chatgpt-scraper'
const GE = 'gemini-scraper'
function brow(id: string, name: string, model: string, count: number, total: number, sov: number): ApiBrandRow {
  return {
    brand: { id, name }, model_channel: { id: model }, visibility: total ? count / total : 0, visibility_count: count, visibility_total: total,
    share_of_voice: sov, sentiment: 0, sentiment_sum: 0, sentiment_count: 0, position: 0, position_sum: 0, position_count: 0,
  } as ApiBrandRow
}
function drow(domain: string, model: string, got: number, total: number): ApiDomainRow {
  return { domain, model_channel: { id: model }, retrieved_chat_count: got, total_chat_count: total } as ApiDomainRow
}
const roster = [
  { id: 'r', name: 'Renaissance', isOwn: true, domains: ['renaissancebenefits.com'] },
  { id: 'g', name: 'Guardian', isOwn: false, domains: ['guardianlife.com'] },
  { id: 'u', name: 'Unum', isOwn: false, domains: [] },
]
const brandRows = [
  brow('r', 'Renaissance', CH, 200, 1000, 0.1), brow('g', 'Guardian', CH, 300, 1000, 0.2), brow('u', 'Unum', CH, 100, 1000, 0.3),
  brow('r', 'Renaissance', GE, 50, 500, 0.05), brow('g', 'Guardian', GE, 100, 500, 0.1),
]
const brandRowsPrior = [brow('r', 'Renaissance', CH, 100, 1000, 0.08), brow('g', 'Guardian', CH, 200, 1000, 0.1)]
const domainRows = [
  drow('renaissancebenefits.com', CH, 300, 1000), drow('guardianlife.com', CH, 100, 1000),
  drow('renaissancebenefits.com', GE, 50, 500), drow('guardianlife.com', GE, 25, 500),
]
const domainRowsPrior = [drow('renaissancebenefits.com', CH, 100, 1000)]

describe('buildPeecModels', () => {
  const out = buildPeecModels({ roster, brandRows, brandRowsPrior, domainRows, domainRowsPrior, yourBrand: 'Renaissance' })
  const by = Object.fromEntries(out.models.map((m) => [m.model, m]))
  it('lists the client models in AEO_MODELS order', () => {
    expect(out.models.map((m) => m.model)).toEqual(['ChatGPT', 'Gemini'])
    expect(out.usedAsSourceBasis).toBe('answers')
  })
  it('computes visibility with the competitor mean', () => {
    expect(by.ChatGPT.visibility.you).toBeCloseTo(20)
    expect(by.ChatGPT.visibility.youPrior).toBeCloseTo(10)
    expect(by.ChatGPT.visibility.competitorAvg).toBeCloseTo((30 + 10) / 2)
  })
  it('has a null prior on a model with no prior row', () => {
    expect(by.Gemini.visibility.youPrior).toBeNull()
    expect(by.Gemini.sov.youPrior).toBeNull()
    expect(by.Gemini.usedAsSource.youPrior).toBeNull()
  })
  it('uses the mean of row share of voice times 100', () => {
    expect(by.ChatGPT.sov.you).toBeCloseTo(10)
    expect(by.ChatGPT.sov.competitorAvg).toBeCloseTo(25)
  })
  it('computes Used as a source per model, leaving a brand without domains out of the mean', () => {
    expect(by.ChatGPT.usedAsSource.you).toBeCloseTo(30)
    expect(by.ChatGPT.usedAsSource.youPrior).toBeCloseTo(10)
    expect(by.ChatGPT.usedAsSource.competitorAvg).toBeCloseTo(10)
    expect(by.Gemini.usedAsSource.you).toBeCloseTo(10)
  })
  it('drops a model the client has no answers on, and returns nothing when you is unknown', () => {
    const rows = [...brandRows, brow('r', 'Renaissance', 'claude-scraper', 0, 0, 0), brow('g', 'Guardian', 'claude-scraper', 1, 10, 0.1)]
    expect(buildPeecModels({ roster, brandRows: rows, brandRowsPrior, domainRows, domainRowsPrior, yourBrand: 'Renaissance' }).models.map((m) => m.model)).toEqual(['ChatGPT', 'Gemini'])
    expect(buildPeecModels({ roster, brandRows, brandRowsPrior, domainRows, domainRowsPrior, yourBrand: 'Nobody' }).models).toEqual([])
  })
  it('uses distinct answers for a multi-row brand on that model', () => {
    const multiRoster = [{ ...roster[0], domains: ['renaissancebenefits.com', 'tenncare.renaissancebenefits.com'] }, roster[1], roster[2]]
    const dr = [drow('renaissancebenefits.com', CH, 300, 1000), drow('tenncare.renaissancebenefits.com', CH, 200, 1000)]
    const o = buildPeecModels({
      roster: multiRoster, brandRows, brandRowsPrior, domainRows: dr, domainRowsPrior: [],
      distinct: new Map([['Renaissance', new Map([['ChatGPT' as const, 400]])]]), yourBrand: 'Renaissance',
    })
    expect(o.models[0].usedAsSource.you).toBeCloseTo(40)
  })
})

describe('getPeecModelsV2', () => {
  const post = vi.mocked(peecPost)
  beforeEach(() => {
    post.mockReset()
    vi.mocked(getPeecRoster).mockResolvedValue(roster)
  })
  const chatCalls = () => post.mock.calls.filter(([, b]) => (b as { dimensions?: string[] }).dimensions?.includes('chat_id'))

  it('makes no chat_id call when no brand has several rows on a model', async () => {
    post.mockImplementation(async (path) => ({ data: path === '/reports/brands' ? brandRows : domainRows }) as never)
    const res = await getPeecModelsV2('renaissance', 'last_30_days', 'previous_period')
    expect(chatCalls()).toHaveLength(0)
    expect(res.models.map((m) => m.model)).toEqual(['ChatGPT', 'Gemini'])
    const brandCall = post.mock.calls.find(([p]) => p === '/reports/brands')![1] as { dimensions: string[]; limit: number }
    expect(brandCall.dimensions).toEqual(['model_channel_id', 'model_id'])
  })
  it('makes one chat_id call per window when a brand has several rows on a model', async () => {
    vi.mocked(getPeecRoster).mockResolvedValue([{ ...roster[0], domains: ['renaissancebenefits.com', 'tenncare.renaissancebenefits.com'] }, roster[1], roster[2]])
    const dr = [drow('renaissancebenefits.com', CH, 300, 1000), drow('tenncare.renaissancebenefits.com', CH, 200, 1000)]
    post.mockImplementation(async (path, body) => {
      if ((body as { dimensions?: string[] }).dimensions?.includes('chat_id')) {
        return { data: [{ domain: 'renaissancebenefits.com', chat: { id: 'c1' }, model_channel: { id: CH } }] } as never
      }
      return { data: path === '/reports/brands' ? brandRows : dr } as never
    })
    const res = await getPeecModelsV2('renaissance', 'last_30_days', 'previous_period')
    expect(chatCalls()).toHaveLength(2)
    expect(res.models[0].usedAsSource.you).toBeCloseTo(0.1) // 1 distinct answer / 1000
  })
  it('stops chat_id paging at 5 pages and leaves the multi-row brand null', async () => {
    vi.mocked(getPeecRoster).mockResolvedValue([{ ...roster[0], domains: ['renaissancebenefits.com', 'tenncare.renaissancebenefits.com'] }, roster[1], roster[2]])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dr = [drow('renaissancebenefits.com', CH, 300, 1000), drow('tenncare.renaissancebenefits.com', CH, 200, 1000)]
    const full = Array.from({ length: 10_000 }, () => ({ domain: 'renaissancebenefits.com', chat: { id: 'c1' }, model_channel: { id: CH } }))
    post.mockImplementation(async (path, body) => {
      if ((body as { dimensions?: string[] }).dimensions?.includes('chat_id')) return { data: full } as never
      return { data: path === '/reports/brands' ? brandRows : dr } as never
    })
    const res = await getPeecModelsV2('renaissance', 'last_30_days', 'previous_period')
    expect(chatCalls()).toHaveLength(10)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[peec] chat_id rows hit 50000 for renaissance; distinct answers unavailable'))
    expect(res.models[0].usedAsSource.you).toBeNull()
    warn.mockRestore()
  })
  it('fails closed without a configured project', async () => {
    const { getClientBySlug } = await import('@/lib/db/queries')
    vi.mocked(getClientBySlug).mockResolvedValueOnce({ peecCustomerProjectId: null } as never)
    await expect(getPeecModelsV2('renaissance', 'last_30_days', 'previous_period')).rejects.toThrow('[peec] no Peec project configured for renaissance')
    expect(post).not.toHaveBeenCalled()
  })
})
