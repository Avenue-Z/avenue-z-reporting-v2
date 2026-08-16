import { salesforceQuery, resolveCompareIso } from './base'
import type { PipelineData, PipelineKpi, StageRow, OwnerRow } from './types'

const STAGE_FIELDS = [
  'opportunity_stage_name', 'opportunity_is_won', 'opportunity_is_closed',
  'opportunity_probability', 'opportunity_count', 'opportunity_amount',
]
const OWNER_FIELDS = ['opportunity_owner', 'opportunity_count', 'opportunity_amount']
const OWNER_MAX_ROWS = 500

/** The only stage that means new-business won. Never use is_won: it also covers renewals carrying $0. */
const CLOSED_WON = 'Closed Won'

function toStageRows(rows: Record<string, string>[]): StageRow[] {
  return rows.map((r) => ({
    stage:       String(r.opportunity_stage_name ?? ''),
    // Booleans arrive as real booleans despite the string typing.
    isWon:       (r.opportunity_is_won as unknown) === true,
    isClosed:    (r.opportunity_is_closed as unknown) === true,
    probability: Number(r.opportunity_probability ?? 0),
    count:       Number(r.opportunity_count ?? 0),
    amount:      Number(r.opportunity_amount ?? 0),
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
): PipelineData {
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
    byOwner:          [],
    ownersTruncated:  false,
  }
}

export function transformByOwner(
  rows: Record<string, string>[],
  maxRows: number,
): { rows: OwnerRow[]; truncated: boolean } {
  const out: OwnerRow[] = rows
    .map((r) => ({
      owner:  String(r.opportunity_owner ?? 'Unassigned'),
      count:  Number(r.opportunity_count ?? 0),
      amount: Number(r.opportunity_amount ?? 0),
    }))
    .sort((a, b) => b.count - a.count)
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
    salesforceQuery(slug, STAGE_FIELDS, dateRange, { maxRows: 100 }),
    cmpIso ? salesforceQuery(slug, STAGE_FIELDS, cmpIso, { maxRows: 100 }).catch(() => null) : Promise.resolve(null),
    salesforceQuery(slug, OWNER_FIELDS, dateRange, { maxRows: OWNER_MAX_ROWS }).catch(() => null),
  ])
  const data = transformPipeline(stageRows, cmpStageRows)
  if (ownerRows) {
    const o = transformByOwner(ownerRows, OWNER_MAX_ROWS)
    data.byOwner = o.rows
    data.ownersTruncated = o.truncated
  }
  return data
}
