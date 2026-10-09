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
