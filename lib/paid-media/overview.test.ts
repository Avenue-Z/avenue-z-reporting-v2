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
  test('all configured channels report → blended spend and clicks sum across them', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200, 12))
    metaMock.mockResolvedValue(meta(500, 80)) // Meta contributes LINK clicks (item 2)
    liMock.mockResolvedValue(li(300, 40, 5))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedSpend).toBe(1800)
    expect(o.blendedClicks).toBe(320) // 200 + 80 + 40
    expect(o.channels.every((c) => c.ok)).toBe(true)
    expect(o.channels.find((c) => c.key === 'meta')!.clicks).toBe(80)
    // Per-channel leads: Paid Search + LinkedIn report; Meta has no leads key (data
    // gap) so it stays null → '—', NOT 0.
    expect(o.channels.find((c) => c.key === 'paid-search')!.leads).toBe(12)
    expect(o.channels.find((c) => c.key === 'linkedin')!.leads).toBe(5)
    expect(o.channels.find((c) => c.key === 'meta')!.leads).toBeNull()
  })

  test('a CONFIGURED channel that fails blanks the whole blended total (Dianna, scoped reading)', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200))
    metaMock.mockRejectedValue(new Error('meta query failed'))
    liMock.mockResolvedValue(li(300, 40))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedSpend).toBeNull()
    expect(o.blendedClicks).toBeNull()
    // The per-channel breakdown still lists what reported.
    expect(o.channels.find((c) => c.key === 'paid-search')!.ok).toBe(true)
    expect(o.channels.find((c) => c.key === 'paid-search')!.spend).toBe(1000)
    expect(o.channels.find((c) => c.key === 'meta')!.ok).toBe(false)
    expect(o.channels.find((c) => c.key === 'meta')!.spend).toBeNull()
  })

  test('a channel the client does NOT run is excluded from the blend, not treated as missing', async () => {
    // Renaissance case: no LinkedIn config. The blend sums the channels the client
    // actually runs (Paid Search + Meta) and must NOT blank just because LinkedIn
    // is absent — only a *configured* channel failing blanks the total.
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: false }))
    psMock.mockResolvedValue(ps(1000, 200, 12))
    metaMock.mockResolvedValue(meta(500, 80))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedSpend).toBe(1500) // 1000 + 500, LinkedIn excluded
    expect(o.blendedClicks).toBe(280) // 200 + 80
    // A non-configured channel is never fetched.
    expect(liMock).not.toHaveBeenCalled()
    // …but it is still listed in the breakdown, rendered as '—'.
    const linkedin = o.channels.find((c) => c.key === 'linkedin')!
    expect(linkedin.configured).toBe(false)
    expect(linkedin.ok).toBe(false)
    expect(linkedin.spend).toBeNull()
    expect(linkedin.leads).toBeNull()
  })

  test('a configured channel missing an expected KPI key fails (ok:false) and blanks the blend, not a silent 0', async () => {
    // Meta reports successfully but its KPI shape drifted — the `linkClicks` key
    // the rollup reads is gone (e.g. renamed upstream). This must blank the blend,
    // NOT let Meta contribute 0 clicks and understate the confident-looking total.
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200, 12))
    metaMock.mockResolvedValue([{ key: 'spend', label: 'Spend', value: 500, format: 'money' }]) // no linkClicks
    liMock.mockResolvedValue(li(300, 40, 5))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedSpend).toBeNull()
    expect(o.blendedClicks).toBeNull()
    const meta = o.channels.find((c) => c.key === 'meta')!
    expect(meta.ok).toBe(false)
    expect(meta.spend).toBeNull()
    expect(meta.clicks).toBeNull()
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

  test('a failed Meta does NOT blank blended Leads/CPL (Meta is not lead-bearing)', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200, 12))
    metaMock.mockRejectedValue(new Error('meta failed'))
    liMock.mockResolvedValue(li(300, 40, 8))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedLeads).toBe(20)
    expect(o.blendedSpend).toBeNull()             // Spend/Clicks gate still blanks on Meta failure
  })

  test('a failed lead-bearing channel (LinkedIn) blanks blended Leads/CPL', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200, 12))
    metaMock.mockResolvedValue(meta(500, 80))
    liMock.mockRejectedValue(new Error('li failed'))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
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
  test('per-channel and blended deltas compute from summed priors', async () => {
    clientMock.mockResolvedValue(client({ ps: true, li: true })) // no Meta
    // Paid Search: spend 100 (prior 80), clicks 10 (prior 8), leads 5 (prior 4)
    psMock.mockResolvedValue(ps(100, 10, 5, { cost: 80, clicks: 8, leads: 4 }))
    // LinkedIn: spend 300 (prior 200), clicks 30 (prior 20), leads 15 (prior 10)
    liMock.mockResolvedValue(li(300, 30, 15, { spend: 200, clicks: 20, leads: 10 }))

    const o = await getPaidMediaOverview('acme', 'last_30_days')

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

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.channels.find((c) => c.key === 'linkedin')!.spendDelta).toBeUndefined()
    expect(o.blendedSpendDelta).toBeUndefined()
    expect(o.blendedClicksDelta).toBeUndefined()
    expect(o.blendedLeadsDelta).toBeUndefined()
    expect(o.blendedCostPerLeadDelta).toBeUndefined()
  })
})
