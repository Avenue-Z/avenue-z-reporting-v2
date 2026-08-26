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
