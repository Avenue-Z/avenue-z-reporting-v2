import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeywordsTableClient } from './keywords-table-client'
import type { KeywordRow } from '@/lib/paid-search/types'
import type { KeywordsData, KeywordsView } from '@/lib/paid-search/keywords'

// DataTable pulls in editable-text → a server action → next-auth, which jsdom
// can't resolve. Mock it to render just the cells we assert on (rows + total).
vi.mock('@/components/charts/data-table', () => ({
  DataTable: ({ rows, totalsRow }: { rows: Array<Record<string, React.ReactNode>>; totalsRow?: Record<string, React.ReactNode> }) => (
    <table>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}><td>{r.cost}</td><td>{r.cpl}</td></tr>
        ))}
        {totalsRow && (
          <tr><td>{totalsRow.keyword}</td><td>{totalsRow.cost}</td><td>{totalsRow.cpl}</td></tr>
        )}
      </tbody>
    </table>
  ),
}))

function kw(keyword: string, clicks: number, impressions: number, cost: number, leads: number): KeywordRow {
  return {
    keyword,
    matchType: 'Exact',
    clicks,
    impressions,
    cost,
    leads,
    ctr: impressions ? +((clicks / impressions) * 100).toFixed(1) : 0,
    cpl: leads ? cost / leads : 0,
  }
}

// The server hands the client a bounded, pre-aggregated shape (top-N + totals),
// so the component test builds that shape directly. The aggregation itself is
// covered by lib/paid-search/keywords.test.ts (buildKeywordsData).
function view(top: KeywordRow[], count: number, totalCost: number): KeywordsView {
  return { top, count, total: { clicks: 0, impressions: 0, cost: totalCost, leads: 0, ctr: 0, cpl: 0 } }
}
function data(filtered: KeywordsView, all: KeywordsView = view([], 0, 0)): KeywordsData {
  return { filtered, all }
}

describe('KeywordsTableClient render', () => {
  test('money figures show cents; total row reflects the filtered set', () => {
    const top = Array.from({ length: 10 }, (_, i) => kw(`k${i}`, 15, 1000, 123.5, 1))
    render(<KeywordsTableClient data={data(view(top, 12, 123.5))} />)
    // Per-row and total cost render in cents.
    expect(screen.getAllByText('$123.50').length).toBeGreaterThan(0)
    // Total row present, reflecting the full filtered count (12), not just the 10 shown.
    expect(screen.getByText(/Total \(12 keywords\)/)).toBeInTheDocument()
  })

  test('when no keyword reaches 10 clicks, a message renders instead of an empty table', () => {
    render(<KeywordsTableClient data={data(view([], 0, 0))} />)
    expect(screen.getByText(/no keywords? .*10 clicks/i)).toBeInTheDocument()
    // No data table rendered.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('Cost/Lead shows — for a 0-lead total instead of $0.00', () => {
    const top = [kw('k0', 15, 1000, 500, 0)] // 0 leads
    render(<KeywordsTableClient data={data(view(top, 1, 500))} />)
    expect(screen.getByText(/Total \(1 keyword\)/)).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
  })
})
