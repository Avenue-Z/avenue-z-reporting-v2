import { describe, it, expect } from 'vitest'
import { buildStages } from './stages'
import type { PipelineData, WeeklyContacts } from '@/lib/salesforce/types'

const totals = { sessions: 89234, activeUsers: 62108, newUsers: 34872, conversions: 1847, bounceRate: 0.384, sessionConversionRate: 0.021 }
const cmpTotals = { sessions: 77300 }
// weekStart values are both in the past relative to the default `buildStages`
// `now` (real current time), so none of these fixtures accidentally trip the
// partial-week drop in the tests below that don't pass a fixed `now`.
const peec = {
  weeklyVisibility: [{ weekStart: '2020-01-06', visibility: 22.1 }, { weekStart: '2020-01-13', visibility: 24.8 }],
  brandRankings: [{ name: 'Competitor', sov: 30, isYou: false }, { name: 'Renaissance', sov: 11.3, isYou: true }],
  trackedPrompts: [{}, {}, {}],
}

describe('buildStages', () => {
  it('always returns four stages in funnel order', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.map(x => x.key)).toEqual(['aeo', 'ga4', 'inbound', 'pipeline'])
  })

  it('marks the two CRM stages unconnected only when the client has no CRM configured', () => {
    const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], crmConnected: false })
    const crm = s.filter(x => x.key === 'inbound' || x.key === 'pipeline')
    expect(crm).toHaveLength(2)
    for (const stage of crm) {
      expect(stage.connected).toBe(false)
      // The null glyph, not undefined: the stub these replace hardcoded no
      // metric at all, but the populated card always writes one and it is the
      // glyph with no data. Nothing reads it in this branch anyway, since
      // demand-journey.tsx:128 renders the unconnected treatment instead. What
      // matters is that no FIGURE is published.
      expect(stage.metric).toBe('—')
      expect(stage.delta).toBeUndefined()
      expect(stage.unconnectedHint).toContain('CRM')
    }
  })

  it('marks the AEO stage unconnected only when the client is NOT configured for AI visibility', () => {
    const s = buildStages({ totals, cmpTotals, peec: null, peecConnected: false, trendRows: [] })
    expect(s.find(x => x.key === 'aeo')?.connected).toBe(false)
  })

  it('keeps the AEO stage connected (dashes, never "not connected") when configured but the fetch failed or returned empty', () => {
    // A configured client whose AI-visibility fetch rejected must not be told
    // to connect a source that is already connected. It dashes like the GA4
    // hero card on a GA4 outage. This is the outage-vs-not-configured
    // distinction, the same one the charts already make with LoadFailed.
    const aeo = buildStages({ totals, cmpTotals, peec: null, peecConnected: true, trendRows: [] })
      .find(x => x.key === 'aeo')!
    expect(aeo.connected).not.toBe(false) // takes the metric branch, not "Not connected"
    expect(aeo.metric).toBe('—')          // dashes rather than claiming a value
  })

  it('gives the unconnected AEO stage an AI-visibility hint, never CRM wording', () => {
    // A Peec outage or an unconfigured Peec project must never tell the
    // reader to connect a CRM, which names the wrong data source.
    const s = buildStages({ totals, cmpTotals, peec: null, trendRows: [] })
    expect(s.find(x => x.key === 'aeo')?.unconnectedHint).not.toContain('CRM')
  })

  it('never marks the GA4 or AEO stages unconnected', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.find(x => x.key === 'ga4')?.connected).not.toBe(false)
    expect(s.find(x => x.key === 'aeo')?.connected).not.toBe(false)
  })

  it('reads AI visibility from the latest week and the delta from the prior one', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    const aeo = s.find(x => x.key === 'aeo')!
    expect(aeo.metric).toBe('24.8%')
    expect(aeo.delta).toBeCloseTo(12.2, 0)
  })

  it('finds share of voice by the isYou flag, not by brand name', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.find(x => x.key === 'aeo')?.subMetric).toContain('11.3%')
  })

  // Paul CR3 (207) finding: the AEO card badged "YTD" over a hero metric that
  // is actually the last complete week (see the partial-week tests below),
  // and every card's delta caption hardcoded "vs prior period" even though
  // the AEO delta compares two complete weeks, not a 30-day period.
  it('badges the AEO stage with its real hero window, never YTD', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    const aeo = s.find(x => x.key === 'aeo')!
    expect(aeo.badge).not.toBe('YTD')
    expect(aeo.badge).toBe('LAST FULL WEEK')
  })

  it('gives the AEO stage its own delta label, "vs prior week", not the default', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.find(x => x.key === 'aeo')?.deltaLabel).toBe('vs prior week')
  })

  it('leaves the GA4 stage without a deltaLabel override, so it falls back to "vs prior period"', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.find(x => x.key === 'ga4')?.deltaLabel).toBeUndefined()
  })

  it('gives the year-to-date share-of-voice subMetric its own time qualifier, since the hero is last-full-week', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    const subMetric = s.find(x => x.key === 'aeo')?.subMetric ?? ''
    expect(subMetric).toContain('11.3%')
    expect(subMetric.toLowerCase()).toContain('year to date')
  })

  it('leaves share of voice out when no brand is flagged isYou', () => {
    const noMatch = { ...peec, brandRankings: [{ name: 'Competitor', sov: 30, isYou: false }] }
    const s = buildStages({ totals, cmpTotals, peec: noMatch, trendRows: [] })
    expect(s.find(x => x.key === 'aeo')?.subMetric).toBeUndefined()
  })

  it('degrades to a dash when GA4 failed, rather than claiming zero', () => {
    const s = buildStages({ totals: null, cmpTotals: null, peec, trendRows: [] })
    expect(s.find(x => x.key === 'ga4')?.metric).toBe('—')
  })

  it('still returns four stages when every source failed', () => {
    const s = buildStages({ totals: null, cmpTotals: null, peec: null, trendRows: [] })
    expect(s).toHaveLength(4)
  })

  it('a failed totals query yields no delta, not minus one hundred percent', () => {
    const s = buildStages({ totals: null, cmpTotals, peec, trendRows: [] })
    expect(s.find(x => x.key === 'ga4')?.delta).toBeUndefined()
  })
})

// Wednesday. Its ISO week (Monday-start, UTC) is 2026-08-17.
const NOW = new Date('2026-08-19T12:00:00Z')

describe('buildStages: AI Visibility partial-week handling', () => {
  it('drops the last bucket when it is the current, still-accumulating week, for both the hero metric and the delta', () => {
    const peecData = {
      weeklyVisibility: [
        { weekStart: '2026-08-03', visibility: 20.0 },
        { weekStart: '2026-08-10', visibility: 22.1 },
        { weekStart: '2026-08-17', visibility: 5.0 }, // partial: only 2 days of the current week so far
      ],
      brandRankings: [],
      trackedPrompts: [],
    }
    const s = buildStages({ totals, cmpTotals, peec: peecData, trendRows: [], now: NOW })
    const aeo = s.find(x => x.key === 'aeo')!
    // Hero comes from the last COMPLETE week (Aug 10), not the partial Aug 17 bucket.
    expect(aeo.metric).toBe('22.1%')
    // Delta compares the two complete weeks (22.1 vs 20.0), not the partial vs a full week.
    expect(aeo.delta).toBeCloseTo(10.5, 1)
  })

  it('does nothing when the last bucket is not the current week (Peec already excludes it)', () => {
    const peecData = {
      weeklyVisibility: [
        { weekStart: '2026-08-03', visibility: 20.0 },
        { weekStart: '2026-08-10', visibility: 22.1 },
      ],
      brandRankings: [],
      trackedPrompts: [],
    }
    const s = buildStages({ totals, cmpTotals, peec: peecData, trendRows: [], now: NOW })
    const aeo = s.find(x => x.key === 'aeo')!
    expect(aeo.metric).toBe('22.1%')
    expect(aeo.delta).toBeCloseTo(10.5, 1)
  })

  it('falls back to no delta, not a crash, when only one complete week remains after dropping the partial one', () => {
    const peecData = {
      weeklyVisibility: [
        { weekStart: '2026-08-10', visibility: 22.1 },
        { weekStart: '2026-08-17', visibility: 5.0 }, // partial, dropped
      ],
      brandRankings: [],
      trackedPrompts: [],
    }
    const s = buildStages({ totals, cmpTotals, peec: peecData, trendRows: [], now: NOW })
    const aeo = s.find(x => x.key === 'aeo')!
    expect(aeo.metric).toBe('22.1%')
    expect(aeo.delta).toBeUndefined()
  })
})

describe('buildStages: AI Visibility brand resolution', () => {
  // Paul CR4 (207) finding: peecConfigured gates only on peecCustomerProjectId,
  // but the visibility number also needs peecYourBrand to identify which brand
  // is "you". With the brand unresolved, filterYou in lib/peec/client.ts keeps
  // EVERY tracked brand, so weeklyVisibility becomes an all-brands average that
  // the hero card presented as the client's own visibility rate. Share of Voice
  // already dashed in that state (isYou is false for every brand), so the card
  // contradicted itself.
  it('dashes the AI Visibility hero when Peec could not resolve which brand is the client', () => {
    const unresolved = { ...peec, yourBrandResolved: false }
    const aeo = buildStages({ totals, cmpTotals, peec: unresolved, trendRows: [] })[0]
    expect(aeo.metric).toBe('—')
    expect(aeo.delta).toBeUndefined()
  })

  it('still reads as connected when the brand is unresolved, since the project IS configured', () => {
    const unresolved = { ...peec, yourBrandResolved: false }
    const aeo = buildStages({ totals, cmpTotals, peec: unresolved, trendRows: [], peecConnected: true })[0]
    expect(aeo.connected).toBe(true)
  })

  it('renders the visibility number when the brand did resolve', () => {
    const aeo = buildStages({ totals, cmpTotals, peec: { ...peec, yourBrandResolved: true }, trendRows: [] })[0]
    expect(aeo.metric).toBe('24.8%')
  })
})

const pipelineFixture: PipelineData = {
  openDeals:        { value: 297 },
  totalPipeline:    { value: 4_820_000 },
  closedWon:        { value: 1_375_000, delta: 15.7 },
  weightedPipeline: { value: 2_140_000 },
  byOwner: [{ owner: 'Dana Reyes', count: 41, amount: 900_000 }],
  ownersTruncated: false,
  stageTruncated: false,
  unrecognizedClosedFlags: 0,
  wonStageUnmatched: false,
  openUnavailable: false,
  wonUnavailable: false,
  campaignScoped: false,
  openCampaignUnmatched: false,
  wonCampaignUnmatched: false,
}

const contactsFixture: WeeklyContacts = {
  weeks: [
    { week: '2026-W31', contacts: 240 },
    { week: '2026-W32', contacts: 186 },
    { week: '2026-W33', contacts: 52 },
  ],
  currentWeek: 52,
  currentWeekPartial: true,
  daysElapsedInCurrentWeek: 3,
  campaignUnmatched: false,
  previousWeek: 186,
  priorYearWeek: 149,
  completedWeekOverWeek: -22.5,
}

describe('CRM stages, populated', () => {
  it('populates the inbound card from contacts, with a hero label and a week-to-date badge', () => {
    const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], contacts: contactsFixture, crmConnected: true })
    const inbound = s.find(x => x.key === 'inbound')!
    expect(inbound.metric).toBe('52')
    expect(inbound.badge).toBe('WEEK TO DATE')
    expect(inbound.subMetric).toBe('3 of 7 days so far')
    // The shipped stub carried NO heroLabel, so "retained" would ship a blank
    // hover reveal. It has to be written out.
    expect(inbound.heroLabel).toBeTruthy()
    expect(inbound.connected).toBeUndefined()
    // Partial week against a complete one is structurally invalid.
    expect(inbound.delta).toBeUndefined()
  })

  it('populates the pipeline card from pipeline, with an as-of-today badge', () => {
    const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], pipeline: pipelineFixture, crmConnected: true })
    const p = s.find(x => x.key === 'pipeline')!
    expect(p.metric).toBe('$4,820,000')
    expect(p.badge).toBe('AS OF TODAY')
    expect(p.subMetric).toBe('297 open deals')
    expect(p.heroLabel).toBeTruthy()
    expect(p.delta).toBeUndefined()
    expect(p.connector).toBeUndefined()   // last stage in the row
  })

  it('dashes the inbound Previous Week stat when no completed week exists', () => {
    const s = buildStages({
      totals, cmpTotals, peec, peecConnected: true, trendRows: [], crmConnected: true,
      contacts: { ...contactsFixture, weeks: [{ week: '2026-W01', contacts: 12 }], previousWeek: 0, completedWeekOverWeek: undefined, priorYearWeek: undefined },
    })
    const stat = s.find(x => x.key === 'inbound')!.stats!.find(st => st.label === 'Previous Week')!
    expect(stat.value).toBe('—')
  })

  it('dashes the inbound hero when the contacts fetch succeeded but returned no weeks', () => {
    // transformWeeklyContacts returns a non-null object with weeks: [] and
    // currentWeek: 0 when the CRM yields zero usable contact rows for the year.
    // Gating on `contacts` alone headlines a confident 0 under a WEEK TO DATE
    // badge, while ContactPacing renders <NoData /> for that same input
    // (contact-pacing.tsx:25). The card must not claim a figure the block
    // beside it refuses to claim.
    const s = buildStages({
      totals, cmpTotals, peec, peecConnected: true, trendRows: [], crmConnected: true,
      contacts: { ...contactsFixture, weeks: [], currentWeek: 0, previousWeek: 0, completedWeekOverWeek: undefined, priorYearWeek: undefined },
    })
    const inbound = s.find(x => x.key === 'inbound')!
    expect(inbound.metric).toBe('—')
    expect(inbound.badge).toBeUndefined()
    expect(inbound.subMetric).toBeUndefined()
    expect(inbound.heroLabel).toBeUndefined()
    // Configured, so this is the dashed state, not the unconnected treatment.
    expect(inbound.connected).toBeUndefined()
  })

  it('dashes the pipeline card\'s Closed Won stat under wonUnavailable and under wonStageUnmatched', () => {
    // Two explicit fixtures rather than a computed key: a computed property in
    // an object literal widens to `string`, so the spread would stop
    // typechecking against PipelineData.
    const degraded: PipelineData[] = [
      { ...pipelineFixture, closedWon: { value: 0, delta: -100 }, wonUnavailable: true },
      { ...pipelineFixture, closedWon: { value: 0, delta: -100 }, wonStageUnmatched: true },
    ]
    for (const pipeline of degraded) {
      const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], crmConnected: true, pipeline })
      const stat = s.find(x => x.key === 'pipeline')!.stats!.find(st => st.label === 'Closed Won')!
      expect(stat.value).toBe('—')
    }
  })

  it('does not state a deal count beside a dashed metric', () => {
    const s = buildStages({
      totals, cmpTotals, peec, peecConnected: true, trendRows: [], crmConnected: true,
      pipeline: { ...pipelineFixture, openDeals: { value: 0 }, totalPipeline: { value: 0 }, weightedPipeline: { value: 0 }, openUnavailable: true },
    })
    const p = s.find(x => x.key === 'pipeline')!
    expect(p.metric).toBe('—')
    expect(p.subMetric).toBe("Couldn't load open pipeline.")
  })
})

describe('CRM stages, crmConnected decides the unconnected treatment', () => {
  it('configured with no data dashes the cards rather than saying "not connected"', () => {
    // This is the case that would otherwise contradict the block below it on
    // the same screen, which renders "Couldn't load contact data."
    const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], crmConnected: true })
    for (const stage of s.filter(x => x.key === 'inbound' || x.key === 'pipeline')) {
      expect(stage.connected).toBeUndefined()
      expect(stage.metric).toBe('—')
    }
  })

  it('falls back to data presence when crmConnected is omitted, for older callers', () => {
    // crmConnected omitted on purpose here; peecConnected still supplied, per
    // the spec's section 2 drift row 4.
    const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [] })
    expect(s.find(x => x.key === 'inbound')?.connected).toBe(false)

    const withData = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], contacts: contactsFixture })
    expect(withData.find(x => x.key === 'inbound')?.connected).toBeUndefined()
  })

  it('keeps the CRM-specific hint on both stubs in every branch', () => {
    for (const input of [
      { crmConnected: false },
      { crmConnected: true },
      { crmConnected: true, contacts: contactsFixture, pipeline: pipelineFixture },
    ]) {
      const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], ...input })
      for (const stage of s.filter(x => x.key === 'inbound' || x.key === 'pipeline')) {
        expect(stage.unconnectedHint).toBe('Connect your CRM to see this')
      }
    }
  })
})

/**
 * The reviewed defect: the funnel read openUnavailable and wonStageUnmatched but
 * ignored campaignUnmatched entirely, so it rendered a confident $0 and "0 open
 * deals" directly above a Pipeline Performance block saying those totals could
 * not be trusted.
 */
describe('the pipeline card honours the campaign-scope flags', () => {
  const stage = (pipeline: PipelineData) =>
    buildStages({ totals, cmpTotals, peec, trendRows: [], pipeline, crmConnected: true })
      .find((s) => s.key === 'pipeline')!

  it('dashes the hero and names the cause when the open window matched no campaign', () => {
    const s = stage({
      ...pipelineFixture,
      campaignScoped: true, openCampaignUnmatched: true,
      openDeals: { value: 0 }, totalPipeline: { value: 0 }, weightedPipeline: { value: 0 },
    })
    expect(s.metric).toBe('—')
    // Never "0 open deals": that is the confident zero this flag exists to stop.
    expect(s.subMetric).toBe('No open deals on the agency-sourced campaigns.')
    expect(s.stats?.find((x) => x.label === 'Weighted Pipeline')?.value).toBe('—')
  })

  it('dashes only the Closed Won stat when just the closed-won window matched no campaign', () => {
    // The newly-scoped-client case: real open pipeline, no close yet. The hero
    // must stay live, which is exactly what a single OR-ed flag destroyed.
    const s = stage({
      ...pipelineFixture,
      campaignScoped: true, wonCampaignUnmatched: true,
      closedWon: { value: 0 },
    })
    expect(s.metric).toBe('$4,820,000')
    expect(s.subMetric).toBe('297 open deals')
    expect(s.stats?.find((x) => x.label === 'Closed Won')?.value).toBe('—')
    expect(s.stats?.find((x) => x.label === 'Weighted Pipeline')?.value).toBe('$2,140,000')
  })

  it('leaves every figure live when both windows matched normally', () => {
    const s = stage({ ...pipelineFixture, campaignScoped: true })
    expect(s.metric).toBe('$4,820,000')
    expect(s.stats?.find((x) => x.label === 'Closed Won')?.value).toBe('$1,375,000')
  })
})

/** The inbound card must name the object it is actually counting. index.tsx
 *  switches its section heading to "Lead Creation" on the same predicate, so a
 *  hardcoded "Online Contacts" put the two in contradiction on one screen. */
describe('the inbound card names leads or contacts by scope', () => {
  const inbound = (crmScoped: boolean) =>
    buildStages({ totals, cmpTotals, peec, trendRows: [], contacts: contactsFixture, crmConnected: true, crmScoped })
      .find((s) => s.key === 'inbound')!

  it('says leads for a campaign-scoped client', () => {
    expect(inbound(true).label).toBe('Online Leads')
    expect(inbound(true).heroLabel).toBe('new leads created so far this week')
  })

  it('keeps contacts for a whole-org client, and defaults to contacts when the flag is omitted', () => {
    expect(inbound(false).label).toBe('Online Contacts')
    expect(inbound(false).heroLabel).toBe('new contacts created so far this week')
    const dflt = buildStages({ totals, cmpTotals, peec, trendRows: [], contacts: contactsFixture, crmConnected: true })
      .find((s) => s.key === 'inbound')!
    expect(dflt.label).toBe('Online Contacts')
  })
})
