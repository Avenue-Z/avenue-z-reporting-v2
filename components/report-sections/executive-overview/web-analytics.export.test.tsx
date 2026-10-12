import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { SessionsTrendChart, type TrendRow } from './sessions-trend-chart'
import { KpiCard } from './kpi-card'
import { NewReturning, type AudienceRow } from './new-returning'

const rows: TrendRow[] = [{ date: 'Aug 1', sessions: 100, users: 80, newUsers: 40 }, { date: 'Aug 2', sessions: 120, users: 90, newUsers: 50 }]
const inExport = (ui: React.ReactElement) => render(<ExportModeProvider>{ui}</ExportModeProvider>).container

// PDF export (spec 2026-10-09 §5): the default view, every series on and unsmoothed, named as a static legend.
test('the trend prints its default series as a static legend, with no buttons, smoothing or hints, on one dark block', () => {
  const container = inExport(<SessionsTrendChart data={rows} />)
  expect(container.querySelectorAll('button')).toHaveLength(0)
  expect(screen.queryByText('7d avg')).toBeNull()
  expect(container.textContent).not.toMatch(/rolling average/) // the smoothing hint
  for (const label of ['Sessions', 'Active Users', 'New Users']) expect(screen.getByText(label)).toBeTruthy()
  const root = container.firstElementChild as HTMLElement
  expect(root.hasAttribute('data-export-block') && root.hasAttribute('data-export-chart')).toBe(true)
  expect(container.querySelector('[data-export-hide]')?.textContent).toContain('?')
})

test('without compare data the trend prints no Previous Period legend', () => {
  inExport(<SessionsTrendChart data={rows} compareLabel="Jul 2 – Jul 31" />)
  expect(screen.queryByText(/Previous Period/)).toBeNull()
})

test('the live trend keeps its toggles', () => {
  const { container } = render(<SessionsTrendChart data={rows} />)
  expect(container.querySelectorAll('button').length).toBe(4)
})

test("a KPI card's ? hint is hidden in the export", () => {
  const container = inExport(<KpiCard title="Sessions" value="1" tooltip="Total sessions." />)
  expect(container.querySelector('[data-export-hide]')?.textContent).toContain('Total sessions.')
})

test('New vs Returning prints on one dark block, hint hidden', () => {
  const audience: AudienceRow[] = [{ type: 'new', sessions: 60, engagementRate: 0.5, avgDuration: 90 }, { type: 'returning', sessions: 40, engagementRate: 0.7, avgDuration: 150 }]
  const container = inExport(<NewReturning rows={audience} />)
  const root = container.firstElementChild as HTMLElement
  expect(root.hasAttribute('data-export-block') && root.hasAttribute('data-export-chart')).toBe(true)
  expect(container.querySelector('[data-export-hide]')?.textContent).toContain('Audience loyalty split')
})
