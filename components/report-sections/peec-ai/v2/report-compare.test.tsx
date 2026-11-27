import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FIXTURE_PEEC_CTX } from '../parts/__fixtures__/peec-ctx'
import { overviewCompare } from './compare'
import type { KpiInputs } from '../ctx'

const getPeecOverview = vi.fn()
const ga4Query = vi.fn()
const getProfoundSentimentKpi = vi.fn()
let sectionConfig: Record<string, unknown> = {}
let profoundCategoryId: string | null = null

vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: vi.fn(async () => ({
    peecCustomerProjectId: 'p',
    profoundCategoryId,
    ga4PropertyId: 'g',
    ga4Config: null,
    reportSectionConfig: { 'peec-ai': sectionConfig },
  })),
  getSectionTemplate: vi.fn(async () => null),
}))
vi.mock('@/lib/peec/client', () => ({ getPeecOverview: (...a: unknown[]) => getPeecOverview(...a) }))
vi.mock('@/lib/profound/client', () => ({ getProfoundOverview: vi.fn() }))
vi.mock('@/lib/profound/sentiment-kpi', () => ({ getProfoundSentimentKpi: (...a: unknown[]) => getProfoundSentimentKpi(...a) }))
vi.mock('@/lib/ga4/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ga4/client')>()
  return { ...actual, ga4Query: (...a: unknown[]) => ga4Query(...a) }
})

async function load(v2: boolean, kpiStrip = false) {
  vi.resetModules()
  if (v2) {
    vi.doMock('./sections', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./sections')>()
      return { ...actual, V2_PART_SECTIONS: kpiStrip ? { 'footer@1': '05', 'kpi-cards@2': '01' } : { 'footer@1': '05' } }
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
  sectionConfig = {}
  profoundCategoryId = null
  getProfoundSentimentKpi.mockReset().mockResolvedValue(70)
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

describe('PeecAIReport KPI requests', () => {
  const run = async (kpiStrip: boolean) => {
    const { PeecAIReport, deriveCompareRange } = await load(kpiStrip, kpiStrip)
    await PeecAIReport({ audience: 'internal', clientSlug: 'renaissance', dateRange: 'last_30_days' })
    return deriveCompareRange
  }

  it('v1 makes no KPI requests', async () => {
    await run(false)
    expect(ga4Query).toHaveBeenCalledTimes(2)
  })

  it('v2 with GA4 KPIs fetches both windows', async () => {
    sectionConfig = { versions: { 'kpi-cards': 2 } }
    const deriveCompareRange = await run(true)
    const { parseDateRange } = await import('@/lib/ga4/client')
    const { AI_SOURCE_FILTER } = await import('@/lib/ga4/ai-kpis')
    const main = iso(parseDateRange('last_30_days'))
    const prior = iso(deriveCompareRange('last_30_days', 'previous_period'))
    const filtered = ga4Query.mock.calls.map((c) => c[0]).filter((a) => a.dimensionFilter && a.dimensionFilter === AI_SOURCE_FILTER)
    expect(filtered.map((a) => a.dateRange).sort()).toEqual([main, prior].sort())
  })

  it('v2 with no GA4 KPI saved makes no KPI requests', async () => {
    sectionConfig = { versions: { 'kpi-cards': 2 }, kpis: ['visibility'] }
    await run(true)
    expect(ga4Query).toHaveBeenCalledTimes(2)
  })
})

describe('PeecAIReport Profound sentiment KPI', () => {
  type El = { props: { children?: unknown; sections?: Record<string, El>; kpi?: KpiInputs } }
  const kpiOf = (out: unknown): KpiInputs => {
    const children = (out as El).props.children as (El | false | undefined)[]
    const tabs = children.find((c): c is El => !!c && !!c.props.sections)!
    return tabs.props.sections!.peec.props.kpi!
  }
  const run = async (kpiStrip: boolean) => {
    const { PeecAIReport, deriveCompareRange } = await load(kpiStrip, kpiStrip)
    const out = await PeecAIReport({ audience: 'internal', clientSlug: 'avenue-z', dateRange: 'last_30_days' })
    const { parseDateRange } = await import('@/lib/ga4/client')
    return { kpi: kpiOf(out), main: iso(parseDateRange('last_30_days')), prior: iso(deriveCompareRange('last_30_days', 'previous_period')) }
  }

  it('v1 makes no sentiment KPI calls', async () => {
    profoundCategoryId = 'cat-1'
    sectionConfig = { kpis: ['sentiment'] }
    const { kpi } = await run(false)
    expect(getProfoundSentimentKpi).not.toHaveBeenCalled()
    expect(kpi.profoundSentiment).toBeNull()
  })

  it('v2 with the default selection (no sentiment) makes no sentiment KPI calls', async () => {
    profoundCategoryId = 'cat-1'
    sectionConfig = { versions: { 'kpi-cards': 2 } }
    await run(true)
    expect(getProfoundSentimentKpi).not.toHaveBeenCalled()
  })

  it('v2 with a saved selection without sentiment makes no sentiment KPI calls', async () => {
    profoundCategoryId = 'cat-1'
    sectionConfig = { versions: { 'kpi-cards': 2 }, kpis: ['visibility', 'ai-sessions'] }
    await run(true)
    expect(getProfoundSentimentKpi).not.toHaveBeenCalled()
  })

  it('v2 with sentiment saved but Profound not configured makes no calls', async () => {
    sectionConfig = { versions: { 'kpi-cards': 2 }, kpis: ['sentiment'] }
    await run(true)
    expect(getProfoundSentimentKpi).not.toHaveBeenCalled()
  })

  it('v2 with sentiment saved fetches both windows', async () => {
    profoundCategoryId = 'cat-1'
    sectionConfig = { versions: { 'kpi-cards': 2 }, kpis: ['sentiment'] }
    const { parseDateRange } = await import('@/lib/ga4/client')
    const mainWindow = iso(parseDateRange('last_30_days'))
    getProfoundSentimentKpi.mockImplementation(async (_slug: string, w: string) => (w === mainWindow ? 62.4 : 60.1))
    const { kpi, main, prior } = await run(true)
    expect(getProfoundSentimentKpi.mock.calls).toEqual([['avenue-z', main], ['avenue-z', prior]])
    expect(kpi.profoundSentiment).toEqual({ now: 62.4, prior: 60.1 })
  })

  it('a rejected side becomes null and is logged', async () => {
    profoundCategoryId = 'cat-1'
    sectionConfig = { versions: { 'kpi-cards': 2 }, kpis: ['sentiment'] }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { parseDateRange } = await import('@/lib/ga4/client')
    const mainWindow = iso(parseDateRange('last_30_days'))
    getProfoundSentimentKpi.mockImplementation(async (_slug: string, w: string) => {
      if (w === mainWindow) throw new TypeError('boom')
      return 60.1
    })
    const { kpi, main } = await run(true)
    expect(kpi.profoundSentiment).toEqual({ now: null, prior: 60.1 })
    expect(err).toHaveBeenCalledWith(`[aeo-kpis] profound sentiment failed slug=avenue-z window=${main} error=TypeError`)
    err.mockRestore()
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
