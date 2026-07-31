import { describe, expect, test, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import type { Kpi } from '@/lib/paid-search/types'

// Mock the three per-channel KPI fetchers so their real modules (which import
// lib/db / next-auth) never load under jsdom, and so we can drive each channel's
// success/failure independently.
vi.mock('@/lib/paid-search/kpis', () => ({ getPaidSearchKpis: vi.fn() }))
vi.mock('@/lib/meta/kpis', () => ({ getMetaKpis: vi.fn() }))
vi.mock('@/lib/linkedin/kpis', () => ({ getLinkedInKpis: vi.fn() }))

import { getPaidMediaOverview } from './overview'
import { getPaidSearchKpis } from '@/lib/paid-search/kpis'
import { getMetaKpis } from '@/lib/meta/kpis'
import { getLinkedInKpis } from '@/lib/linkedin/kpis'

const psMock = getPaidSearchKpis as Mock
const metaMock = getMetaKpis as Mock
const liMock = getLinkedInKpis as Mock

// Minimal KPI arrays keyed the way the rollup reads them.
const ps = (cost: number, clicks: number): Kpi[] => [
  { key: 'cost', label: 'Cost', value: cost, format: 'money' },
  { key: 'clicks', label: 'Clicks', value: clicks },
]
const meta = (spend: number, linkClicks: number): Kpi[] => [
  { key: 'spend', label: 'Spend', value: spend, format: 'money' },
  { key: 'linkClicks', label: 'Link Clicks', value: linkClicks },
]
const li = (spend: number, clicks: number): Kpi[] => [
  { key: 'spend', label: 'Spend', value: spend, format: 'money' },
  { key: 'clicks', label: 'Clicks', value: clicks },
]

beforeEach(() => {
  psMock.mockReset()
  metaMock.mockReset()
  liMock.mockReset()
})

describe('getPaidMediaOverview', () => {
  test('all three channels report → blended spend and clicks sum across them', async () => {
    psMock.mockResolvedValue(ps(1000, 200))
    metaMock.mockResolvedValue(meta(500, 80)) // Meta contributes LINK clicks (item 2)
    liMock.mockResolvedValue(li(300, 40))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedSpend).toBe(1800)
    expect(o.blendedClicks).toBe(320) // 200 + 80 + 40
    expect(o.channels.every((c) => c.ok)).toBe(true)
    expect(o.channels.find((c) => c.key === 'meta')!.clicks).toBe(80)
    // Leads / CPL are fenced off until HubSpot attribution is defined (Blocker 1).
    expect(o.leads).toBeNull()
    expect(o.costPerLead).toBeNull()
  })

  test('a missing channel makes the whole blended total unavailable (item 4)', async () => {
    psMock.mockResolvedValue(ps(1000, 200))
    metaMock.mockRejectedValue(new Error('meta not configured'))
    liMock.mockResolvedValue(li(300, 40))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.blendedSpend).toBeNull()
    expect(o.blendedClicks).toBeNull()
    // The per-channel breakdown still lists what reported.
    expect(o.channels.find((c) => c.key === 'paid-search')!.ok).toBe(true)
    expect(o.channels.find((c) => c.key === 'paid-search')!.spend).toBe(1000)
    expect(o.channels.find((c) => c.key === 'meta')!.ok).toBe(false)
    expect(o.channels.find((c) => c.key === 'meta')!.spend).toBeNull()
    expect(o.channels.find((c) => c.key === 'linkedin')!.ok).toBe(true)
  })

  test('leads and costPerLead are always null regardless of channel data (Blocker 1)', async () => {
    psMock.mockResolvedValue(ps(1000, 200))
    metaMock.mockResolvedValue(meta(500, 80))
    liMock.mockResolvedValue(li(300, 40))

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.leads).toBeNull()
    expect(o.costPerLead).toBeNull()
  })
})
