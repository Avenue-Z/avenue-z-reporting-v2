import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionsTrendChart, type TrendRow } from './sessions-trend-chart'

const row: TrendRow = { date: 'Aug 1', sessions: 100, users: 80, newUsers: 40 }

test('empty data renders the no-data state instead of chart chrome', () => {
  render(<SessionsTrendChart data={[]} />)
  expect(screen.getByText('No data for this period.')).toBeInTheDocument()
  expect(screen.queryByText('Sessions & Users Over Time')).not.toBeInTheDocument()
})

test('non-empty data renders the chart, not the no-data state', () => {
  render(<SessionsTrendChart data={[row]} />)
  expect(screen.getByText('Sessions & Users Over Time')).toBeInTheDocument()
  expect(screen.queryByText('No data for this period.')).not.toBeInTheDocument()
})

// Paul CR3 (207) finding: a REJECTED GA4 query flattened to an empty array
// just like a fulfilled-but-empty one, so an outage rendered "No data for
// this period." A false positive claim the period had zero traffic.

test('a failed query renders the "couldn\'t load" state, not No data', () => {
  render(<SessionsTrendChart data={[]} failed />)
  expect(screen.getByText("Couldn't load this data.")).toBeInTheDocument()
  expect(screen.queryByText('No data for this period.')).not.toBeInTheDocument()
})

test('an empty-but-not-failed query renders No data, not the "couldn\'t load" state', () => {
  render(<SessionsTrendChart data={[]} />)
  expect(screen.getByText('No data for this period.')).toBeInTheDocument()
  expect(screen.queryByText("Couldn't load this data.")).not.toBeInTheDocument()
})

test('non-empty data renders the chart regardless of the failed flag', () => {
  render(<SessionsTrendChart data={[row]} failed={false} />)
  expect(screen.getByText('Sessions & Users Over Time')).toBeInTheDocument()
})

// Paul CR4 (207) finding: compareLabel carried the real compare window
// ("Jun 1 - Jun 30") all the way from index.tsx but was only used as a
// truthiness gate — the legend printed a bare "Previous Period", so the
// dashed line on the chart named no date range anywhere on the page.

test('the legend names the compare window rather than a bare "Previous Period"', () => {
  const withPrior: TrendRow = { ...row, prevDate: 'Jul 1', prevSessions: 90, prevUsers: 70, prevNewUsers: 30 }
  render(<SessionsTrendChart data={[withPrior]} compareLabel="Jul 1 – Jul 30" />)
  expect(screen.getByText(/Jul 1 – Jul 30/)).toBeInTheDocument()
})
