import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FIXTURE_PEEC_CTX } from '../parts/__fixtures__/peec-ctx'
import { overviewCompare } from './compare'

const getPeecOverview = vi.fn()
const ga4Query = vi.fn()

vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: vi.fn(async () => ({
    peecCustomerProjectId: 'p',
    profoundCategoryId: null,
    ga4PropertyId: 'g',
    reportSectionConfig: {},
  })),
  getSectionTemplate: vi.fn(async () => null),
}))
vi.mock('@/lib/peec/client', () => ({ getPeecOverview: (...a: unknown[]) => getPeecOverview(...a) }))
vi.mock('@/lib/profound/client', () => ({ getProfoundOverview: vi.fn() }))
vi.mock('@/lib/ga4/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ga4/client')>()
  return { ...actual, ga4Query: (...a: unknown[]) => ga4Query(...a) }
})

async function load(v2: boolean) {
  vi.resetModules()
  if (v2) {
    vi.doMock('./sections', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./sections')>()
      return { ...actual, V2_PART_SECTIONS: { 'footer@1': '05' } }
    })
  } else {
    vi.doUnmock('./sections')
  }
  const { PeecAIReport } = await import('../index')
  const { deriveCompareRange } = await import('@/lib/ga4/client')
  return { PeecAIReport, deriveCompareRange }
}

const iso = (r: { startDate: string; endDate: string } | null) => `${r!.startDate},${r!.endDate}`

beforeEach(() => {
  getPeecOverview.mockReset().mockResolvedValue(FIXTURE_PEEC_CTX.data)
  ga4Query.mockReset().mockResolvedValue({ rows: [] })
})

describe('PeecAIReport compare wiring', () => {
  it('v1 ignores compareRange and deltas', async () => {
    const { PeecAIReport, deriveCompareRange } = await load(false)
    await PeecAIReport({ audience: 'internal', clientSlug: 'renaissance', dateRange: 'last_30_days', compareRange: 'previous_year', deltas: 'off' })
    expect(getPeecOverview).toHaveBeenCalledWith('renaissance', 'last_30_days')
    expect(getPeecOverview.mock.calls[0]).toHaveLength(2)
    expect(ga4Query.mock.calls[1][0].dateRange).toBe(iso(deriveCompareRange('last_30_days', 'previous_period')))
  })

  it('v2 previous_year reaches the fetchers', async () => {
    const { PeecAIReport, deriveCompareRange } = await load(true)
    await PeecAIReport({ audience: 'internal', clientSlug: 'renaissance', dateRange: 'last_30_days', compareRange: 'previous_year', deltas: 'off' })
    expect(getPeecOverview).toHaveBeenCalledWith('renaissance', 'last_30_days', 'previous_year')
    expect(ga4Query.mock.calls[1][0].dateRange).toBe(iso(deriveCompareRange('last_30_days', 'previous_year')))
  })

  it('v2 none fetches previous period and hides deltas', async () => {
    const { PeecAIReport } = await load(true)
    await PeecAIReport({ audience: 'internal', clientSlug: 'renaissance', dateRange: 'last_30_days', compareRange: 'none' })
    expect(getPeecOverview.mock.calls[0]).toHaveLength(2)
  })
})

describe('overviewCompare', () => {
  it('none on v2', () => {
    expect(overviewCompare(true, 'none', undefined)).toEqual({ compare: 'none', showDeltas: false, fetchMode: 'previous_period' })
  })
  it('previous_year on v2 with deltas off', () => {
    expect(overviewCompare(true, 'previous_year', 'off')).toEqual({ compare: 'previous_year', showDeltas: false, fetchMode: 'previous_year' })
  })
  it('v1 ignores both', () => {
    expect(overviewCompare(false, 'previous_year', 'off')).toEqual({ compare: 'previous_period', showDeltas: true, fetchMode: 'previous_period' })
  })
})
