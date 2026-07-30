import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { CreativeTable } from './creative-table'
import type { CampaignNode } from '@/lib/meta/types'

/**
 * Cost / LPV is a per-unit cost and is routinely sub-dollar. It must render with
 * cents, like CPC does. It was the only per-unit cost column formatted with the
 * whole-dollar `usd()`, so a real 30-cent Cost / LPV displayed as "$0".
 */
function campaign(costPerLpv: number): CampaignNode[] {
  const metrics = {
    spend: 45, impressions: 6000, reach: 4500, frequency: 1.3,
    linkClicks: 130, ctr: 2.2, cpc: 0.35, lpv: 200,
    costPerLpv, engagements: 180, shareOfSpend: 100,
  }
  return [{
    name: 'Traffic',
    ...metrics,
    adSets: [{
      name: 'Set 3',
      ...metrics,
      ads: [{ ...metrics, ad: 'Ad D', campaign: 'Traffic', adSet: 'Set 3', status: 'ACTIVE' }],
    }],
  }]
}

test('Cost / LPV renders with cents, not rounded to whole dollars', () => {
  const { container } = render(<CreativeTable campaigns={campaign(0.3)} />)
  const text = container.textContent ?? ''
  expect(text).toContain('$0.30')
  expect(text).not.toContain('$0<')
})

test('a sub-dollar Cost / LPV never collapses to $0', () => {
  const { container } = render(<CreativeTable campaigns={campaign(0.42)} />)
  expect(container.textContent ?? '').toContain('$0.42')
})
