/** One aggregated stage row from Supermetrics. Numbers, not strings, at runtime. */
export interface StageRow {
  stage: string
  isClosed: boolean
  /** 0 to 100 as returned. Divide by 100 before weighting. */
  probability: number
  count: number
  amount: number
}

export interface PipelineKpi {
  value: number
  /**
   * Percent change vs the compare window. Undefined covers two different
   * situations: no baseline was available (compare fetch failed or the prior
   * value was 0), or the comparison is withheld on purpose because it would be
   * structurally invalid, as pipeline.ts does for openDeals, totalPipeline, and
   * weightedPipeline (openness is measured as of now, so a prior-year window has
   * had a year to close and trends to ~0 open by construction). The two cases
   * are not distinguished in the type: the only current consumer is not yet
   * built, so there is nothing to prove a richer shape against yet. If a
   * consumer needs to render these differently (e.g. "no comparison available"
   * vs. "not comparable"), add a discriminant then, once real UI requirements
   * exist to design it against.
   */
  delta?: number
}

export interface OwnerRow {
  owner: string
  count: number
  amount: number
}

export interface PipelineKpis {
  openDeals: PipelineKpi
  totalPipeline: PipelineKpi
  closedWon: PipelineKpi
  weightedPipeline: PipelineKpi
}

export interface PipelineData extends PipelineKpis {
  /**
   * null means the owner query failed and we have no data. [] means the query
   * succeeded and this client genuinely has no open owners. Do not conflate
   * the two: a failed fetch must never render as "this client has no owners".
   */
  byOwner: OwnerRow[] | null
  /** True when the by-owner query hit maxRows, so the list may be truncated. */
  ownersTruncated: boolean
  /**
   * True when the stage query hit maxRows, so the four headline tiles derived
   * from it (openDeals, totalPipeline, closedWon, weightedPipeline) may be
   * undercounted. Parallel to ownersTruncated, but higher stakes: this one
   * drives the client-facing headline numbers, not just a supporting chart.
   */
  stageTruncated: boolean
  /**
   * How many rows carried an opportunity_is_closed value this module does not
   * recognise (see parseBool in num.ts). Those rows are failed CLOSED, which
   * drops them from the open tiles and, on a won-stage row, adds them to
   * closedWon, so a non-zero count means the headline numbers are shifted by an
   * unknown amount in a known direction. Surfaced rather than left as a console
   * warn so the UI can caveat the tiles to the person reading the dashboard,
   * who is the one making decisions from them.
   *
   * Counts ROWS across the queries backing this section, not distinct deals: the
   * open (wide, created-date) and won (year to date, close-date) windows overlap,
   * so one bad deal can contribute more than once. Treat it as a severity hint,
   * never as "N deals are affected".
   */
  unrecognizedClosedFlags: number
  /**
   * True when the closed-won window returned rows but none of them counted as
   * won, either because the configured won stage was renamed in the CRM or
   * because every won-stage row is still flagged open. closedWon then renders
   * $0, which is indistinguishable from a genuine "won nothing this period"
   * unless the UI reads this flag and says so. False for an empty window: that
   * is missing data, a different problem.
   */
  wonStageUnmatched: boolean
}

export interface WeekBucket {
  /** ISO year and week, e.g. '2026-W33'. Normalized from the API's 'YYYY|WW'. */
  week: string
  contacts: number
}

export interface WeeklyContacts {
  weeks: WeekBucket[]
  currentWeek: number
  previousWeek: number
  /** Same ISO week last year, or undefined when the compare query failed or had no matching week. */
  priorYearWeek?: number
  /** Percent change current vs previous week, undefined when previous is 0. */
  weekOverWeek?: number
}
