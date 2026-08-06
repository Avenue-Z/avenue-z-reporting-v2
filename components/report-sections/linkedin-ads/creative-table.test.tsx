import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CreativeTableClient } from './creative-table-client'
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
