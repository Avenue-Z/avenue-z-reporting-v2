import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CreativeTableClient, sortItems } from './creative-table-client'
import type { LinkedInCampaignGroupNode, LinkedInCreativeMetrics } from '@/lib/linkedin/types'

const zero: LinkedInCreativeMetrics = {
  spend: 500,
  impressions: 4000,
  clicks: 40,
  ctr: 1,
  cpc: 12.5,
  leads: 0,
  costPerLead: 0,
  leadFormOpens: 0,
  leadFormCompletionRate: 0,
  landingPageClicks: 30,
  shareOfSpend: 100,
}

const groups: LinkedInCampaignGroupNode[] = [
  {
    name: 'Prospecting',
    ...zero,
    campaigns: [
      {
        name: 'Brokers',
        ...zero,
        ads: [
          {
            ...zero,
            ad: 'Ad A',
            campaign: 'Brokers',
            campaignGroup: 'Prospecting',
            status: 'ACTIVE',
          },
        ],
      },
    ],
  },
]

describe('CreativeTableClient', () => {
  test('a 0-lead ad shows — for Cost / Lead, never $0.00', () => {
    render(<CreativeTableClient groups={groups} totals={zero} />)
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })
})

describe('sortItems — Cost / Lead ranks leadless rows last', () => {
  // A 0-lead creative stores costPerLead: 0, but it has NO cost-per-lead — it must not
  // sort as the cheapest. It should land at the most-expensive end.
  const withLead = { ...zero, name: 'has-leads', leads: 3, costPerLead: 5 }
  const noLead = { ...zero, name: 'no-leads', leads: 0, costPerLead: 0 }

  test('ascending Cost / Lead puts a real CPL before a 0-lead row', () => {
    const asc = sortItems([noLead, withLead], 'costPerLead', 'asc')
    expect(asc.map((x) => x.name)).toEqual(['has-leads', 'no-leads'])
  })

  test('descending keeps leadless rows at the most-expensive end, not mixed in as cheapest', () => {
    const desc = sortItems([withLead, noLead], 'costPerLead', 'desc')
    expect(desc.map((x) => x.name)).toEqual(['no-leads', 'has-leads'])
  })
})
