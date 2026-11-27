// Unit E (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md, F6): an approved note is a numbered mark on
// its day or month, with the note as the hover text, in both views of a toggle chart; a graph with no note draws exactly as
// it does without notes ("if we don't have anything to say it would still look normal"). Made-up values only.
import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { LineChart, PointLines, PosNeuColumns, YtdColumns } from './charts'

const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((day, i) => ({ day, results: 10 + i }))
const months = ['2026-08', '2026-09', '2026-10']
const ytd = months.map((month) => ({ month, value: { pos: 60, neu: 30, neg: 10 } }))
const html = (el: React.ReactElement) => render(el).container.innerHTML
const marksOf = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-note-mark]'))

describe('no note, no change', () => {
  test('every chart with an empty marks list draws exactly what it draws without one', () => {
    expect(html(<LineChart days={days} color="#60FDFF" id="x" marks={[]} />)).toBe(html(<LineChart days={days} color="#60FDFF" id="x" />))
    expect(html(<PointLines months={months} series={[{ name: 'A', vals: [1, 2, 3], color: '#fff' }]} marks={[]} />))
      .toBe(html(<PointLines months={months} series={[{ name: 'A', vals: [1, 2, 3], color: '#fff' }]} />))
    expect(html(<YtdColumns points={ytd} aria="a" marks={[]} />)).toBe(html(<YtdColumns points={ytd} aria="a" />))
    expect(html(<PosNeuColumns months={months} posNeu={[90, 90, 90]} neg={[10, 10, 10]} marks={[]} />))
      .toBe(html(<PosNeuColumns months={months} posNeu={[90, 90, 90]} neg={[10, 10, 10]} />))
  })
})

describe('a note on the graph', () => {
  const day = [{ at: '2026-10-03', n: 1, label: 'Oct 3', text: 'AMA went live' }]
  const month = [{ at: '2026-09', n: 1, label: 'Sep', text: 'AMA month' }, { at: '2026-10', n: 2, label: 'Oct', text: 'Press' }]

  test('Results over time: a numbered mark on its day, the note as its hover text', () => {
    const { container } = render(<LineChart days={days} color="#60FDFF" id="x" marks={day} />)
    const m = marksOf(container)
    expect(m).toHaveLength(1)
    expect(m[0].querySelector('title')!.textContent).toBe('1. Oct 3: AMA went live')
    expect(m[0].textContent).toContain('1')
  })

  test.each([
    ['the line view', <PointLines key="l" months={months} series={[{ name: 'A', vals: [1, 2, 3], color: '#fff' }]} marks={month} />],
    ['the sentiment columns', <YtdColumns key="c" points={ytd} aria="a" marks={month} />],
    ['the positive + neutral columns', <PosNeuColumns key="p" months={months} posNeu={[90, 90, 90]} neg={[10, 10, 10]} marks={month} />],
  ])('a year to date graph, %s: a mark per noted month, in order', (_name, el) => {
    const { container } = render(el)
    expect(marksOf(container).map((g) => g.querySelector('title')!.textContent)).toEqual(['1. Sep: AMA month', '2. Oct: Press'])
  })

  test('a note on a day or month the graph does not draw has no mark', () => {
    const { container } = render(<LineChart days={days} color="#60FDFF" id="x" marks={[{ ...day[0], at: '2026-09-30' }]} />)
    expect(marksOf(container)).toHaveLength(0)
    const cols = render(<YtdColumns points={ytd} aria="a" marks={[{ ...month[0], at: '2026-07' }]} />)
    expect(marksOf(cols.container)).toHaveLength(0)
  })
})
