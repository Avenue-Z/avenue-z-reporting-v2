import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { HoverHint } from '@/components/charts/hover-hint'

const TEXT = 'Top Performers by metric (Views/Engagements)'

test('a question mark badge with the text, no provider needed', () => {
  const { getByText, container } = render(<HoverHint text={TEXT} />)
  expect(getByText('?')).toBeTruthy()
  expect(getByText(TEXT)).toBeTruthy()
  expect(container.querySelector('.group-hover\\:block')).not.toBeNull()
})

// Tailwind 4 compiles `hover:` inside `@media (hover: hover)`, so on a phone or iPad a tap shows nothing and a badge
// that is not focusable is unreachable from the keyboard (Paul, #335 review). jsdom evaluates no media query, so the
// test pins the two things that make the badge reachable: it takes focus, and focus reveals the text.
test('the badge takes focus and focus reveals the text (touch and keyboard)', () => {
  const { getByText, container } = render(<HoverHint text={TEXT} />)
  expect(getByText('?').getAttribute('tabindex')).toBe('0')
  expect(container.querySelector('.group-focus-within\\:block')?.textContent).toContain(TEXT)
})

test('the badge is marked for the PDF export to hide, and is all spans so it is valid inside a heading', () => {
  const { container } = render(<HoverHint text={TEXT} />)
  expect(container.firstElementChild?.getAttribute('data-export-hide')).toBe('')
  expect(container.querySelectorAll('div').length).toBe(0)
})

// Paul, #335 round 2: an opacity-0 box is still laid out, so one centred on a badge near the right edge pushed the page
// wider than a phone. The box is not laid out until it opens, and is never wider than the screen.
test('the box takes no layout space until it opens, and is capped to the screen width', () => {
  const { container } = render(<HoverHint text={TEXT} />)
  const box = container.querySelector('.hidden')
  expect(box?.textContent).toContain(TEXT)
  expect(box?.className).toContain('max-w-[calc(100vw-2rem)]')
  expect(container.querySelector('.opacity-0')).toBeNull()
})

// Paul, #335 round 3: once the box is display:none at rest, its text left the accessibility tree and a screen reader
// focusing the badge heard only "?". The badge now points at the box (aria-describedby; the box is role="tooltip").
// Accessible-name rules include a directly referenced node even while it is hidden, so the definition is announced.
test('the badge is described by its box, so a screen reader reads the definition', () => {
  const { getByText } = render(<HoverHint text={TEXT} />)
  const badge = getByText('?')
  const id = badge.getAttribute('aria-describedby')
  expect(id).toBeTruthy()
  const box = document.getElementById(id!)
  expect(box?.getAttribute('role')).toBe('tooltip')
  expect(box?.textContent).toContain(TEXT)
  expect(badge).toHaveAccessibleDescription(TEXT)
})

test('two badges on one page point at their own boxes', () => {
  const { getAllByText } = render(<><HoverHint text="First text" /><HoverHint text="Second text" /></>)
  const [a, b] = getAllByText('?')
  expect(a.getAttribute('aria-describedby')).not.toBe(b.getAttribute('aria-describedby'))
  expect(a).toHaveAccessibleDescription('First text')
  expect(b).toHaveAccessibleDescription('Second text')
})
