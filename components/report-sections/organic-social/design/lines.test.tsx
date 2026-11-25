// The line views behind the Line / Columns toggle (plan 2026-11-24, Unit C): industry results per day by sentiment as
// three lines, as the October deck draws them. The year to date line view reuses PointLines (tested through the page).
import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { DailyLines, PosNeuColumns } from './charts'

const day = (d: number, pos: number, neu: number, neg: number) => ({ day: `2026-10-${String(d).padStart(2, '0')}`, pos, neu, neg })

describe('DailyLines', () => {
  test('three lines, positive, neutral and negative, one point per day, with a key', () => {
    const { container } = render(<DailyLines rows={[day(1, 3, 10, 5), day(2, 4, 12, 6), day(3, 2, 30, 4)]} />)
    const lines = Array.from(container.querySelectorAll('polyline'))
    expect(lines).toHaveLength(3)
    expect(lines.map((l) => l.getAttribute('stroke'))).toEqual(['#60FF80', '#FFFC60', '#FF4444'])
    for (const l of lines) expect(l.getAttribute('points')!.split(' ')).toHaveLength(3)
    expect(container.textContent).toContain('Positive')
    expect(container.textContent).toContain('Negative')
  })

  test('the scale fits the largest single sentiment, not the day total, and the highest point sits under the top', () => {
    const { container } = render(<DailyLines rows={[day(1, 0, 100, 0), day(2, 0, 10, 0)]} />)
    const ys = Array.from(container.querySelectorAll('polyline')).flatMap((l) => l.getAttribute('points')!.split(' ').map((p) => Number(p.split(',')[1])))
    expect(Math.min(...ys)).toBeGreaterThan(24)
  })

  test('no rows: nothing drawn', () => {
    expect(render(<DailyLines rows={[]} />).container.innerHTML).toBe('')
  })

  test('its label names the chart for a screen reader', () => {
    const { container } = render(<DailyLines rows={[day(1, 1, 1, 1)]} />)
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toBe('Results per day by sentiment, as lines')
  })
})

// Positive + neutral's columns view (Savannah's list asks for the toggle on all three year to date charts): one column a
// month, positive + neutral at the bottom in the positive colour, negative on top, each share printed, a gap month empty.
describe('PosNeuColumns', () => {
  const months = ['2026-08', '2026-09', '2026-10']
  test('a column per month with data, positive + neutral under negative, each share printed, a key for both', () => {
    const { container } = render(<PosNeuColumns months={months} posNeu={[91, null, 87]} neg={[9, null, 13]} />)
    const rects = Array.from(container.querySelectorAll('rect'))
    expect(rects).toHaveLength(4)
    const [aug, augNeg] = rects
    expect(aug.style.fill.toUpperCase()).toBe('#60FF80')
    expect(augNeg.style.fill.toUpperCase()).toBe('#FF4444')
    expect(Number(augNeg.getAttribute('y'))).toBeLessThan(Number(aug.getAttribute('y')))
    expect(Array.from(container.querySelectorAll('text')).map((t) => t.textContent)).toEqual(['91', '9', 'Aug', 'Sep', '87', '13', 'Oct'])
    expect(container.textContent).toContain('Positive + neutral')
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toBe('Positive + neutral and negative by month: Aug 91% and 9%, Sep no data, Oct 87% and 13%')
  })
})
