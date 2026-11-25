// Unit D (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md, F9, F10). The share of media types change
// column reads as the tiles' change line (an up arrow in green, a down arrow in red), as Jasmine asked on the call; and
// the October deck's slide 10, where each sentiment came from: one 100% bar per sentiment, split by media type.
import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { MediaShare, SentimentByMedia } from './charts'

const cls = (el: Element, name: string) => Array.from(el.classList).some((c) => c === name || c.startsWith(`_${name}_`))

describe('MediaShare change column', () => {
  const rows = [
    { media: 'Facebook', count: 94, pct: 16.8, change: 12, color: '#39A0FF' },
    { media: 'Online News Other', count: 84, pct: 15, change: -61.5, color: '#6034FF' },
    { media: 'YouTube', count: 24, pct: 4.3, change: 0, color: '#FF0000' },
    { media: 'Newspaper', count: 12, pct: 2.1, change: null, color: '#B056D0' },
  ]
  const change = (c: HTMLElement, i: number) => c.querySelectorAll('[class*="chg"]')[i].firstElementChild as HTMLElement

  test('a rise is an up arrow in green, a drop a down arrow in red, both with the size', () => {
    const { container } = render(<MediaShare rows={rows} />)
    expect(change(container, 0).textContent).toContain('↑ 12%')
    expect(cls(change(container, 0), 'up')).toBe(true)
    expect(change(container, 1).textContent).toContain('↓ 62%')
    expect(cls(change(container, 1), 'down')).toBe(true)
  })
  test('no change reads 0% and no baseline reads n/a, both muted', () => {
    const { container } = render(<MediaShare rows={rows} />)
    expect(change(container, 2).textContent).toContain('0%')
    expect(cls(change(container, 2), 'flat')).toBe(true)
    expect(change(container, 3).textContent).toBe('n/a')
    expect(cls(change(container, 3), 'flat')).toBe(true)
  })
})

describe('SentimentByMedia', () => {
  const rows = [
    { media: 'Facebook', total: 10, pos: 6, neu: 2, neg: 2 },
    { media: 'X', total: 6, pos: 1, neu: 3, neg: 2 },
    { media: 'Blogs', total: 4, pos: 3, neu: 1, neg: 0 },
  ]
  const color = (m: string) => ({ Facebook: '#39A0FF', X: '#60FDFF', Blogs: '#FFFC60' }[m] ?? '#9CA3AF')
  const bars = (c: HTMLElement) => Array.from(c.querySelectorAll('[role="img"]'))

  test('one bar per sentiment, each labelled with its result count', () => {
    const { container } = render(<SentimentByMedia rows={rows} colorFor={color} />)
    expect(bars(container)).toHaveLength(3)
    expect(container.textContent).toContain('Positive (10)')
    expect(container.textContent).toContain('Neutral (6)')
    expect(container.textContent).toContain('Negative (4)')
  })
  test('a bar is split by media type in volume order, widths summing to 100, a type with none left out', () => {
    const { container } = render(<SentimentByMedia rows={rows} colorFor={color} />)
    const neg = Array.from(bars(container)[2].querySelectorAll('i')) as HTMLElement[]
    expect(neg.map((i) => i.style.width)).toEqual(['50%', '50%'])
    expect(neg.map((i) => i.style.background)).toEqual(['rgb(57, 160, 255)', 'rgb(96, 253, 255)'])
    const pos = Array.from(bars(container)[0].querySelectorAll('i')) as HTMLElement[]
    expect(pos.reduce((a, i) => a + parseFloat(i.style.width), 0)).toBeCloseTo(100, 6)
  })
  test('a share is printed inside its segment when the segment is wide enough', () => {
    const { container } = render(<SentimentByMedia rows={rows} colorFor={color} />)
    const pos = Array.from(bars(container)[0].querySelectorAll('i')).map((i) => i.textContent)
    expect(pos).toEqual(['60%', '10%', '30%'])
    expect(bars(container)[0].getAttribute('aria-label')).toBe('Positive: Facebook 60%, X 10%, Blogs 30%')
  })
  test('a sentiment with no results is an empty bar', () => {
    const none = rows.map((r) => ({ ...r, neg: 0, total: r.pos + r.neu }))
    const { container } = render(<SentimentByMedia rows={none} colorFor={color} />)
    expect(container.textContent).toContain('Negative (0)')
    expect(bars(container)[2].querySelectorAll('i')).toHaveLength(0)
  })
  test('a key names every media type in its colour', () => {
    const { container } = render(<SentimentByMedia rows={rows} colorFor={color} />)
    expect(container.textContent).toContain('Facebook')
    expect(container.textContent).toContain('Blogs')
  })
})
