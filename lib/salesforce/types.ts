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
  /** Percent change vs the compare window, undefined when no baseline. */
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
