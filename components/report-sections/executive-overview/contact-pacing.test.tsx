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
    campaignUnmatched: false,
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

  it('labels the axis by date, not by week number', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.queryByText(/^W\d\d$/)).not.toBeInTheDocument()
    expect(screen.getByText('Aug 3')).toBeInTheDocument()
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
    expect(screen.getByText('Week of Jul 27 · 240 contacts')).toBeInTheDocument()
    expect(screen.getByText('Week of Aug 3 · 186 contacts')).toBeInTheDocument()
  })

  it('says the final bar is still filling, so its lower count is not read as a drop', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('Week of Aug 10 · 52 contacts so far, 3 of 7 days')).toBeInTheDocument()
  })

  it('singularises a one-contact week', () => {
    render(<ContactPacing data={data({
      weeks: [{ week: '2026-W31', contacts: 1 }, { week: '2026-W32', contacts: 4 }],
    })} />)
    expect(screen.getByText('Week of Jul 27 · 1 contact')).toBeInTheDocument()
  })
})

describe('the axis is thinned to month starts', () => {
  // 35 weekly bars carrying 35 labels is unreadable, and the week number was
  // never the thing a reader wanted anyway. One label per month start gives a
  // date the eye can anchor on and leaves the rest of the track clean. Every
  // bucket keeps a cell so the label track and the bar track stay in step; only
  // the anchors carry text.
  it('labels only the bucket that opens each month', () => {
    const { container } = render(<ContactPacing data={data({
      weeks: [
        { week: '2026-W01', contacts: 10 }, { week: '2026-W02', contacts: 20 },
        { week: '2026-W03', contacts: 30 }, { week: '2026-W04', contacts: 40 },
        { week: '2026-W05', contacts: 50 }, { week: '2026-W06', contacts: 60 },
        { week: '2026-W07', contacts: 70 }, { week: '2026-W08', contacts: 80 },
        { week: '2026-W09', contacts: 90 },
      ],
    })} />)
    const cells = Array.from(container.querySelectorAll('[data-week-label]'))
    expect(cells).toHaveLength(9)
    const labelled = cells.filter((c) => (c.textContent ?? '') !== '').map((c) => c.textContent)
    // 2026-W01 opens on 2025-12-29, so the January anchor is W02, not W01.
    expect(labelled).toEqual(['Jan 5', 'Feb 2'])
  })

  it('anchors the first bucket when it does not sit beside a month change', () => {
    const { container } = render(<ContactPacing data={data({
      weeks: [
        { week: '2026-W02', contacts: 10 }, { week: '2026-W03', contacts: 20 },
        { week: '2026-W04', contacts: 30 },
      ],
    })} />)
    const labelled = Array.from(container.querySelectorAll('[data-week-label]'))
      .filter((c) => (c.textContent ?? '') !== '').map((c) => c.textContent)
    expect(labelled).toEqual(['Jan 5'])
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

describe('campaign-scoped empty state', () => {
  it('says the campaigns matched nothing rather than that the period was empty', () => {
    // The generic NoData message asserts the PERIOD had no leads. When the
    // filter matched nothing that is false — rows came back, none in scope —
    // and Pipeline Performance directly below names the rename as the likely
    // cause. Two blocks explaining one rename two different ways is the bug.
    render(<ContactPacing data={data({ weeks: [], campaignUnmatched: true })} />)
    expect(screen.getByText(/No leads matched the agency-sourced campaigns/)).toBeInTheDocument()
    expect(screen.queryByText('No data for this period.')).not.toBeInTheDocument()
  })

  it('keeps the generic empty message when nothing is campaign-scoped', () => {
    render(<ContactPacing data={data({ weeks: [], campaignUnmatched: false })} />)
    expect(screen.getByText('No data for this period.')).toBeInTheDocument()
  })

  it('renders the series normally when the scope matched', () => {
    // The flag must not hijack a healthy render just because scoping is on.
    render(<ContactPacing data={data({ campaignUnmatched: false })} />)
    expect(screen.getByText('186')).toBeInTheDocument()
  })
})

/**
 * The two signals the leads path adds. Both describe an empty or short series
 * for a reason the generic "No data for this period." actively misstates: the
 * query returned rows, they just could not all be turned into weekly counts.
 */
describe('leads-path data quality signals', () => {
  it('explains an empty series caused by rows with no lead id, rather than blaming the period', () => {
    render(<ContactPacing data={data({ weeks: [], currentWeek: 0, previousWeek: 0, unusableRows: 12 })} />)
    expect(screen.getByText(/12 rows carried no lead identifier/i)).toBeInTheDocument()
    expect(screen.queryByText('No data for this period.')).not.toBeInTheDocument()
  })

  it('ranks campaignUnmatched above it: nothing was in scope in the first place', () => {
    render(<ContactPacing data={data({ weeks: [], currentWeek: 0, previousWeek: 0, unusableRows: 12, campaignUnmatched: true })} />)
    expect(screen.getByText(/no leads matched the agency-sourced campaigns/i)).toBeInTheDocument()
  })

  it('caveats a rendered series that is missing some rows, without replacing it', () => {
    render(<ContactPacing data={data({ unusableRows: 3 })} />)
    expect(screen.getByText(/3 rows carried no lead identifier and were left out/i)).toBeInTheDocument()
    // The chart is still there: this is partial loss, not an empty series.
    expect(screen.queryByText('No data for this period.')).not.toBeInTheDocument()
  })

  it('caveats a truncated lead response', () => {
    render(<ContactPacing data={data({ truncated: true })} />)
    expect(screen.getByText(/hit its row limit/i)).toBeInTheDocument()
  })

  it('stays silent on the contacts path, which measures neither', () => {
    // undefined means "not measured", not "fine". Only an explicit true caveats.
    render(<ContactPacing data={data()} />)
    expect(screen.queryByTestId('leads-caveat')).not.toBeInTheDocument()
  })
})
