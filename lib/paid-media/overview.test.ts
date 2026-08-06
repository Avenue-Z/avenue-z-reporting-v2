import { describe, expect, test, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import type { Kpi } from '@/lib/paid-search/types'

// Mock the three per-channel KPI fetchers so their real modules (which import
// lib/db / next-auth) never load under jsdom, and so we can drive each channel's
// success/failure independently. getClientBySlug is mocked too — the rollup reads
// it to learn which channels the client is CONFIGURED for (the scoped-reading gate).
vi.mock('@/lib/paid-search/kpis', () => ({ getPaidSearchKpis: vi.fn() }))
vi.mock('@/lib/meta/kpis', () => ({ getMetaKpis: vi.fn() }))
vi.mock('@/lib/linkedin/kpis', () => ({ getLinkedInKpis: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))

import { getPaidMediaOverview } from './overview'
import { getPaidSearchKpis } from '@/lib/paid-search/kpis'
import { getMetaKpis } from '@/lib/meta/kpis'
import { getLinkedInKpis } from '@/lib/linkedin/kpis'
import { getClientBySlug } from '@/lib/db/queries'

const psMock = getPaidSearchKpis as Mock
const metaMock = getMetaKpis as Mock
const liMock = getLinkedInKpis as Mock
const clientMock = getClientBySlug as Mock

// Minimal KPI arrays keyed the way the rollup reads them.
const ps = (cost: number, clicks: number, leads = 0, prior?: { cost: number; clicks: number; leads: number }): Kpi[] => [
  { key: 'cost', label: 'Cost', value: cost, format: 'money', delta: prior ? ((cost - prior.cost) / prior.cost) * 100 : undefined, compareValue: prior?.cost },
  { key: 'clicks', label: 'Clicks', value: clicks, delta: prior ? ((clicks - prior.clicks) / prior.clicks) * 100 : undefined, compareValue: prior?.clicks },
  { key: 'leads', label: 'Leads', value: leads, delta: prior ? ((leads - prior.leads) / prior.leads) * 100 : undefined, compareValue: prior?.leads },
]
// Meta exposes no `leads` key — Meta lead conversions are unavailable (data gap).
const meta = (spend: number, linkClicks: number): Kpi[] => [
  { key: 'spend', label: 'Spend', value: spend, format: 'money' },
  { key: 'linkClicks', label: 'Link Clicks', value: linkClicks },
]
const li = (spend: number, clicks: number, leads = 0, prior?: { spend: number; clicks: number; leads: number }): Kpi[] => [
  { key: 'spend', label: 'Spend', value: spend, format: 'money', delta: prior ? ((spend - prior.spend) / prior.spend) * 100 : undefined, compareValue: prior?.spend },
  { key: 'clicks', label: 'Clicks', value: clicks, delta: prior ? ((clicks - prior.clicks) / prior.clicks) * 100 : undefined, compareValue: prior?.clicks },
  { key: 'leads', label: 'Leads', value: leads, delta: prior ? ((leads - prior.leads) / prior.leads) * 100 : undefined, compareValue: prior?.leads },
]

// Which channels the client is configured for — only presence matters to the rollup.
const client = (opts: { ps?: boolean; meta?: boolean; li?: boolean }) => ({
  paidSearchConfig: opts.ps ? { googleAdsAccountId: '1' } : null,
  metaConfig: opts.meta ? { metaAdAccountId: '1' } : null,
  linkedinConfig: opts.li ? { linkedinAdAccountId: '1' } : null,
})

beforeEach(() => {
  psMock.mockReset()
  metaMock.mockReset()
  liMock.mockReset()
  clientMock.mockReset()
})

describe('getPaidMediaOverview', () => {
  test('blended spend and clicks sum Paid Search + LinkedIn only (Meta excluded)', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200, 12))
    metaMock.mockResolvedValue(meta(500, 80)) // Meta runs, but is excluded from the blend
    liMock.mockResolvedValue(li(300, 40, 5))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedSpend).toBe(1300) // 1000 + 300 — Meta's 500 excluded
    expect(o.blendedClicks).toBe(240) // 200 + 40 — Meta's 80 excluded
    expect(o.channels.every((c) => c.ok)).toBe(true)
    // Meta still reports its own clicks in the per-channel breakdown (just not the blend).
    expect(o.channels.find((c) => c.key === 'meta')!.clicks).toBe(80)
    // Per-channel leads: Paid Search + LinkedIn report; Meta has no leads key (data
    // gap) so it stays null → '—', NOT 0.
    expect(o.channels.find((c) => c.key === 'paid-search')!.leads).toBe(12)
    expect(o.channels.find((c) => c.key === 'linkedin')!.leads).toBe(5)
    expect(o.channels.find((c) => c.key === 'meta')!.leads).toBeNull()
  })

  test('a failed Meta does NOT blank the blend (Meta is excluded from it)', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200))
    metaMock.mockRejectedValue(new Error('meta query failed'))
    liMock.mockResolvedValue(li(300, 40))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    // Meta failing no longer blanks the blend — the blend is Paid Search + LinkedIn only.
    expect(o.blendedSpend).toBe(1300)
    expect(o.blendedClicks).toBe(240)
    // The per-channel breakdown still shows Meta failed.
    expect(o.channels.find((c) => c.key === 'paid-search')!.ok).toBe(true)
    expect(o.channels.find((c) => c.key === 'meta')!.ok).toBe(false)
    expect(o.channels.find((c) => c.key === 'meta')!.spend).toBeNull()
  })

  test('a lead-bearing channel the client does NOT run is excluded from the blend, not treated as missing', async () => {
    // Renaissance-style case: no LinkedIn config. The blend is Paid Search + LinkedIn;
    // with LinkedIn not run and Meta excluded, the blend is Paid Search alone — and it
    // must NOT blank just because LinkedIn is absent (only a *configured* lead-bearing
    // channel failing blanks it).
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: false }))
    psMock.mockResolvedValue(ps(1000, 200, 12))
    metaMock.mockResolvedValue(meta(500, 80))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedSpend).toBe(1000) // Paid Search only — Meta excluded, LinkedIn not run
    expect(o.blendedClicks).toBe(200)
    // A non-configured channel is never fetched.
    expect(liMock).not.toHaveBeenCalled()
    // …but it is still listed in the breakdown, rendered as '—'.
    const linkedin = o.channels.find((c) => c.key === 'linkedin')!
    expect(linkedin.configured).toBe(false)
    expect(linkedin.ok).toBe(false)
    expect(linkedin.spend).toBeNull()
    expect(linkedin.leads).toBeNull()
  })

  test('a blend-feeding channel missing an expected KPI key fails (ok:false) and blanks the blend, not a silent 0', async () => {
    // LinkedIn reports successfully but its KPI shape drifted — the `clicks` key the
    // rollup reads is gone (e.g. renamed upstream). Because LinkedIn feeds the blend,
    // this must blank the blend, NOT let LinkedIn contribute 0 and understate the total.
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200, 12))
    metaMock.mockResolvedValue(meta(500, 80))
    liMock.mockResolvedValue([
      { key: 'spend', label: 'Spend', value: 300, format: 'money' },
      { key: 'leads', label: 'Leads', value: 5 },
    ]) // no `clicks` key → shape drift

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedSpend).toBeNull()
    expect(o.blendedClicks).toBeNull()
    expect(o.blendedLeads).toBeNull()
    const linkedin = o.channels.find((c) => c.key === 'linkedin')!
    expect(linkedin.ok).toBe(false)
    expect(linkedin.spend).toBeNull()
    expect(linkedin.clicks).toBeNull()
  })

  test('the breakdown always lists all three channels, even a non-configured one', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: false }))
    psMock.mockResolvedValue(ps(1000, 200))
    metaMock.mockResolvedValue(meta(500, 80))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.channels.map((c) => c.key)).toEqual(['paid-search', 'meta', 'linkedin'])
  })

  test('blended Leads = Paid Search + LinkedIn; CPL = their spend / their leads; Meta excluded', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200, 12))   // 12 leads
    metaMock.mockResolvedValue(meta(500, 80))     // no leads key
    liMock.mockResolvedValue(li(300, 40, 8))      // 8 leads

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedLeads).toBe(20)               // 12 + 8, Meta excluded
    expect(o.blendedCostPerLead).toBeCloseTo((1000 + 300) / 20, 6) // (PS+LI spend) / (PS+LI leads)
  })

  test('a failed Meta blanks nothing — the blend is Paid Search + LinkedIn only', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200, 12))
    metaMock.mockRejectedValue(new Error('meta failed'))
    liMock.mockResolvedValue(li(300, 40, 8))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    // All four blended figures stay populated — Meta isn't part of the blend.
    expect(o.blendedSpend).toBe(1300)
    expect(o.blendedClicks).toBe(240)
    expect(o.blendedLeads).toBe(20)
    expect(o.blendedCostPerLead).toBeCloseTo(1300 / 20, 6) // reconciles: Spend ÷ Leads
  })

  test('a failed lead-bearing channel (LinkedIn) blanks the entire blend', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200, 12))
    metaMock.mockResolvedValue(meta(500, 80))
    liMock.mockRejectedValue(new Error('li failed'))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedSpend).toBeNull()
    expect(o.blendedClicks).toBeNull()
    expect(o.blendedLeads).toBeNull()
    expect(o.blendedCostPerLead).toBeNull()
  })

  test('0 blended leads → CPL is null (renders —)', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200, 0))
    metaMock.mockResolvedValue(meta(500, 80))
    liMock.mockResolvedValue(li(300, 40, 0))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedLeads).toBe(0)
    expect(o.blendedCostPerLead).toBeNull()
  })
})

describe('getPaidMediaOverview — deltas', () => {
  // Faithful to getXKpis: a prior (compareValue/delta) exists only when a compare
  // period is passed. With no comparison the channel returns values but no priors.
  const psComparing = () =>
    psMock.mockImplementation((_s: string, _d: string, compare: string | null) =>
      Promise.resolve(compare ? ps(100, 10, 5, { cost: 80, clicks: 8, leads: 4 }) : ps(100, 10, 5)))
  const liComparing = () =>
    liMock.mockImplementation((_s: string, _d: string, compare: string | null) =>
      Promise.resolve(compare ? li(300, 30, 15, { spend: 200, clicks: 20, leads: 10 }) : li(300, 30, 15)))

  test('per-channel and blended deltas compute from summed priors when a comparison is selected', async () => {
    clientMock.mockResolvedValue(client({ ps: true, li: true })) // no Meta
    // Paid Search: spend 100 (prior 80), clicks 10 (prior 8), leads 5 (prior 4)
    // LinkedIn: spend 300 (prior 200), clicks 30 (prior 20), leads 15 (prior 10)
    psComparing()
    liComparing()

    const o = await getPaidMediaOverview('acme', 'last_30_days', 'previous_period')

    // Per-channel deltas come straight from each Kpi.delta.
    const psRow = o.channels.find((c) => c.key === 'paid-search')!
    expect(psRow.spendDelta).toBeCloseTo(25) // (100-80)/80
    expect(psRow.clicksDelta).toBeCloseTo(25)
    expect(psRow.leadsDelta).toBeCloseTo(25)

    // Blended = delta(sumCurrent, sumPrior): spend (400 vs 280), clicks (40 vs 28), leads (20 vs 14).
    expect(o.blendedSpendDelta).toBeCloseTo(((400 - 280) / 280) * 100)
    expect(o.blendedClicksDelta).toBeCloseTo(((40 - 28) / 28) * 100)
    expect(o.blendedLeadsDelta).toBeCloseTo(((20 - 14) / 14) * 100)
    // Blended CPL: cur 400/20=20, prior 280/14=20 → 0% (invert handled in UI).
    expect(o.blendedCostPerLeadDelta).toBeCloseTo(0)
  })

  test('a configured channel missing its prior blanks the blended delta (all-or-nothing)', async () => {
    clientMock.mockResolvedValue(client({ ps: true, li: true }))
    psMock.mockResolvedValue(ps(100, 10, 5, { cost: 80, clicks: 8, leads: 4 }))
    liMock.mockResolvedValue(li(300, 30, 15)) // no prior → compareValue undefined

    const o = await getPaidMediaOverview('acme', 'last_30_days', 'previous_period')
    expect(o.channels.find((c) => c.key === 'linkedin')!.spendDelta).toBeUndefined()
    expect(o.blendedSpendDelta).toBeUndefined()
    expect(o.blendedClicksDelta).toBeUndefined()
    expect(o.blendedLeadsDelta).toBeUndefined()
    expect(o.blendedCostPerLeadDelta).toBeUndefined()
  })

  test('no comparison selected → no compare query, values shown without deltas', async () => {
    clientMock.mockResolvedValue(client({ ps: true, li: true }))
    psComparing()
    liComparing()

    // null compareRange = 'No Comparison' in the date picker.
    const o = await getPaidMediaOverview('acme', 'last_30_days')

    // Each channel is queried with a null compare period — no extra compare-period call.
    expect(psMock).toHaveBeenCalledWith('acme', 'last_30_days', null)
    expect(liMock).toHaveBeenCalledWith('acme', 'last_30_days', null)
    // Values still present…
    expect(o.blendedSpend).toBe(400)
    expect(o.blendedLeads).toBe(20)
    // …but every delta is absent (nothing to compare against).
    expect(o.channels.find((c) => c.key === 'paid-search')!.spendDelta).toBeUndefined()
    expect(o.blendedSpendDelta).toBeUndefined()
    expect(o.blendedClicksDelta).toBeUndefined()
    expect(o.blendedLeadsDelta).toBeUndefined()
    expect(o.blendedCostPerLeadDelta).toBeUndefined()
  })
})
