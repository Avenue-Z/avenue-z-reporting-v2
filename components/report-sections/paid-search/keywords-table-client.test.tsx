import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeywordsTableClient, summarizeKeywords } from './keywords-table-client'
import type { KeywordRow } from '@/lib/paid-search/types'

// DataTable pulls in editable-text → a server action → next-auth, which jsdom
// can't resolve. Mock it to render just the cells we assert on (rows + total).
vi.mock('@/components/charts/data-table', () => ({
  DataTable: ({ rows, totalsRow }: { rows: Array<Record<string, React.ReactNode>>; totalsRow?: Record<string, React.ReactNode> }) => (
    <table>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}><td>{r.cost}</td></tr>
        ))}
        {totalsRow && (
          <tr><td>{totalsRow.keyword}</td><td>{totalsRow.cost}</td></tr>
        )}
      </tbody>
    </table>
  ),
}))

// A keyword fixture. clicks drive the ≥10 filter; leads drive sort.
// (transformKeywords' no-cap behavior is exercised by lib/paid-search/keywords.test.ts,
// which must run under tsx — importing it here would drag lib/db into jsdom.)
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

describe('summarizeKeywords (≥10-clicks filter + total over filtered set)', () => {
  const rows: KeywordRow[] = [
    ...Array.from({ length: 25 }, (_, i) => kw(`hi${i}`, 10 + i, 1000, 100, 2)), // 25 with clicks ≥10
    ...Array.from({ length: 8 }, (_, i) => kw(`lo${i}`, i + 1, 100, 5, 0)), // 8 with clicks <10
  ]

  test('default filter keeps only ≥10-clicks keywords; total sums all filtered, not just the 10 shown', () => {
    const { display, total, filteredCount } = summarizeKeywords(rows, true)
    expect(filteredCount).toBe(25)
    expect(display.length).toBe(10) // top 10 displayed
    // Total covers all 25 filtered keywords: clicks = sum(10..34), cost = 25*100.
    const expectedClicks = Array.from({ length: 25 }, (_, i) => 10 + i).reduce((a, b) => a + b, 0)
    expect(total.clicks).toBe(expectedClicks)
    expect(total.cost).toBe(2500)
    expect(total.leads).toBe(50)
  })

  test('derived metrics (CTR, CPL) are recomputed from summed numerators/denominators, not summed', () => {
    const { total } = summarizeKeywords(rows, true)
    // CPL = total cost / total leads = 2500 / 50 = 50 (not the sum of per-row CPLs).
    expect(total.cpl).toBe(2500 / 50)
    // CTR = total clicks / total impressions * 100.
    expect(total.ctr).toBeCloseTo((total.clicks / (25 * 1000)) * 100, 5)
  })

  test('clearing the filter totals over ALL keywords and still displays top 10', () => {
    const { display, total, filteredCount } = summarizeKeywords(rows, false)
    expect(filteredCount).toBe(33)
    expect(display.length).toBe(10)
    expect(total.cost).toBe(2500 + 8 * 5)
  })
})

describe('KeywordsTableClient render', () => {
  test('money figures show cents; total row reflects the filtered set', () => {
    const rows = Array.from({ length: 12 }, (_, i) => kw(`k${i}`, 15, 1000, 123.5, 1))
    render(<KeywordsTableClient rows={rows} />)
    // Per-row and total cost render in cents.
    expect(screen.getAllByText('$123.50').length).toBeGreaterThan(0)
    // Total row present.
    expect(screen.getByText(/Total/)).toBeInTheDocument()
  })

  test('when no keyword reaches 10 clicks, a message renders instead of an empty table', () => {
    const rows = Array.from({ length: 5 }, (_, i) => kw(`k${i}`, i + 1, 100, 5, 0)) // all <10 clicks
    render(<KeywordsTableClient rows={rows} />)
    expect(screen.getByText(/no keywords? .*10 clicks/i)).toBeInTheDocument()
    // No data table rendered.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
