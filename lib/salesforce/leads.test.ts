import { describe, it, expect } from 'vitest'
import { dedupeLeadWeeks, LEAD_FIELDS, LEAD_MAX_ROWS } from './leads'

const row = (id: string, week: string, campaign: string) =>
  ({ lead_id: id, yearWeekIso_created: week, campaign_name: campaign, lead_count: 1 }) as unknown as Record<string, string>

const NAMES = [
  '2026 - Inbound Prospecting',
  '2026 - Inbound Prospecting - Brokers',
  '2026 - Inbound Prospecting - Employers',
]

describe('dedupeLeadWeeks', () => {
  it('counts each lead once even when it belongs to several matching campaigns', () => {
    // Measured on the live org: 363 lead-campaign rows over 222 distinct leads,
    // 141 of them in more than one campaign. Summing lead_count would inflate
    // the chart by ~63%. This is the whole reason lead_id is requested.
    const out = dedupeLeadWeeks(
      [
        row('L1', '2026|10', NAMES[0]),
        row('L1', '2026|10', NAMES[1]),
        row('L2', '2026|10', NAMES[0]),
      ],
      NAMES,
    )
    expect(out.rows).toEqual([{ yearWeekIso_created: '2026|10', contact_count: 2 }])
  })

  it('drops leads that are not on a configured campaign', () => {
    const out = dedupeLeadWeeks([row('L1', '2026|10', 'Napa Golf Outing'), row('L2', '2026|10', NAMES[0])], NAMES)
    expect(out.rows).toEqual([{ yearWeekIso_created: '2026|10', contact_count: 1 }])
  })

  it('keeps weeks separate and preserves the raw pipe-delimited key the transform parses', () => {
    const out = dedupeLeadWeeks([row('L1', '2026|10', NAMES[0]), row('L2', '2026|11', NAMES[0])], NAMES)
    expect(out.rows).toEqual([
      { yearWeekIso_created: '2026|10', contact_count: 1 },
      { yearWeekIso_created: '2026|11', contact_count: 1 },
    ])
  })

  it('attributes a lead to its earliest week when campaigns disagree', () => {
    // A lead cannot be created twice. If two rows carry different weeks the
    // connector split on something we did not ask back; taking the earliest is
    // deterministic, and counting it twice would be wrong outright.
    const out = dedupeLeadWeeks([row('L1', '2026|12', NAMES[0]), row('L1', '2026|09', NAMES[1])], NAMES)
    expect(out.rows).toEqual([{ yearWeekIso_created: '2026|09', contact_count: 1 }])
  })

  it('flags unmatched when rows arrived and none were on a configured campaign', () => {
    const out = dedupeLeadWeeks([row('L1', '2026|10', 'Napa Golf Outing')], NAMES)
    expect(out.rows).toEqual([])
    expect(out.unmatched).toBe(true)
  })

  it('does not flag unmatched on an empty fetch', () => {
    expect(dedupeLeadWeeks([], NAMES).unmatched).toBe(false)
  })

  it('ignores rows with no usable lead id rather than merging them into one lead', () => {
    // Every id-less row would collapse onto the key '' and become a single lead.
    const out = dedupeLeadWeeks([row('', '2026|10', NAMES[0]), row('', '2026|11', NAMES[0])], NAMES)
    expect(out.rows).toEqual([])
  })

  it('COUNTS the id-less rows it drops, so an empty series is not blamed on an empty period', () => {
    // Dropping them is right; dropping them silently reaches the same false
    // explanation campaignUnmatched exists to prevent, by a different route.
    // In-scope rows arrived, so unmatched is correctly false, and without this
    // count the block would say "No data for this period."
    const out = dedupeLeadWeeks([row('', '2026|10', NAMES[0]), row('', '2026|11', NAMES[0])], NAMES)
    expect(out.unmatched).toBe(false)
    expect(out.idlessRows).toBe(2)
  })

  it('reports no id-less rows on a healthy fetch', () => {
    expect(dedupeLeadWeeks([row('L1', '2026|10', NAMES[0])], NAMES).idlessRows).toBe(0)
  })

  it('orders week keys numerically, so an unpadded week 9 beats week 10', () => {
    // The connector does not promise a zero-padded week. Raw string comparison
    // puts '2026|10' before '2026|9' ('1' < '9'), so "earliest wins" picked the
    // LATER week, and the output rows sorted wrong too. contacts.ts pads for
    // exactly this reason; this path has to as well.
    const out = dedupeLeadWeeks([row('L1', '2026|10', NAMES[0]), row('L1', '2026|9', NAMES[1])], NAMES)
    expect(out.rows).toEqual([{ yearWeekIso_created: '2026|9', contact_count: 1 }])
  })

  it('sorts the emitted weeks numerically rather than lexically', () => {
    const out = dedupeLeadWeeks(
      [row('L1', '2026|10', NAMES[0]), row('L2', '2026|9', NAMES[0]), row('L3', '2026|2', NAMES[0])],
      NAMES,
    )
    expect(out.rows.map((r) => r.yearWeekIso_created)).toEqual(['2026|2', '2026|9', '2026|10'])
  })
})

/**
 * Static guards on the query shape. Both of these were silently removable: the
 * suite stayed green with campaign_name dropped from the field list (every
 * fixture supplies it regardless of what was requested) and with LEAD_MAX_ROWS
 * compared to nothing at all.
 */
describe('lead query shape', () => {
  it('requests campaign_name, or there is nothing to scope on', () => {
    // Drop this field and filterByCampaign matches nothing on a live response,
    // which renders as "no leads matched the agency-sourced campaigns" for
    // every scoped client.
    expect(LEAD_FIELDS).toContain('campaign_name')
  })

  it('requests lead_id, or every lead is counted once per campaign it belongs to', () => {
    // Measured live: 363 rows over 222 distinct leads. Without the id the chart
    // overstates by ~63%.
    expect(LEAD_FIELDS).toContain('lead_id')
  })

  it('keeps the cap high enough that a real campaign programme cannot reach it', () => {
    expect(LEAD_MAX_ROWS).toBeGreaterThanOrEqual(20000)
  })
})
