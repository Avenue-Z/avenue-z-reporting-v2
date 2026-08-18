import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NoData } from './no-data'

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
