import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('@/components/charts/bar-chart', () => ({ BarChart: () => <div data-testid="bar" /> }))

import { ExportModeProvider } from '@/components/export/export-mode'
import { CreativeTable } from './creative-table'
import { MetaGeoSection } from './geo-section'
import type { CampaignNode } from '@/lib/meta/types'

const metrics = { spend: 45, impressions: 6000, reach: 4500, frequency: 1.3, linkClicks: 130, ctr: 2.2, cpc: 0.35, lpv: 200, costPerLpv: 0.3, engagements: 180, shareOfSpend: 50 }
const node = (name: string): CampaignNode => ({
  name, ...metrics,
  adSets: [{ name: `${name} set`, ...metrics, ads: [{ ...metrics, ad: `${name} ad`, campaign: name, adSet: `${name} set`, status: 'ACTIVE' }] }],
})
const campaigns = ['Traffic', 'Leads'].map(node)
const many = (n: number) => Array.from({ length: n }, (_, i) => node(`Campaign ${i}`))
const inExport = (c: CampaignNode[]) => render(<ExportModeProvider><CreativeTable campaigns={c} /></ExportModeProvider>).container

// PDF export (spec 2026-10-08 §7, PR 3 plan deviation 3): campaigns collapsed as on first load; no sort or hint controls.
test('the export prints top-level campaigns and the total, marked, with no arrows, chevrons or hints', () => {
  const { container } = render(<ExportModeProvider><CreativeTable campaigns={campaigns} /></ExportModeProvider>)
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(3)
  expect(container.textContent).not.toMatch(/[▸▾↓↑?]/)
  expect(screen.queryByText('Traffic set')).toBeNull()
  expect(container.querySelector('th[class*="cursor-pointer"]')).toBeNull()
})

// Spec 2026-10-08 §5: a table of 15 printed rows or fewer stays whole; a longer one splits between rows (total last).
test('14 campaigns plus the total print as one block', () => {
  expect(inExport(many(14)).querySelector('[data-export-table]')!.hasAttribute('data-export-block')).toBe(true)
})

test('15 campaigns plus the total split between rows, with the total row last', () => {
  const container = inExport(many(15))
  expect(container.querySelector('[data-export-table]')!.hasAttribute('data-export-block')).toBe(false)
  const rows = [...container.querySelectorAll('tbody tr')]
  expect(rows).toHaveLength(16)
  expect(rows.every((r) => r.hasAttribute('data-export-row'))).toBe(true)
  expect(rows.at(-1)!.textContent).toMatch(/^Total/)
})

test('the export drops the chevron indent, so names line up with the Name header', () => {
  const container = inExport(campaigns)
  expect([...container.querySelectorAll('tbody td:first-child')].every((td) => (td as HTMLElement).style.paddingLeft === '')).toBe(true)
})

test('geo: the chart and its title print as one block', () => {
  render(<ExportModeProvider><MetaGeoSection data={{ rows: [{ region: 'Ohio', spend: 9, linkClicks: 1, lpv: 1, engagements: 1 }], totalRegions: 1, prevTopRegionSpend: null, prevTotalRegions: null }} /></ExportModeProvider>)
  expect(screen.getByText('Top Regions by Spend').parentElement!.hasAttribute('data-export-block')).toBe(true)
})

// Thomas, #352 creative-table-client.tsx:117: the Frequency caveat was a hover hint, hidden on paper, yet every Frequency
// in the PDF is campaign level, where it applies. It prints as a footnote under the table.
test('the export prints the Frequency double-count caveat under the table; live it stays a hint', () => {
  expect(inExport(campaigns).textContent).toMatch(/Frequency: at campaign and ad set level, frequency sums reach across ad sets and may double-count users/)
  expect(render(<CreativeTable campaigns={campaigns} />).container.querySelector('p')).toBeNull()
})

// Thomas, #352 (width headroom) and record item 11: Status is an ad-level field and only top-level rows print, so the
// column was blank on every printed row while costing width on the tightest tables. The export leaves it out.
test('the export leaves out the Status column; live keeps it', () => {
  const container = inExport(campaigns)
  expect([...container.querySelectorAll('th')].map((th) => th.textContent?.trim())).not.toContain('Status')
  const cols = container.querySelectorAll('th').length
  expect([...container.querySelectorAll('tbody tr')].every((tr) => tr.querySelectorAll('td').length === cols)).toBe(true)
  expect([...render(<CreativeTable campaigns={campaigns} />).container.querySelectorAll('th')].map((th) => th.textContent?.trim())).toContain('Status')
})
