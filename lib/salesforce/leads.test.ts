import { describe, it, expect } from 'vitest'
import { dedupeLeadWeeks } from './leads'

const row = (id: string, week: string, campaign: string) =>
  ({ lead_id: id, yearWeekIso_created: week, campaign_name: campaign, lead_count: 1 }) as unknown as Record<string, string>

const NAMES = ['2026 - Inbound Prospecting', '2026 - Inbound Prospecting - Employers']

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
})
