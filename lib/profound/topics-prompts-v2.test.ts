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
import { profoundModel } from './models'
import { buildProfoundTopicsPrompts, getProfoundTopicsPromptsV2 } from './topics-prompts-v2'

const assets: ProfoundAsset[] = [
  { name: 'Avenue Z', website: 'avenuez.com', alternateDomains: [], isOwned: true },
  { name: 'iPullRank', website: 'ipullrank.com', alternateDomains: [], isOwned: false },
]
const cell = (topic: string | null, model: string, asset: string, mentions: number, executions: number): ProfoundNamedRow => ({
  dims: { topic, model, asset_name: asset },
  metrics: { mentions_count: mentions, executions },
})
const run = (id: string, text: string, topic: string | null, model: string, executions: number): ProfoundNamedRow => ({
  dims: { prompt_id: id, prompt: text, topic, model },
  metrics: { executions },
})
const youRow = (id: string, model: string, mentions: number, pos?: number): ProfoundNamedRow => ({
  dims: { prompt_id: id, model },
  metrics: pos === undefined ? { mentions_count: mentions } : { mentions_count: mentions, average_position: pos },
})

describe('profoundModel', () => {
  it('maps names, keeping Google AI Overviews apart from Gemini', () => {
    expect(profoundModel('Google AI Overviews')).toBe('Google')
    expect(profoundModel('Google Gemini')).toBe('Gemini')
    expect(profoundModel('Gemini')).toBe('Gemini')
    expect(profoundModel('ChatGPT')).toBe('ChatGPT')
    expect(profoundModel('Perplexity AI')).toBe('Perplexity')
    expect(profoundModel('Claude')).toBe('Claude')
    expect(profoundModel('Microsoft Copilot')).toBe('Copilot')
    expect(profoundModel('Bard')).toBeNull()
  })
})

describe('buildProfoundTopicsPrompts', () => {
  const base = {
    assets,
    yourBrand: 'Avenue Z',
    cells: [cell('SEO', 'ChatGPT', 'Avenue Z', 5, 20), cell('SEO', 'Google AI Overviews', 'iPullRank', 3, 10), cell('SEO', 'ChatGPT', 'Other Co', 9, 20), cell('SEO', 'Bard', 'Avenue Z', 1, 1)],
    cellsPrior: [cell('SEO', 'ChatGPT', 'Avenue Z', 2, 10)],
    runs: [run('p1', 'best seo?', 'SEO', 'ChatGPT', 58), run('p2', 'new one', 'SEO', 'ChatGPT', 4)],
    runsPrior: [run('p1', 'best seo?', 'SEO', 'ChatGPT', 50)],
    you: [youRow('p2', 'ChatGPT', 10, 4.5)],
    youPrior: [] as ProfoundNamedRow[],
  }
  const out = buildProfoundTopicsPrompts(base)

  it('sums cells, drops untracked assets and unmapped models', () => {
    expect(out.cells).toEqual([
      { topic: 'SEO', brand: 'Avenue Z', model: 'ChatGPT', mentions: 5, answers: 20 },
      { topic: 'SEO', brand: 'iPullRank', model: 'Google', mentions: 3, answers: 10 },
    ])
    expect(out.cellsPrior).toHaveLength(1)
    expect(out.you).toBe('Avenue Z')
  })
  it('gives a prompt with runs but no you row zero mentions', () => {
    const p1 = out.prompts.find((p) => p.id === 'p1')!
    expect(p1.current.ChatGPT).toEqual({ mentions: 0, answers: 58, posSum: 0, posCount: 0 })
    expect(p1.prior).toEqual({ ChatGPT: { mentions: 0, answers: 50, posSum: 0, posCount: 0 } })
  })
  it('has null prior for a prompt with no prior runs and weights position by mentions', () => {
    const p2 = out.prompts.find((p) => p.id === 'p2')!
    expect(p2.prior).toBeNull()
    expect(p2.current.ChatGPT).toEqual({ mentions: 10, answers: 4, posSum: 45, posCount: 10 })
    expect(p2.topic).toBe('SEO')
    expect(p2.text).toBe('new one')
  })
  it('sums the runs report executions by topic and model as the topic totals', () => {
    const o = buildProfoundTopicsPrompts({ ...base, runs: [...base.runs, run('p3', 'x', 'SEO', 'Google Gemini', 7), run('p4', 'y', 'SEO', 'Bard', 9)] })
    expect(o.topicAnswers).toEqual([
      { topic: 'SEO', model: 'ChatGPT', answers: 62 },
      { topic: 'SEO', model: 'Gemini', answers: 7 },
    ])
    expect(out.topicAnswersPrior).toEqual([{ topic: 'SEO', model: 'ChatGPT', answers: 50 }])
  })
  it('puts a null topic under Other in both the cells and the prompts', () => {
    const o = buildProfoundTopicsPrompts({
      ...base,
      cells: [cell(null, 'ChatGPT', 'Avenue Z', 2, 6)],
      runs: [run('p9', 'no topic', null, 'ChatGPT', 6)],
      you: [youRow('p9', 'ChatGPT', 2, 1)],
    })
    expect(o.cells).toEqual([{ topic: 'Other', brand: 'Avenue Z', model: 'ChatGPT', mentions: 2, answers: 6 }])
    expect(o.prompts.map((p) => p.topic)).toEqual(['Other'])
    expect(o.topicAnswers).toEqual([{ topic: 'Other', model: 'ChatGPT', answers: 6 }])
  })
  it('counts a position only when average_position is a finite number', () => {
    const o = buildProfoundTopicsPrompts({
      ...base,
      runs: [run('a', 'a', 'SEO', 'ChatGPT', 5), run('b', 'b', 'SEO', 'ChatGPT', 5)],
      you: [youRow('a', 'ChatGPT', 3), { dims: { prompt_id: 'b', model: 'ChatGPT' }, metrics: { mentions_count: 2, average_position: Number.NaN } }],
    })
    for (const p of o.prompts) {
      expect(p.current.ChatGPT?.posCount).toBe(0)
      expect(p.current.ChatGPT?.posSum).toBe(0)
      expect(p.current.ChatGPT?.mentions).toBeGreaterThan(0)
    }
  })
  it('resolves you over assets in visibility-rank order, so a tie goes to the best-ranked', () => {
    const owned = assets.map((a) => ({ ...a, isOwned: true }))
    const o = buildProfoundTopicsPrompts({ ...base, assets: owned, yourBrand: '', cells: [cell('SEO', 'ChatGPT', 'Avenue Z', 1, 20), cell('SEO', 'ChatGPT', 'iPullRank', 8, 20)] })
    expect(o.you).toBe('iPullRank')
  })
})

describe('unmapped Profound models', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  beforeEach(() => warn.mockClear())
  it('warns once per fetch, naming each dropped model', () => {
    buildProfoundTopicsPrompts({
      assets, yourBrand: 'Avenue Z',
      cells: [cell('SEO', 'Bard', 'Avenue Z', 1, 1)], cellsPrior: [cell('SEO', 'Grok', 'Avenue Z', 1, 1)],
      runs: [run('p', 'p', 'SEO', 'Bard', 2)], runsPrior: [], you: [youRow('p', 'Bard', 1, 1)], youPrior: [],
    })
    const calls = warn.mock.calls.filter(([m]) => String(m).startsWith('[profound] unmapped'))
    expect(calls).toEqual([['[profound] unmapped models dropped: Bard, Grok']])
  })
  it('says nothing when every model maps', () => {
    buildProfoundTopicsPrompts({ assets, yourBrand: 'Avenue Z', cells: [], cellsPrior: [], runs: [], runsPrior: [], you: [], youPrior: [] })
    expect(warn.mock.calls.filter(([m]) => String(m).startsWith('[profound] unmapped'))).toHaveLength(0)
  })
})

describe('getProfoundTopicsPromptsV2', () => {
  beforeEach(() => {
    vi.mocked(profoundPost).mockReset()
    vi.mocked(getClientBySlug).mockResolvedValue({ profoundCategoryId: 'cat1', peecYourBrand: 'Avenue Z' } as never)
    vi.mocked(getProfoundAssets).mockResolvedValue(assets)
    vi.mocked(profoundPost).mockImplementation((async (_p: string, body: { dimensions: string[]; metrics: string[] }) => {
      const dims = [...body.dimensions].sort()
      const metrics = [...body.metrics].sort()
      return { info: { query: { dimensions: dims, metrics } }, data: [] }
    }) as never)
  })

  it('sends no analysis_type or prompt_type filter, and scopes cells and you', async () => {
    await getProfoundTopicsPromptsV2('avenue-z', 'last_30_days', 'previous_period')
    const calls = vi.mocked(profoundPost).mock.calls as unknown as [string, { dimensions: string[]; filters?: { field: string; operator: string; value: unknown }[] }][]
    expect(calls).toHaveLength(6)
    for (const [path, b] of calls) {
      expect(path).toBe('/v1/reports/visibility')
      expect((b.filters ?? []).some((f) => f.field === 'analysis_type' || f.field === 'prompt_type')).toBe(false)
    }
    const cells = calls.filter(([, b]) => b.dimensions.includes('asset_name'))
    for (const [, b] of cells) expect(b.filters).toEqual([{ field: 'asset_name', operator: 'in', value: ['Avenue Z', 'iPullRank'] }])
    const you = calls.filter(([, b]) => !b.dimensions.includes('asset_name') && b.filters)
    expect(you).toHaveLength(2)
    for (const [, b] of you) expect(b.filters).toEqual([{ field: 'asset_name', operator: 'is', value: 'Avenue Z' }])
  })

  it('filters the client rows by the best-ranked of several owned assets', async () => {
    vi.mocked(getClientBySlug).mockResolvedValue({ profoundCategoryId: 'cat1', peecYourBrand: null } as never)
    vi.mocked(getProfoundAssets).mockResolvedValue(assets.map((a) => ({ ...a, isOwned: true })))
    vi.mocked(profoundPost).mockImplementation((async (_p: string, body: { dimensions: string[]; metrics: string[] }) => {
      const dims = [...body.dimensions].sort()
      const metrics = [...body.metrics].sort()
      const data = dims.includes('asset_name')
        ? [{ dimensions: ['Avenue Z', 'ChatGPT', 'SEO'], metrics: [20, 1] }, { dimensions: ['iPullRank', 'ChatGPT', 'SEO'], metrics: [20, 9] }]
        : []
      return { info: { query: { dimensions: dims, metrics } }, data }
    }) as never)
    const out = await getProfoundTopicsPromptsV2('avenue-z', 'last_30_days', 'previous_period')
    expect(out.you).toBe('iPullRank')
    const calls = vi.mocked(profoundPost).mock.calls as unknown as [string, { dimensions: string[]; filters?: { value: unknown }[] }][]
    const you = calls.filter(([, b]) => !b.dimensions.includes('asset_name') && b.filters)
    expect(you.map(([, b]) => b.filters![0].value)).toEqual(['iPullRank', 'iPullRank'])
  })

  it('throws without a category and without assets', async () => {
    vi.mocked(getClientBySlug).mockResolvedValue({ profoundCategoryId: null } as never)
    await expect(getProfoundTopicsPromptsV2('x', 'last_30_days', 'previous_period')).rejects.toThrow('[profound] no Profound category configured for x')
    vi.mocked(getClientBySlug).mockResolvedValue({ profoundCategoryId: 'c' } as never)
    vi.mocked(getProfoundAssets).mockResolvedValue([])
    await expect(getProfoundTopicsPromptsV2('x', 'last_30_days', 'previous_period')).rejects.toThrow('[profound] no tracked assets for x')
    expect(profoundPost).not.toHaveBeenCalled()
  })
})
