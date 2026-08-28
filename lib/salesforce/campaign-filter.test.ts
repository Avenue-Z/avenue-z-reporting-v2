import { describe, it, expect } from 'vitest'
import { filterByCampaign } from './campaign-filter'

const row = (campaign: string, n = 1) =>
  ({ campaign_name: campaign, opportunity_count: n }) as unknown as Record<string, string>

const NAMES = ['2026 - Inbound Prospecting', '2026 - Inbound Prospecting - Employers']

describe('filterByCampaign', () => {
  it('passes every row through when no campaign names are configured', () => {
    const rows = [row('Napa Golf Outing'), row('')]
    for (const names of [undefined, []]) {
      const r = filterByCampaign(rows, names)
      expect(r.rows).toEqual(rows)
      expect(r.unmatched).toBe(false)
      expect(r.active).toBe(false)
    }
  })

  it('keeps only rows whose campaign is one of the configured names', () => {
    const r = filterByCampaign(
      [row('2026 - Inbound Prospecting'), row('Napa Golf Outing'), row('2026 - Inbound Prospecting - Employers')],
      NAMES,
    )
    expect(r.rows.map((x) => x.campaign_name)).toEqual([
      '2026 - Inbound Prospecting',
      '2026 - Inbound Prospecting - Employers',
    ])
    expect(r.active).toBe(true)
    expect(r.unmatched).toBe(false)
  })

  it('drops rows with no campaign, which is 99.7% of this org', () => {
    // Blank campaign is the overwhelming majority of Renaissance's opportunities.
    // They are NOT agency-sourced, so a filter that let them through would report
    // the whole book as ours — the exact overstatement this filter exists to stop.
    expect(filterByCampaign([row(''), row('   ')], NAMES).rows).toEqual([])
  })

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const r = filterByCampaign([row('  2026 - INBOUND PROSPECTING  ')], NAMES)
    expect(r.rows).toHaveLength(1)
  })

  it('does not substring-match: a longer campaign name is a different campaign', () => {
    // '2026 - Inbound Prospecting - Brokers' is a real, separate campaign in this
    // org. Nick scoped the filter to two names; a startsWith/includes match would
    // silently pull in a third and change client-facing numbers.
    expect(filterByCampaign([row('2026 - Inbound Prospecting - Brokers')], NAMES).rows).toEqual([])
  })

  it('flags unmatched when rows arrived but none matched', () => {
    // Distinct from an empty fetch: the query worked and this client genuinely has
    // no opportunities on these campaigns, OR the campaign was renamed in the CRM.
    // Either way the tiles must not render a confident $0 without saying so.
    const r = filterByCampaign([row('Napa Golf Outing')], NAMES)
    expect(r.rows).toEqual([])
    expect(r.unmatched).toBe(true)
  })

  it('does not flag unmatched on an empty input, which is missing data not a mismatch', () => {
    expect(filterByCampaign([], NAMES).unmatched).toBe(false)
  })
})
