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
import { buildProfoundModels, getProfoundModelsV2 } from './models-v2'

const assets: ProfoundAsset[] = [
  { name: 'Avenue Z', website: 'avenuez.com', alternateDomains: [], isOwned: true },
  { name: 'iPullRank', website: 'ipullrank.com', alternateDomains: [], isOwned: false },
]
const vis = (model: string, asset: string, v: number, sov: number): ProfoundNamedRow => ({
  dims: { model, asset_name: asset },
  metrics: { visibility_score: v, share_of_voice: sov },
})
const cite = (model: string, host: string, share: number): ProfoundNamedRow => ({
  dims: { model, hostname: host },
  metrics: { citation_share: share },
})

const base = {
  assets,
  yourBrand: 'Avenue Z',
  vis: [
    vis('ChatGPT', 'Avenue Z', 0.1859, 0.3),
    vis('ChatGPT', 'iPullRank', 0.1, 0.1),
    vis('Google AI Overviews', 'Avenue Z', 0.2, 0.4),
    vis('Google Gemini', 'Avenue Z', 0.05, 0.05),
    vis('ChatGPT', 'Untracked Co', 0.9, 0.9),
    vis('Bard', 'Avenue Z', 0.5, 0.5),
  ],
  visPrior: [vis('ChatGPT', 'Avenue Z', 0.1, 0.2)],
  cites: [
    cite('ChatGPT', 'www.avenuez.com', 0.05),
    cite('ChatGPT', 'ipullrank.com', 0.02),
    cite('ChatGPT', 'youtube.com', 0.1),
    cite('Google AI Overviews', 'youtube.com', 0.1),
  ],
  citesPrior: [cite('ChatGPT', 'avenuez.com', 0.04)],
}

describe('buildProfoundModels', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  beforeEach(() => warn.mockClear())
  const out = buildProfoundModels(base)
  const chat = out.models.find((m) => m.model === 'ChatGPT')!

  it('lists the mapped models in AEO_MODELS order, citations basis', () => {
    expect(out.models.map((m) => m.model)).toEqual(['ChatGPT', 'Gemini', 'Google'])
    expect(out.usedAsSourceBasis).toBe('citations')
  })
  it('turns fractions into percent', () => {
    expect(chat.visibility.you).toBeCloseTo(18.59, 6)
    expect(chat.sov.you).toBeCloseTo(30, 6)
  })
  it('keeps an untracked asset out of every competitor average', () => {
    expect(chat.visibility.competitorAvg).toBeCloseTo(10, 6)
    expect(chat.sov.competitorAvg).toBeCloseTo(10, 6)
  })
  it('computes Used as a source from the citations matching the asset domains', () => {
    expect(chat.usedAsSource.you).toBeCloseTo(5, 6)
    expect(chat.usedAsSource.competitorAvg).toBeCloseTo(2, 6)
    expect(chat.usedAsSource.youPrior).toBeCloseTo(4, 6)
  })
  it('is 0 when the model has citations but none match, null when it has none', () => {
    const google = out.models.find((m) => m.model === 'Google')!
    expect(google.usedAsSource.you).toBe(0)
    const gemini = out.models.find((m) => m.model === 'Gemini')!
    expect(gemini.usedAsSource.you).toBeNull()
    expect(gemini.usedAsSource.competitorAvg).toBeNull()
  })
  it('gives a tracked asset with no row on a model with data zero, and a null prior when absent before too', () => {
    const google = out.models.find((m) => m.model === 'Google')!
    expect(google.visibility.competitorAvg).toBe(0)
    expect(google.visibility.youPrior).toBeNull()
    expect(chat.visibility.youPrior).toBeCloseTo(10, 6)
  })
  it('gives a null prior when the asset has no domain', () => {
    const o = buildProfoundModels({ ...base, assets: [assets[0], { ...assets[1], website: null }] })
    expect(o.models.find((m) => m.model === 'ChatGPT')!.usedAsSource.competitorAvg).toBeNull()
  })
  it('warns once for unmapped models', () => {
    buildProfoundModels(base)
    const calls = warn.mock.calls.filter(([m]) => String(m).startsWith('[profound] unmapped'))
    expect(calls).toEqual([['[profound] unmapped models dropped: Bard']])
  })
  it('resolves you over assets in rank order with isOwned', () => {
    const owned = assets.map((a) => ({ ...a, isOwned: true }))
    const o = buildProfoundModels({ ...base, assets: owned, yourBrand: '' })
    expect(o.models.find((m) => m.model === 'ChatGPT')!.visibility.you).toBeCloseTo(18.59, 6)
  })
  it('is empty when nobody is the client', () => {
    expect(buildProfoundModels({ ...base, yourBrand: 'Nobody' }).models).toEqual([])
  })
  it('does not break on a vendor name like __proto__', () => {
    const o = buildProfoundModels({ ...base, cites: [...base.cites, cite('ChatGPT', '__proto__', 0.5)], vis: [...base.vis, vis('ChatGPT', '__proto__', 0.1, 0.1)] })
    expect(o.models.length).toBe(3)
  })
})

describe('getProfoundModelsV2', () => {
  beforeEach(() => {
    vi.mocked(profoundPost).mockReset()
    vi.mocked(getClientBySlug).mockResolvedValue({ profoundCategoryId: 'cat1', peecYourBrand: 'Avenue Z' } as never)
    vi.mocked(getProfoundAssets).mockResolvedValue(assets)
    vi.mocked(profoundPost).mockImplementation((async (_p: string, body: { dimensions: string[]; metrics: string[] }) => ({
      info: { query: { dimensions: [...body.dimensions].sort(), metrics: [...body.metrics].sort() } },
      data: [],
    })) as never)
  })

  it('scopes citations to visibility prompts and visibility to the tracked assets only', async () => {
    await getProfoundModelsV2('avenue-z', 'last_30_days', 'previous_period')
    const calls = vi.mocked(profoundPost).mock.calls as unknown as [string, { filters?: { field: string; operator: string; value: unknown }[] }][]
    expect(calls).toHaveLength(4)
    const cites = calls.filter(([p]) => p === '/v1/reports/citations')
    const visCalls = calls.filter(([p]) => p === '/v1/reports/visibility')
    expect(cites).toHaveLength(2)
    expect(visCalls).toHaveLength(2)
    for (const [, b] of cites) expect(b.filters?.some((f) => f.field === 'analysis_type' && f.value === 'visibility')).toBe(true)
    for (const [, b] of visCalls) {
      expect(b.filters).toEqual([{ field: 'asset_name', operator: 'in', value: ['Avenue Z', 'iPullRank'] }])
    }
  })

  it('throws without a category and without assets', async () => {
    vi.mocked(getClientBySlug).mockResolvedValue({ profoundCategoryId: null } as never)
    await expect(getProfoundModelsV2('x', 'last_30_days', 'previous_period')).rejects.toThrow('[profound] no Profound category configured for x')
    vi.mocked(getClientBySlug).mockResolvedValue({ profoundCategoryId: 'c' } as never)
    vi.mocked(getProfoundAssets).mockResolvedValue([])
    await expect(getProfoundModelsV2('x', 'last_30_days', 'previous_period')).rejects.toThrow('[profound] no tracked assets for x')
    expect(profoundPost).not.toHaveBeenCalled()
  })
})
