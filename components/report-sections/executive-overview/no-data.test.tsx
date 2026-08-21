import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NoData, LoadFailed } from './no-data'

test('renders the default no-data message', () => {
  render(<NoData />)
  expect(screen.getByText('No data for this period.')).toBeInTheDocument()
})

test('accepts a custom message', () => {
  render(<NoData message="Nothing here yet." />)
  expect(screen.getByText('Nothing here yet.')).toBeInTheDocument()
})

test('names no vendor or data source', () => {
  const { container } = render(<NoData />)
  const text = container.textContent ?? ''
  expect(text.toLowerCase()).not.toMatch(/hubspot|salesforce|crm|ga4|google/)
})

// Paul CR3 (207) finding: NoData's own doc comment says it means "we queried
// and got nothing back," never "the query failed": so a REJECTED query
// needs its own distinct copy, not NoData's "no data for this period."

test('LoadFailed renders its own message, distinct from NoData\'s', () => {
  render(<LoadFailed />)
  expect(screen.getByText("Couldn't load this data.")).toBeInTheDocument()
  expect(screen.queryByText('No data for this period.')).not.toBeInTheDocument()
})

test('LoadFailed accepts a custom message', () => {
  render(<LoadFailed message="Something went wrong." />)
  expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
})

test('LoadFailed names no vendor or data source', () => {
  const { container } = render(<LoadFailed />)
  const text = container.textContent ?? ''
  expect(text.toLowerCase()).not.toMatch(/hubspot|salesforce|crm|ga4|google/)
})
