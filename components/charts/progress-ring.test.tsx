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
