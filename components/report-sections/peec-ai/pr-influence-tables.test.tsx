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

// ── FB-069 Req 2 (Tina: "Remove it") ─────────────────────────────────────────
// Every row in this table is a cited placement by construction, so a column that
// always reads "Yes" carries no information.
test('the "Cited by AI" column is gone', () => {
  const { container } = renderTable()
  expect(screen.queryByText('Cited by AI')).not.toBeInTheDocument()
  expect(container.textContent).not.toMatch(/\bYes\b/)
})

// ── FB-069 Req 3 (Tina: "Display an error that instructs the PR team to fix
// the missing data in the sheet") ────────────────────────────────────────────
// A blank title previously rendered a zero-width <a>: an invisible, clickable
// gap that read as a rendering bug rather than as missing data.
const BLANK_TITLE: PRPlacementMatchbackRow[] = [
  { ...ROWS[0], headline: '' },
]

test('a missing article title renders a visible error, not an empty cell', () => {
  const { container } = render(
    <TooltipProvider>
      <PRPlacementMatchbackTable rows={BLANK_TITLE} />
    </TooltipProvider>,
  )
  const cell = screen.getByText(/missing article title/i)
  expect(cell).toBeInTheDocument()
  expect(container.textContent).not.toMatch(/^\s*$/)
})

test('the missing-title error still links through to the article', () => {
  render(
    <TooltipProvider>
      <PRPlacementMatchbackTable rows={BLANK_TITLE} />
    </TooltipProvider>,
  )
  const link = screen.getByText(/missing article title/i).closest('a')
  expect(link).toHaveAttribute('href', BLANK_TITLE[0].link)
})

test('a row with a title is unaffected and shows no error', () => {
  const { container } = renderTable()
  expect(screen.getByText('Building a Benefits Dream Team')).toBeInTheDocument()
  expect(container.textContent).not.toMatch(/missing article title/i)
})
