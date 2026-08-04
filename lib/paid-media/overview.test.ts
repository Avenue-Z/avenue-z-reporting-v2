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
const ps = (cost: number, clicks: number, leads = 0): Kpi[] => [
  { key: 'cost', label: 'Cost', value: cost, format: 'money' },
  { key: 'clicks', label: 'Clicks', value: clicks },
  { key: 'leads', label: 'Leads', value: leads },
]
// Meta exposes no `leads` key — Meta lead conversions are unavailable (data gap).
const meta = (spend: number, linkClicks: number): Kpi[] => [
  { key: 'spend', label: 'Spend', value: spend, format: 'money' },
  { key: 'linkClicks', label: 'Link Clicks', value: linkClicks },
]
const li = (spend: number, clicks: number, leads = 0): Kpi[] => [
  { key: 'spend', label: 'Spend', value: spend, format: 'money' },
  { key: 'clicks', label: 'Clicks', value: clicks },
  { key: 'leads', label: 'Leads', value: leads },
]

// Which channels the client is configured for — only presence matters to the rollup.
const client = (opts: { ps?: boolean; meta?: boolean; li?: boolean }) => ({
  paidSearchConfig: opts.ps ? { googleAdsAccountId: '1' } : null,
  metaConfig: opts.meta ? { metaAccountId: '1' } : null,
  linkedinConfig: opts.li ? { linkedinAccountId: '1' } : null,
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

  test('the breakdown always lists all three channels, even a non-configured one', async () => {
    clientMock.mockResolvedValue(client({ ps: true, meta: true, li: false }))
    psMock.mockResolvedValue(ps(1000, 200))
    metaMock.mockResolvedValue(meta(500, 80))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.channels.map((c) => c.key)).toEqual(['paid-search', 'meta', 'linkedin'])
  })
})
