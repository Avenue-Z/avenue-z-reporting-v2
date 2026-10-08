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
  expect(counts).toEqual([...counts].sort((a, b) => b - a))
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
