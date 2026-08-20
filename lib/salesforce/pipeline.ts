import { salesforceQuery, resolveCompareIso } from './base'
import { toNumber, toBool } from './num'
import { getClientBySlug } from '@/lib/db/queries'
import { cached } from '@/lib/cache'
import { byClient } from '@/lib/perf'
import type { PipelineKpis, PipelineData, PipelineKpi, StageRow, OwnerRow } from './types'

// opportunity_is_won is deliberately not requested: nothing below reads it (won
// is decided by the stage literal, see DEFAULT_WON_STAGE), and it is a
// dimension, so keeping it in the query multiplies row cardinality against
// STAGE_MAX_ROWS for no benefit.
const STAGE_FIELDS = [
  'opportunity_stage_name', 'opportunity_is_closed',
  'opportunity_probability', 'opportunity_count', 'opportunity_amount',
]
// is_closed lets the owner breakdown filter down to open deals client-side. A
// server-side filter is avoided on purpose: a typo'd filter field returns HTTP 200
// with empty data and no error, indistinguishable from a legitimate zero result.
const OWNER_FIELDS = ['opportunity_owner', 'opportunity_is_closed', 'opportunity_count', 'opportunity_amount']
// About 39 owners, open and closed, well under this cap.
const OWNER_MAX_ROWS = 500
// Live cardinality is about 18 rows, well under this cap, but only because
// probability is currently a per-stage default. A client setting probability
// per deal makes cardinality stage times probability, so this still needs its
// own truncation flag: see stageTruncated below.
const STAGE_MAX_ROWS = 500

/** The default stage that means new-business won, when a client has not customized
 * it. Never use is_won: it also covers renewals carrying $0. Overridable per client
 * via salesforceConfig.wonStageName, so a renamed or customized stage label does not
 * silently zero out the closedWon tile. */
const DEFAULT_WON_STAGE = 'Closed Won'

// Connector settings pinned explicitly, never left on their Supermetrics defaults.
// Openness is evaluated as of now, so the open tiles must not be date-windowed by
// close date (the default deal_date_field), which would show only the overdue
// subset. They query the created-date basis over a wide window instead; we filter
// is_closed ourselves. closedWon keeps the close-date basis on a YTD window.
// convert_to_default_currency is pinned false, not true: live-probed, requesting
// true 500s outright ("Currency conversion failed. The organization does not have
// multi-currency enabled.") rather than degrading, because the org has no default
// currency configured to convert into. Pinning false is still explicit, not a
// left-on-default, and matches today's real behavior; a future multi-currency org
// needs this revisited deliberately, not flipped silently.
const OPEN_SETTINGS = { deal_date_field: 'deal_created', convert_to_default_currency: false }
const WON_SETTINGS = { deal_date_field: 'deal_closed', convert_to_default_currency: false }
// A window wide enough to include every currently-open deal regardless of when it
// was created. Static bounds so the query is cache-stable within a day. Start date
// is Supermetrics' live-confirmed earliest supported historical date for this
// Salesforce connector (2016-08-20); anything earlier 400s with START_DATE_HISTORICAL.
const OPEN_WINDOW = '2016-08-20,2035-12-31'

function toStageRows(rows: Record<string, string>[]): StageRow[] {
  return rows.map((r) => ({
    stage:       String(r.opportunity_stage_name ?? ''),
    // Booleans arrive as real booleans despite the string typing, in the common
    // case, but that is an unguaranteed API detail, not a promise Supermetrics
    // makes, so this goes through toBool() rather than a bare === true check.
    isClosed:    toBool(r.opportunity_is_closed, 'opportunity_is_closed'),
    probability: toNumber(r.opportunity_probability, 'opportunity_probability'),
    count:       toNumber(r.opportunity_count, 'opportunity_count'),
    amount:      toNumber(r.opportunity_amount, 'opportunity_amount'),
  }))
}

function pct(current: number, prior: number | undefined): number | undefined {
  // A non-positive prior (zero or negative) withholds the delta. closedWon
  // amounts can go negative (credits, refunds), and a swing from -50k to
  // +100k should not render as a sign-flipped "down 300 percent".
  if (prior == null || prior <= 0) return undefined
  return ((current - prior) / prior) * 100
}

function kpi(value: number, prior?: number): PipelineKpi {
  return { value, delta: pct(value, prior) }
}

/** A tile with delta deliberately withheld. See the comment in transformPipeline for why. */
function kpiNoDelta(value: number): PipelineKpi {
  return { value }
}

/**
 * Sums the won-stage rows in one row set (Task 2's isClosed AND stage === wonStage
 * partition) and returns the summed amount. warnOnNoMatch gates the two
 * operator-facing warns (a won-stage row not flagged closed; no row matches
 * wonStage at all) so they fire once, for the current window only. A legitimately
 * empty or differently-labeled prior window is common and closedWon's delta
 * already degrades cleanly to undefined via pct()'s non-positive-prior guard, so
 * warning on the prior would just be noise on top of a non-issue.
 */
function wonRowsFor(
  rows: Record<string, string>[],
  wonStage: string,
  warnOnNoMatch: boolean,
): number {
  const input = toStageRows(rows)
  // Won requires BOTH the won stage AND is_closed: a row whose stage says
  // Closed Won but whose is_closed flag is still false (a mid-migration or
  // data-entry state) is not actually closed yet, so it belongs in open, not
  // in won.
  const won = input.filter((r) => r.isClosed && r.stage === wonStage)
  if (warnOnNoMatch) {
    const mislabeled = input.filter((r) => !r.isClosed && r.stage === wonStage)
    if (mislabeled.length > 0) {
      console.warn(
        `[salesforce] ${mislabeled.length} row(s) in won stage but not closed; excluded from closedWon:`,
        mislabeled.map((r) => r.stage),
      )
    }
    // A renamed won stage (differing by punctuation, casing, or trailing
    // whitespace from wonStage) collapses this tile to $0 with nothing to
    // distinguish it from a client who genuinely won nothing. Warn with the
    // stages actually present so an operator can see the correct label
    // immediately, rather than having to go dig through the CRM.
    if (input.length > 0 && won.length === 0) {
      console.warn(
        `[salesforce] no rows matched won stage "${wonStage}"; stages present:`,
        [...new Set(input.map((r) => r.stage))],
      )
    }
  }
  return won.reduce((s, r) => s + r.amount, 0)
}

/**
 * Builds the four pipeline tiles from two independently sourced row sets.
 * openRows comes from a wide, created-date-basis query (Task 3): openness is
 * evaluated as of now, so it is not windowed by close date and carries no
 * comparable prior at all, hence openDeals/totalPipeline/weightedPipeline
 * always use kpiNoDelta. wonRowsCurrent/wonRowsPrior come from the close-date
 * year-to-date query and its prior-year window: closed-won is a historical
 * fact recorded at close time, so comparing this year's to last year's is a
 * sound comparison and keeps its delta via kpi().
 */
export function transformPipeline(
  openRows: Record<string, string>[],
  wonRowsCurrent: Record<string, string>[],
  wonRowsPrior: Record<string, string>[] | null,
  wonStage: string = DEFAULT_WON_STAGE,
): PipelineKpis {
  const open = toStageRows(openRows).filter((r) => !r.isClosed)
  const wonCur = wonRowsFor(wonRowsCurrent, wonStage, true)
  const wonPrior = wonRowsPrior ? wonRowsFor(wonRowsPrior, wonStage, false) : undefined
  return {
    openDeals:        kpiNoDelta(open.reduce((s, r) => s + r.count, 0)),
    totalPipeline:    kpiNoDelta(open.reduce((s, r) => s + r.amount, 0)),
    // Probability is 0 to 100. Divide by 100 or the result is 100x too large.
    weightedPipeline: kpiNoDelta(open.reduce((s, r) => s + r.amount * (r.probability / 100), 0)),
    closedWon:        kpi(wonCur, wonPrior),
  }
}

/**
 * Keeps only open (not-closed) rows, then aggregates by owner: one owner can
 * span more than one row now that is_closed is a dimension. Sorted by count
 * descending so the heaviest owners lead the chart.
 */
export function transformByOwner(
  rows: Record<string, string>[],
  maxRows: number,
): { rows: OwnerRow[]; truncated: boolean } {
  const open = rows.filter((r) => !toBool(r.opportunity_is_closed, 'opportunity_is_closed'))
  const byOwner = new Map<string, OwnerRow>()
  for (const r of open) {
    // '' is falsy, so a blank owner falls back to Unassigned too, not just a missing one.
    const owner = String(r.opportunity_owner || 'Unassigned')
    const count = toNumber(r.opportunity_count, 'opportunity_count')
    const amount = toNumber(r.opportunity_amount, 'opportunity_amount')
    const existing = byOwner.get(owner)
    if (existing) {
      existing.count += count
      existing.amount += amount
    } else {
      byOwner.set(owner, { owner, count, amount })
    }
  }
  const out = Array.from(byOwner.values()).sort((a, b) => b.count - a.count)
  return { rows: out, truncated: rows.length >= maxRows }
}

/**
 * Fetches open deals over a wide, created-date-basis window (openness is as of
 * now, see the constants above), this year's closed-won and its prior-year
 * window on the close-date basis, and the by-owner breakdown (open scope, same
 * wide window as the open tiles), and returns the assembled tile data. Compare
 * failure degrades to no closedWon delta rather than failing the section.
 */
// Exported (not module-private) so pipeline.orchestration.test.ts can call it
// directly: the public getSalesforcePipeline below is wrapped in cached(),
// which invokes Next's unstable_cache and throws outside a real request
// context, which every vitest run is. Testing the impl directly is the
// intended use of the ...Impl pattern (see lib/hubspot/client.ts), not a
// workaround: it is the plain, uncached orchestration this wraps.
export async function getSalesforcePipelineImpl(slug: string): Promise<PipelineData> {
  const wonRange = 'year_to_date'
  const wonPriorIso = resolveCompareIso(wonRange, 'previous_year')
  const client = await getClientBySlug(slug)
  const wonStage = client?.salesforceConfig?.wonStageName ?? DEFAULT_WON_STAGE

  const [openRows, wonCurRows, wonPriorRows, ownerRows] = await Promise.all([
    salesforceQuery(slug, STAGE_FIELDS, OPEN_WINDOW, { settings: OPEN_SETTINGS, maxRows: STAGE_MAX_ROWS }),
    salesforceQuery(slug, STAGE_FIELDS, wonRange, { settings: WON_SETTINGS, maxRows: STAGE_MAX_ROWS }),
    wonPriorIso
      ? salesforceQuery(slug, STAGE_FIELDS, wonPriorIso, { settings: WON_SETTINGS, maxRows: STAGE_MAX_ROWS }).catch((e) => {
          // Same degrade-not-fail contract as the owner fetch below: a persistently
          // failing compare fetch silently drops the closed-won year-over-year
          // delta, so it needs the same operational signal before it swallows it.
          console.error(`[salesforce] pipeline won-prior fetch failed for ${slug}:`, e)
          return null
        })
      : Promise.resolve(null),
    salesforceQuery(slug, OWNER_FIELDS, OPEN_WINDOW, { settings: OPEN_SETTINGS, maxRows: OWNER_MAX_ROWS }).catch((e) => {
      // A failed fetch must surface as byOwner: null, never as an empty list, so
      // it never reads as "this client has no owners". Log before swallowing.
      console.error(`[salesforce] owner fetch failed for ${slug}:`, e)
      return null
    }),
  ])
  const kpis = transformPipeline(openRows, wonCurRows, wonPriorRows, wonStage)
  const owner = ownerRows ? transformByOwner(ownerRows, OWNER_MAX_ROWS) : null
  return {
    ...kpis,
    byOwner: owner ? owner.rows : null,
    ownersTruncated: owner ? owner.truncated : false,
    // Drives all four headline tiles, unlike the owner breakdown, so a silent
    // truncation here would corrupt client-facing numbers rather than just a chart.
    // Checks the open query (backs three of the four tiles) and both won queries: a
    // truncated won-prior set undercounts the prior just as badly as a truncated
    // won-current set undercounts closedWon, and would otherwise silently overstate
    // the closedWon year-over-year delta.
    stageTruncated:
      openRows.length >= STAGE_MAX_ROWS ||
      wonCurRows.length >= STAGE_MAX_ROWS ||
      (wonPriorRows?.length ?? 0) >= STAGE_MAX_ROWS,
  }
}

// Cached the same way the HubSpot fetchers this block replaces are (1-hour TTL,
// see lib/hubspot/client.ts): six Supermetrics queries per render across pipeline
// and contacts (four here plus two in contacts.ts), any of which can take the
// async schedule/poll path, is too much live-render latency for a client-facing
// page. Wrapping also routes this fetch through recordFetch (inside cached()), so
// a Salesforce outage becomes visible on the health probe the same way a HubSpot
// outage already is.
export const getSalesforcePipeline = cached('salesforce', 'getSalesforcePipeline', getSalesforcePipelineImpl, {
  extractTags: byClient,
})
