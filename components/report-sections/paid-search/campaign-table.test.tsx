import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CampaignTable } from './campaign-table'
import type { CampaignRow } from '@/lib/paid-search/types'

function row(campaign: string, cost: number, leads: number): CampaignRow {
  return { campaign, cost, clicks: 100, impressions: 1000, ctr: 10, cpc: cost / 100, leads, cpl: leads ? cost / leads : 0, convRate: 0 }
}

describe('CampaignTable Cost/Lead dash', () => {
  test('a campaign with 0 leads shows — for CPL, one with leads shows cents', () => {
    render(<CampaignTable rows={[row('Has Leads', 1000, 4), row('No Leads', 500, 0)]} />)
    expect(screen.getByText('$250.00')).toBeInTheDocument() // 1000 / 4
    // 'No Leads' row + a 0-lead scenario must not print $0.00 for CPL.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })
})
