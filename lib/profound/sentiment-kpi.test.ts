import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))
const profoundPost = vi.fn()
vi.mock('./client', () => ({
  profoundPost: (...a: unknown[]) => profoundPost(...a),
  getCategoryId: vi.fn(async () => 'env-category'),
}))
vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: vi.fn(async () => ({ profoundCategoryId: 'cat-1', peecYourBrand: 'Avenue Z' })),
}))

import { getProfoundSentimentKpi } from './sentiment-kpi'

// Shaped like the live /v2/reports/sentiment answer for Avenue Z, 2026-10-26..2026-11-24 (group_by []).
const LIVE = {
  info: { total_results: 1, count: 1, next_cursor: null, asset: 'Avenue Z', metrics: ['positive_sentiment', 'negative_sentiment'] },
  data: [{ positive_sentiment: 77.08791033129972, negative_sentiment: 22.912089668700265 }],
}

beforeEach(() => {
  profoundPost.mockReset()
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

  it('propagates a Profound failure', async () => {
    profoundPost.mockRejectedValue(new Error('Profound API error 422: /v2/reports/sentiment'))
    await expect(getProfoundSentimentKpi('avenue-z', '2026-10-26,2026-11-24')).rejects.toThrow('422')
  })
})
