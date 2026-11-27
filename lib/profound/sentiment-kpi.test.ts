import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const cachedOptions = vi.hoisted(() => new Map<string, unknown>())
vi.mock('@/lib/cache', () => ({
  cached: (_v: string, fn: string, impl: unknown, options: unknown) => {
    cachedOptions.set(fn, options)
    return impl
  },
}))
const profoundPost = vi.fn()
vi.mock('./client', () => ({
  profoundPost: (...a: unknown[]) => profoundPost(...a),
  getCategoryId: vi.fn(async () => 'env-category'),
}))
let clientRow: { profoundCategoryId: string | null; peecYourBrand: string | null } | null = null
const getClientBySlug = vi.fn(async (_slug: string) => clientRow)
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: (slug: string) => getClientBySlug(slug) }))

import { getProfoundSentimentKpi } from './sentiment-kpi'

// Shaped like the live /v2/reports/sentiment answer for Avenue Z, 2026-10-26..2026-11-24 (group_by []).
const LIVE = {
  info: { total_results: 1, count: 1, next_cursor: null, asset: 'Avenue Z', metrics: ['positive_sentiment', 'negative_sentiment'] },
  data: [{ positive_sentiment: 77.08791033129972, negative_sentiment: 22.912089668700265 }],
}

beforeEach(() => {
  profoundPost.mockReset()
  getClientBySlug.mockClear()
  clientRow = { profoundCategoryId: 'cat-1', peecYourBrand: 'Avenue Z' }
  // Another brand's settings in env: the tile must never fall back to them.
  vi.stubEnv('PROFOUND_AI_YOUR_BRAND', 'Env Brand')
  vi.stubEnv('PEEC_AI_YOUR_BRAND', 'Env Peec Brand')
  vi.stubEnv('PROFOUND_CATEGORY_ID', 'env-category')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('getProfoundSentimentKpi', () => {
  it('asks the v2 sentiment report for the whole window, ungrouped', async () => {
    profoundPost.mockResolvedValue(LIVE)
    await getProfoundSentimentKpi('avenue-z', '2026-10-26,2026-11-24')
    expect(profoundPost).toHaveBeenCalledTimes(1)
    expect(profoundPost).toHaveBeenCalledWith('/v2/reports/sentiment', {
      category_id: 'cat-1',
      asset: 'Avenue Z',
      start_date: '2026-10-26',
      end_date: '2026-11-24',
      group_by: [],
      metrics: ['positive_sentiment', 'negative_sentiment'],
    })
  })

  it('uses the client row, never the env brand or category', async () => {
    clientRow = { profoundCategoryId: 'cat-row', peecYourBrand: 'Row Brand' }
    profoundPost.mockResolvedValue(LIVE)
    await getProfoundSentimentKpi('acme', '2026-10-26,2026-11-24')
    expect(getClientBySlug).toHaveBeenCalledWith('acme')
    const body = profoundPost.mock.calls[0][1] as Record<string, unknown>
    expect(body.category_id).toBe('cat-row')
    expect(body.asset).toBe('Row Brand')
  })

  it.each([
    ['no brand', { profoundCategoryId: 'cat-1', peecYourBrand: null }],
    ['a blank brand', { profoundCategoryId: 'cat-1', peecYourBrand: '   ' }],
    ['no category', { profoundCategoryId: null, peecYourBrand: 'Avenue Z' }],
    ['no client row', null],
  ])('is null and asks Profound nothing when the client row has %s', async (_label, row) => {
    clientRow = row
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await getProfoundSentimentKpi('acme', '2026-10-26,2026-11-24')).toBeNull()
    expect(profoundPost).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[aeo-kpis] profound sentiment not configured slug=acme')
  })

  it('returns the positive share of classified sentiment, 0-100', async () => {
    profoundPost.mockResolvedValue(LIVE)
    expect(await getProfoundSentimentKpi('avenue-z', '2026-10-26,2026-11-24')).toBeCloseTo(77.09, 2)
  })

  it('normalises by positive + negative', async () => {
    profoundPost.mockResolvedValue({ info: {}, data: [{ positive_sentiment: 30, negative_sentiment: 10 }] })
    expect(await getProfoundSentimentKpi('avenue-z', '2026-10-26,2026-11-24')).toBe(75)
  })

  it('is null when the window has no classified mentions', async () => {
    profoundPost.mockResolvedValue({ info: { total_results: 0, count: 0 }, data: [] })
    expect(await getProfoundSentimentKpi('avenue-z', '2023-01-01,2023-01-31')).toBeNull()
  })

  it('is null when the metrics come back null or zero', async () => {
    profoundPost.mockResolvedValue({ info: {}, data: [{ positive_sentiment: null, negative_sentiment: null }] })
    expect(await getProfoundSentimentKpi('avenue-z', '2026-10-26,2026-11-24')).toBeNull()
    profoundPost.mockResolvedValue({ info: {}, data: [{ positive_sentiment: 0, negative_sentiment: 0 }] })
    expect(await getProfoundSentimentKpi('avenue-z', '2026-10-26,2026-11-24')).toBeNull()
  })

  it('is not health-critical: a failure only blanks one tile', () => {
    expect(cachedOptions.get('getProfoundSentimentKpi')).toEqual(expect.objectContaining({ healthCritical: false }))
  })

  it('propagates a Profound failure', async () => {
    profoundPost.mockRejectedValue(new Error('Profound API error 422: /v2/reports/sentiment'))
    await expect(getProfoundSentimentKpi('avenue-z', '2026-10-26,2026-11-24')).rejects.toThrow('422')
  })
})
