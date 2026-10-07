import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { HoverHint } from '@/components/charts/hover-hint'

const TEXT = 'Top Performers by metric (Views/Engagements)'

test('a question mark badge with the text, no provider needed', () => {
  const { getByText, container } = render(<HoverHint text={TEXT} />)
  expect(getByText('?')).toBeTruthy()
  expect(getByText(TEXT)).toBeTruthy()
  expect(container.querySelector('.group-hover\\:opacity-100')).not.toBeNull()
})

// Tailwind 4 compiles `hover:` inside `@media (hover: hover)`, so on a phone or iPad a tap shows nothing and a badge
// that is not focusable is unreachable from the keyboard (Paul, #335 review). jsdom evaluates no media query, so the
// test pins the two things that make the badge reachable: it takes focus, and focus reveals the text.
test('the badge takes focus and focus reveals the text (touch and keyboard)', () => {
  const { getByText, container } = render(<HoverHint text={TEXT} />)
  expect(getByText('?').getAttribute('tabindex')).toBe('0')
  expect(container.querySelector('.group-focus-within\\:opacity-100')?.textContent).toContain(TEXT)
})

test('the badge is marked for the PDF export to hide, and is all spans so it is valid inside a heading', () => {
  const { container } = render(<HoverHint text={TEXT} />)
  expect(container.firstElementChild?.getAttribute('data-export-hide')).toBe('')
  expect(container.querySelectorAll('div').length).toBe(0)
})
