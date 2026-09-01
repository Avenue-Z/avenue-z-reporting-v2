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
 * WHY LEAD_ID IS REQUESTED — AND WHAT IT IS AND IS NOT BUYING US TODAY.
 *
 * Leads are many-to-many with campaigns, unlike opportunities, which carry a
 * single primary campaign, so `lead_count` summed over the returned rows can
 * double-count a lead that sits in two campaigns. `lead_id` is the only way to
 * count each lead once, and `dedupeLeadWeeks` is what collapses it.
 *
 * The magnitude, re-measured live 2026-08-31, because an earlier version of this
 * comment cited "363 rows across 222 distinct leads, roughly 63% overcount" and
 * that figure does not reproduce at any window:
 *
 *   | Window                              | Rows   | Distinct | Multi-campaign | Inflation |
 *   |-------------------------------------|--------|----------|----------------|-----------|
 *   | 2026 year to date (what this queries)|     88 |       88 |              0 |      0.0% |
 *   | 2025 year to date (compare window)  |      6 |        6 |              0 |      0.0% |
 *   | Org-wide, 2017 to 2035              | 19,002 |   18,861 |            141 |      0.7% |
 *
 * So in the window this function actually uses there is no duplication at all,
 * and `dedupeLeadWeeks` currently changes nothing. It stays as DEFENSIVE code:
 * the many-to-many shape is real (141 org-wide leads do sit in more than one
 * campaign), a scoped client's campaign programme can grow into it, and the
 * failure mode it prevents is a silent client-facing overcount. Stated plainly
 * so the next person who diffs the output with and without it does not conclude
 * it is dead code and delete it.
 */
export const LEAD_FIELDS = ['yearWeekIso_created', 'lead_id', 'campaign_name', 'lead_count']

/**
 * One row per lead per campaign, so the cap has to clear leads x campaigns
 * rather than weeks. Scoped clients return tens of rows (88 for the live client
 * on the year-to-date window, re-measured 2026-08-31 — an earlier version of
 * this line said 73 from a 2026-08-28 run, which contradicted the table in the
 * LEAD_FIELDS docblock above for the same query); this leaves room for a
 * campaign programme two orders of magnitude larger before truncation is even
 * conceivable.
 */
export const LEAD_MAX_ROWS = 20000

/** Pinned explicitly, never left on the connector default: the lead window basis
 *  is its own setting, and a default change would silently reinterpret every
 *  bucket as last-modified or converted instead of created. */
export const LEAD_SETTINGS = { lead_date_field: 'lead_created' }

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
  truncated = false,
): DedupedLeadWeeks {
  // `truncated` only suppresses `unmatched`, never the filter. See
  // filterByCampaign: a capped response cannot support the rename accusation,
  // because the in-scope rows may sit past the cap.
  const scoped = filterByCampaign(rows, campaignNames, truncated)
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
    getLeadRows(slug, dateRange),
    cmpIso
      ? getLeadRowsCompare(slug, cmpIso).catch((e) => {
          // Degrade, do not fail: the compare window supplies the prior-year
          // figure and nothing else. The catch sits OUTSIDE the cached wrapper
          // for the same reason pipeline.ts gives — caught inside, the null
          // becomes a fulfilled result and gets stored as if it were data.
          console.error(`[salesforce] leads compare fetch failed for ${slug}:`, e)
          return null
        })
      : Promise.resolve(null),
  ])
  // Measured on the RAW response, before dedupe and before the campaign filter,
  // and computed here so it can be passed INTO the filter as well as reported.
  const truncated = rows.length >= LEAD_MAX_ROWS
  const cur = dedupeLeadWeeks(rows, campaignNames, truncated)
  const cmp = cmpRows ? dedupeLeadWeeks(cmpRows, campaignNames, cmpRows.length >= LEAD_MAX_ROWS) : null
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
    truncated,
    unusableRows: cur.idlessRows,
  }
}

/**
 * WHERE THE CACHE BOUNDARY SITS, AND WHY IT MOVED.
 *
 * Cached on the same 1-hour TTL and for the same reason as the contacts fetcher
 * this stands in for: two Supermetrics queries per render, either of which can
 * take the async schedule/poll path, is too much live-render latency for a
 * client-facing page. Wrapping also routes these through recordFetch so an
 * outage reaches the health probe.
 *
 * What changed is WHAT is stored. This used to wrap the composer, so the entry
 * held the assembled, ALREADY-SCOPED series — campaignUnmatched and all — while
 * the cache key carried only the slug, not campaignNames. That made a config fix
 * un-take-effect-able for up to an hour, and it desynchronised the two CRM
 * blocks on one page, because pipeline.ts caches raw rows and scopes outside:
 *
 *   1. A campaign is genuinely renamed in the CRM. Both blocks correctly say so.
 *   2. Somebody corrects campaignNames.
 *   3. The pipeline tiles come back on the very next render, off raw cached rows.
 *   4. This block kept repeating "the campaigns may have been renamed" for the
 *      rest of the hour, above the corrected tiles — the contradiction
 *      contact-pacing.tsx says the flag exists to prevent.
 *
 * There was no way to clear it early — no Salesforce fetcher passes `tags:`, so
 * revalidateTag cannot reach these entries, leaving only the TTL or
 * CACHE_DISABLE=1. So the boundary now sits on the RAW query, exactly as the
 * pipeline's does, and the scoping re-runs below it every render.
 *
 * That is not quite "a corrected campaign name lands on the next render": the
 * names come from getClientBySlug, which is itself cached at a 5-minute TTL, so
 * the true bound is five minutes rather than one render. Five minutes against
 * the hour this replaces is the fix working; the sentence is just weaker than
 * it looks.
 *
 * The fetcher names are new (`leadRows`, not `getSalesforceWeeklyLeads`), and
 * cached() keys on vendor + fn + version, so no pre-existing entry can be read
 * back under the new shape. That is also what makes a `version` bump moot here:
 * the old assembled-shape entries, which gained `truncated` and `unusableRows`
 * on this branch, are unreachable rather than reinterpreted.
 */
/**
 * How long a failed lead query is remembered before it is attempted again.
 *
 * Matches pipeline.ts's constant of the same name, which carries the fuller
 * argument for the 60s-against-an-hour asymmetry. It is here because the
 * boundary move above TOOK A BRAKE OFF, and the brake has to come back
 * deliberately rather than by accident.
 *
 * The accident: while the cached entry was the assembled composite, a
 * persistently failing compare query was caught inside the wrapper, so the call
 * FULFILLED with a degraded result and unstable_cache stored it for the hour —
 * which meant one real upstream attempt per hour. Now the catch sits outside,
 * correctly, so a rejection stores nothing and the query is re-issued on every
 * render, each one paying smQuery's 15s REQUEST_TIMEOUT_MS plus its retries
 * (leadRowsImpl passes no timeoutMs of its own). lib/cache.ts's negative-caching
 * docblock describes this exact trade, and pipeline.ts applied it to all four
 * of its fetchers when it made the same move; the leads move inherited the
 * structure without the key.
 */
const NEGATIVE_TTL_SECONDS = 60

function leadRowsImpl(slug: string, range: string): Promise<Record<string, string>[]> {
  return salesforceQuery(slug, LEAD_FIELDS, range, { settings: LEAD_SETTINGS, maxRows: LEAD_MAX_ROWS })
}
const getLeadRows = cached('salesforce', 'leadRows', leadRowsImpl, {
  extractTags: byClient, negativeTtlSeconds: NEGATIVE_TTL_SECONDS,
})

/**
 * Same impl, separate wrapper, one difference: healthCritical is false.
 *
 * Moving the boundary down moved recordFetch down with it. On the composite, a
 * failed compare fetch was caught inside the cached call and health saw a
 * healthy render — correctly, since the block renders its series and merely
 * omits one prior-year figure. Per query, the same failure lands in the beacon's
 * failed set, and deriveStatus marks a section down if ANY source failed, so a
 * missing year-over-year number would page Slack for an outage that is not one.
 * Identical reasoning to getWonStagesCompare in pipeline.ts. The console.error
 * at the call site remains the operational signal.
 */
const getLeadRowsCompare = cached('salesforce', 'leadRowsCompare', leadRowsImpl, {
  extractTags: byClient, healthCritical: false, negativeTtlSeconds: NEGATIVE_TTL_SECONDS,
})

// Deliberately NOT wrapped in cached(). The caching sits on the two fetchers
// above, so the campaign scoping below them re-runs on every render and a
// config fix takes effect immediately. Re-wrapping this composer would silently
// restore the stale-scope bug the docblock above describes.
export const getSalesforceWeeklyLeads = getSalesforceWeeklyLeadsImpl
