import { describe, it, expect } from 'vitest'
import { filterByCampaign, hasCampaignScope } from './campaign-filter'

const row = (campaign: string, n = 1) =>
  ({ campaign_name: campaign, opportunity_count: n }) as unknown as Record<string, string>

// The live scope for Renaissance: three sibling campaigns under one prefix.
// Confirmed against the Campaigns report type on 2026-08-31 — these are the only
// campaigns in the org whose name mentions prospecting.
const PARENT = '2026 - Inbound Prospecting'
const BROKERS = '2026 - Inbound Prospecting - Brokers'
const EMPLOYERS = '2026 - Inbound Prospecting - Employers'
const NAMES = [PARENT, BROKERS, EMPLOYERS]

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
      [row(PARENT), row('Napa Golf Outing'), row(EMPLOYERS), row(BROKERS)],
      NAMES,
    )
    expect(r.rows.map((x) => x.campaign_name)).toEqual([PARENT, EMPLOYERS, BROKERS])
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
    // All three siblings are in scope, and each is named individually in the config.
    // This is what makes that necessary: given a config that names only the parent,
    // the '- Brokers' sibling is not pulled in. A startsWith/includes match would
    // agree with the three-name config today and then silently widen client-facing
    // numbers the moment somebody creates a fourth sibling nobody reviewed.
    const r = filterByCampaign([row(BROKERS)], [PARENT])
    expect(r.rows).toEqual([])
    expect(r.unmatched).toBe(true)
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

  /**
   * A capped response cannot support the rename accusation, because the rows we
   * never saw could be the in-scope ones. Without this, exactly 500 out-of-scope
   * rows raise `unmatched` AND the caller's truncation flag together, and the UI
   * pushes the campaign caveat first — so the page leads with "the campaigns may
   * have been renamed" and buries the one true sentence, "hit the row limit",
   * underneath it.
   */
  it('does not flag unmatched when the row set was truncated', () => {
    const r = filterByCampaign([row('Napa Golf Outing')], NAMES, true)
    expect(r.rows).toEqual([])
    expect(r.active).toBe(true)
    expect(r.unmatched).toBe(false)
  })

  it('still filters and reports normally on a truncated set that DID match', () => {
    // Truncation only suppresses the accusation. It must not suppress the filter,
    // or a capped response would quietly widen the numbers back to whole-org.
    const r = filterByCampaign([row(PARENT), row('Napa Golf Outing')], NAMES, true)
    expect(r.rows.map((x) => x.campaign_name)).toEqual([PARENT])
    expect(r.unmatched).toBe(false)
  })

  it('defaults to treating the response as complete', () => {
    // The parameter is opt-in, so a caller that forgets it gets today's behaviour
    // rather than a silently disabled flag.
    expect(filterByCampaign([row('Napa Golf Outing')], NAMES).unmatched).toBe(true)
  })
})

/**
 * The UI predicate. It exists because index.tsx had its own — `campaignNames
 * ?.length > 0` — which disagrees with the match set filterByCampaign actually
 * builds. These tests exist mainly to pin that the two never diverge again.
 */
describe('hasCampaignScope', () => {
  it('is false for no config at all', () => {
    expect(hasCampaignScope(undefined)).toBe(false)
    expect(hasCampaignScope([])).toBe(false)
  })

  it('is false for names that normalize away, which a bare length check gets wrong', () => {
    // [' '] has length 1. A length check calls this scoped, prints "Scoped to
    // agency-sourced campaigns." and switches the inbound block to the leads
    // series, all over whole-org data that no filter touched.
    for (const names of [[' '], [''], ['', '   ']]) {
      expect(hasCampaignScope(names)).toBe(false)
      expect(filterByCampaign([row('Napa Golf Outing')], names).active).toBe(false)
    }
  })

  it('is true for a real name, with or without surrounding whitespace', () => {
    expect(hasCampaignScope([PARENT])).toBe(true)
    expect(hasCampaignScope(['  ', PARENT])).toBe(true)
    expect(hasCampaignScope([`  ${PARENT}  `])).toBe(true)
  })

  it('agrees with filterByCampaign.active on every input, which is the whole point', () => {
    const inputs: (string[] | undefined)[] = [
      undefined, [], [''], [' '], ['', ' '], [PARENT], ['  ', PARENT], [`  ${PARENT}  `], NAMES,
    ]
    for (const names of inputs) {
      expect(hasCampaignScope(names)).toBe(filterByCampaign([row('anything')], names).active)
    }
  })
})
