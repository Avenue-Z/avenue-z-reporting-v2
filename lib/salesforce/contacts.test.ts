import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
// contacts.ts imports ./base (-> lib/db -> next-auth); mock it so jsdom can load
// the module, same pattern as lib/salesforce/pipeline.orchestration.test.ts. That
// file kept the mock separate from the pure-function tests, but vitest.config.ts
// only allowlists lib/salesforce/contacts.test.ts (no second orchestration file for
// contacts), so both live here. The mock only intercepts ./base, so it does not
// touch transformWeeklyContacts, which never imports it.
vi.mock('@/lib/salesforce/base', () => ({ salesforceQuery: vi.fn(), resolveCompareIso: vi.fn() }))

// getSalesforceWeeklyContacts (the public export) is wrapped in cached(), which
// calls Next's unstable_cache under the hood and throws
// ("Invariant: incrementalCache missing") outside a real request context,
// which is exactly what every test below is. The 'getSalesforceWeeklyContacts'
// describe block imports the internal ...Impl directly instead, per the
// pattern cached() is built around (see lib/hubspot/client.ts): the wrapper is
// a thin cache/perf/health shell around the impl, so exercising the impl
// directly tests the same orchestration logic without needing to fake a
// request context.
import { transformWeeklyContacts, getSalesforceWeeklyContactsImpl as getSalesforceWeeklyContacts } from './contacts'
import { salesforceQuery, resolveCompareIso } from './base'

// Real key format from the API: pipe-separated, zero-padded week.
const rows = [
  { yearWeekIso_created: '2026|31', contact_count: 132 },
  { yearWeekIso_created: '2026|33', contact_count: 131 },
  { yearWeekIso_created: '2026|32', contact_count: 100 },
] as unknown as Record<string, string>[]

// 2026-08-19 is a Wednesday in ISO week 34, so weeks 31 to 33 are all complete
// and "this week" is 3 days old. Pinned so these tests do not drift with the clock.
const WED_W34 = new Date('2026-08-19T12:00:00Z')

describe('transformWeeklyContacts', () => {
  it('normalizes the pipe key to ISO form and sorts ascending', () => {
    const w = transformWeeklyContacts(rows, null, WED_W34)
    expect(w.weeks.map((b) => b.week)).toEqual(['2026-W31', '2026-W32', '2026-W33', '2026-W34'])
  })

  it('reads the completed weeks chronologically, not in raw input order', () => {
    // Input order is W31, W33, W32 (unsorted). An implementation reading the raw
    // array's tail would treat W32 (100) as the most recent completed week and
    // W33 (131) as the one before it, inverting the comparison.
    const w = transformWeeklyContacts(rows, null, WED_W34)
    expect(w.previousWeek).toBe(131)          // W33, the last completed week
    expect(w.completedWeekOverWeek).toBeCloseTo(31, 0) // 131 vs W32's 100
  })

  it('computes the comparison from the two most recent completed weeks', () => {
    const w = transformWeeklyContacts(rows, null, WED_W34)
    expect(w.completedWeekOverWeek).toBeCloseTo(31, 0)
  })

  it('carries prior-year week when supplied and omits it when not', () => {
    const cmp = [{ yearWeekIso_created: '2025|33', contact_count: 90 }] as unknown as Record<string, string>[]
    expect(transformWeeklyContacts(rows, cmp, WED_W34).priorYearWeek).toBe(90)
    expect(transformWeeklyContacts(rows, null, WED_W34).priorYearWeek).toBeUndefined()
  })

  it('returns zeros, not throws, on empty input', () => {
    const w = transformWeeklyContacts([], null, WED_W34)
    expect(w.weeks).toEqual([])
    expect(w.currentWeek).toBe(0)
    expect(w.completedWeekOverWeek).toBeUndefined()
  })

  it('pads a single-digit week number to two digits', () => {
    // A normalizeWeek that skips padStart would emit '2026-W3'. It happens to still
    // sort correctly in isolation, so this pins the actual rendered form, not just order.
    const unpadded = [
      { yearWeekIso_created: '2026|3', contact_count: 10 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(unpadded, null, new Date('2026-01-26T12:00:00Z'))
    expect(w.weeks[0].week).toBe('2026-W03')
  })

  it('sorts across a year boundary, not just within one year', () => {
    const crossYear = [
      { yearWeekIso_created: '2026|01', contact_count: 5 },
      { yearWeekIso_created: '2025|52', contact_count: 9 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(crossYear, null, new Date('2026-01-05T12:00:00Z'))
    expect(w.weeks.map((b) => b.week)).toEqual(['2025-W52', '2026-W01', '2026-W02'])
    expect(w.previousWeek).toBe(5)  // 2026-W01
    expect(w.completedWeekOverWeek).toBeCloseTo(-44.4, 1) // 5 vs 2025-W52's 9
  })

  it('treats a single present week as current with no previous, not a crash', () => {
    // Weekly series omit empty periods entirely (a 16-day window returned 14 rows
    // live), so a lone bucket is a real shape, not an edge case to assume away.
    const single = [
      { yearWeekIso_created: '2026|20', contact_count: 40 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(single, null, new Date('2026-05-20T12:00:00Z'))
    expect(w.previousWeek).toBe(40)   // W21, the only completed week
    expect(w.currentWeek).toBe(0)     // W22 has nothing yet
    expect(w.completedWeekOverWeek).toBeUndefined()
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
    const w = transformWeeklyContacts(yearOnly, null, WED_W34)
    expect(w.weeks.find((b) => b.week === '2026-W33')?.contacts).toBe(131)
    expect(w.weeks.some((b) => b.week.endsWith('-W00'))).toBe(false)
    expect(w.previousWeek).toBe(131)
    expect(w.completedWeekOverWeek).toBeUndefined() // W33 is the only completed week with data before it gap-filled
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
    const w = transformWeeklyContacts(withMalformed, null, WED_W34)
    expect(w.weeks.find((b) => b.week === '2026-W33')?.contacts).toBe(131)
    expect(w.weeks.some((b) => b.week.endsWith('-W00'))).toBe(false)
    expect(w.previousWeek).toBe(131)
    expect(w.completedWeekOverWeek).toBeUndefined() // W33 is the only completed week with data before it gap-filled
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[salesforce]'), '')
    warnSpy.mockRestore()
  })

  it('does not let one unparseable contact_count NaN-poison the bucket', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bad = [
      { yearWeekIso_created: '2026|10', contact_count: 'not-a-number' },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(bad, null, new Date('2026-03-11T12:00:00Z'))
    expect(w.weeks[0].contacts).toBe(0)
    expect(Number.isFinite(w.previousWeek)).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[salesforce]'), 'not-a-number')
    warnSpy.mockRestore()
  })

  it('warns distinctly when contact_count is entirely absent, not just unparseable', () => {
    // A renamed/dropped field_id leaves the key missing from the row rather than
    // present-but-garbled. Number(undefined ?? 0) is a real, finite 0, so a
    // fix that only re-checks Number.isFinite would stay silent here even
    // though this is the worse failure: every week reads a plausible-looking 0
    // with nothing pointing an operator at the broken field id.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const missingField = [
      { yearWeekIso_created: '2026|10' },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(missingField, null, new Date('2026-03-11T12:00:00Z'))
    expect(w.weeks[0].contacts).toBe(0)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing'), undefined)
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
    const w = await getSalesforceWeeklyContacts('acme', WED_W34)
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
    const w = await getSalesforceWeeklyContacts('acme', WED_W34)
    expect(w.priorYearWeek).toBeUndefined()
  })

  it('degrades to no prior-year figure, not a thrown error, when the compare fetch fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, _fields: string[], dateRange: string) => {
      if (dateRange === '2025-01-01,2025-12-31') return Promise.reject(new Error('timeout'))
      return Promise.resolve([{ yearWeekIso_created: '2026|33', contact_count: 131 }])
    })
    const w = await getSalesforceWeeklyContacts('acme', WED_W34)
    expect(w.priorYearWeek).toBeUndefined()
    expect(w.previousWeek).toBe(131) // the current-window fetch still came through
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
    const w = await getSalesforceWeeklyContacts('acme', WED_W34)
    expect(w.priorYearWeek).toBe(77)
  })

  it('passes previous_year to resolveCompareIso for the year-to-date window', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockResolvedValue([{ yearWeekIso_created: '2026|33', contact_count: 131 }])
    await getSalesforceWeeklyContacts('acme', WED_W34)
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
    const w = await getSalesforceWeeklyContacts('acme', WED_W34)
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
    const w = await getSalesforceWeeklyContacts('acme', WED_W34)
    expect(w.weeks.some((b) => b.week.startsWith('2025-'))).toBe(false)
    expect(w.weeks.find((b) => b.week === '2026-W33')?.contacts).toBe(131)
  })

  it('skips the compare fetch entirely when resolveCompareIso returns null', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockResolvedValue([{ yearWeekIso_created: '2026|33', contact_count: 131 }])
    const w = await getSalesforceWeeklyContacts('acme', WED_W34)
    expect(w.priorYearWeek).toBeUndefined()
    expect(salesforceQuery).toHaveBeenCalledTimes(1)
  })

  it('requests the weekly fields at maxRows 100 for both current and compare queries', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockResolvedValue([{ yearWeekIso_created: '2026|33', contact_count: 131 }])
    await getSalesforceWeeklyContacts('acme', WED_W34)
    expect(salesforceQuery).toHaveBeenCalledWith(
      'acme', ['yearWeekIso_created', 'contact_count'], 'year_to_date',
      { settings: { data_fetched_by: 'fetched_by_created' }, maxRows: 100, timeoutMs: 60_000 },
    )
    expect(salesforceQuery).toHaveBeenCalledWith(
      'acme', ['yearWeekIso_created', 'contact_count'], '2025-01-01,2025-12-31',
      { settings: { data_fetched_by: 'fetched_by_created' }, maxRows: 100, timeoutMs: 60_000 },
    )
  })

  it('gives BOTH contact queries the same hang guard the pipeline queries get', async () => {
    // Left unset, these ran on smQuery's 15s REQUEST_TIMEOUT_MS while every
    // pipeline query got 60s against the same upstream. Warm they return in
    // about a second, but a query Supermetrics has not served before takes tens
    // of seconds whatever its shape, and 15s does not clear that: observed live
    // 2026-09-01 as `SmTimeoutError ... after 15000ms` on the compare query,
    // which silently costs the prior-year figure.
    //
    // Asserted on every call rather than on one, because the compare query is
    // the one that was seen failing and it is the easier of the two to miss.
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockResolvedValue([{ yearWeekIso_created: '2026|33', contact_count: 131 }])
    await getSalesforceWeeklyContacts('acme', WED_W34)
    const calls = (salesforceQuery as Mock).mock.calls
    expect(calls).toHaveLength(2)
    for (const [, , , opts] of calls) expect(opts.timeoutMs).toBe(60_000)
  })
})

describe('week bucketing', () => {
  it('merges duplicate week keys instead of letting one displace the other', () => {
    const dup = [
      { yearWeekIso_created: '2026|33', contact_count: 71 },
      { yearWeekIso_created: '2026|33', contact_count: 60 },
      { yearWeekIso_created: '2026|32', contact_count: 100 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(dup, null, WED_W34)
    expect(w.weeks.find((b) => b.week === '2026-W33')?.contacts).toBe(131)
    expect(w.weeks.filter((b) => b.week === '2026-W33')).toHaveLength(1)
  })

  it('keeps W53 in a 53-week year, ordered last', () => {
    // ISO 2026 has 53 weeks (it starts on a Thursday), so 2026-W53 is real and
    // must survive both the key check and the calendar rebuild.
    const rows53 = [
      { yearWeekIso_created: '2026|53', contact_count: 5 },
      { yearWeekIso_created: '2026|51', contact_count: 90 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(rows53, null, new Date('2027-01-06T12:00:00Z'))
    const weeks = w.weeks.map((b) => b.week)
    expect(weeks).toContain('2026-W53')
    expect(weeks.indexOf('2026-W53')).toBeGreaterThan(weeks.indexOf('2026-W51'))
    expect(w.weeks.find((b) => b.week === '2026-W53')?.contacts).toBe(5)
  })

  it('warns rather than silently dropping a week number its year does not have', () => {
    // ISO 2027 has only 52 weeks, so '2027|53' passes the key regex but has no
    // slot in the rebuilt calendar. Those contacts leave the series; that has to
    // be audible.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const impossible = [
      { yearWeekIso_created: '2027|52', contact_count: 10 },
      { yearWeekIso_created: '2027|53', contact_count: 7 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(impossible, null, new Date('2028-01-05T12:00:00Z'))
    expect(w.weeks.some((b) => b.week === '2027-W53')).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not a real ISO week'),
      '2027-W53',
    )
    warnSpy.mockRestore()
  })

  it('gap-fills weeks the API omitted, so completed weeks are adjacent by construction', () => {
    // The API omits empty periods entirely, so W32 is simply absent. Without
    // gap-filling, the "previous" completed week would silently be W31, five
    // weeks of calendar apart from W33 but presented as week over week.
    const gapped = [
      { yearWeekIso_created: '2026|31', contact_count: 40 },
      { yearWeekIso_created: '2026|33', contact_count: 60 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(gapped, null, WED_W34)
    expect(w.weeks.map((b) => b.week)).toEqual(['2026-W31', '2026-W32', '2026-W33', '2026-W34'])
    expect(w.weeks.find((b) => b.week === '2026-W32')?.contacts).toBe(0)
  })
})

describe('partial current week', () => {
  const rowsToW34 = [
    { yearWeekIso_created: '2026|32', contact_count: 120 },
    { yearWeekIso_created: '2026|33', contact_count: 130 },
    { yearWeekIso_created: '2026|34', contact_count: 18 }, // Monday-to-Wednesday so far
  ] as unknown as Record<string, string>[]

  it('reads currentWeek from the actual current ISO week and marks it partial', () => {
    const w = transformWeeklyContacts(rowsToW34, null, WED_W34)
    expect(w.currentWeek).toBe(18)
    expect(w.currentWeekPartial).toBe(true)
    expect(w.daysElapsedInCurrentWeek).toBe(3) // Mon, Tue, Wed
  })

  it('reports 0 for a current week with no contacts yet, not the previous week', () => {
    const w = transformWeeklyContacts(rowsToW34.slice(0, 2), null, WED_W34)
    expect(w.currentWeek).toBe(0)
    expect(w.previousWeek).toBe(130) // W33, the last completed week
  })

  it('compares completed weeks only, so a 3-day week never reads as an 85 percent collapse', () => {
    const w = transformWeeklyContacts(rowsToW34, null, WED_W34)
    // W33 (130) vs W32 (120), both complete. NOT 18 vs 130.
    expect(w.previousWeek).toBe(130)
    expect(w.completedWeekOverWeek).toBeCloseTo(8.33, 1)
  })

  it('matches the prior-year bucket to the last completed week, not the partial one', () => {
    const cmp = [
      { yearWeekIso_created: '2025|33', contact_count: 111 },
      { yearWeekIso_created: '2025|34', contact_count: 99 },
    ] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(rowsToW34, cmp, WED_W34)
    expect(w.priorYearWeek).toBe(111) // W33 vs W33, both full weeks
  })

  it('withholds the completed comparison when there is only one completed week', () => {
    const one = [{ yearWeekIso_created: '2026|33', contact_count: 130 }] as unknown as Record<string, string>[]
    const w = transformWeeklyContacts(one, null, WED_W34)
    expect(w.completedWeekOverWeek).toBeUndefined()
  })
})
