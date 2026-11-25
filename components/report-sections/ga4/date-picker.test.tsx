import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/dashboard/renaissance/reports',
  useSearchParams: () => new URLSearchParams('section=peec-ai'),
}))

import { GA4DatePicker } from './date-picker'

beforeEach(() => push.mockReset())

function applyNoComparison(props: { compareRange: string | null; explicitNone?: boolean }) {
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
