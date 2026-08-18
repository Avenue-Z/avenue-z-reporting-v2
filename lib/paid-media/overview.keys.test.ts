import { describe, expect, test, vi } from 'vitest'

// Guards the STRING COUPLING between getPaidMediaOverview's CHANNELS
// {spendKey, clicksKey, leadsKey} and each channel's real KPI keys. The rollup
// tests hand-build mock KPI arrays with the exact keys the rollup expects, so a
// rename inside a real transform would never fail them. Here we run the REAL
// transforms and assert the keys the rollup reads are actually produced — so
// renaming e.g. Meta's `linkClicks` breaks CI instead of silently blanking the
// blend at runtime.
//
// Each channel's `kpis.ts` imports its `base.ts`, which pulls lib/db → next-auth
// (unresolvable under jsdom). We only exercise the pure transforms, so mock the
// base modules to keep that chain from loading.
vi.mock('@/lib/meta/base', () => ({ metaQuery: vi.fn(), resolveCompareIso: vi.fn() }))
vi.mock('@/lib/linkedin/base', () => ({ linkedinQuery: vi.fn(), resolveCompareIso: vi.fn() }))
vi.mock('@/lib/paid-search/base', () => ({
  awQuery: vi.fn(),
  resolveCompareIso: vi.fn(),
  isLeadAction: () => true,
}))

import { transformMetaKpis } from '@/lib/meta/kpis'
import { transformLinkedInKpis } from '@/lib/linkedin/kpis'
import { transformKpis } from '@/lib/paid-search/kpis'

const keys = (kpis: { key: string }[]) => new Set(kpis.map((k) => k.key))

describe('Overview rollup key coupling — real transforms expose the keys getPaidMediaOverview reads', () => {
  test('Paid Search transform exposes cost / clicks / leads', () => {
    const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'lead', category: 'broker' as const }] }
    const k = keys(
      transformKpis(
        { Cost: '100', Clicks: '20', Impressions: '1000' },
        [{ ConversionTypeName: 'lead', Conversions: '3' }],
        null,
        null,
        cfg,
      ),
    )
    expect(k).toContain('cost') // CHANNELS['paid-search'].spendKey
    expect(k).toContain('clicks') // .clicksKey
    expect(k).toContain('leads') // .leadsKey
  })

  test('Meta transform exposes spend / linkClicks (and NO leads — data gap)', () => {
    const k = keys(transformMetaKpis({ cost: '100', inline_link_clicks: '20' }, null))
    expect(k).toContain('spend') // CHANNELS.meta.spendKey
    expect(k).toContain('linkClicks') // .clicksKey
    // Meta has no leadsKey; if a `leads` key ever appears here the rollup's
    // "Meta leads is always null" assumption silently breaks.
    expect(k.has('leads')).toBe(false)
  })

  test('LinkedIn transform exposes spend / clicks / leads', () => {
    const k = keys(transformLinkedInKpis({ spend: '100', clicks: '20', oneClickLeads: '3' }, null))
    expect(k).toContain('spend') // CHANNELS.linkedin.spendKey
    expect(k).toContain('clicks') // .clicksKey
    expect(k).toContain('leads') // .leadsKey
  })
})
