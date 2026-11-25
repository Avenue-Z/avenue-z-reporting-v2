import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const push = vi.fn()
let search = 'section=peec-ai'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/dashboard/renaissance/reports',
  useSearchParams: () => new URLSearchParams(search),
}))

import { GA4DatePicker } from './date-picker'

beforeEach(() => {
  push.mockReset()
  search = 'section=peec-ai'
})

function applyNoComparison(props: { compareRange: string | null; explicitNone?: boolean; defaultCompare?: string }) {
  render(<GA4DatePicker dateRange="last_30_days" {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Last 30 Days/ }))
  fireEvent.click(screen.getByRole('button', { name: 'No Comparison' }))
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
}

test('explicitNone writes compareRange=none', () => {
  applyNoComparison({ compareRange: 'previous_period', explicitNone: true })
  expect(push.mock.calls[0][0]).toContain('compareRange=none')
})

test('without explicitNone the param is removed', () => {
  applyNoComparison({ compareRange: 'previous_period' })
  expect(push.mock.calls[0][0]).not.toContain('compareRange')
})

test('the trigger shows No Comparison for compareRange=none', () => {
  render(<GA4DatePicker dateRange="last_30_days" compareRange="none" />)
  const trigger = screen.getByRole('button', { name: /Last 30 Days/ })
  expect(trigger.textContent).toContain('vs')
  expect(trigger.textContent).toContain('No Comparison')
})

function applyDateOnly(props: { compareRange: string | null; explicitNone?: boolean; defaultCompare?: string }) {
  render(<GA4DatePicker dateRange="last_30_days" {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Last 30 Days/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Last 7 Days' }))
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
}

test('AEO Overview: a date-only change with no compareRange in the URL does not write one', () => {
  applyDateOnly({ compareRange: null, explicitNone: true, defaultCompare: 'previous_period' })
  expect(push.mock.calls[0][0]).toContain('dateRange=last_7_days')
  expect(push.mock.calls[0][0]).not.toContain('compareRange')
})

test('defaultCompare is display-only: label shows it while the URL has no compareRange', () => {
  render(<GA4DatePicker dateRange="last_30_days" compareRange={null} explicitNone defaultCompare="previous_period" />)
  expect(screen.getByRole('button', { name: /Last 30 Days/ }).textContent).toContain('Previous Period')
})

test('subsection (no explicitNone): a date-only change leaves an absent compareRange absent', () => {
  applyDateOnly({ compareRange: null })
  expect(push.mock.calls[0][0]).not.toContain('compareRange')
})

test('a date-only change keeps a present compareRange exactly as it is', () => {
  search = 'section=peec-ai&compareRange=previous_year'
  applyDateOnly({ compareRange: 'previous_year', explicitNone: true, defaultCompare: 'previous_period' })
  expect(push.mock.calls[0][0]).toContain('compareRange=previous_year')
})

test('explicitNone: No Comparison still writes none when defaultCompare is set', () => {
  applyNoComparison({ compareRange: null, explicitNone: true, defaultCompare: 'previous_period' })
  expect(push.mock.calls[0][0]).toContain('compareRange=none')
})

test('choosing a compare preset writes it', () => {
  render(<GA4DatePicker dateRange="last_30_days" compareRange={null} />)
  fireEvent.click(screen.getByRole('button', { name: /Last 30 Days/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Previous Year' }))
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(push.mock.calls[0][0]).toContain('compareRange=previous_year')
})
