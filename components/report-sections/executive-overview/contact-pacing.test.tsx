import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContactPacing } from './contact-pacing'
import type { WeeklyContacts } from '@/lib/salesforce/types'

/** Healthy baseline: three weeks, the last in progress. Every figure distinct. */
function data(over: Partial<WeeklyContacts> = {}): WeeklyContacts {
  return {
    weeks: [
      { week: '2026-W31', contacts: 240 },
      { week: '2026-W32', contacts: 186 },
      { week: '2026-W33', contacts: 52 },
    ],
    currentWeek: 52,
    currentWeekPartial: true,
    daysElapsedInCurrentWeek: 3,
    previousWeek: 186,
    priorYearWeek: 149,
    completedWeekOverWeek: -22.5,
    ...over,
  }
}

describe('healthy render', () => {
  it('renders all three tile figures', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('52')).toBeInTheDocument()
    expect(screen.getByText('186')).toBeInTheDocument()
    expect(screen.getByText('149')).toBeInTheDocument()
  })

  it('gives Current Week no delta: a partial week against a complete one is invalid', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.queryByText(/vs prior period/)).not.toBeInTheDocument()
    // The only percentage on screen belongs to Previous Week.
    expect(screen.getAllByText(/%/)).toHaveLength(1)
  })

  it('puts completedWeekOverWeek on Previous Week, where both sides are complete', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText(/22\.5%\s*vs prior complete week/)).toBeInTheDocument()
  })

  it('discloses the partial week with a colon, not an em dash', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('Partial week: 3 of 7 days.')).toBeInTheDocument()
  })

  it('renders the window label', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('Year to date, by ISO week.')).toBeInTheDocument()
  })
})

describe('Prior Year Week is always rendered, never dropped', () => {
  it('dashes when absent rather than removing the tile', () => {
    render(<ContactPacing data={data({ priorYearWeek: undefined })} />)
    expect(screen.getByText('Prior Year Week')).toBeInTheDocument()
    expect(screen.queryByText('149')).not.toBeInTheDocument()
  })
})

describe('no completed week exists (weeks.length < 2)', () => {
  const solo = data({
    weeks: [{ week: '2026-W01', contacts: 12 }],
    currentWeek: 12,
    daysElapsedInCurrentWeek: 2,
    previousWeek: 0,            // the ?? 0 at contacts.ts:153, not a count
    priorYearWeek: undefined,
    completedWeekOverWeek: undefined,
  })

  it('dashes Previous Week instead of publishing a confident 0', () => {
    render(<ContactPacing data={solo} />)
    expect(screen.getByText('Previous Week')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getByText('No completed week yet this year.')).toBeInTheDocument()
  })

  it('promises no comparison at all: no percentage and no placeholder', () => {
    render(<ContactPacing data={solo} />)
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/vs prior complete week/)).not.toBeInTheDocument()
  })

  it('dashes Prior Year Week for the same reason', () => {
    render(<ContactPacing data={solo} />)
    expect(screen.getByText('Prior Year Week')).toBeInTheDocument()
  })

  it('still renders Current Week, which is a real partial count', () => {
    render(<ContactPacing data={solo} />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})

describe('a completed week that is genuinely zero', () => {
  it('renders 0, not the glyph: the derivation must not degenerate into "dash any zero"', () => {
    render(<ContactPacing data={data({
      weeks: [{ week: '2026-W32', contacts: 0 }, { week: '2026-W33', contacts: 52 }],
      previousWeek: 0,
      completedWeekOverWeek: undefined,
      priorYearWeek: undefined,
    })} />)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('No completed week yet this year.')).not.toBeInTheDocument()
  })
})

describe('the in-progress bar is marked', () => {
  it('marks only the final bucket', () => {
    const { container } = render(<ContactPacing data={data()} />)
    const bars = Array.from(container.querySelectorAll('[data-week]'))
    expect(bars).toHaveLength(3)
    expect(bars.slice(0, 2).every((b) => b.getAttribute('data-partial') !== 'true')).toBe(true)
    expect(bars[2].getAttribute('data-partial')).toBe('true')
  })

  it('captions the row so the marking is legible without hovering', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('Final bar is the current week in progress: 3 of 7 days.')).toBeInTheDocument()
  })

  it('labels buckets by week number', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('W31')).toBeInTheDocument()
    expect(screen.getByText('W33')).toBeInTheDocument()
  })
})

describe('bar heights resolve against a definite containing block', () => {
  // The bars carry `height: N%`, and a percentage height resolves against its
  // containing block's height. Every element between a bar and the fixed-height
  // row must therefore carry a definite height of its own. The original markup
  // nested each bar in a per-week column that had none: the row is `items-end`,
  // which suppresses the default `align-items: stretch`, so the column was
  // sized by its content, the percentage resolved to `auto`, and every bar
  // rendered at zero height while the labels below them still drew.
  //
  // The hover target reintroduced a wrapper, which is why this asserts the
  // whole ancestor chain rather than "the bar is a direct child": `h-full` on
  // that wrapper keeps the chain definite. jsdom performs no layout, so no
  // assertion on the emitted style string can catch a regression here.
  it('keeps every element between a bar and the fixed-height row definite', () => {
    const { container } = render(<ContactPacing data={data()} />)
    const row = container.querySelector('.h-32')
    expect(row).not.toBeNull()
    const bars = Array.from(container.querySelectorAll('[data-week]'))
    expect(bars).toHaveLength(3)
    for (const bar of bars) {
      let node = bar.parentElement
      let hops = 0
      while (node && node !== row) {
        expect(node.className).toMatch(/\bh-full\b/)
        node = node.parentElement
        hops++
        expect(hops).toBeLessThan(5)
      }
      expect(node).toBe(row)
    }
  })

  it('keeps one label per bucket so the label track still matches the bar track', () => {
    const { container } = render(<ContactPacing data={data()} />)
    expect(container.querySelectorAll('[data-week-label]')).toHaveLength(
      container.querySelectorAll('[data-week]').length,
    )
  })
})

describe('bars read as the Online Contacts stage', () => {
  // The journey card heading this block is CHART_COLORS.positive. Grey bars
  // under a green card made the two look like different sources.
  it('fills completed bars with the section green', () => {
    const { container } = render(<ContactPacing data={data()} />)
    const bars = Array.from(container.querySelectorAll('[data-week]')) as HTMLElement[]
    expect(bars[0].style.backgroundColor).toBe('rgb(96, 255, 128)')
  })

  it('keeps the in-progress bar visually distinct rather than solid', () => {
    const { container } = render(<ContactPacing data={data()} />)
    const bars = Array.from(container.querySelectorAll('[data-week]')) as HTMLElement[]
    const partial = bars[2]
    expect(partial.getAttribute('data-partial')).toBe('true')
    expect(partial.style.backgroundColor).not.toBe(bars[0].style.backgroundColor)
  })
})

describe('bars are hoverable, like every other chart in the report', () => {
  it('names the week and its count on every bar', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('W31 · 240 contacts')).toBeInTheDocument()
    expect(screen.getByText('W32 · 186 contacts')).toBeInTheDocument()
  })

  it('says the final bar is still filling, so its lower count is not read as a drop', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('W33 · 52 contacts so far, 3 of 7 days')).toBeInTheDocument()
  })

  it('singularises a one-contact week', () => {
    render(<ContactPacing data={data({
      weeks: [{ week: '2026-W31', contacts: 1 }, { week: '2026-W32', contacts: 4 }],
    })} />)
    expect(screen.getByText('W31 · 1 contact')).toBeInTheDocument()
  })
})

describe('guards', () => {
  it('empty weeks replaces the WHOLE block, tiles included', () => {
    // Chart-only replacement would leave three tiles reading 0, 0 and the glyph
    // stacked above the words "No data for this period."
    render(<ContactPacing data={data({
      weeks: [], currentWeek: 0, previousWeek: 0,
      priorYearWeek: undefined, completedWeekOverWeek: undefined,
    })} />)
    expect(screen.getByText('No data for this period.')).toBeInTheDocument()
    expect(screen.queryByText('Current Week')).not.toBeInTheDocument()
    expect(screen.queryByText('Previous Week')).not.toBeInTheDocument()
    expect(screen.queryByText('Prior Year Week')).not.toBeInTheDocument()
  })

  it('every bucket at zero produces a finite height, never NaN%', () => {
    const { container } = render(<ContactPacing data={data({
      weeks: [{ week: '2026-W32', contacts: 0 }, { week: '2026-W33', contacts: 0 }],
      currentWeek: 0, previousWeek: 0,
    })} />)
    expect(container.innerHTML).not.toContain('NaN')
  })
})

describe('vendor neutrality', () => {
  it('names no CRM vendor', () => {
    const { container } = render(<ContactPacing data={data()} />)
    expect(container.textContent ?? '').not.toMatch(/Salesforce|HubSpot/i)
  })
})
