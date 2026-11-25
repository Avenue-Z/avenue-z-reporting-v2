'use client'
// Renders SortableTable directly, as client code (function props like rowKey cannot cross a Server Component boundary).
import { expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SortableTable, type SortableColumn } from '../sortable-table'
import { deltaColumn } from './delta-columns'

type Row = { name: string; vis: number; d: number | null; isNew?: boolean }
const ROWS: Row[] = [
  { name: 'A', vis: 10, d: 2 },
  { name: 'B', vis: 30, d: -1 },
  { name: 'C', vis: 20, d: null },
]
const NAME: SortableColumn<Row> = { key: 'name', label: 'Name' }
const VIS: SortableColumn<Row> = { key: 'vis', label: 'Vis', align: 'right' }
const delta = (isNew?: (r: Row) => boolean) =>
  deltaColumn<Row>({ key: 'd', accessor: (r) => r.d, unit: 'pts', betterWhen: 'higher', isNew })

const ui = (columns: SortableColumn<Row>[], rows: Row[] = ROWS, extra: { defaultSortKey?: string; defaultSortDir?: 'asc' | 'desc' } = {}) => (
  <TooltipProvider><SortableTable columns={columns} rows={rows} rowKey={(r) => r.name} {...extra} /></TooltipProvider>
)
const order = (c: HTMLElement) => [...c.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')?.textContent)

test('deltaColumn renders unit and tone', () => {
  render(ui([NAME, VIS, delta()]))
  const a = screen.getByText('+2.0 pts')
  expect(a.className).toContain('text-[#60FF80]')
  const b = screen.getByText('-1.0 pts')
  expect(b.className).toContain('text-[#FF4444]')
  expect(screen.getByText('–').className).toContain('text-text-muted')
})

test('null and New sink in both directions', () => {
  const rows = [...ROWS, { name: 'D', vis: 5, d: 9, isNew: true }]
  const { container } = render(ui([NAME, VIS, delta((r) => !!r.isNew)], rows))
  expect(screen.getByText('New')).toBeTruthy()
  const header = screen.getByRole('button', { name: 'Sort by Δ' })
  fireEvent.click(header)
  expect(order(container).slice(0, 2)).toEqual(['B', 'A'])
  expect(new Set(order(container).slice(2))).toEqual(new Set(['C', 'D']))
  fireEvent.click(header)
  expect(order(container).slice(0, 2)).toEqual(['A', 'B'])
  expect(new Set(order(container).slice(2))).toEqual(new Set(['C', 'D']))
})

test('falls back to default sort when the sorted column disappears', () => {
  const extra = { defaultSortKey: 'vis', defaultSortDir: 'desc' as const }
  const { container, rerender } = render(ui([NAME, VIS, delta()], ROWS, extra))
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Δ' }))
  expect(order(container)).toEqual(['B', 'A', 'C'])
  rerender(ui([NAME, VIS], ROWS, extra))
  expect(order(container)).toEqual(['B', 'C', 'A'])
  expect(container.querySelector('thead svg.lucide-arrow-down')).not.toBeNull()
  expect(container.querySelectorAll('thead svg.lucide-arrow-up')).toHaveLength(0)
})

test('the no-data cell explains itself and Δ columns are not filterable', () => {
  render(ui([NAME, VIS, delta()]))
  expect(screen.getByText('–').getAttribute('title')).toBe('No comparison data')
  expect(delta().filterable).toBe(false)
})

test('cycling the default column after the fallback starts from the effective direction', () => {
  const extra = { defaultSortKey: 'vis', defaultSortDir: 'desc' as const }
  const { container, rerender } = render(ui([NAME, VIS, delta()], ROWS, extra))
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Δ' }))
  rerender(ui([NAME, VIS], ROWS, extra))
  expect(order(container)).toEqual(['B', 'C', 'A']) // fallback: vis desc
  // Effective direction is desc, so the next click clears the sort (not asc).
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Vis' }))
  expect(order(container)).toEqual(['A', 'B', 'C'])
  expect(container.querySelectorAll('thead svg.lucide-arrow-down, thead svg.lucide-arrow-up')).toHaveLength(0)
})
