import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
// contacts.ts imports ./base (-> lib/db -> next-auth); mock it so jsdom can load
// the module, same pattern as lib/salesforce/pipeline.orchestration.test.ts. That
// file kept the mock separate from the pure-function tests, but vitest.config.ts
// only allowlists lib/salesforce/contacts.test.ts (no second orchestration file for
// contacts), so both live here. The mock only intercepts ./base, so it does not
// touch transformWeeklyContacts, which never imports it.
vi.mock('@/lib/salesforce/base', () => ({ salesforceQuery: vi.fn(), resolveCompareIso: vi.fn() }))

import { transformWeeklyContacts, getSalesforceWeeklyContacts } from './contacts'
import { salesforceQuery, resolveCompareIso } from './base'

// Real key format from the API: pipe-separated, zero-padded week.
const rows = [
  { yearWeekIso_created: '2026|31', contact_count: 132 },
  { yearWeekIso_created: '2026|33', contact_count: 131 },
  { yearWeekIso_created: '2026|32', contact_count: 100 },
] as unknown as Record<string, string>[]

describe('transformWeeklyContacts', () => {
  it('normalizes the pipe key to ISO form and sorts ascending', () => {
    const w = transformWeeklyContacts(rows, undefined)
    expect(w.weeks.map((b) => b.week)).toEqual(['2026-W31', '2026-W32', '2026-W33'])
  })

  it('reads current and previous week from the last two buckets, not raw input order', () => {
    // Input order is W31, W33, W32 (unsorted). A wrong implementation reading the
    // last two elements of the raw, unsorted array would report currentWeek 100
    // (W32) and previousWeek 131 (W33) instead of the chronologically correct pair.
    const w = transformWeeklyContacts(rows, undefined)
    expect(w.currentWeek).toBe(131)
    expect(w.previousWeek).toBe(100)
  })

  it('computes week over week from those two', () => {
    const w = transformWeeklyContacts(rows, undefined)
    expect(w.weekOverWeek).toBeCloseTo(31, 0)
  })

  it('carries prior-year week when supplied and omits it when not', () => {
    expect(transformWeeklyContacts(rows, 90).priorYearWeek).toBe(90)
    expect(transformWeeklyContacts(rows, undefined).priorYearWeek).toBeUndefined()
  })

  it('returns zeros, not throws, on empty input', () => {
    const w = transformWeeklyContacts([], undefined)
    expect(w.weeks).toEqual([])
    expect(w.currentWeek).toBe(0)
    expect(w.weekOverWeek).toBeUndefined()
  })

  it('pads a single-digit week number to two digits', () => {
    // A normalizeWeek that skips padStart would emit '2026-W3'. It happens to still
    // sort correctly in isolation, so this pins the actual rendered form, not just order.
    const unpadded = [
      { yearWeekIso_created: '2026|3', contact_count: 10 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(unpadded, undefined)
    expect(w.weeks[0].week).toBe('2026-W03')
  })

  it('sorts across a year boundary, not just within one year', () => {
    const crossYear = [
      { yearWeekIso_created: '2026|01', contact_count: 5 },
      { yearWeekIso_created: '2025|52', contact_count: 9 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(crossYear, undefined)
    expect(w.weeks.map((b) => b.week)).toEqual(['2025-W52', '2026-W01'])
    expect(w.currentWeek).toBe(5)
    expect(w.previousWeek).toBe(9)
  })

  it('treats a single present week as current with no previous, not a crash', () => {
    // Weekly series omit empty periods entirely (a 16-day window returned 14 rows
    // live), so a lone bucket is a real shape, not an edge case to assume away.
    const single = [
      { yearWeekIso_created: '2026|20', contact_count: 40 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(single, undefined)
    expect(w.currentWeek).toBe(40)
    expect(w.previousWeek).toBe(0)
    expect(w.weekOverWeek).toBeUndefined()
  })

  it('does not let one unparseable contact_count NaN-poison the bucket', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bad = [
      { yearWeekIso_created: '2026|10', contact_count: 'not-a-number' },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(bad, undefined)
    expect(w.weeks[0].contacts).toBe(0)
    expect(Number.isFinite(w.currentWeek)).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[salesforce]'), 'not-a-number')
    warnSpy.mockRestore()
  })
})

describe('getSalesforceWeeklyContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('matches the prior-year bucket by ISO week number, not array position', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, _fields: string[], dateRange: string) => {
      if (dateRange === '2025-01-01,2025-12-31') {
        return Promise.resolve([
          // Out of position order, plus a decoy week, so a positional (same-index)
          // match would pick the wrong bucket instead of matching by week number.
          { yearWeekIso_created: '2025|10', contact_count: 999 },
          { yearWeekIso_created: '2025|33', contact_count: 77 },
        ])
      }
      return Promise.resolve([
        { yearWeekIso_created: '2026|31', contact_count: 132 },
        { yearWeekIso_created: '2026|33', contact_count: 131 },
      ])
    })
    const w = await getSalesforceWeeklyContacts('acme')
    expect(w.priorYearWeek).toBe(77)
  })

  it('omits priorYearWeek when the compare set has no matching week number', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, _fields: string[], dateRange: string) => {
      if (dateRange === '2025-01-01,2025-12-31') {
        return Promise.resolve([{ yearWeekIso_created: '2025|10', contact_count: 999 }])
      }
      return Promise.resolve([{ yearWeekIso_created: '2026|33', contact_count: 131 }])
    })
    const w = await getSalesforceWeeklyContacts('acme')
    expect(w.priorYearWeek).toBeUndefined()
  })

  it('degrades to no prior-year figure, not a thrown error, when the compare fetch fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, _fields: string[], dateRange: string) => {
      if (dateRange === '2025-01-01,2025-12-31') return Promise.reject(new Error('timeout'))
      return Promise.resolve([{ yearWeekIso_created: '2026|33', contact_count: 131 }])
    })
    const w = await getSalesforceWeeklyContacts('acme')
    expect(w.priorYearWeek).toBeUndefined()
    expect(w.currentWeek).toBe(131)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[salesforce] contacts compare fetch failed'), expect.any(Error),
    )
    errorSpy.mockRestore()
  })

  it('derives the latest week from chronological order, not the raw last API row', async () => {
    // Current-set rows arrive raw-last = W31 but chronologically-latest = W33 (the
    // API gives no order guarantee). The compare set has different figures for the
    // two candidate weeks, so matching against the wrong "latest" is observable: a
    // fetcher that looks up latestWeek from rows.at(-1) instead of the sorted
    // buckets would report 50 (W31) here instead of the correct 77 (W33).
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, _fields: string[], dateRange: string) => {
      if (dateRange === '2025-01-01,2025-12-31') {
        return Promise.resolve([
          { yearWeekIso_created: '2025|31', contact_count: 50 },
          { yearWeekIso_created: '2025|33', contact_count: 77 },
        ])
      }
      return Promise.resolve([
        { yearWeekIso_created: '2026|33', contact_count: 131 },
        { yearWeekIso_created: '2026|31', contact_count: 132 },
      ])
    })
    const w = await getSalesforceWeeklyContacts('acme')
    expect(w.priorYearWeek).toBe(77)
  })

  it('passes previous_year to resolveCompareIso for the year-to-date window', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockResolvedValue([{ yearWeekIso_created: '2026|33', contact_count: 131 }])
    await getSalesforceWeeklyContacts('acme')
    expect(resolveCompareIso).toHaveBeenCalledWith('year_to_date', 'previous_year')
  })

  it('does not throw when the current fetch is empty but the compare fetch succeeds', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, _fields: string[], dateRange: string) => {
      if (dateRange === '2025-01-01,2025-12-31') {
        return Promise.resolve([{ yearWeekIso_created: '2025|10', contact_count: 999 }])
      }
      return Promise.resolve([])
    })
    const w = await getSalesforceWeeklyContacts('acme')
    expect(w.priorYearWeek).toBeUndefined()
    expect(w.currentWeek).toBe(0)
  })

  it('keeps compare-set rows out of the returned weeks series', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, _fields: string[], dateRange: string) => {
      if (dateRange === '2025-01-01,2025-12-31') {
        return Promise.resolve([{ yearWeekIso_created: '2025|33', contact_count: 77 }])
      }
      return Promise.resolve([
        { yearWeekIso_created: '2026|31', contact_count: 132 },
        { yearWeekIso_created: '2026|33', contact_count: 131 },
      ])
    })
    const w = await getSalesforceWeeklyContacts('acme')
    expect(w.weeks.map((b) => b.week)).toEqual(['2026-W31', '2026-W33'])
  })

  it('skips the compare fetch entirely when resolveCompareIso returns null', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockResolvedValue([{ yearWeekIso_created: '2026|33', contact_count: 131 }])
    const w = await getSalesforceWeeklyContacts('acme')
    expect(w.priorYearWeek).toBeUndefined()
    expect(salesforceQuery).toHaveBeenCalledTimes(1)
  })

  it('requests the weekly fields at maxRows 100 for both current and compare queries', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockResolvedValue([{ yearWeekIso_created: '2026|33', contact_count: 131 }])
    await getSalesforceWeeklyContacts('acme')
    expect(salesforceQuery).toHaveBeenCalledWith(
      'acme', ['yearWeekIso_created', 'contact_count'], 'year_to_date', { maxRows: 100 },
    )
    expect(salesforceQuery).toHaveBeenCalledWith(
      'acme', ['yearWeekIso_created', 'contact_count'], '2025-01-01,2025-12-31', { maxRows: 100 },
    )
  })
})
