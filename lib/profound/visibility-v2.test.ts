import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client', async (orig) => ({
  ...(await orig<typeof import('./client')>()),
  profoundPost: vi.fn(),
}))
vi.mock('./assets', async (orig) => ({
  ...(await orig<typeof import('./assets')>()),
  getProfoundAssets: vi.fn(),
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/cache', () => ({ cached: (_v: string, _n: string, fn: unknown) => fn }))

import { profoundPost } from './client'
import { getProfoundAssets, type ProfoundAsset } from './assets'
import { getClientBySlug } from '@/lib/db/queries'
import type { ProfoundNamedRow } from './report-rows'
import { buildProfoundBrandRows, getProfoundVisibilityV2 } from './visibility-v2'

const assets: ProfoundAsset[] = [
  { name: 'Avenue Z', website: 'avenuez.com', alternateDomains: [], isOwned: true },
  { name: 'iPullRank', website: 'ipullrank.com', alternateDomains: [], isOwned: false },
  { name: 'NoSite', website: null, alternateDomains: [], isOwned: false },
]
const vis = (name: string, v: number, s: number): ProfoundNamedRow => ({
  dims: { asset_name: name },
  metrics: { visibility_score: v, share_of_voice: s },
})
const cite = (host: string, share: number): ProfoundNamedRow => ({
  dims: { hostname: host },
  metrics: { citation_share: share, count: 10 },
})

const current = [vis('Avenue Z', 0.1859, 0.0224), vis('iPullRank', 0.3, 0.05), vis('NoSite', 0.1, 0.01), vis('Siege Media', 0.9, 0.5)]
const prior = [vis('Avenue Z', 0.1, 0.02), vis('iPullRank', 0.25, 0.04)]
const cites = [cite('www.avenuez.com', 0.02), cite('blog.ipullrank.com', 0.01), cite('ipullrank.com', 0.03)]

describe('buildProfoundBrandRows', () => {
  const rows = buildProfoundBrandRows(assets, current, prior, cites, [cite('avenuez.com', 0.01)], 'Avenue Z')

  it('drops untracked names and ranks by visibility', () => {
    expect(rows.map((r) => r.name)).toEqual(['iPullRank', 'Avenue Z', 'NoSite'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3])
  })
  it('sums citation share over matching hostnames as percent', () => {
    const by = Object.fromEntries(rows.map((r) => [r.name, r]))
    expect(by['Avenue Z'].usedAsSource).toBeCloseTo(2.0)
    expect(by['iPullRank'].usedAsSource).toBeCloseTo(4.0)
    expect(by['NoSite'].usedAsSource).toBeNull()
    expect(by['Avenue Z'].usedAsSourcePrior).toBeCloseTo(1.0)
  })
  it('has null prior without a prior row', () => {
    expect(rows.find((r) => r.name === 'NoSite')!.visibilityPrior).toBeNull()
    expect(rows.find((r) => r.name === 'NoSite')!.sovPrior).toBeNull()
  })
  it('converts fractions to percents and flags you', () => {
    const az = rows.find((r) => r.name === 'Avenue Z')!
    expect(az.visibility).toBeCloseTo(18.59)
    expect(az.visibilityPrior).toBeCloseTo(10)
    expect(az.isYou).toBe(true)
    expect(rows.find((r) => r.name === 'iPullRank')!.isYou).toBe(false)
  })
  it('flags only the resolved you', () => {
    const r = buildProfoundBrandRows(assets, current, prior, cites, [], 'Avenue Z')
    expect(r.find((x) => x.name === 'Avenue Z')!.isYou).toBe(true)
    expect(r.find((x) => x.name === 'iPullRank')!.isYou).toBe(false)
  })
  it('gives 0 when the asset has a domain with no matching hostname', () => {
    const r = buildProfoundBrandRows(assets, current, prior, [cite('other.com', 0.5)], [cite('other.com', 0.5)], 'Avenue Z')
    expect(r.find((x) => x.name === 'Avenue Z')!.usedAsSource).toBe(0)
    expect(r.find((x) => x.name === 'Avenue Z')!.usedAsSourcePrior).toBe(0)
  })
  // Final review I1: a window with no citation rows at all has no figure, never a fabricated 0 (Peec's rule).
  it('is null, not 0, for a window with no citation rows', () => {
    const r = buildProfoundBrandRows(assets, current, prior, [], [], 'Avenue Z')
    expect(r.find((x) => x.name === 'Avenue Z')!.usedAsSource).toBeNull()
    expect(r.find((x) => x.name === 'Avenue Z')!.usedAsSourcePrior).toBeNull()
  })
  // Final review I2: a brand new this period has no prior in any column.
  it('has a null Citation share prior for a brand with no prior row, even when the prior window cites it', () => {
    const r = buildProfoundBrandRows(assets, current, [vis('iPullRank', 0.25, 0.04)], cites, [cite('avenuez.com', 0.01)], 'Avenue Z')
    const az = r.find((x) => x.name === 'Avenue Z')!
    expect(az.visibilityPrior).toBeNull()
    expect(az.sovPrior).toBeNull()
    expect(az.usedAsSourcePrior).toBeNull()
  })
  // Final review M4: a tracked asset with no row this window is still listed (0 visibility, 0 SoV), so the client can always be pinned.
  it('lists a tracked asset missing from the current answer at 0, with its prior, ranked by visibility', () => {
    const r = buildProfoundBrandRows(assets, [vis('iPullRank', 0.3, 0.05), vis('NoSite', 0.1, 0.01)], prior, cites, [cite('avenuez.com', 0.01)], 'Avenue Z')
    expect(r.map((x) => [x.name, x.rank])).toEqual([['iPullRank', 1], ['NoSite', 2], ['Avenue Z', 3]])
    const az = r.find((x) => x.name === 'Avenue Z')!
    expect(az.visibility).toBe(0)
    expect(az.sov).toBe(0)
    expect(az.visibilityPrior).toBeCloseTo(10)
    expect(az.sovPrior).toBeCloseTo(2)
    expect(az.usedAsSourcePrior).toBeCloseTo(1)
    expect(az.isYou).toBe(true)
    const none = buildProfoundBrandRows(assets, [vis('iPullRank', 0.3, 0.05)], [], cites, [], 'Avenue Z').find((x) => x.name === 'NoSite')!
    expect([none.visibility, none.sov, none.visibilityPrior, none.sovPrior]).toEqual([0, 0, null, null])
  })
})

describe('getProfoundVisibilityV2', () => {
  beforeEach(() => {
    vi.mocked(profoundPost).mockReset()
    vi.mocked(getClientBySlug).mockResolvedValue({ profoundCategoryId: 'cat1', peecYourBrand: 'Avenue Z' } as never)
    vi.mocked(getProfoundAssets).mockResolvedValue(assets)
    vi.mocked(profoundPost).mockImplementation((async (path: string, body: { dimensions: string[]; metrics: string[] }) => {
      const dims = [...body.dimensions].sort()
      const metrics = [...body.metrics].sort()
      return {
        info: { query: { dimensions: dims, metrics } },
        data: [{ dimensions: dims.map((d) => (d === 'date' ? '2026-11-01' : d === 'hostname' ? 'avenuez.com' : 'Avenue Z')), metrics: metrics.map(() => 0.1) }],
      }
    }) as never)
  })

  it('scopes citations to visibility prompts and never filters visibility by analysis_type', async () => {
    const res = await getProfoundVisibilityV2('avenue-z', 'last_30_days', 'previous_period')
    const calls = vi.mocked(profoundPost).mock.calls as unknown as [string, { filters?: { field: string; value?: unknown }[] }][]
    const cit = calls.filter(([p]) => p === '/v1/reports/citations')
    const vc = calls.filter(([p]) => p === '/v1/reports/visibility')
    expect(cit.length).toBe(2)
    for (const [, b] of cit) expect(b.filters).toContainEqual({ field: 'analysis_type', operator: 'is', value: 'visibility' })
    expect(vc.length).toBe(3)
    for (const [, b] of vc) {
      expect((b.filters ?? []).some((f) => f.field === 'analysis_type')).toBe(false)
      expect(b.filters).toContainEqual({ field: 'asset_name', operator: 'in', value: ['Avenue Z', 'iPullRank', 'NoSite'] })
    }
    expect(res.usedAsSourceBasis).toBe('citations')
    expect(res.roster).toEqual(['Avenue Z', 'iPullRank', 'NoSite'])
    expect(res.trend.find((t) => t.name === 'Avenue Z')!.points[0]).toEqual({ date: '2026-11-01', visibility: 10 })
  })

  // Final review I3: a configured name that names no tracked brand flags nobody (never the own flag, never a substring).
  it('flags nobody when peecYourBrand names no tracked brand, even with an owned asset', async () => {
    vi.mocked(getClientBySlug).mockResolvedValue({ profoundCategoryId: 'cat1', peecYourBrand: 'Rank' } as never)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await getProfoundVisibilityV2('avenue-z', 'last_30_days', 'previous_period')
    expect(res.brands.some((b) => b.isYou)).toBe(false)
    expect(res.trend.some((t) => t.isYou)).toBe(false)
    expect(warn).toHaveBeenCalledWith('[aeo-v2] no tracked brand is named "Rank"')
    warn.mockRestore()
  })

  it('flags the owned asset as you when peecYourBrand is empty', async () => {
    vi.mocked(getClientBySlug).mockResolvedValue({ profoundCategoryId: 'cat1', peecYourBrand: null } as never)
    const res = await getProfoundVisibilityV2('avenue-z', 'last_30_days', 'previous_period')
    expect(res.brands.filter((b) => b.isYou).map((b) => b.name)).toEqual(['Avenue Z'])
  })

  // Final review M8: fail closed with an error card, as Peec does.
  it('throws without a category', async () => {
    vi.mocked(getClientBySlug).mockResolvedValue({ profoundCategoryId: null } as never)
    await expect(getProfoundVisibilityV2('x', 'last_30_days', 'previous_period')).rejects.toThrow('[profound] no Profound category configured for x')
    expect(profoundPost).not.toHaveBeenCalled()
  })

  it('throws when the category has no tracked assets', async () => {
    vi.mocked(getProfoundAssets).mockResolvedValue([])
    await expect(getProfoundVisibilityV2('x', 'last_30_days', 'previous_period')).rejects.toThrow('[profound] no tracked assets for x')
    expect(profoundPost).not.toHaveBeenCalled()
  })
})
