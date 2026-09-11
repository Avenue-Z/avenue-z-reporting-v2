import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NeedsConnection } from './needs-connection'

test('names the source that is not connected', () => {
  render(<NeedsConnection sourceName="CRM" />)
  expect(screen.getByText('CRM not connected')).toBeInTheDocument()
})

test('tells the reader what connecting would give them', () => {
  render(<NeedsConnection sourceName="CRM" />)
  expect(screen.getByText(/Connect your CRM/)).toBeInTheDocument()
})

test('renders no number and no dash, which would read as real data', () => {
  const { container } = render(<NeedsConnection sourceName="CRM" />)
  const text = container.textContent ?? ''
  expect(text).not.toMatch(/\d/)
  expect(text).not.toContain('—')
  expect(text).not.toContain('$')
})

test('takes the label as a prop, so no vendor name is hardcoded', () => {
  render(<NeedsConnection sourceName="Analytics" />)
  expect(screen.getByText('Analytics not connected')).toBeInTheDocument()
})
