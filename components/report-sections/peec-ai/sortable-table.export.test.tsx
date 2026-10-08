'use client'
// Renders SortableTable directly, as client code (scripts/check-rsc-props.ts reads a file without this directive as a
// Server Component, and function props like rowKey cannot cross that boundary).
import { expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import { SortableTable, type SortableColumn, type SortableTableProps } from './sortable-table'

type Row = { name: string; n: number }
const ROWS: Row[] = Array.from({ length: 14 }, (_, i) => ({ name: `row-${i}`, n: (i * 7) % 11 }))
const COLUMNS: SortableColumn<Row>[] = [
  { key: 'name', label: 'Name', tooltip: 'What it is' },
  { key: 'n', label: 'Count', align: 'right' },
]
const table = (props: Partial<SortableTableProps<Row>> = {}, exportMode = true) => {
  const ui = <TooltipProvider><SortableTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} {...props} /></TooltipProvider>
  return render(exportMode ? <ExportModeProvider>{ui}</ExportModeProvider> : ui)
}
const names = (c: HTMLElement) => [...c.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')?.textContent)

// Spec 2026-10-08-pdf-export-all-reports-design §5: the default view, no controls, and a line saying rows were cut.
test('the export prints the default sort and first page of rows, with no buttons, and says how many there are', () => {
  const { container } = table({ initialPageSize: 10, defaultSortKey: 'n', defaultSortDir: 'desc' })
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(container.querySelectorAll('tbody tr')).toHaveLength(10)
  const counts = [...container.querySelectorAll('tbody tr')].map((tr) => Number(tr.querySelectorAll('td')[1].textContent))
  // Sorted before cutting to the page (final review: a sorted-among-themselves check passes even if sliced first).
  expect(counts).toEqual([10, 9, 8, 7, 7, 6, 5, 4, 3, 3])
  expect(screen.getByText('Showing 10 of 14')).toBeTruthy()
  expect(within(container.querySelector('thead')!).getByText('Name')).toBeTruthy()
})

test('every row is marked for the page-break rules, inside a marked table', () => {
  const { container } = table({ initialPageSize: 10 })
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(10)
})

test('a table with no more rows than its page size has no "Showing" line', () => {
  table({ initialPageSize: 20 })
  expect(screen.queryByText(/^Showing /)).toBeNull()
})

test('a table with no page size prints every row', () => {
  const { container } = table()
  expect(container.querySelectorAll('tbody tr')).toHaveLength(14)
})

test('outside the export the table is unchanged: sort buttons, the See all control, no export markers', () => {
  const { container } = table({ initialPageSize: 10 }, false)
  expect(screen.getByRole('button', { name: 'Sort by Name' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'See all 14 rows' })).toBeTruthy()
  expect(container.querySelector('[data-export-table], [data-export-row]')).toBeNull()
  expect(names(container)).toHaveLength(10)
})

// Final review of PR 2: the export branch must keep what the live rows show, e.g. the client's own highlighted row and
// cells that render links.
test('the export keeps row classes and cell renderers', () => {
  const cols: SortableColumn<Row>[] = [{ key: 'name', label: 'Name', render: (r) => <a href={`https://example.com/${r.name}`}>{r.name}</a> }]
  const { container } = render(<ExportModeProvider><SortableTable columns={cols} rows={ROWS} rowKey={(r) => r.name} rowClassName={(r) => (r.name === 'row-3' ? 'is-you' : '')} /></ExportModeProvider>)
  expect(container.querySelector('tr.is-you td')?.textContent).toBe('row-3')
  expect(container.querySelectorAll('tbody a[href^="https://example.com/"]')).toHaveLength(14)
})

// Spec 2026-10-08 §5: a table short enough for a page is one block; a longer one splits between rows.
test('a table of up to 15 printed rows is one unbreakable block; a longer one is not', () => {
  expect(table({ initialPageSize: 10 }).container.querySelector('[data-export-table]')?.hasAttribute('data-export-block')).toBe(true)
  const long = Array.from({ length: 20 }, (_, i) => ({ name: `r${i}`, n: i }))
  const { container } = render(<ExportModeProvider><SortableTable columns={COLUMNS} rows={long} rowKey={(r) => r.name} /></ExportModeProvider>)
  expect(container.querySelector('[data-export-table]')?.hasAttribute('data-export-block')).toBe(false)
})
