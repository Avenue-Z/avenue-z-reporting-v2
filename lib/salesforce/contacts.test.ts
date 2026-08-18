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

  it('drops a year-only key (missing the |WW component) rather than keeping it as W00', () => {
    // normalizeWeek('2026') has no '|', so week is undefined and pads to '00'.
    // ISO weeks run 01-53, never 00, so '2026-W00' must be treated as malformed,
    // not as a legitimate bucket that could become previousWeek.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const yearOnly = [
      { yearWeekIso_created: '2026', contact_count: 999 },
      { yearWeekIso_created: '2026|33', contact_count: 131 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(yearOnly, undefined)
    expect(w.weeks).toEqual([{ week: '2026-W33', contacts: 131 }])
    expect(w.currentWeek).toBe(131)
    expect(w.previousWeek).toBe(0)
    expect(w.weekOverWeek).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[salesforce]'), '2026')
    warnSpy.mockRestore()
  })

  it('drops a malformed week key rather than letting it become a bogus previous week', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const withMalformed = [
      // A missing yearWeekIso_created normalizes to '-W00', which sorts first.
      // With exactly two buckets left, it would become previousWeek and produce
      // a nonsense weekOverWeek if it were not dropped.
      { yearWeekIso_created: '', contact_count: 999 },
      { yearWeekIso_created: '2026|33', contact_count: 131 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(withMalformed, undefined)
    expect(w.weeks).toEqual([{ week: '2026-W33', contacts: 131 }])
    expect(w.currentWeek).toBe(131)
    expect(w.previousWeek).toBe(0)
    expect(w.weekOverWeek).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[salesforce]'), '')
    warnSpy.mockRestore()
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
          // The correct match by week number (33, matching the current set's
          // latest week below).
          { yearWeekIso_created: '2025|33', contact_count: 77 },
          // Decoy with a HIGHER week number than the correct match: it is both
          // the raw array's last element and, after sorting, the chronologically
          // latest bucket. An implementation that picked the last row (by raw
          // position or by sorted position) instead of matching on week number
          // would return 999 here instead of 77.
          { yearWeekIso_created: '2025|40', contact_count: 999 },
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
