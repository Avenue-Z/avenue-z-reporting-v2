import { describe, expect, test, vi } from 'vitest'
// kpis.ts imports ./base (→ lib/db → next-auth); mock it so jsdom can load the module.
vi.mock('@/lib/linkedin/base', () => ({ linkedinQuery: vi.fn(), resolveCompareIso: vi.fn() }))
import { transformLinkedInKpis } from './kpis'

describe('LinkedIn Cost / Lead dash', () => {
  test('costPerLead is null (renders —) when there are 0 leads', () => {
    // oneClickLeadsCost can come back null → previously Number(null||0)=0 → "$0.00".
    const k = transformLinkedInKpis({ spend: '5000', clicks: '100', oneClickLeads: '0' }, null)
    const cpl = k.find((c) => c.key === 'costPerLead')!
    expect(cpl.value).toBeNull()
  })
  test('costPerLead keeps its value when leads > 0', () => {
    const k = transformLinkedInKpis({ spend: '5000', oneClickLeads: '10', oneClickLeadsCost: '80' }, null)
    expect(k.find((c) => c.key === 'costPerLead')!.value).toBe(80)
  })
  test('attaches prior-period compareValue on spend, clicks and leads', () => {
    const k = transformLinkedInKpis(
      { spend: '100', clicks: '10', oneClickLeads: '5' },
      { spend: '80', clicks: '8', oneClickLeads: '4' },
    )
    expect(k.find((x) => x.key === 'spend')!.compareValue).toBe(80)
    expect(k.find((x) => x.key === 'clicks')!.compareValue).toBe(8)
    expect(k.find((x) => x.key === 'leads')!.compareValue).toBe(4)
  })
})
