import { salesforceQuery, resolveCompareIso } from './base'
import { filterByCampaign } from './campaign-filter'
import { transformWeeklyContacts } from './contacts'
import { getClientBySlug } from '@/lib/db/queries'
import { cached } from '@/lib/cache'
import { byClient } from '@/lib/perf'
import type { WeeklyContacts } from './types'

/**
 * Weekly AGENCY-SOURCED lead volume, for clients whose CRM also holds business
 * the agency did not source.
 *
 * WHY LEADS RATHER THAN CONTACTS. contacts.ts counts `contact_count`, which
 * cannot be scoped: dimensioning contacts by `campaign_name` is rejected by the
 * connector outright (HTTP 400, verified 2026-08-28). Leads are the only inbound
 * object that carries a campaign, so a campaign-scoped inbound metric has to be
 * built on them. Whole-org clients keep the contacts path unchanged.
 *
 * WHY LEAD_ID IS REQUESTED. Leads are many-to-many with campaigns, unlike
 * opportunities, which carry a single primary campaign. Measured live on this
 * org: 363 lead-campaign rows across 222 DISTINCT leads, with 141 leads in more
 * than one campaign. Summing `lead_count` over the returned rows therefore
 * overcounts by roughly 63%, silently. `lead_id` is the only way to count each
 * lead once, so it is a dimension here and `dedupeLeadWeeks` is what collapses it.
 */
export const LEAD_FIELDS = ['yearWeekIso_created', 'lead_id', 'campaign_name', 'lead_count']

/**
 * One row per lead per campaign, so the cap has to clear leads x campaigns
 * rather than weeks. Scoped clients return tens of rows (73 for the live client
 * on 2026-08-28); this leaves room for a campaign programme two orders of
 * magnitude larger before truncation is even conceivable.
 */
export const LEAD_MAX_ROWS = 20000

/** Pinned explicitly, never left on the connector default: the lead window basis
 *  is its own setting, and a default change would silently reinterpret every
 *  bucket as last-modified or converted instead of created. */
const LEAD_SETTINGS = { lead_date_field: 'lead_created' }

/** What `dedupeLeadWeeks` hands back: rows shaped exactly like the contacts
 *  query's output, so the already-tested weekly transform can consume them. */
export interface DedupedLeadWeeks {
  rows: Record<string, string>[]
  /** Rows arrived, none were on a configured campaign. See CampaignFilterResult.unmatched. */
  unmatched: boolean
  /**
   * How many IN-SCOPE rows were dropped for carrying no lead id.
   *
   * They have to be dropped (see the loop below), but dropping them silently
   * reaches the same false explanation `unmatched` exists to prevent, by a
   * different route: if every in-scope row is id-less the series is empty and
   * the block claims the PERIOD was empty when the query in fact returned rows.
   * Surfaced so the UI can say what actually happened.
   */
  idlessRows: number
}

/**
 * Ordering key for a raw 'YYYY|WW' week.
 *
 * The raw keys are NOT safely comparable as strings: the connector does not
 * promise a zero-padded week, and '2026|10' < '2026|9' lexically, so week 10
 * would win an "earliest wins" comparison against week 9. Pad before comparing.
 * The RAW key is still what gets emitted — contacts.ts's normalizeWeek is what
 * parses it downstream — this is only the ordering key.
 */
function weekOrder(raw: string): string {
  const [year, week] = String(raw).split('|')
  return `${year}-${String(week ?? '').padStart(2, '0')}`
}

/**
 * Scopes lead rows to the configured campaigns, counts each `lead_id` ONCE, and
 * re-emits them in the contacts query's shape (`yearWeekIso_created` +
 * `contact_count`) so `transformWeeklyContacts` can bucket, gap-fill and compare
 * them with no duplicated logic.
 *
 * The raw `YYYY|WW` key is preserved rather than normalized, because that is
 * what the downstream transform parses.
 */
export function dedupeLeadWeeks(
  rows: Record<string, string>[],
  campaignNames: string[] | undefined,
): DedupedLeadWeeks {
  const scoped = filterByCampaign(rows, campaignNames)
  // Earliest week wins. A lead has one creation date, so two different weeks for
  // one id means the connector split on a dimension we did not request back;
  // picking deterministically beats counting the lead twice.
  const weekByLead = new Map<string, string>()
  let idlessRows = 0
  for (const r of scoped.rows) {
    const id = String(r.lead_id ?? '').trim()
    // An id-less row cannot be deduped. Admitting it would collapse every such
    // row onto one key and report them all as a single lead. Counted rather than
    // dropped silently: see DedupedLeadWeeks.idlessRows.
    if (id === '') { idlessRows++; continue }
    const week = String(r.yearWeekIso_created ?? '')
    const seen = weekByLead.get(id)
    if (seen === undefined || weekOrder(week) < weekOrder(seen)) weekByLead.set(id, week)
  }
  const counts = new Map<string, number>()
  for (const week of weekByLead.values()) counts.set(week, (counts.get(week) ?? 0) + 1)
  return {
    rows: [...counts.entries()]
      // Same padded key as the earliest-wins comparison above, and for the same
      // reason: raw '2026|9' would sort after '2026|10'.
      .sort(([a], [b]) => (weekOrder(a) < weekOrder(b) ? -1 : weekOrder(a) > weekOrder(b) ? 1 : 0))
      .map(([week, n]) => ({ yearWeekIso_created: week, contact_count: n }) as unknown as Record<string, string>),
    unmatched: scoped.unmatched,
    idlessRows,
  }
}

/**
 * Year-to-date agency-sourced leads by ISO week, plus the same window last year.
 * The compare query degrading costs the prior-year figure, not the block, the
 * same contract getSalesforceWeeklyContactsImpl has.
 */
export async function getSalesforceWeeklyLeadsImpl(slug: string, now: Date = new Date()): Promise<WeeklyContacts> {
  const dateRange = 'year_to_date'
  const cmpIso = resolveCompareIso(dateRange, 'previous_year')
  const client = await getClientBySlug(slug)
  const campaignNames = client?.salesforceConfig?.campaignNames
  const [rows, cmpRows] = await Promise.all([
    salesforceQuery(slug, LEAD_FIELDS, dateRange, { settings: LEAD_SETTINGS, maxRows: LEAD_MAX_ROWS }),
    cmpIso
      ? salesforceQuery(slug, LEAD_FIELDS, cmpIso, { settings: LEAD_SETTINGS, maxRows: LEAD_MAX_ROWS }).catch((e) => {
          console.error(`[salesforce] leads compare fetch failed for ${slug}:`, e)
          return null
        })
      : Promise.resolve(null),
  ])
  const cur = dedupeLeadWeeks(rows, campaignNames)
  const cmp = cmpRows ? dedupeLeadWeeks(cmpRows, campaignNames) : null
  // cur.unmatched, not cmp's: the compare window matching nothing is an ordinary
  // empty prior-year baseline, the same call pipeline.ts makes for wonPrior.
  return {
    ...transformWeeklyContacts(cur.rows, cmp?.rows ?? null, now, cur.unmatched),
    // Judged on the RAW response length, before dedupe and before the campaign
    // filter, exactly as pipeline.ts judges stageTruncated: the cap applies to
    // what the API returned, and rows we never saw could have been in scope.
    // Counting the deduped or scoped rows instead would compare a handful of
    // leads against a 20,000-row cap and report a permanent, meaningless
    // all-clear. Only the CURRENT window: a truncated prior year costs one
    // comparison figure, not the series the reader is looking at.
    truncated: rows.length >= LEAD_MAX_ROWS,
    unusableRows: cur.idlessRows,
  }
}

// Cached on the same 1-hour TTL and for the same reason as the contacts fetcher
// it stands in for: two Supermetrics queries per render, either of which can take
// the async schedule/poll path, is too much live-render latency for a
// client-facing page. Wrapping also routes this through recordFetch so an outage
// reaches the health probe.
export const getSalesforceWeeklyLeads = cached(
  'salesforce', 'getSalesforceWeeklyLeads', getSalesforceWeeklyLeadsImpl, { extractTags: byClient },
)
