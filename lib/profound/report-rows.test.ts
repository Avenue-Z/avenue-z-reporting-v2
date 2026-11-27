import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client', async (orig) => ({
  ...(await orig<typeof import('./client')>()),
  profoundPost: vi.fn(),
}))

import { profoundPost } from './client'
import { profoundRows, profoundPostAll, visibilityPromptsOnly } from './report-rows'
import { assetDomains } from './assets'

const mockPost = vi.mocked(profoundPost)

describe('profoundRows', () => {
  it('names columns from info.query, not request order', () => {
    const rows = profoundRows({
      info: {
        query: {
          dimensions: ['asset_name', 'date'],
          metrics: ['average_position', 'share_of_voice', 'visibility_score'],
        },
      },
      data: [{ dimensions: ['Avenue Z', '2026-11-01'], metrics: [4.72, 0.0224, 0.1859] }],
    })
    expect(rows).toEqual([
      {
        dims: { asset_name: 'Avenue Z', date: '2026-11-01' },
        metrics: { average_position: 4.72, share_of_voice: 0.0224, visibility_score: 0.1859 },
      },
    ])
  })

  it('throws without info.query', () => {
    expect(() =>
      profoundRows({ info: {}, data: [{ dimensions: ['a'], metrics: [1] }] }),
    ).toThrow('[profound] response has no info.query; cannot name its columns')
  })

  it('throws when a row has more metrics than names', () => {
    expect(() =>
      profoundRows({
        info: { query: { dimensions: ['a'], metrics: ['m'] } },
        data: [{ dimensions: ['x'], metrics: [1, 2] }],
      }),
    ).toThrow('[profound] response has no info.query; cannot name its columns')
  })
})

describe('profoundPostAll', () => {
  beforeEach(() => mockPost.mockReset())
  const info = { query: { dimensions: ['d'], metrics: ['m'] } }
  const page = (n: number) => ({
    info,
    data: Array.from({ length: n }, (_, i) => ({ dimensions: [`r${i}`], metrics: [i] })),
  })

  it('pages until short page', async () => {
    mockPost.mockResolvedValueOnce(page(10_000)).mockResolvedValueOnce(page(3))
    const rows = await profoundPostAll('/v1/reports/visibility', { category_id: 'c' })
    expect(rows).toHaveLength(10_003)
    expect(mockPost).toHaveBeenCalledTimes(2)
    expect(mockPost.mock.calls[1][1]).toMatchObject({ pagination: { limit: 10000, offset: 10000 } })
  })

  it('stops when info.total_rows is reached', async () => {
    mockPost.mockResolvedValueOnce({ info: { ...info, total_rows: 10_000 }, data: page(10_000).data })
    const rows = await profoundPostAll('/v1/x', {})
    expect(rows).toHaveLength(10_000)
    expect(mockPost).toHaveBeenCalledTimes(1)
  })

  it('truncates at maxRows and logs', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockPost.mockResolvedValue(page(10_000))
    const rows = await profoundPostAll('/v1/x', {}, 15_000)
    expect(rows).toHaveLength(15_000)
    expect(spy).toHaveBeenCalledWith('[profound] /v1/x truncated at 15000 rows')
    spy.mockRestore()
  })
})

describe('misc', () => {
  it('visibilityPromptsOnly filter', () => {
    expect(visibilityPromptsOnly).toEqual([{ field: 'analysis_type', operator: 'is', value: 'visibility' }])
  })
  it('assetDomains', () => {
    expect(assetDomains({ name: 'A', website: 'avenuez.com', alternateDomains: ['avenuez.co'], isOwned: true })).toEqual(['avenuez.com', 'avenuez.co'])
    expect(assetDomains({ name: 'A', website: null, alternateDomains: [], isOwned: false })).toEqual([])
  })
})
