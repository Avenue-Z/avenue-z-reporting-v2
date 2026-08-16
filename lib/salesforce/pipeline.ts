import { salesforceQuery, resolveCompareIso } from './base'
import type { PipelineKpis, PipelineData, PipelineKpi, StageRow, OwnerRow } from './types'

// opportunity_is_won is still fetched (and kept in fixtures) because it mirrors the
// API shape, but it is deliberately not read below: see CLOSED_WON.
const STAGE_FIELDS = [
  'opportunity_stage_name', 'opportunity_is_won', 'opportunity_is_closed',
  'opportunity_probability', 'opportunity_count', 'opportunity_amount',
]
// is_closed lets the owner breakdown filter down to open deals client-side. A
// server-side filter is avoided on purpose: a typo'd filter field returns HTTP 200
// with empty data and no error, indistinguishable from a legitimate zero result.
const OWNER_FIELDS = ['opportunity_owner', 'opportunity_is_closed', 'opportunity_count', 'opportunity_amount']
// About 39 owners, open and closed, well under this cap.
const OWNER_MAX_ROWS = 500
// The live stage breakdown is about 18 rows, so this is ample headroom. That is
// also why the stage query carries no truncation flag of its own.
const STAGE_MAX_ROWS = 500

/** The only stage that means new-business won. Never use is_won: it also covers renewals carrying $0. */
const CLOSED_WON = 'Closed Won'

/**
 * Coerces a Supermetrics numeric field to a finite number. Number(x) returns NaN
 * on something like a stringified '1,234.56', and one NaN propagates through an
 * entire reduce, turning a whole tile into NaN. Falls back to 0 instead.
 */
function toNumber(v: unknown): number {
  const n = Number(v ?? 0)
  if (Number.isFinite(n)) return n
  console.warn(`[salesforce] unparseable numeric value, defaulting to 0:`, v)
  return 0
}

function toStageRows(rows: Record<string, string>[]): StageRow[] {
  return rows.map((r) => ({
    stage:       String(r.opportunity_stage_name ?? ''),
    // Booleans arrive as real booleans despite the string typing.
    isClosed:    (r.opportunity_is_closed as unknown) === true,
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

/**
 * Aggregates a stage breakdown into the four pipeline tiles.
 * Sums by stage rather than finding a row: when probability is a dimension,
 * a stage can appear on more than one row.
 */
export function transformPipeline(
  rows: Record<string, string>[],
  cmpRows: Record<string, string>[] | null,
): PipelineKpis {
  const agg = (input: StageRow[]) => {
    const open = input.filter((r) => !r.isClosed)
    const won  = input.filter((r) => r.stage === CLOSED_WON)
    return {
      openDeals:     open.reduce((s, r) => s + r.count, 0),
      totalPipeline: open.reduce((s, r) => s + r.amount, 0),
      closedWon:     won.reduce((s, r) => s + r.amount, 0),
      // Probability is 0 to 100. Divide by 100 or the result is 100x too large.
      weighted:      open.reduce((s, r) => s + r.amount * (r.probability / 100), 0),
    }
  }
  const cur = agg(toStageRows(rows))
  const prev = cmpRows ? agg(toStageRows(cmpRows)) : null
  return {
    openDeals:        kpi(cur.openDeals,     prev?.openDeals),
    totalPipeline:    kpi(cur.totalPipeline, prev?.totalPipeline),
    closedWon:        kpi(cur.closedWon,     prev?.closedWon),
    weightedPipeline: kpi(cur.weighted,      prev?.weighted),
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
  const open = rows.filter((r) => (r.opportunity_is_closed as unknown) !== true)
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
export async function getSalesforcePipeline(slug: string): Promise<PipelineData> {
  const dateRange = 'year_to_date'
  const cmpIso = resolveCompareIso(dateRange, 'previous_year')
  const [stageRows, cmpStageRows, ownerRows] = await Promise.all([
    salesforceQuery(slug, STAGE_FIELDS, dateRange, { maxRows: STAGE_MAX_ROWS }),
    cmpIso ? salesforceQuery(slug, STAGE_FIELDS, cmpIso, { maxRows: STAGE_MAX_ROWS }).catch(() => null) : Promise.resolve(null),
    salesforceQuery(slug, OWNER_FIELDS, dateRange, { maxRows: OWNER_MAX_ROWS }).catch((e) => {
      // A failed fetch must surface as byOwner: null, never as an empty list, so
      // it never reads as "this client has no owners". Log before swallowing.
      console.error(`[salesforce] owner fetch failed for ${slug}:`, e)
      return null
    }),
  ])
  const kpis = transformPipeline(stageRows, cmpStageRows)
  const owner = ownerRows ? transformByOwner(ownerRows, OWNER_MAX_ROWS) : null
  return {
    ...kpis,
    byOwner: owner ? owner.rows : null,
    ownersTruncated: owner ? owner.truncated : false,
  }
}
