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
  test('blended spend and clicks sum EVERY configured channel (incl Meta) = total paid', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200, 12))
    metaMock.mockResolvedValue(meta(500, 80))
    liMock.mockResolvedValue(li(300, 40, 5))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedSpend).toBe(1800) // 1000 + 500 + 300 — Meta included
    expect(o.blendedClicks).toBe(320) // 200 + 80 + 40 — Meta included
    expect(o.channels.every((c) => c.ok)).toBe(true)
    // There is no blended Leads / Cost per Lead (scrapped).
    expect('blendedLeads' in o).toBe(false)
    expect('blendedCostPerLead' in o).toBe(false)
    // Per-channel leads still shown: Paid Search + LinkedIn report; Meta has no leads
    // key (data gap) so it stays null → '—', NOT 0.
    expect(o.channels.find((c) => c.key === 'paid-search')!.leads).toBe(12)
    expect(o.channels.find((c) => c.key === 'linkedin')!.leads).toBe(5)
    expect(o.channels.find((c) => c.key === 'meta')!.leads).toBeNull()
  })

  test('a failed Meta blanks the blend (Meta now feeds it — all-or-nothing over configured)', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    psMock.mockResolvedValue(ps(1000, 200))
    metaMock.mockRejectedValue(new Error('meta query failed'))
    liMock.mockResolvedValue(li(300, 40))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    // A configured channel failing blanks the blend rather than understating the total.
    expect(o.blendedSpend).toBeNull()
    expect(o.blendedClicks).toBeNull()
    // The per-channel breakdown still shows Paid Search + LinkedIn, and Meta failed.
    expect(o.channels.find((c) => c.key === 'paid-search')!.ok).toBe(true)
    expect(o.channels.find((c) => c.key === 'meta')!.ok).toBe(false)
    expect(o.channels.find((c) => c.key === 'meta')!.spend).toBeNull()
  })

  test('a channel the client does NOT run is excluded from the blend, not treated as missing', async () => {
    // Renaissance-style case: no LinkedIn config. The blend is every CONFIGURED channel;
    // with LinkedIn not run, the blend is Paid Search + Meta — and it must NOT blank just
    // because LinkedIn is absent (only a *configured* channel failing blanks it).
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: false }))
    psMock.mockResolvedValue(ps(1000, 200, 12))
    metaMock.mockResolvedValue(meta(500, 80))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedSpend).toBe(1500) // Paid Search + Meta — LinkedIn not run
    expect(o.blendedClicks).toBe(280)
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
})

describe('getPaidMediaOverview — deltas', () => {
  test('per-channel and blended Spend/Clicks deltas compute from summed priors', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: true }))
    // Paid Search: spend 100 (prior 80), clicks 10 (prior 8), leads 5 (prior 4)
    psMock.mockResolvedValue(ps(100, 10, 5, { cost: 80, clicks: 8, leads: 4 }))
    // Meta: spend 200 (prior 160), link clicks 20 (prior 16)
    metaMock.mockResolvedValue([
      { key: 'spend', label: 'Spend', value: 200, format: 'money', delta: 25, compareValue: 160 },
      { key: 'linkClicks', label: 'Link Clicks', value: 20, delta: 25, compareValue: 16 },
    ])
    // LinkedIn: spend 300 (prior 200), clicks 30 (prior 20), leads 15 (prior 10)
    liMock.mockResolvedValue(li(300, 30, 15, { spend: 200, clicks: 20, leads: 10 }))

    const o = await getPaidMediaOverview('acme', 'last_30_days')

    // Per-channel deltas come straight from each Kpi.delta (per-channel leads still shown).
    const psRow = o.channels.find((c) => c.key === 'paid-search')!
    expect(psRow.spendDelta).toBeCloseTo(25) // (100-80)/80
    expect(psRow.clicksDelta).toBeCloseTo(25)
    expect(psRow.leadsDelta).toBeCloseTo(25)

    // Blended = delta(sumCurrent, sumPrior) over ALL configured: spend (600 vs 440),
    // clicks (60 vs 44). No blended Leads/CPL delta.
    expect(o.blendedSpendDelta).toBeCloseTo(((600 - 440) / 440) * 100)
    expect(o.blendedClicksDelta).toBeCloseTo(((60 - 44) / 44) * 100)
    expect('blendedLeadsDelta' in o).toBe(false)
    expect('blendedCostPerLeadDelta' in o).toBe(false)
  })

  test('a configured channel missing its prior blanks the blended delta (all-or-nothing)', async () => {
    clientMock.mockResolvedValue(client({ ps: true, li: true }))
    psMock.mockResolvedValue(ps(100, 10, 5, { cost: 80, clicks: 8, leads: 4 }))
    liMock.mockResolvedValue(li(300, 30, 15)) // no prior → compareValue undefined

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.channels.find((c) => c.key === 'linkedin')!.spendDelta).toBeUndefined()
    expect(o.blendedSpendDelta).toBeUndefined()
    expect(o.blendedClicksDelta).toBeUndefined()
  })
})
