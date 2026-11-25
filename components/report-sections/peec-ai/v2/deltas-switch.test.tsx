import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const replace = vi.fn()
let search = 'section=peec-ai&compareRange=previous_year'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/dashboard/renaissance/reports',
  useSearchParams: () => new URLSearchParams(search),
}))

import { DeltasSwitch } from './deltas-switch'

beforeEach(() => {
  replace.mockReset()
  search = 'section=peec-ai&compareRange=previous_year'
})

test('turning off sets deltas=off', () => {
  render(<DeltasSwitch showDeltas disabled={false} />)
  fireEvent.click(screen.getByRole('switch', { name: 'Show deltas' }))
  expect(replace).toHaveBeenCalledWith(
    '/dashboard/renaissance/reports?section=peec-ai&compareRange=previous_year&deltas=off',
    { scroll: false },
  )
})

test('turning on removes deltas', () => {
  search += '&deltas=off'
  render(<DeltasSwitch showDeltas={false} disabled={false} />)
  fireEvent.click(screen.getByRole('switch', { name: 'Show deltas' }))
  expect(replace).toHaveBeenCalledWith(
    '/dashboard/renaissance/reports?section=peec-ai&compareRange=previous_year',
    { scroll: false },
  )
})

test('disabled does nothing and shows helper text', () => {
  render(<DeltasSwitch showDeltas disabled />)
  fireEvent.click(screen.getByRole('switch', { name: 'Show deltas' }))
  expect(replace).not.toHaveBeenCalled()
  expect(screen.getByText('No comparison selected')).toBeTruthy()
})
