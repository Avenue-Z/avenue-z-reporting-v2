'use client'
// Renders DataTable directly, as client code (scripts/check-rsc-props.ts reads a file without this directive as a Server
// Component).
import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// EditableText pulls in a server action (next-auth), which jsdom can't load; record that it was used.
vi.mock('@/components/dashboard/editable-text', () => ({ EditableText: ({ value }: { value: string }) => <span data-testid="editable">{value}</span> }))

import { DataTable } from './data-table'
import { ExportModeProvider } from '@/components/export/export-mode'

const COLUMNS = [
  { key: 'name', label: 'Campaign', align: 'left' as const, sortable: true, sortType: 'string' as const },
  { key: 'cost', label: 'Cost', align: 'right' as const, sortable: true, sortKey: '_cost', sortType: 'number' as const },
]
const ROWS = Array.from({ length: 12 }, (_, i) => ({ name: `C${i}`, cost: `$${i}`, _cost: (i * 7) % 12 }))
const TOTALS = { name: 'Total', cost: '$66' }
const inExport = (ui: React.ReactElement) => render(<ExportModeProvider>{ui}</ExportModeProvider>)

// Spec 2026-10-08 §5 and §7: the default sort, no sort controls or arrows, rows that never split, totals kept.
test('the export prints the default sort with plain headers, every row and the totals marked for page breaks', () => {
  const { container } = inExport(<DataTable columns={COLUMNS} rows={ROWS} defaultSort={{ key: 'cost', dir: 'desc' }} totalsRow={TOTALS} />)
  const headers = [...container.querySelectorAll('th')].map((th) => th.textContent)
  expect(headers).toEqual(['Campaign', 'Cost'])
  expect(container.querySelector('th[class*="cursor-pointer"]')).toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(13)
  expect([...container.querySelectorAll('tbody tr')].slice(0, 3).map((tr) => tr.querySelector('td')!.textContent)).toEqual(['C5', 'C10', 'C3'])
  expect(container.querySelector('tbody tr:last-child td')?.textContent).toBe('Total')
})

test('a table of up to 15 printed rows is one block; a longer one splits between rows', () => {
  expect(inExport(<DataTable columns={COLUMNS} rows={ROWS} totalsRow={TOTALS} />).container.querySelector('[data-export-table]')?.hasAttribute('data-export-block')).toBe(true)
  const long = Array.from({ length: 20 }, (_, i) => ({ name: `L${i}`, cost: '$1', _cost: 1 }))
  expect(inExport(<DataTable columns={COLUMNS} rows={long} />).container.querySelector('[data-export-table]')?.hasAttribute('data-export-block')).toBe(false)
})

test('an editable label prints as plain text in the export', () => {
  const cols = [{ key: 'name', label: 'Region', editable: true, dimKey: 'region' }]
  inExport(<DataTable columns={cols} rows={[{ name: 'East', name__raw: 'east' }]} slug="dash" canEdit />)
  expect(screen.queryByTestId('editable')).toBeNull()
  expect(screen.getByText('East')).toBeTruthy()
})

test('outside the export the table is unchanged: sortable headers with an arrow, no export markers', () => {
  const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} defaultSort={{ key: 'cost', dir: 'desc' }} />)
  expect(container.querySelector('th[class*="cursor-pointer"]')).not.toBeNull()
  expect(screen.getByText('Cost ↓')).toBeTruthy()
  expect(container.querySelector('[data-export-table], [data-export-row]')).toBeNull()
})

// Thomas, #352 data-table.tsx:83: 13 and 20 rows left `<= 15` free to become `< 15`. The boundary, totals counted.
test('15 printed rows (14 + totals) are one block; 16 (15 + totals) split', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `R${i}`, cost: '$1', _cost: 1 }))
  const block = (n: number) => inExport(<DataTable columns={COLUMNS} rows={rows(n)} totalsRow={TOTALS} />).container.querySelector('[data-export-table]')?.hasAttribute('data-export-block')
  expect(block(14)).toBe(true)
  expect(block(15)).toBe(false)
})
