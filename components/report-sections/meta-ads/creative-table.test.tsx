import { expect, test } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { DASH } from '@/lib/paid-media/format'
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
  // Concrete cents string. A whole-dollar regression would render 0.30 as "$0"
  // (no ".30"), so this assertion fails on regression. (The prior
  // `not.toContain('$0<')` was tautological — textContent has no tags.)
  expect(text).toContain('$0.30')
})

test('a sub-dollar Cost / LPV never collapses to $0', () => {
  const { container } = render(<CreativeTable campaigns={campaign(0.42)} />)
  expect(container.textContent ?? '').toContain('$0.42')
})

// C2: a BigQuery window the reach marts do not hold has null reach and frequency. They render — at every level,
// in the total and in the export, never a 0; live rows (which always carry reach) render as before.
const node = (name: string, spend: number, reach: number | null): CampaignNode => {
  const m = { spend, impressions: 6000, reach, frequency: reach == null ? null : 1.3, linkClicks: 130, ctr: 2.2, cpc: 0.35, lpv: 200, costPerLpv: 0.3, engagements: 180, shareOfSpend: 50 }
  return { name, ...m, adSets: [{ name: `${name} set`, ...m, ads: [{ ...m, ad: `${name} ad`, campaign: name, adSet: `${name} set`, status: 'ACTIVE' }] }] }
}
const reachCells = (c: HTMLElement) => {
  const col = [...c.querySelectorAll('th')].findIndex((th) => th.textContent?.startsWith('Reach'))
  return [...c.querySelectorAll('tbody tr')].map((tr) => [tr.children[0].textContent?.trim(), tr.children[col].textContent, tr.children[col + 1].textContent])
}

test('live rows render reach and frequency as before', () => {
  const { container } = render(<CreativeTable campaigns={[node('Traffic', 45, 4500)]} />)
  expect(reachCells(container)).toEqual([['▸ Traffic', '4,500', '1.3x'], ['Total (1 Campaign)', '4,500', '1.3x']])
})

test('null reach and frequency render — in the rows and the total, and in the export', () => {
  const campaigns = [node('Traffic', 45, null), node('Leads', 30, 3000)]
  const { container } = render(<CreativeTable campaigns={campaigns} />)
  expect(reachCells(container)).toEqual([['▸ Traffic', DASH, DASH], ['▸ Leads', '3,000', '1.3x'], ['Total (2 Campaigns)', DASH, DASH]])
  const exported = render(<ExportModeProvider><CreativeTable campaigns={campaigns} /></ExportModeProvider>).container
  expect(reachCells(exported).map((r) => r.slice(1))).toEqual([[DASH, DASH], ['3,000', '1.3x'], [DASH, DASH]])
})

test('sorting by reach puts null rows last in either direction', () => {
  const { container } = render(<CreativeTable campaigns={[node('A', 10, null), node('B', 20, 1000), node('C', 30, 5000)]} />)
  const names = () => reachCells(container).slice(0, -1).map((r) => r[0])
  const header = () => [...container.querySelectorAll('th')].find((th) => th.textContent?.startsWith('Reach'))!
  fireEvent.click(header())
  expect(names()).toEqual(['▸ C', '▸ B', '▸ A'])
  fireEvent.click(header())
  expect(names()).toEqual(['▸ B', '▸ C', '▸ A'])
})
