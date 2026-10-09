import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('@/components/charts/bar-chart', () => ({ BarChart: () => <div data-testid="bar" /> }))

import { ExportModeProvider } from '@/components/export/export-mode'
import { LinkedInCreativeTable } from './creative-table'
import { LinkedInGeoSection } from './geo-section'
import type { LinkedInCampaignGroupNode, LinkedInCreativeMetrics } from '@/lib/linkedin/types'

const m: LinkedInCreativeMetrics = { spend: 500, impressions: 4000, clicks: 40, ctr: 1, cpc: 12.5, leads: 0, costPerLead: 0, leadFormOpens: 0, leadFormCompletionRate: 0, landingPageClicks: 30, shareOfSpend: 50 }
const node = (name: string): LinkedInCampaignGroupNode => ({
  name, ...m,
  campaigns: [{ name: `${name} campaign`, ...m, ads: [{ ...m, ad: `${name} ad`, campaign: `${name} campaign`, campaignGroup: name, status: 'ACTIVE' }] }],
})
const groups = ['Prospecting', 'Retargeting'].map(node)
const many = (n: number) => Array.from({ length: n }, (_, i) => node(`Group ${i}`))
const inExport = (g: LinkedInCampaignGroupNode[]) => render(<ExportModeProvider><LinkedInCreativeTable groups={g} /></ExportModeProvider>).container

// PDF export (spec 2026-10-08 §7, PR 3 plan deviation 3): campaign groups collapsed as on first load; no sort controls.
test('the export prints top-level campaign groups and the total, marked, with no arrows or chevrons', () => {
  const { container } = render(<ExportModeProvider><LinkedInCreativeTable groups={groups} /></ExportModeProvider>)
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(3)
  expect(container.textContent).not.toMatch(/[▸▾↓↑]/)
  expect(screen.queryByText('Prospecting campaign')).toBeNull()
  expect(container.querySelector('th[class*="cursor-pointer"]')).toBeNull()
})

// Spec 2026-10-08 §5: a table of 15 printed rows or fewer stays whole; a longer one splits between rows (total last).
test('14 campaign groups plus the total print as one block', () => {
  expect(inExport(many(14)).querySelector('[data-export-table]')!.hasAttribute('data-export-block')).toBe(true)
})

test('15 campaign groups plus the total split between rows, with the total row last', () => {
  const container = inExport(many(15))
  expect(container.querySelector('[data-export-table]')!.hasAttribute('data-export-block')).toBe(false)
  const rows = [...container.querySelectorAll('tbody tr')]
  expect(rows).toHaveLength(16)
  expect(rows.every((r) => r.hasAttribute('data-export-row'))).toBe(true)
  expect(rows.at(-1)!.textContent).toMatch(/^Total/)
})

test('the export drops the chevron indent, so names line up with the Name header', () => {
  const container = inExport(groups)
  expect([...container.querySelectorAll('tbody td:first-child')].every((td) => (td as HTMLElement).style.paddingLeft === '')).toBe(true)
})

test('geo: the chart and its title print as one block', () => {
  render(<ExportModeProvider><LinkedInGeoSection rows={[{ region: 'Ohio', spend: 9, impressions: 1, clicks: 1, leads: 0 }]} /></ExportModeProvider>)
  expect(screen.getByText('Top Regions by Spend').parentElement!.hasAttribute('data-export-block')).toBe(true)
})
