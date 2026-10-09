import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { PaidMediaFallback } from './fallback'

// Thomas, #352 acceptance.mts:214: a timed-out part tells the reader to try a shorter date range, which a reader of the
// PDF can't do. The advice is hidden in the export (display: none); the live text is unchanged.
test('a timed-out part prints its notice without the date-range advice; the live text is unchanged', () => {
  const { container } = render(<PaidMediaFallback kind="timeout" />)
  expect(container.textContent).toBe('Taking longer than usual — try a shorter date range.')
  expect(container.querySelector('[data-export-hide]')?.textContent).toBe(' — try a shorter date range')
})

test('a failed part says it could not load', () => {
  expect(render(<PaidMediaFallback kind="error" />).container.textContent).toBe("Couldn't load this section.")
})
