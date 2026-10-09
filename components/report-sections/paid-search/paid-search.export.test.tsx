'use client'
// Renders client components directly (scripts/check-rsc-props.ts reads a file without this directive as a Server Component).
import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/charts/combo-chart', () => ({ ComboChart: (p: { bar: { label: string } }) => <div data-testid="combo">{p.bar.label}</div> }))
vi.mock('@/components/charts/bar-chart', () => ({ BarChart: () => <div data-testid="bar" /> }))
vi.mock('@/components/dashboard/editable-text', () => ({ EditableText: ({ value }: { value: string }) => <span>{value}</span> }))

import { ExportModeProvider } from '@/components/export/export-mode'
import { Hero } from './hero'
import { LeadsSection } from './leads-section'
import { GeoSection } from './geo-section'
import { KeywordsTableClient } from './keywords-table-client'
import type { GeoRegion, LeadBreakdown, HeroPoint } from '@/lib/paid-search/types'
import type { KeywordsData, KeywordsView } from '@/lib/paid-search/keywords'

const inExport = (ui: React.ReactElement) => render(<ExportModeProvider>{ui}</ExportModeProvider>)

// PDF export (spec 2026-10-08 §7; PR 3 plan deviation 2): the default metric, named, on a dark panel so its colours read.
test('the hero prints Cost as a label on a dark panel, one block, no buttons', () => {
  const points: HeroPoint[] = [{ week: '2026-09-01', cost: 10, clicks: 2, impressions: 50, leads: 1 }]
  const { container } = inExport(<Hero points={points} />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.getByTestId('combo').textContent).toBe('Cost')
  expect(screen.getByText('Cost', { selector: '[data-export-toggle-label]' })).toBeTruthy()
  const section = container.querySelector('section')!
  expect(section.hasAttribute('data-export-block') && section.hasAttribute('data-export-chart')).toBe(true)
  expect(section.className).toContain('bg-bg-surface')
})

test('leads: the chart card is a dark block; each category stays whole; the action list title stays with it', () => {
  const data: LeadBreakdown = {
    byAction: [{ name: 'Employer Form', category: 'employer', count: 9 }, { name: 'Broker Form', category: 'broker', count: 3 }],
    categoryTotals: { employer: 9, broker: 3, contact: 0 }, totalLeads: 12, trend: [],
  }
  const { container } = inExport(<LeadsSection data={data} />)
  expect(container.querySelector('[data-export-block][data-export-chart] [data-testid="combo"]')).not.toBeNull()
  expect(screen.getByText('Leads by Action').hasAttribute('data-export-keep-with-next')).toBe(true)
  expect(screen.getByText('Total Leads').parentElement!.hasAttribute('data-export-keep-with-next')).toBe(true)
  expect(container.querySelectorAll('[data-export-block]').length).toBe(1 + 3)
})

test('geo: KPI grid and table are blocks, region rows are marked, chevrons hidden, labels kept with what follows', () => {
  const rows: GeoRegion[] = Array.from({ length: 12 }, (_, i) => ({ region: `R${i}`, clicks: i, cost: i, leads: 12 - i, dmas: [] }))
  const { container } = inExport(<GeoSection rows={rows} />)
  expect(container.querySelector('.grid[data-export-block]')).not.toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(10)
  expect(container.querySelector('[data-export-table]')?.hasAttribute('data-export-block')).toBe(true)
  expect(screen.getByText('Top Regions by Leads').hasAttribute('data-export-keep-with-next')).toBe(true)
  expect(screen.getByText('Region → DMA Breakdown').hasAttribute('data-export-keep-with-next')).toBe(true)
  expect(screen.getByText('Top Regions by Leads').parentElement!.hasAttribute('data-export-block')).toBe(true)
  expect(container.querySelectorAll('tbody svg')).toHaveLength(10)
  expect([...container.querySelectorAll('tbody svg')].every((svg) => svg.closest('[data-export-hide]'))).toBe(true)
})

test('keywords print the default ≥10-clicks view as a label, not a button', () => {
  const view: KeywordsView = { top: [], total: { clicks: 0, impressions: 0, ctr: 0, cost: 0, leads: 0, cpl: 0 }, count: 0 }
  const data: KeywordsData = { filtered: view, all: view }
  inExport(<KeywordsTableClient data={data} />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.getByText('Showing keywords with ≥10 clicks')).toBeTruthy()
  expect(screen.getByText('No keywords reached 10 clicks in this period.')).toBeTruthy()
  // Found in the live page check: without this the title and its label ended page 6 with the table on page 7.
  expect(screen.getByText('Keywords').closest('[data-export-keep-with-next]')).not.toBeNull()
})
