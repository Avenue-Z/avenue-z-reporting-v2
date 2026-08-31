/**
 * Restricts Salesforce rows to the campaigns that represent agency-sourced work.
 *
 * WHY THIS EXISTS. Renaissance's org holds their entire book — 89,654
 * opportunities, ~$172M of open pipeline, most of it renewals their own sales
 * team owns. Without a filter the Executive Overview reports all of it, which
 * reads to a client as "this is what the agency drove". The campaign names are
 * the only attribution signal this CRM actually carries (verified 2026-08-28:
 * `opportunity_lead_source` is populated on 3 of 89,654 records, and no
 * UTM/agency/vendor field is exposed at all), so they are what we filter on.
 *
 * EXACT MATCH, NOT SUBSTRING. The names come from the client contact and are
 * stored per client in `salesforce_config.campaignNames`. Matching is exact
 * (case-insensitive, trimmed) rather than a prefix or `includes`. Renaissance's
 * org carries three sibling campaigns under one prefix — `2026 - Inbound
 * Prospecting`, `2026 - Inbound Prospecting - Brokers` and `2026 - Inbound
 * Prospecting - Employers` — and all three are scoped in. Verified against the
 * Campaigns report type 2026-08-31: those three are the only campaigns in the
 * org whose name mentions prospecting. Listing them individually is the point.
 * A prefix match would reach the same answer today and then silently swallow
 * the fourth sibling somebody creates next quarter. Widening the scope stays a
 * config edit somebody made on purpose.
 *
 * NO SERVER-SIDE FILTER. Deliberate, and consistent with `salesforceQuery`,
 * which takes no `filters` parameter: a typo'd filter field returns HTTP 200
 * with empty data, indistinguishable from a legitimate zero. Filtering here
 * means a mistake fails a test instead of silently zeroing a client's report.
 * The cost is row cardinality, and it was measured before this was chosen:
 * adding `campaign_name` to the stage query takes it from 31 rows to 92,
 * against a 500-row cap. There is no volume argument for the risky option.
 */

/** A row set narrowed to the configured campaigns, plus what the UI must say about it. */
export interface CampaignFilterResult {
  rows: Record<string, string>[]
  /** True when a filter was actually applied, so the UI can label the numbers as scoped. */
  active: boolean
  /**
   * True when rows arrived and NONE matched the configured campaigns.
   *
   * Parallel to `wonStageUnmatched` in pipeline.ts, and it carries the same
   * risk: the totals collapse to 0, which is indistinguishable from "this
   * client has no agency-sourced pipeline" unless the UI reads this flag and
   * says so. It most likely means a campaign was renamed in the CRM. False for
   * an empty input, which is missing data — a different problem with a
   * different message.
   */
  unmatched: boolean
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase()
}

/**
 * Keeps only rows whose `campaign_name` is one of `names`.
 *
 * An absent or empty `names` applies no filter at all and reports
 * `active: false`, which is the pre-existing whole-org behaviour every client
 * without a configured campaign list keeps.
 *
 * Rows with a blank campaign are dropped whenever a filter IS active. That is
 * the majority of this org (89,425 of 89,654 opportunities carry no campaign),
 * and none of them are agency-sourced, so admitting them would reinstate the
 * overstatement wholesale.
 */
export function filterByCampaign(
  rows: Record<string, string>[],
  names: string[] | undefined,
): CampaignFilterResult {
  const wanted = new Set((names ?? []).map(norm).filter((n) => n !== ''))
  if (wanted.size === 0) return { rows, active: false, unmatched: false }
  const kept = rows.filter((r) => wanted.has(norm(r.campaign_name)))
  return { rows: kept, active: true, unmatched: rows.length > 0 && kept.length === 0 }
}
