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

function toStageRows(rows: Record<string, string>[]): StageRow[] {
  return rows.map((r) => ({
    stage:       String(r.opportunity_stage_name ?? ''),
    // Booleans arrive as real booleans despite the string typing, in the common
    // case, but that is an unguaranteed API detail, not a promise Supermetrics
    // makes, so this goes through toBool() rather than a bare === true check.
    isClosed:    toBool(r.opportunity_is_closed),
    probability: toNumber(r.opportunity_probability),
    count:       toNumber(r.opportunity_count),
    amount:      toNumber(r.opportunity_amount),
  }))
}

function pct(current: number, prior: number | undefined): number | undefined {
  if (prior == null || prior === 0) return undefined
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
 * Aggregates a stage breakdown into the four pipeline tiles.
 * Sums by stage rather than finding a row: when probability is a dimension,
 * a stage can appear on more than one row.
 */
export function transformPipeline(
  rows: Record<string, string>[],
  cmpRows: Record<string, string>[] | null,
  wonStage: string = DEFAULT_WON_STAGE,
): PipelineKpis {
  const agg = (input: StageRow[], warnOnNoMatch: boolean) => {
    const open = input.filter((r) => !r.isClosed)
    const won  = input.filter((r) => r.stage === wonStage)
    // A renamed won stage (differing by punctuation, casing, or trailing
    // whitespace from wonStage) collapses this tile to $0 with nothing to
    // distinguish it from a client who genuinely won nothing. Warn with the
    // stages actually present so an operator can see the correct label
    // immediately, rather than having to go dig through the CRM.
    if (warnOnNoMatch && input.length > 0 && won.length === 0) {
      console.warn(
        `[salesforce] no rows matched won stage "${wonStage}"; stages present:`,
        [...new Set(input.map((r) => r.stage))],
      )
    }
    return {
      openDeals:     open.reduce((s, r) => s + r.count, 0),
      totalPipeline: open.reduce((s, r) => s + r.amount, 0),
      closedWon:     won.reduce((s, r) => s + r.amount, 0),
      // Probability is 0 to 100. Divide by 100 or the result is 100x too large.
      weighted:      open.reduce((s, r) => s + r.amount * (r.probability / 100), 0),
    }
  }
  // Warn only for the current window. A legitimately empty or differently-labeled
  // compare window is common (a client with no closed-won a year ago, or a won
  // stage that was renamed partway through last year) and closedWon's delta
  // already degrades cleanly to undefined via pct()'s prior-is-0 guard, so a
  // second warn here would just be noise on top of a non-issue. The current
  // window is the one that renders a live, client-facing $0 with no other signal.
  const cur = agg(toStageRows(rows), true)
  const prev = cmpRows ? agg(toStageRows(cmpRows), false) : null
  return {
    // openDeals, totalPipeline, and weightedPipeline never carry a year-over-year
    // delta, on purpose. Openness is evaluated as of now, not as of the historical
    // window: a deal whose close date fell in the prior-year window has had a full
    // year to close, so the prior window's open pipeline trends to zero by
    // construction. Verified against live data: 297 open deals in the 2026 YTD
    // window versus 1 in the same window a year earlier (and that lone survivor is
    // a single $0 Renewal Released). Comparing this year's ~$18M open pipeline to a
    // prior window that has almost nothing left open is not a stale or missing
    // comparison, it is a structurally invalid one, so these three tiles suppress
    // delta unconditionally, even when a compare set with real nonzero values is
    // supplied. Do not "fix" this by wiring prev back in: the near-zero prior
    // makes the percent swing look enormous (was +29,600% before this was caught).
    openDeals:        kpiNoDelta(cur.openDeals),
    totalPipeline:    kpiNoDelta(cur.totalPipeline),
    // closedWon is unaffected: closed-won is a historical fact recorded at close
    // time, it does not change with the passage of time, so comparing this year's
    // closed-won to last year's closed-won is a sound comparison and keeps its delta.
    closedWon:        kpi(cur.closedWon, prev?.closedWon),
    weightedPipeline: kpiNoDelta(cur.weighted),
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
  const open = rows.filter((r) => !toBool(r.opportunity_is_closed))
  const byOwner = new Map<string, OwnerRow>()
  for (const r of open) {
    // '' is falsy, so a blank owner falls back to Unassigned too, not just a missing one.
    const owner = String(r.opportunity_owner || 'Unassigned')
    const count = toNumber(r.opportunity_count)
    const amount = toNumber(r.opportunity_amount)
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
 * Fetches this year to date and the same window last year, plus the by-owner
 * breakdown, and returns the assembled tile data. Compare failure degrades to
 * no deltas rather than failing the section.
 */
// Exported (not module-private) so pipeline.orchestration.test.ts can call it
// directly: the public getSalesforcePipeline below is wrapped in cached(),
// which invokes Next's unstable_cache and throws outside a real request
// context, which every vitest run is. Testing the impl directly is the
// intended use of the ...Impl pattern (see lib/hubspot/client.ts), not a
// workaround: it is the plain, uncached orchestration this wraps.
export async function getSalesforcePipelineImpl(slug: string): Promise<PipelineData> {
  const dateRange = 'year_to_date'
  const cmpIso = resolveCompareIso(dateRange, 'previous_year')
  const client = await getClientBySlug(slug)
  const wonStage = client?.salesforceConfig?.wonStageName ?? DEFAULT_WON_STAGE
  const [stageRows, cmpStageRows, ownerRows] = await Promise.all([
    salesforceQuery(slug, STAGE_FIELDS, dateRange, { maxRows: STAGE_MAX_ROWS }),
    cmpIso
      ? salesforceQuery(slug, STAGE_FIELDS, cmpIso, { maxRows: STAGE_MAX_ROWS }).catch((e) => {
          // Same degrade-not-fail contract as the owner fetch below: a persistently
          // failing compare fetch silently drops the closed-won year-over-year
          // delta, so it needs the same operational signal before it swallows it.
          console.error(`[salesforce] pipeline compare fetch failed for ${slug}:`, e)
          return null
        })
      : Promise.resolve(null),
    salesforceQuery(slug, OWNER_FIELDS, dateRange, { maxRows: OWNER_MAX_ROWS }).catch((e) => {
      // A failed fetch must surface as byOwner: null, never as an empty list, so
      // it never reads as "this client has no owners". Log before swallowing.
      console.error(`[salesforce] owner fetch failed for ${slug}:`, e)
      return null
    }),
  ])
  const kpis = transformPipeline(stageRows, cmpStageRows, wonStage)
  const owner = ownerRows ? transformByOwner(ownerRows, OWNER_MAX_ROWS) : null
  return {
    ...kpis,
    byOwner: owner ? owner.rows : null,
    ownersTruncated: owner ? owner.truncated : false,
    // Drives all four headline tiles, unlike the owner breakdown, so a silent
    // truncation here would corrupt client-facing numbers rather than just a chart.
    // Checks both fetches: a truncated compare set undercounts prev.closedWon just
    // as badly as a truncated current set undercounts cur.closedWon, and would
    // otherwise silently overstate the closedWon year-over-year delta.
    stageTruncated: stageRows.length >= STAGE_MAX_ROWS || (cmpStageRows?.length ?? 0) >= STAGE_MAX_ROWS,
  }
}

// Cached the same way the HubSpot fetchers this block replaces are (1-hour TTL,
// see lib/hubspot/client.ts): five Supermetrics queries per render, any of which
// can take the async schedule/poll path, is too much live-render latency for a
// client-facing page. Wrapping also routes this fetch through recordFetch (inside
// cached()), so a Salesforce outage becomes visible on the health probe the same
// way a HubSpot outage already is.
export const getSalesforcePipeline = cached('salesforce', 'getSalesforcePipeline', getSalesforcePipelineImpl, {
  extractTags: byClient,
})
