import { describe, it, expect } from 'vitest'
import { resolveCompareIso } from './base'

// Every comparison window in this module is decided here, and both orchestration
// suites vi.mock('./base'), so without this spec the function ran in no CI at
// all. Expectations below are pinned against real observed output, not assumed.
describe('resolveCompareIso', () => {
  it('returns null when no compare range is requested', () => {
    expect(resolveCompareIso('2026-01-01,2026-01-31', null)).toBeNull()
  })

  it('shifts a calendar month back a month for previous_period', () => {
    expect(resolveCompareIso('2026-01-01,2026-01-31', 'previous_period')).toBe('2025-12-01,2025-12-31')
  })

  it('shifts a 7 day window back by its own length, not by a calendar month', () => {
    // Feb 22 to Feb 28 is the week immediately before Mar 1 to Mar 7, so this
    // pins that previous_period means "the preceding window of equal length".
    expect(resolveCompareIso('2026-03-01,2026-03-07', 'previous_period')).toBe('2026-02-22,2026-02-28')
  })

  it('shifts back exactly one year for previous_year, keeping month and day', () => {
    expect(resolveCompareIso('2026-01-01,2026-08-16', 'previous_year')).toBe('2025-01-01,2025-08-16')
  })

  it('resolves a named range before shifting it', () => {
    // year_to_date is resolved against today, so the shape is pinned rather than
    // the literal dates: the year must be last year, starting Jan 1.
    const prior = resolveCompareIso('year_to_date', 'previous_year')
    expect(prior).toMatch(/^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/)
    const [start, end] = prior!.split(',')
    const lastYear = new Date().getUTCFullYear() - 1
    expect(start).toBe(`${lastYear}-01-01`)
    expect(end.startsWith(String(lastYear))).toBe(true)
  })
})
