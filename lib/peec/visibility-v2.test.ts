import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _n: string, fn: unknown) => fn }))
vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: vi.fn(async () => ({ peecCustomerProjectId: 'or_test', peecYourBrand: 'Renaissance' })),
}))
vi.mock('./roster', () => ({ getPeecRoster: vi.fn() }))
vi.mock('./client', async (orig) => ({
  ...(await orig<typeof import('./client')>()),
  peecPost: vi.fn(),
  peecGet: vi.fn(),
  fetchAllRows: vi.fn(),
}))

import { buildPeecBrandRows, getPeecVisibilityV2 } from './visibility-v2'
import { peecPost, peecGet, fetchAllRows, type ApiBrandRow } from './client'
import { getPeecRoster } from './roster'

function row(id: string, name: string, count: number, total: number, sov = 0, date?: string): ApiBrandRow {
  return {
    brand: { id, name }, date, visibility: total ? count / total : 0, visibility_count: count, visibility_total: total,
    share_of_voice: sov, sentiment: 0, sentiment_sum: 0, sentiment_count: 0, position: 0, position_sum: 0, position_count: 0,
  } as ApiBrandRow
}

const current = [row('g', 'Guardian', 300, 1000, 0.2), row('r', 'Renaissance', 200, 1000, 0.1), row('n', 'NewCo', 50, 1000, 0.05)]
const prior = [row('g', 'Guardian', 250, 1000, 0.15), row('r', 'Renaissance', 220, 1000, 0.12)]

describe('buildPeecBrandRows', () => {
  it('orders, ranks and flags only the own brand', () => {
    const rows = buildPeecBrandRows(current, prior, new Map(), new Map(), 'Renaissance')
    expect(rows.map((r) => [r.name, r.rank, r.isYou])).toEqual([
      ['Guardian', 1, false], ['Renaissance', 2, true], ['NewCo', 3, false],
    ])
  })
  it('carries priors and nulls a brand absent from the prior window', () => {
    const rows = buildPeecBrandRows(current, prior, new Map(), new Map(), 'Renaissance')
    const by = Object.fromEntries(rows.map((r) => [r.name, r]))
    expect(by.Guardian.visibilityPrior).toBeCloseTo(25)
    expect(by.Renaissance.visibilityPrior).toBeCloseTo(22)
    expect(by.Renaissance.sovPrior).toBeCloseTo(12)
    expect(by.NewCo.visibilityPrior).toBeNull()
    expect(by.NewCo.sovPrior).toBeNull()
  })
  it('takes Used as a source from the maps, null when missing', () => {
    const rows = buildPeecBrandRows(current, prior, new Map([['Guardian', 40]]), new Map([['Guardian', 30]]), 'Renaissance')
    const by = Object.fromEntries(rows.map((r) => [r.name, r]))
    expect(by.Guardian.usedAsSource).toBe(40)
    expect(by.Guardian.usedAsSourcePrior).toBe(30)
    expect(by.Renaissance.usedAsSource).toBeNull()
    expect(by.Renaissance.usedAsSourcePrior).toBeNull()
  })
  // Final review I2: a brand new this period has no prior in any column, even when the prior window's domains report counted it.
  it('has a null Used as a source prior for a brand with no prior row', () => {
    const rows = buildPeecBrandRows(current, prior, new Map([['NewCo', 5]]), new Map([['NewCo', 4]]), 'Renaissance')
    const newCo = rows.find((r) => r.name === 'NewCo')!
    expect(newCo.usedAsSource).toBe(5)
    expect(newCo.usedAsSourcePrior).toBeNull()
  })
  it('flags nobody when you is null', () => {
    expect(buildPeecBrandRows(current, prior, new Map(), new Map(), null).some((r) => r.isYou)).toBe(false)
  })
})

describe('getPeecVisibilityV2', () => {
  const peecGetMock = vi.mocked(peecGet)
  const post = vi.mocked(peecPost)
  const fetchAll = vi.mocked(fetchAllRows)
  const domain = (d: string) => ({ domain: d, retrieved_chat_count: 10, total_chat_count: 100 })

  afterEach(() => vi.unstubAllEnvs())

  beforeEach(() => {
    post.mockReset(); fetchAll.mockReset()
    fetchAll.mockResolvedValue([row('r', 'Renaissance', 1, 4, 0, '2026-01-01'), row('g', 'Guardian', 2, 4, 0, '2026-01-01')])
  })

  function setup(rosterDomains: string[]) {
    vi.mocked(getPeecRoster).mockResolvedValue([
      { id: 'r', name: 'Renaissance', isOwn: true, domains: rosterDomains },
      { id: 'g', name: 'Guardian', isOwn: false, domains: ['guardian.com'] },
    ])
  }
  const chatCalls = () => post.mock.calls.filter(([, b]) => (b as { dimensions?: string[] }).dimensions?.[0] === 'chat_id')

  it('makes no chat_id call when every brand has at most one domain row', async () => {
    setup(['renaissance.com'])
    post.mockImplementation(async (path) => (path === '/reports/domains'
      ? { data: [domain('renaissance.com'), domain('guardian.com')] } : { data: current }) as never)
    const res = await getPeecVisibilityV2('renaissance', 'last_30_days', 'previous_period')
    expect(chatCalls()).toHaveLength(0)
    expect(fetchAll).toHaveBeenCalledWith(expect.objectContaining({ dimensions: ['date'] }), 'or_test', 20_000)
    expect(res.usedAsSourceBasis).toBe('answers')
    expect(res.roster).toEqual(['Renaissance', 'Guardian'])
    expect(res.brands.find((b) => b.name === 'Renaissance')?.usedAsSource).toBeCloseTo(10)
    expect(res.trend.find((t) => t.name === 'Renaissance')?.points).toEqual([{ date: '2026-01-01', visibility: 25 }])
  })

  it('makes exactly one chat_id call per window when a brand has several rows', async () => {
    setup(['renaissance.com', 'tenncare.renaissance.com'])
    post.mockImplementation(async (path, body) => {
      if (path === '/reports/domains') {
        const dims = (body as { dimensions?: string[] }).dimensions
        if (dims?.[0] === 'chat_id') return { data: [{ domain: 'renaissance.com', chat: { id: 'c1' } }, { domain: 'tenncare.renaissance.com', chat: { id: 'c1' } }] } as never
        return { data: [domain('renaissance.com'), domain('tenncare.renaissance.com'), domain('guardian.com')] } as never
      }
      return { data: current } as never
    })
    const res = await getPeecVisibilityV2('renaissance', 'last_30_days', 'previous_period')
    expect(chatCalls()).toHaveLength(2)
    expect(res.brands.find((b) => b.name === 'Renaissance')?.usedAsSource).toBeCloseTo(1) // 1 distinct answer / 100
  })

  it('fails closed without a configured project, ignoring the env fallback', async () => {
    const { getClientBySlug } = await import('@/lib/db/queries')
    vi.mocked(getClientBySlug).mockResolvedValueOnce({ peecCustomerProjectId: null, peecYourBrand: 'Renaissance' } as never)
    vi.stubEnv('PEEC_AI_PROJECT_ID', 'or_env')
    await expect(getPeecVisibilityV2('renaissance', 'last_30_days', 'previous_period')).rejects.toThrow('[peec] no Peec project configured for renaissance')
    expect(post).not.toHaveBeenCalled()
    expect(peecGetMock).not.toHaveBeenCalled()
  })

  it('does not take your brand from the env', async () => {
    const { getClientBySlug } = await import('@/lib/db/queries')
    vi.mocked(getClientBySlug).mockResolvedValueOnce({ peecCustomerProjectId: 'or_test', peecYourBrand: null } as never)
    vi.stubEnv('PEEC_AI_YOUR_BRAND', 'Guardian')
    setup(['renaissance.com'])
    post.mockImplementation(async (path) => (path === '/reports/domains' ? { data: [] } : { data: current }) as never)
    const res = await getPeecVisibilityV2('renaissance', 'last_30_days', 'previous_period')
    expect(res.brands.filter((b) => b.isYou).map((b) => b.name)).toEqual(['Renaissance']) // the roster's own flag, not the env
  })

  it('marks one you by exact name, not substring', async () => {
    const { getClientBySlug } = await import('@/lib/db/queries')
    vi.mocked(getClientBySlug).mockResolvedValueOnce({ peecCustomerProjectId: 'or_test', peecYourBrand: 'Allstate' } as never)
    vi.mocked(getPeecRoster).mockResolvedValue([
      { id: 'a', name: 'Allstate', isOwn: false, domains: [] }, { id: 'b', name: 'Allstate Benefits', isOwn: false, domains: [] },
    ])
    const rows = [row('a', 'Allstate', 1, 10, 0, '2026-01-01'), row('b', 'Allstate Benefits', 2, 10, 0, '2026-01-01')]
    fetchAll.mockResolvedValue(rows)
    post.mockImplementation(async (path) => (path === '/reports/domains' ? { data: [] } : { data: rows }) as never)
    const res = await getPeecVisibilityV2('x', 'last_30_days', 'previous_period')
    expect(res.brands.filter((b) => b.isYou).map((b) => b.name)).toEqual(['Allstate'])
    expect(res.trend.filter((t) => t.isYou).map((t) => t.name)).toEqual(['Allstate'])
  })

  it('stops chat_id paging after 5 pages and leaves the multi-row brand null', async () => {
    setup(['renaissance.com', 'tenncare.renaissance.com'])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const full = Array.from({ length: 10_000 }, () => ({ domain: 'renaissance.com', chat: { id: 'c1' } }))
    post.mockImplementation(async (path, body) => {
      if ((body as { dimensions?: string[] }).dimensions?.[0] === 'chat_id') return { data: full } as never
      return (path === '/reports/domains'
        ? { data: [domain('renaissance.com'), domain('tenncare.renaissance.com'), domain('guardian.com')] } : { data: current }) as never
    })
    const res = await getPeecVisibilityV2('renaissance', 'last_30_days', 'previous_period')
    expect(chatCalls()).toHaveLength(10) // 5 pages per window, two windows
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[peec] chat_id rows hit 50000 for renaissance; distinct answers unavailable'))
    expect(res.brands.find((b) => b.name === 'Renaissance')?.usedAsSource).toBeNull()
    warn.mockRestore()
  })

  it('skips a trend day with no data and warns at the YTD ceiling', async () => {
    setup(['renaissance.com'])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ytd = [row('r', 'Renaissance', 0, 0, 0, '2026-01-01'), row('r', 'Renaissance', 1, 4, 0, '2026-01-02')]
    fetchAll.mockResolvedValue(Array.from({ length: 20_000 }, (_, i) => ytd[i % 2]))
    post.mockImplementation(async (path) => (path === '/reports/domains' ? { data: [] } : { data: current }) as never)
    const res = await getPeecVisibilityV2('renaissance', 'last_30_days', 'previous_period')
    expect(res.trend.find((t) => t.name === 'Renaissance')?.points).toEqual([{ date: '2026-01-02', visibility: 25 }])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[peec] YTD trend rows hit 20000 for renaissance'))
    warn.mockRestore()
  })
})
