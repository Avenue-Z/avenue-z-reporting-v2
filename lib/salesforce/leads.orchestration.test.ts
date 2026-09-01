import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest'

// Same pattern (and same reasons) as pipeline.orchestration.test.ts: leads.ts
// imports ./base, which reaches lib/db and next-auth, and it reads the client
// directly for salesforceConfig.campaignNames. Kept out of leads.test.ts so
// these mocks never touch the pure dedupeLeadWeeks tests.
vi.mock('@/lib/salesforce/base', () => ({ salesforceQuery: vi.fn(), resolveCompareIso: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
// cached() calls Next's unstable_cache, which throws outside a request context.
// A pass-through is what CACHE_DISABLE=1 does in production, so the code under
// test is unchanged; only the cache shell is removed.
//
// The pass-through also RECORDS which fetchers were wrapped, at import time, so
// the cache boundary itself can be asserted. vi.hoisted because vi.mock is
// hoisted above any ordinary const and would hit its TDZ.
//
// TWO records, ported from pipeline.orchestration.test.ts:26-30, because "a
// wrapper was built" and "the composer goes through it" are different claims
// and only the second is the property that matters. The registry alone cannot
// see the regression it exists to catch: swapping getLeadRows(slug, range) for
// leadRowsImpl(slug, range) in the composer disables caching for the main lead
// query outright, and the `const getLeadRows = cached(...)` line still runs and
// still registers, so every test in this file stayed green. The structural
// change on this branch happened HERE, which is the one file the pattern had
// not reached.
//
// The registry also keeps each wrapper's OPTIONS, so the health severity and
// the negative TTL are pinned rather than inferred.
const { wrapped, cacheCalls } = vi.hoisted(() => ({
  wrapped: {
    names: [] as string[],
    options: [] as Array<{ fn: string; options: Record<string, unknown> }>,
  },
  cacheCalls: [] as string[],
}))
vi.mock('@/lib/cache', () => ({
  cached: (
    _v: string,
    fn: string,
    impl: (...a: unknown[]) => unknown,
    options: Record<string, unknown> = {},
  ) => {
    wrapped.names.push(fn)
    wrapped.options.push({ fn, options })
    // A DISTINCT function, never `impl` itself: the composer calling the impl
    // directly has to be observably different from it calling the wrapper, or
    // no assertion here can tell the two apart. Beyond the record it is a
    // pass-through, which is what CACHE_DISABLE=1 does in production, so the
    // orchestration under test is unchanged.
    return (...args: unknown[]) => {
      cacheCalls.push(fn)
      return impl(...args)
    }
  },
}))

import { salesforceQuery, resolveCompareIso } from '@/lib/salesforce/base'
import { getClientBySlug } from '@/lib/db/queries'
import { getSalesforceWeeklyLeadsImpl, LEAD_FIELDS, LEAD_SETTINGS, LEAD_MAX_ROWS } from './leads'

const NAMES = [
  '2026 - Inbound Prospecting',
  '2026 - Inbound Prospecting - Brokers',
  '2026 - Inbound Prospecting - Employers',
]
const NOW = new Date('2026-08-19T12:00:00Z')

const row = (id: string, week: string, campaign: string) =>
  ({ lead_id: id, yearWeekIso_created: week, campaign_name: campaign, lead_count: 1 }) as unknown as Record<string, string>

const withScope = (campaignNames?: string[]) =>
  ({ salesforceConfig: { salesforceAccountId: '00D', campaignNames } }) as unknown as ReturnType<typeof getClientBySlug>

beforeEach(() => {
  vi.clearAllMocks()
  // Undefined compare window, so these tests exercise the current year only.
  ;(resolveCompareIso as Mock).mockReturnValue(undefined)
})

/**
 * campaignUnmatched has to survive the whole impl, not just dedupeLeadWeeks.
 *
 * This is the regression these tests exist for: dedupeLeadWeeks computed the
 * flag correctly and getSalesforceWeeklyLeadsImpl dropped it on the floor,
 * which no unit test of either piece alone could see. The consequence was a
 * renamed campaign rendering "No data for this period." — a claim the period
 * was empty, when the query in fact returned rows and none were in scope.
 */
describe('getSalesforceWeeklyLeadsImpl — campaignUnmatched reaches the caller', () => {
  it('is true when rows arrived and none were on a configured campaign', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([row('L1', '2026|30', 'Napa Golf Outing')])

    const out = await getSalesforceWeeklyLeadsImpl('renaissance', NOW)

    expect(out.campaignUnmatched).toBe(true)
    // And the series really is empty, which is why the flag is the only thing
    // standing between the reader and a false explanation of that emptiness.
    expect(out.weeks).toEqual([])
  })

  it('is false when rows matched the configured campaigns', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([
      row('L1', '2026|30', NAMES[0]),
      row('L2', '2026|30', NAMES[2]),
    ])

    const out = await getSalesforceWeeklyLeadsImpl('renaissance', NOW)

    expect(out.campaignUnmatched).toBe(false)
    expect(out.weeks.length).toBeGreaterThan(0)
  })

  it('is false for an empty fetch, which is missing data rather than a mismatch', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([])

    const out = await getSalesforceWeeklyLeadsImpl('renaissance', NOW)

    expect(out.campaignUnmatched).toBe(false)
  })

  it('is false when the client configures no campaigns at all', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(undefined))
    ;(salesforceQuery as Mock).mockResolvedValue([row('L1', '2026|30', 'Napa Golf Outing')])

    const out = await getSalesforceWeeklyLeadsImpl('renaissance', NOW)

    expect(out.campaignUnmatched).toBe(false)
  })
})

/**
 * The cap existed as a constant and was compared to nothing. A truncated lead
 * response is a client-facing undercount of the whole weekly series, so it has
 * to reach the reader the way pipeline.ts's stageTruncated does.
 */
describe('getSalesforceWeeklyLeadsImpl — row cap', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => row(`L${i}`, '2026|30', NAMES[0]))

  it('flags truncation when the current-window query returns at least its cap', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue(many(LEAD_MAX_ROWS))

    expect((await getSalesforceWeeklyLeadsImpl('renaissance', NOW)).truncated).toBe(true)
  })

  it('does not flag truncation under the cap', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue(many(3))

    expect((await getSalesforceWeeklyLeadsImpl('renaissance', NOW)).truncated).toBe(false)
  })

  it('judges the cap on the RAW response, not the deduped or campaign-scoped rows', async () => {
    // The trap this guards: dedupe collapses LEAD_MAX_ROWS rows onto a handful
    // of leads and the filter drops most of the rest, so any post-processing
    // count is orders of magnitude under the cap and reports a permanent,
    // meaningless all-clear.
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([
      ...Array.from({ length: LEAD_MAX_ROWS - 1 }, () => row('L1', '2026|30', 'Napa Golf Outing')),
      row('L1', '2026|30', NAMES[0]),
    ])

    const out = await getSalesforceWeeklyLeadsImpl('renaissance', NOW)
    expect(out.truncated).toBe(true)
    // One lead survived dedupe + filter. Its bucket is W30, not the last
    // element: gapFill runs the series through the current week (W34 at NOW).
    expect(out.weeks.find((w) => w.week === '2026-W30')?.contacts).toBe(1)
    expect(out.weeks.reduce((n, w) => n + w.contacts, 0)).toBe(1)
  })
})

/**
 * The other half of the afb76c4 regression, reached a different way: rows that
 * ARE in scope but carry no lead id are dropped, which empties the series while
 * campaignUnmatched stays correctly false. Without a count of its own the block
 * falls through to "No data for this period." and asserts the period was empty.
 */
describe('getSalesforceWeeklyLeadsImpl — id-less rows reach the caller', () => {
  it('reports how many in-scope rows had no lead id', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([
      row('', '2026|30', NAMES[0]),
      row('', '2026|31', NAMES[0]),
    ])

    const out = await getSalesforceWeeklyLeadsImpl('renaissance', NOW)
    expect(out.unusableRows).toBe(2)
    expect(out.campaignUnmatched).toBe(false)
    expect(out.weeks).toEqual([])
  })

  it('reports zero on a healthy fetch', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([row('L1', '2026|30', NAMES[0])])

    expect((await getSalesforceWeeklyLeadsImpl('renaissance', NOW)).unusableRows).toBe(0)
  })
})

/**
 * The static guards in leads.test.ts pin the CONSTANTS; nothing pinned the
 * CALL. Verified by mutation: replacing LEAD_FIELDS at the call site with an
 * inlined ['yearWeekIso_created', 'lead_id', 'lead_count'] and dropping the
 * settings object left the whole suite green at 357/357, because LEAD_FIELDS
 * still contained campaign_name for the constant guard to find and every
 * fixture here supplies campaign_name regardless of what was requested.
 *
 * That is the round-one silent failure exactly: live, the connector would
 * return no campaign column, filterByCampaign would match nothing, and every
 * scoped client would read "no leads matched the agency-sourced campaigns".
 */
describe('getSalesforceWeeklyLeadsImpl \u2014 the query it actually issues', () => {
  it('sends LEAD_FIELDS, LEAD_SETTINGS and LEAD_MAX_ROWS, not an inlined equivalent', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([row('L1', '2026|30', NAMES[0])])

    await getSalesforceWeeklyLeadsImpl('renaissance', NOW)

    // LEAD_SETTINGS rides on this same call and was equally unpinned: the lead
    // window basis is its own connector setting, so losing it silently
    // reinterprets every bucket as last-modified or converted, not created.
    // LEAD_SETTINGS is asserted as a LITERAL, not as the imported constant.
    // Importing it from the module under test pins the call site and nothing
    // else: the assertion holds no matter what the constant says, so changing it
    // to { lead_date_field: 'lead_converted' } left the whole suite green and
    // silently rebased every weekly bucket onto a different date basis. Both
    // siblings already assert the literal — contacts.test.ts:295 and
    // pipeline.orchestration.test.ts:144 — so this was a drift from convention.
    expect(salesforceQuery).toHaveBeenCalledWith(
      'renaissance', LEAD_FIELDS, 'year_to_date',
      { settings: { lead_date_field: 'lead_created' }, maxRows: LEAD_MAX_ROWS },
    )
    // And the constant the call site reads really is that literal, so the two
    // axes are pinned separately rather than by one self-referential assertion.
    expect(LEAD_SETTINGS).toEqual({ lead_date_field: 'lead_created' })
  })

  it('sends the same fields and settings on the compare window', async () => {
    // The prior-year series is scoped and bucketed by the same rules; a compare
    // call that dropped either would compare unlike with unlike.
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([row('L1', '2026|30', NAMES[0])])

    await getSalesforceWeeklyLeadsImpl('renaissance', NOW)

    expect(salesforceQuery).toHaveBeenCalledWith(
      'renaissance', LEAD_FIELDS, '2025-01-01,2025-12-31',
      { settings: { lead_date_field: 'lead_created' }, maxRows: LEAD_MAX_ROWS },
    )
  })
})

/**
 * The cache boundary sits on the RAW query, never on the assembled series.
 *
 * Wrapping the composer stored an already-scoped result under a key that does
 * not include campaignNames, so correcting a renamed campaign left this block
 * repeating "the campaigns may have been renamed" for up to an hour above
 * pipeline tiles that had already corrected — pipeline.ts caches raw rows and
 * scopes outside, and the two blocks share a page. There is no way to clear the
 * entry early: no Salesforce fetcher passes `tags:`, so revalidateTag cannot
 * reach it.
 *
 * Nothing else here would notice a revert. Every test in this file drives the
 * impl directly, and the cache is a pass-through under the mock, so the wrapping
 * is invisible unless it is asserted.
 */
describe('the cache boundary', () => {
  const leadOptions = (fn: string) => wrapped.options.find((o) => o.fn === fn)?.options

  it('wraps the two raw-row queries and NOT the composer', () => {
    // Filtered to this module's own fetchers: leads.ts imports contacts.ts for
    // transformWeeklyContacts, which registers a wrapper of its own at import.
    // 'getSalesforceWeeklyLeads' matches this filter too, which is the point —
    // re-wrapping the composer shows up here rather than passing silently.
    expect(wrapped.names.filter((n) => n.toLowerCase().includes('lead')))
      .toEqual(['leadRows', 'leadRowsCompare'])
  })

  it('routes BOTH queries through their wrappers, not past them into the impl', () => {
    // The claim the registry cannot make. A composer that calls leadRowsImpl
    // directly leaves the registry identical and the query uncached on every
    // render.
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([row('L1', '2026|30', NAMES[0])])
    cacheCalls.length = 0
    return getSalesforceWeeklyLeadsImpl('renaissance', NOW).then(() => {
      expect(cacheCalls.sort()).toEqual(['leadRows', 'leadRowsCompare'])
    })
  })

  it('gives both wrappers a negative TTL, the brake the boundary move took off', () => {
    // While the cached entry was the assembled composite, a persistently failing
    // compare query was caught INSIDE the wrapper, so the call fulfilled with a
    // degraded result and unstable_cache stored it for the hour: one real
    // upstream attempt per hour, by accident. The catch now sits outside, so a
    // rejection stores nothing and the query is re-issued every render, each one
    // paying smQuery's 15s timeout plus retries. pipeline.ts carries this key on
    // all four of its fetchers for exactly this reason.
    for (const fn of ['leadRows', 'leadRowsCompare']) {
      expect(leadOptions(fn)?.negativeTtlSeconds).toBe(60)
      expect(leadOptions(fn)?.negativeTtlSeconds as number).toBeLessThan(3600)
    }
  })

  it('keeps the compare query out of the health verdict, and the current one in it', () => {
    // Losing this would page Slack over a missing year-over-year figure on a
    // page that renders every series it owes: recordFetch moved down with the
    // boundary, and deriveStatus marks a section down if ANY source failed.
    // Its pipeline twin is pinned the same way (pipeline.orchestration.test.ts).
    expect(leadOptions('leadRowsCompare')?.healthCritical).toBe(false)
    // Left undefined (cached() defaults it true) on the query whose failure
    // does take the block down, so a real outage still reports.
    expect(leadOptions('leadRows')?.healthCritical).toBeUndefined()
  })
})

/**
 * A capped response cannot support the rename accusation: the in-scope rows may
 * sit past the cap. Same fix, same reasoning, as the pipeline path.
 */
describe('getSalesforceWeeklyLeadsImpl — truncation outranks the campaign accusation', () => {
  it('does not claim a campaign was renamed when the response was capped', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue(
      Array.from({ length: LEAD_MAX_ROWS }, (_, i) => row(`L${i}`, '2026|30', 'Napa Golf Outing')),
    )

    const out = await getSalesforceWeeklyLeadsImpl('renaissance', NOW)
    expect(out.truncated).toBe(true)
    expect(out.campaignUnmatched).toBe(false)
    // The filter still ran: none of the out-of-scope leads reached the series.
    expect(out.weeks).toEqual([])
  })

  it('still claims it when the same rows arrive under the cap', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([row('L1', '2026|30', 'Napa Golf Outing')])

    const out = await getSalesforceWeeklyLeadsImpl('renaissance', NOW)
    expect(out.truncated).toBe(false)
    expect(out.campaignUnmatched).toBe(true)
  })
})
