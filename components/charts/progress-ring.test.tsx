import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { ProgressRing, ringRatio } from './progress-ring'

test('the ratio is value over target, capped at 1, and 0 for a zero target', () => {
  expect([ringRatio(0, 100), ringRatio(50, 100), ringRatio(100, 100), ringRatio(150, 100), ringRatio(5, 0)]).toEqual([0, 0.5, 1, 1, 0])
})

test('the ring shows the value, the target and the filled share', () => {
  const { getByText, container } = render(<ProgressRing label="Total Followers" value={18089} target={20000} />)
  expect(getByText('Total Followers')).toBeTruthy()
  expect(getByText('18,089')).toBeTruthy()
  expect(getByText('Target: 20,000')).toBeTruthy()
  const arc = container.querySelector('[data-ratio]') as SVGElement
  expect(arc.getAttribute('data-ratio')).toBe('0.904')
})

test('over target: full arc, the real value still shown', () => {
  const { getByText, container } = render(<ProgressRing label="Engagements" value={13000} target={12500} />)
  expect(getByText('13,000')).toBeTruthy()
  expect((container.querySelector('[data-ratio]') as SVGElement).getAttribute('data-ratio')).toBe('1.000')
})

// Paul, #334 review item 14: a zero-length dash with round caps renders as a dot, which read as a sliver of progress.
test('at zero there is no value arc at all, only the track', () => {
  const { container, getByText } = render(<ProgressRing label="Engagements" value={0} target={500} />)
  expect(getByText('0')).toBeTruthy()
  expect(container.querySelectorAll('circle').length).toBe(1)
  expect(container.querySelector('[data-ratio]')).toBeNull()
})

// K1 (dev scorecard, 2026-10-07): a fixed 128 px ring let six-digit values and "Target: 1,000,000" spill over the arc.
// Layout cannot be measured in jsdom, so this pins the mechanism; the fit itself was measured in the browser.
test('the ring scales to its column up to a cap, and its text is sized from the ring, not fixed', () => {
  const { container, getByText } = render(<ProgressRing label="Impressions/Views" value={858907} target={1000000} />)
  const ring = container.querySelector('svg')!.parentElement!
  expect(ring.className).toMatch(/@container/)
  expect(ring.className).toMatch(/aspect-square/)
  expect(ring.className).toMatch(/max-w-44/)
  expect(ring.className).toMatch(/min-w-32/) // never smaller than the old 128 px ring, on a page squeezed by a sidebar
  expect(ring.className.split(' ')).not.toContain('h-32') // the old fixed size
  expect(ring.className.split(' ')).not.toContain('w-32')
  expect(getByText('858,907').className).toMatch(/cqw/)
  expect(getByText('Target: 1,000,000').className).toMatch(/cqw/)
})
