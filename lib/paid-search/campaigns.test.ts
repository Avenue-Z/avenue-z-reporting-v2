import { describe, expect, test } from 'vitest'
import { transformCampaigns, campaignTotals } from './campaigns'
import { isLeadAction } from './base'

const cfg = {
  googleAdsAccountId: '4136001852',
  leadActions: [
    { name: 'contact_individual_lead', category: 'contact' as const },
    { name: 'contact_employee_lead', category: 'contact' as const },
    { name: 'broker_group_lead', category: 'broker' as const },
  ],
}
// Campaign-segmented metrics (from live probe).
const metricRows = [
  { Campaignname: 'REN | AVZ | SEM | Non-Brand | Brokers | Select Geos', Cost: '8824.99', Clicks: '2663', Impressions: '47412' },
  { Campaignname: 'REN | AVZ | SEM | Brand | All Users | Select Geos', Cost: '3283.43', Clicks: '5886', Impressions: '16805' },
]
// Campaign x conversion-action (includes a non-lead 'Calls from ads' to be excluded).
const leadRows = [
  { Campaignname: 'REN | AVZ | SEM | Brand | All Users | Select Geos', ConversionTypeName: 'Calls from ads', Conversions: '13' },
  { Campaignname: 'REN | AVZ | SEM | Brand | All Users | Select Geos', ConversionTypeName: 'contact_individual_lead', Conversions: '10' },
  { Campaignname: 'REN | AVZ | SEM | Non-Brand | Brokers | Select Geos', ConversionTypeName: 'contact_employee_lead', Conversions: '4' },
  { Campaignname: 'REN | AVZ | SEM | Non-Brand | Brokers | Select Geos', ConversionTypeName: 'broker_group_lead', Conversions: '1' },
]

describe('transformCampaigns', () => {
  const rows = transformCampaigns(metricRows, leadRows, cfg)

  test('scopes leads per campaign and excludes non-lead actions', () => {
    // Brokers campaign: 5 scoped leads (4 + 1), Calls excluded.
    const brokers = rows.find((r) => r.campaign.includes('Brokers'))!
    expect(brokers.leads).toBe(5)
    // Brand campaign: 10 scoped leads (Calls from ads excluded).
    // Note: 'Non-Brand' contains 'Brand' as a substring, so we exclude it explicitly.
    const brand = rows.find((r) => r.campaign.includes('Brand') && !r.campaign.includes('Non-Brand'))!
    expect(brand.leads).toBe(10)
  })

  test('CPL is exact cents — cost / leads, not rounded (item 11d)', () => {
    const brokers = rows.find((r) => r.campaign.includes('Brokers'))!
    expect(brokers.cpl).toBeCloseTo(8824.99 / 5, 6)
  })

  test('sorts by cost desc', () => {
    expect(rows[0].campaign.includes('Brokers')).toBe(true)
  })

  test('totals reconcile with the account-level scoped-leads sum (§10 acceptance)', () => {
    expect(campaignTotals(rows).leads).toBe(15)
    const kpiScopedLeads = leadRows
      .filter((r) => isLeadAction(r.ConversionTypeName, cfg))
      .reduce((s, r) => s + Number(r.Conversions), 0)
    expect(kpiScopedLeads).toBe(campaignTotals(rows).leads)
  })
})
