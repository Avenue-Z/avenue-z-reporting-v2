import { expect, test } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CompetitorUrlsBrandAbsentTable, type CompetitorUrlsBrandAbsentRow } from './content-impact-tables'

// Section H.2 table: Citation Share and its period-over-period delta used to share
// one cell (delta was not independently sortable). It is now split so the delta
// lives in its own sortable column. These tests lock that split + sortability.

const ROWS: CompetitorUrlsBrandAbsentRow[] = [
  { domain: 'alpha.com', articleTitle: 'Alpha piece', url: 'https://alpha.com/a', citationShare: 10, citationShareDelta: 5, competitorsMentioned: 'Rival' },
  { domain: 'bravo.com', articleTitle: 'Bravo piece', url: 'https://bravo.com/b', citationShare: 20, citationShareDelta: -2, competitorsMentioned: 'Rival' },
]

function renderTable() {
  return render(
    <TooltipProvider>
      <CompetitorUrlsBrandAbsentTable rows={ROWS} emptyMessage="none" />
    </TooltipProvider>,
  )
}

function domainOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('tbody tr td:first-child')).map((td) => td.textContent ?? '')
}

test('Citation Share and Delta are two distinct, independently sortable columns', () => {
  renderTable()
  // Both columns present as their own sortable headers (before the split there was
  // no standalone Delta header — the delta rendered inside the Citation Share cell).
  expect(screen.getByLabelText('Sort by Citation Share')).toBeTruthy()
  expect(screen.getByLabelText('Sort by Δ')).toBeTruthy() // "Sort by Δ"
})

test('the delta value renders in the Delta column, not inside the Citation Share cell', () => {
  const { container } = renderTable()
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent ?? '')
  const shareIdx = headers.findIndex((h) => h.includes('Citation Share'))
  const deltaIdx = headers.findIndex((h) => h.includes('Δ'))
  expect(shareIdx).toBeGreaterThanOrEqual(0)
  expect(deltaIdx).toBe(shareIdx + 1) // Delta sits immediately right of Citation Share

  const firstRowCells = container.querySelectorAll('tbody tr:first-child td')
  // Citation Share cell holds only the percentage, no "pp" delta text.
  expect(firstRowCells[shareIdx].textContent).toContain('10.0%')
  expect(firstRowCells[shareIdx].textContent).not.toContain('pp')
  // Delta cell holds the pp delta.
  expect(firstRowCells[deltaIdx].textContent).toContain('pp')
})

test('clicking the Delta header sorts rows by citationShareDelta', () => {
  const { container } = renderTable()
  // Initial (input) order.
  expect(domainOrder(container)).toEqual(['alpha.com', 'bravo.com'])
  const deltaSort = screen.getByLabelText('Sort by Δ')
  fireEvent.click(deltaSort) // asc: -2 (bravo) before 5 (alpha)
  expect(domainOrder(container)).toEqual(['bravo.com', 'alpha.com'])
  fireEvent.click(deltaSort) // desc: 5 (alpha) before -2 (bravo)
  expect(domainOrder(container)).toEqual(['alpha.com', 'bravo.com'])
})
