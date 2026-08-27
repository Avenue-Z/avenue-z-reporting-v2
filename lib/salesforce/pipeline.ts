import { salesforceQuery, resolveCompareIso } from './base'
import { toNumber, toBool, parseBool } from './num'
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
// Measured live on the wide window (2026-08-20): 129 rows across 93 distinct
// owners (36 of them with open deals), because is_closed is a dimension and one
// owner spans more than one row. Roughly 4x headroom under this cap. The flag
// below stays keyed to the RAW row count, not the deduped owner list: if the
// response is capped we cannot know whether the rows we never saw held owners we
// never rendered, so a complete-looking list is exactly when a false all-clear
// would hurt.
const OWNER_MAX_ROWS = 500
// Measured live on the wide window (2026-08-20): 31 rows across 13 stages, and
// 28 rows on the year-to-date window, so roughly 16x headroom under this cap.
// It stays this generous because the row count is stage x is_closed x
// probability, and probability is only cheap while it remains a per-stage
// default: a client setting it per deal multiplies the cardinality. That is why
// the flag below exists rather than trusting the cap: see stageTruncated.
const STAGE_MAX_ROWS = 500

/**
 * Submit-call timeout for every Salesforce query here.
 *
 * smQuery's REQUEST_TIMEOUT_MS is 15s, sized for the healthy ~3s response so a
 * connector that never answers surfaces as an error instead of an indefinite
 * spinner. That premise does not hold in this runtime, and it does not hold
 * for the reason first assumed.
 *
 * The original raise covered only the two wide created-date queries, on the
 * theory that they were slow because they were large (the by-owner query
 * measured about 42s live on 2026-08-25). Staging then failed the CLOSED-WON
 * query — a year-to-date window — at exactly 15000ms on both 2026-08-26 and
 * 2026-08-27, while the two queries that had been given headroom never failed
 * once. Re-probed live, all four return in ~1.6-2.4s uncontended and ~1.9s
 * with 16 in flight, so slowness is not what is aborting them.
 *
 * The 15s budget is not a network budget. The abort timer is armed before the
 * fetch and res.json() runs inside the same window (lib/supermetrics/client.ts),
 * so connect + transfer + parse + any time the request's continuation spends
 * waiting on a busy event loop all count against it. On a CPU-pressured
 * serverless function the timers phase runs before a pending fetch resolution,
 * so a response that arrived in 2s can still be aborted. Every query on this
 * page is exposed to that, not just the wide ones.
 *
 * Applying one ceiling to all four costs nothing in worst-case page latency:
 * they run concurrently in a single Promise.all, so the ceiling was already
 * 60s from the wide queries. It stays comfortably under the cache-warm cron's
 * function ceiling (app/api/cache-warm/route.ts), which is what populates
 * these entries before a reader ever asks for them. Still scoped to this
 * module rather than raised globally: every other channel's windows are
 * narrower and the 15s default remains right for them.
 */
const SALESFORCE_TIMEOUT_MS = 60_000

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
/**
 * A window wide enough to include every currently-open deal regardless of when it
 * was created. This must NOT be a static literal: Supermetrics' Salesforce
 * historical floor is a ROLLING "today minus 10 years", so a hardcoded start date
 * silently slips below the floor as the clock advances and every query 400s with
 * START_DATE_HISTORICAL (a fixed '2016-08-20' was already one day under the floor
 * by 2026-08-21, live-confirmed, which zeroed the open tiles). The start is
 * therefore derived from the clock: January 1 of nine years ago, which is always
 * comfortably above a ten-year rolling floor (worst case, on Dec 31, still a day
 * above it) yet captures effectively all still-open history, since an opportunity
 * open for nine or more years is vanishingly rare. Year-granular bounds keep the
 * query cache-stable within a calendar year. `now` is injectable so the derivation
 * is testable without depending on the wall clock.
 */
export function openWindow(now: Date = new Date()): string {
  const y = now.getUTCFullYear()
  return `${y - 9}-01-01,${y + 9}-12-31`
}

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

/**
 * Counts rows whose opportunity_is_closed carries a value parseBool does not
 * recognise. toBool fails those closed (see num.ts), which quietly moves a deal
 * out of the open tiles and, on a won-stage row, into closedWon. The console
 * warn it emits is invisible to anyone reading the dashboard, so the count is
 * surfaced on PipelineData as unrecognizedClosedFlags for the UI to caveat.
 * A null row set (a fetch that failed and degraded) contributes nothing.
 */
export function countUnrecognizedClosed(...rowSets: (Record<string, string>[] | null)[]): number {
  let n = 0
  for (const rows of rowSets) {
    for (const r of rows ?? []) {
      if (parseBool(r.opportunity_is_closed) === undefined) n++
    }
  }
  return n
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
 * Sums the won-stage rows in one row set (isClosed AND stage === wonStage) and
 * reports whether the window produced no won rows at all despite carrying data.
 * `unmatched` is the client-facing caveat: closedWon renders $0 either because
 * the stage was renamed in the CRM or because every won-stage row is still
 * flagged open, and neither is distinguishable from "won nothing" in a dollar
 * figure alone.
 *
 * warnOnNoMatch gates the operator-facing warns so they fire once, for the
 * current window only. A legitimately empty or differently-labeled prior window
 * is common and closedWon's delta already degrades cleanly to undefined via
 * pct()'s non-positive-prior guard, so warning on the prior would be noise.
 */
function wonRowsFor(
  rows: Record<string, string>[],
  wonStage: string,
  warnOnNoMatch: boolean,
): { amount: number; unmatched: boolean } {
  const input = toStageRows(rows)
  // Won requires BOTH the won stage AND is_closed: a row whose stage says
  // Closed Won but whose is_closed flag is still false (a mid-migration or
  // data-entry state) is not actually closed yet, so it belongs in open, not
  // in won.
  const won = input.filter((r) => r.isClosed && r.stage === wonStage)
  const mislabeled = input.filter((r) => !r.isClosed && r.stage === wonStage)
  // A window that returned nothing at all is missing data, not a stage
  // mismatch; only a window that carried rows and still matched none is.
  const unmatched = input.length > 0 && won.length === 0
  if (warnOnNoMatch) {
    if (mislabeled.length > 0) {
      console.warn(
        `[salesforce] ${mislabeled.length} row(s) in the closed-won window are in won stage but not closed; excluded from closedWon (they reach the open tiles through the separate open query):`,
        mislabeled.map((r) => r.stage),
      )
    }
    // Only claim the stage is absent when it really is. Emitting this alongside
    // the mislabel warn produced a contradictory pair, naming the same stage as
    // both missing and present in consecutive lines.
    if (unmatched && mislabeled.length === 0) {
      console.warn(
        `[salesforce] no rows matched won stage "${wonStage}"; stages present:`,
        [...new Set(input.map((r) => r.stage))],
      )
    }
  }
  return { amount: won.reduce((s, r) => s + r.amount, 0), unmatched }
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
): PipelineKpis & { wonStageUnmatched: boolean } {
  const open = toStageRows(openRows).filter((r) => !r.isClosed)
  const wonCur = wonRowsFor(wonRowsCurrent, wonStage, true)
  const wonPrior = wonRowsPrior ? wonRowsFor(wonRowsPrior, wonStage, false) : undefined
  return {
    openDeals:        kpiNoDelta(open.reduce((s, r) => s + r.count, 0)),
    totalPipeline:    kpiNoDelta(open.reduce((s, r) => s + r.amount, 0)),
    // Probability is 0 to 100. Divide by 100 or the result is 100x too large.
    weightedPipeline: kpiNoDelta(open.reduce((s, r) => s + r.amount * (r.probability / 100), 0)),
    closedWon:        kpi(wonCur.amount, wonPrior?.amount),
    wonStageUnmatched: wonCur.unmatched,
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
 * The cache boundary sits on each QUERY, not on the assembled PipelineData.
 *
 * It used to sit on the composite, and that gave the four queries shared fate.
 * A partial degrade is still a fulfilled result, and cached() stores fulfilled
 * results, so one failed query wrote a degraded object over a good entry and
 * every tile — including the three that had fetched fine — reverted to dashes
 * for the rest of the hour. Live on staging 2026-08-26: the open query 500'd
 * and closed-won timed out while the owner query succeeded, and all four tiles
 * dashed until the TTL expired.
 *
 * Split per query, a failure is simply not stored (unstable_cache writes no
 * entry for a rejected call), so the next render retries that one query while
 * the other three serve warm. Seconds of vendor trouble now cost one render
 * instead of an hour. As a bonus the health probe (recordFetch, inside
 * cached()) reports which query is unhealthy rather than "pipeline".
 *
 * The 1-hour TTL and the reason for caching at all are unchanged: six
 * Supermetrics queries per render across pipeline and contacts, any of which
 * can take the async schedule/poll path, is too much live-render latency for a
 * client-facing page.
 *
 * Two consequences of the split are deliberate, and both cost something:
 *
 * 1. NOT STORING A FAILURE MEANS RE-ISSUING IT. The property that makes the
 *    split work — unstable_cache writes nothing for a rejected call — also
 *    means a query that fails persistently is re-run in full on every render,
 *    each time paying the whole SALESFORCE_TIMEOUT_MS ceiling. Caching the
 *    composite used to hide that behind the stored degraded object, at the
 *    price of the hour-long outage above. Hence NEGATIVE_TTL_SECONDS below: a
 *    failure is remembered just long enough to stop the storm, nowhere near
 *    long enough to bring the hour back.
 *
 * 2. THE FOUR RESULTS ARE NO LONGER ONE SNAPSHOT. openStages and ownerRows read
 *    the same deals through different aggregations, so while they shared an
 *    entry the Open Deals tile and Open Deals by Owner could not disagree.
 *    Separate entries can now hold data fetched at different moments, and the
 *    owner rows can stop summing to the tile. countUnrecognizedClosed and
 *    stageTruncated below likewise reason across row sets that need not be
 *    contemporaneous.
 *
 *    What bounds it: in the healthy path all four are written by the same
 *    render and expire together, so they stay in lockstep, and no entry is ever
 *    staler than the 1-hour TTL. Skew appears only after a partial failure —
 *    precisely the case whose alternative was four dashed tiles for an hour.
 *
 *    What does NOT bound it: the misalignment is permanent, not self-healing.
 *    Nothing re-synchronises the four expiries. A query that fails while its
 *    siblings are written comes back roughly NEGATIVE_TTL_SECONDS later and
 *    keeps that offset from then on: in every subsequent hour there is a ~65s
 *    window where the three that expired on time hold a fresh fetch and the
 *    laggard is still serving the previous hour's, a data-age gap of nearly an
 *    hour. Only another partial failure, a deploy, or a tag invalidation moves
 *    it. Steady state is a brief recurring gap, not one that the next TTL
 *    closes.
 *
 *    A tile and a chart that disagree slightly for part of an hour beats both
 *    of them showing nothing for all of it, so the split stands; but it is a
 *    real trade, not a free win, and anything that later needs these four to be
 *    strictly consistent has to re-unify them behind one entry and re-solve the
 *    shared-fate problem some other way.
 *
 * The won queries get two wrappers, not one. They run the same impl over
 * different windows, so a single wrapper would have served both (the range is
 * an argument, so each window keyed its own entry). They are split because the
 * CURRENT window backs the Closed Won tile while the PRIOR window only supplies
 * that tile's delta, and after the boundary moved down here that difference
 * started to matter: see getWonStagesCompare.
 */

/**
 * How long a failed Salesforce query is remembered before it is attempted again.
 *
 * One minute against a 1-hour positive TTL. The asymmetry is the point. A
 * transient failure now costs at most a minute of dashed tiles instead of the
 * hour that prompted this whole change, while a genuinely broken query is
 * attempted once a minute per instance rather than once per render — which
 * matters because each attempt can burn the full 60s ceiling, on a page the
 * health sweep probes under a 60s function budget of its own.
 */
const NEGATIVE_TTL_SECONDS = 60
function openStagesImpl(slug: string): Promise<Record<string, string>[]> {
  return salesforceQuery(slug, STAGE_FIELDS, openWindow(), {
    settings: OPEN_SETTINGS, maxRows: STAGE_MAX_ROWS, timeoutMs: SALESFORCE_TIMEOUT_MS,
  })
}
const getOpenStages = cached('salesforce', 'openStages', openStagesImpl, {
  extractTags: byClient, negativeTtlSeconds: NEGATIVE_TTL_SECONDS,
})

function wonStagesImpl(slug: string, range: string): Promise<Record<string, string>[]> {
  return salesforceQuery(slug, STAGE_FIELDS, range, {
    settings: WON_SETTINGS, maxRows: STAGE_MAX_ROWS, timeoutMs: SALESFORCE_TIMEOUT_MS,
  })
}
const getWonStages = cached('salesforce', 'wonStages', wonStagesImpl, {
  extractTags: byClient, negativeTtlSeconds: NEGATIVE_TTL_SECONDS,
})

/**
 * The prior-year window, whose only job is the Closed Won delta.
 *
 * Same impl as getWonStages, separate wrapper for one reason: healthCritical is
 * false. Moving the cache boundary down onto the queries also moved recordFetch
 * down with it, and recordFetch is what the health beacon reads. On the
 * composite, this fetch's failure was caught inside the cached call, the
 * composite still fulfilled, and health saw a healthy render — correctly, since
 * the page renders every figure it is asked for and merely omits one delta.
 * Per query, the same failure lands in the beacon's failed set, and
 * deriveStatus (lib/health/derive.ts) marks a section down if ANY source
 * failed. A missing year-over-year arrow would have declared the whole
 * Executive Overview down and paged Slack for it.
 *
 * The contract this fetch has always had is stated a few lines below at its
 * .catch: degrade rather than fail, "its absence only costs a delta". A signal
 * that loud contradicts it. The console.error there remains the operational
 * signal, as it was designed to be, and the PERF line still records the
 * failure; what is withheld is only the outage verdict. When health grows a
 * `degraded` status this should become that instead of silence.
 */
const getWonStagesCompare = cached('salesforce', 'wonStagesCompare', wonStagesImpl, {
  extractTags: byClient, negativeTtlSeconds: NEGATIVE_TTL_SECONDS, healthCritical: false,
})

function ownerRowsImpl(slug: string): Promise<Record<string, string>[]> {
  return salesforceQuery(slug, OWNER_FIELDS, openWindow(), {
    settings: OPEN_SETTINGS, maxRows: OWNER_MAX_ROWS, timeoutMs: SALESFORCE_TIMEOUT_MS,
  })
}
const getOwnerRows = cached('salesforce', 'ownerRows', ownerRowsImpl, {
  extractTags: byClient, negativeTtlSeconds: NEGATIVE_TTL_SECONDS,
})

/**
 * Fetches open deals over a wide, created-date-basis window (openness is as of
 * now, see the constants above), this year's closed-won and its prior-year
 * window on the close-date basis, and the by-owner breakdown (open scope, same
 * wide window as the open tiles), and returns the assembled tile data. Compare
 * failure degrades to no closedWon delta rather than failing the section.
 */
// Exported (not module-private) so pipeline.orchestration.test.ts can call it
// directly. The caching now lives on the four fetchers above rather than on
// this composer, but the ...Impl name is kept: it is still the seam the tests
// enter through, and renaming it would churn every call site in that file for
// no gain.
export async function getSalesforcePipelineImpl(slug: string): Promise<PipelineData> {
  const wonRange = 'year_to_date'
  const wonPriorIso = resolveCompareIso(wonRange, 'previous_year')
  const client = await getClientBySlug(slug)
  const wonStage = client?.salesforceConfig?.wonStageName ?? DEFAULT_WON_STAGE

  const [openRows, wonCurRows, wonPriorRows, ownerRows] = await Promise.all([
    // Same degrade-not-fail contract as the owner fetch: letting this throw
    // would blank the whole section through the error boundary and discard the
    // closedWon and owner data that fetched fine. null is surfaced as
    // openUnavailable so the tiles read as unavailable, never as a confident 0.
    // The catch is OUTSIDE the cached wrapper on purpose: caught inside, the
    // null would become a fulfilled result and get cached as if it were data.
    getOpenStages(slug).catch((e) => {
      console.error(`[salesforce] open pipeline fetch failed for ${slug}:`, e)
      return null
    }),
    getWonStages(slug, wonRange).catch((e) => {
      console.error(`[salesforce] closed-won fetch failed for ${slug}:`, e)
      return null
    }),
    wonPriorIso
      ? getWonStagesCompare(slug, wonPriorIso).catch((e) => {
          // Same degrade-not-fail contract as the owner fetch below: a persistently
          // failing compare fetch silently drops the closed-won year-over-year
          // delta, so it needs the same operational signal before it swallows it.
          // This console.error IS that signal, and it is the only one: the
          // wrapper is healthCritical: false precisely so a missing delta does
          // not read as a page-wide outage. See getWonStagesCompare.
          console.error(`[salesforce] pipeline won-prior fetch failed for ${slug}:`, e)
          return null
        })
      : Promise.resolve(null),
    getOwnerRows(slug).catch((e) => {
      // A failed fetch must surface as byOwner: null, never as an empty list, so
      // it never reads as "this client has no owners". Log before swallowing.
      console.error(`[salesforce] owner fetch failed for ${slug}:`, e)
      return null
    }),
  ])
  // Every primary query failed, so there is no partial result to protect and
  // nothing to render but four dashes. Throw rather than return that object.
  //
  // This guard used to carry the caching argument too: an all-unavailable
  // return value is a fulfilled result, so cached() stored a seconds-long
  // outage and replayed it for the full hour. That argument now lives at the
  // per-query cache boundary above, which fixes it for PARTIAL failures as
  // well — this guard only ever caught the total case. What remains here is
  // the render decision, which is reason enough on its own.
  //
  // The reader loses nothing: index.tsx renders a thrown pipeline as
  // "Couldn't load pipeline data." for a configured client, which is the same
  // message four dashed tiles were already carrying, in one place instead of
  // four. wonPriorRows is deliberately not part of this test: it is the compare
  // fetch, it is null whenever no compare window was resolved at all, and its
  // absence only costs a delta.
  if (openRows === null && wonCurRows === null && ownerRows === null) {
    throw new Error(`every Salesforce query failed for ${slug}`)
  }

  const kpis = transformPipeline(openRows ?? [], wonCurRows ?? [], wonPriorRows, wonStage)
  const owner = ownerRows ? transformByOwner(ownerRows, OWNER_MAX_ROWS) : null
  return {
    ...kpis,
    // Parallel to byOwner being null rather than []: a fetch that failed must
    // never render as a confident zero. The tile values are 0 in that case only
    // because there is nothing to sum; these flags are what makes that legible.
    openUnavailable: openRows === null,
    wonUnavailable: wonCurRows === null,
    byOwner: owner ? owner.rows : null,
    ownersTruncated: owner ? owner.truncated : false,
    // Drives all four headline tiles, unlike the owner breakdown, so a silent
    // truncation here would corrupt client-facing numbers rather than just a chart.
    // Checks the open query (backs three of the four tiles) and both won queries: a
    // truncated won-prior set undercounts the prior just as badly as a truncated
    // won-current set undercounts closedWon, and would otherwise silently overstate
    // the closedWon year-over-year delta.
    unrecognizedClosedFlags: countUnrecognizedClosed(openRows, wonCurRows, wonPriorRows, ownerRows),
    stageTruncated:
      (openRows?.length ?? 0) >= STAGE_MAX_ROWS ||
      (wonCurRows?.length ?? 0) >= STAGE_MAX_ROWS ||
      (wonPriorRows?.length ?? 0) >= STAGE_MAX_ROWS,
  }
}

// Deliberately NOT wrapped in cached(). The caching (and with it recordFetch,
// so a Salesforce outage still shows on the health probe — every fetcher above
// except the delta-only compare window, see getWonStagesCompare) sits on the
// four query fetchers above, one entry each, so a single failed query cannot
// write a degraded object over a good composite entry and dash every tile for
// an hour. See the comment on openStagesImpl for the incident that forced the
// split, and for the two costs the split carries.
// Re-wrapping this composer would silently restore that shared fate.
export const getSalesforcePipeline = getSalesforcePipelineImpl
