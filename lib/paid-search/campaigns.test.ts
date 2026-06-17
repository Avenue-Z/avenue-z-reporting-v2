// Run: npx tsx --env-file=.env.local lib/paid-search/campaigns.test.ts
import { strict as assert } from 'node:assert'
import { transformCampaigns, campaignTotals } from './campaigns'

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
const rows = transformCampaigns(metricRows, leadRows, cfg)
// Brokers campaign: 5 scoped leads (4 + 1), Calls excluded.
const brokers = rows.find((r) => r.campaign.includes('Brokers'))!
assert.equal(brokers.leads, 5)
assert.equal(brokers.cpl, Math.round((8824.99 / 5)))
// Brand campaign: 10 scoped leads (Calls from ads excluded).
// Note: 'Non-Brand' contains 'Brand' as a substring, so we exclude it explicitly.
const brand = rows.find((r) => r.campaign.includes('Brand') && !r.campaign.includes('Non-Brand'))!
assert.equal(brand.leads, 10)
// Default sort: cost desc → Brokers first.
assert.equal(rows[0].campaign.includes('Brokers'), true)
// Totals reconcile: sum of scoped leads = 15.
assert.equal(campaignTotals(rows).leads, 15)
console.log('ok')
