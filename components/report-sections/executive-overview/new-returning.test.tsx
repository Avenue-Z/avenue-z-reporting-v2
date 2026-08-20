import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NewReturning, type AudienceRow } from './new-returning'

const rows: AudienceRow[] = [
  { type: 'new', sessions: 60, engagementRate: 0.5, avgDuration: 90 },
  { type: 'returning', sessions: 40, engagementRate: 0.7, avgDuration: 150 },
]

test('empty rows render the no-data state instead of the title and an empty split bar', () => {
  render(<NewReturning rows={[]} />)
  expect(screen.getByText('No data for this period.')).toBeInTheDocument()
  expect(screen.queryByText('New vs. Returning')).not.toBeInTheDocument()
})

test('non-empty rows render the chart, not the no-data state', () => {
  render(<NewReturning rows={rows} />)
  expect(screen.getByText('New vs. Returning')).toBeInTheDocument()
  expect(screen.queryByText('No data for this period.')).not.toBeInTheDocument()
})

// Paul CR3 (207) finding: a REJECTED GA4 query flattened to an empty array
// just like a fulfilled-but-empty one, so an outage rendered "No data for
// this period." A false positive claim the period had zero traffic.

test('a failed query renders the "couldn\'t load" state, not No data', () => {
  render(<NewReturning rows={[]} failed />)
  expect(screen.getByText("Couldn't load this data.")).toBeInTheDocument()
  expect(screen.queryByText('No data for this period.')).not.toBeInTheDocument()
})

test('an empty-but-not-failed query renders No data, not the "couldn\'t load" state', () => {
  render(<NewReturning rows={[]} />)
  expect(screen.getByText('No data for this period.')).toBeInTheDocument()
  expect(screen.queryByText("Couldn't load this data.")).not.toBeInTheDocument()
})

test('non-empty rows render the chart regardless of the failed flag', () => {
  render(<NewReturning rows={rows} failed={false} />)
  expect(screen.getByText('New vs. Returning')).toBeInTheDocument()
})
