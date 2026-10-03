import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { Fallback } from './shared'

// Fix list X4: the default copy is pinned exactly, because nine other Organic Social parts (Renaissance's included)
// render it; only the YTD blocks pass their own timeout text.
test('without timeoutText the card is exactly today\'s', () => {
  expect(render(<Fallback kind="timeout" />).container.textContent).toBe('Taking longer than usual — try a shorter date range.')
  expect(render(<Fallback kind="error" />).container.textContent).toBe("Couldn't load this section.")
})

test('timeoutText replaces only the timeout copy', () => {
  expect(render(<Fallback kind="timeout" timeoutText="Taking longer than usual. Try again in a minute." />).container.textContent)
    .toBe('Taking longer than usual. Try again in a minute.')
  expect(render(<Fallback kind="error" timeoutText="Taking longer than usual. Try again in a minute." />).container.textContent)
    .toBe("Couldn't load this section.")
})
