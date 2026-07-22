import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PRPlacementMatchbackTable, type PRPlacementMatchbackRow } from './pr-influence-tables'

// FB-069 Req 4: the "N of M placements cited by AI (X%)" summary line above the
// matchback table is removed. Its numerator counted placements cited in the
// selected date range while its denominator counted every placement ever
// secured, so the percentage compared two different bases and moved with the
// date picker for reasons no reader could infer.
//
// The table itself is unaffected. These tests lock both halves of that.

const ROWS: PRPlacementMatchbackRow[] = [
  {
    outlet: 'Employee Benefit News',
    headline: 'Building a Benefits Dream Team',
    link: 'https://www.benefitnews.com/news/building-a-benefits-dream-team',
    publicationDate: 'April 7, 2026',
    citedByAI: true,
    aiEnginesCiting: ['ChatGPT', 'Google'],
    firstCitedDate: '2026-06-22',
    lastCitedDate: '2026-07-21',
  },
]

function renderTable(rows = ROWS) {
  return render(
    <TooltipProvider>
      <PRPlacementMatchbackTable rows={rows} />
    </TooltipProvider>,
  )
}

test('the "N of M placements cited by AI" summary line is not rendered', () => {
  const { container } = renderTable()
  expect(container.textContent).not.toMatch(/placements cited by AI/i)
  // The percentage that accompanied it is gone too.
  expect(container.textContent).not.toMatch(/\d+\.\d%\)/)
})

test('the table still renders its rows and columns', () => {
  renderTable()
  expect(screen.getByText('Employee Benefit News')).toBeInTheDocument()
  expect(screen.getByText('Building a Benefits Dream Team')).toBeInTheDocument()
  expect(screen.getByText('Publication')).toBeInTheDocument()
  expect(screen.getByText('Article')).toBeInTheDocument()
})

test('the empty state is unchanged', () => {
  renderTable([])
  expect(screen.getByText('No PR placements cited by AI in the selected timeframe.')).toBeInTheDocument()
})
