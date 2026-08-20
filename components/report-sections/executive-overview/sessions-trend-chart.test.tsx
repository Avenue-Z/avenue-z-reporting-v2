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
