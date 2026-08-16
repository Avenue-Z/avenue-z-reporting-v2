/** One aggregated stage row from Supermetrics. Numbers, not strings, at runtime. */
export interface StageRow {
  stage: string
  isWon: boolean
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

export interface PipelineData {
  openDeals: PipelineKpi
  totalPipeline: PipelineKpi
  closedWon: PipelineKpi
  weightedPipeline: PipelineKpi
  byOwner: OwnerRow[]
  /** True when the by-owner query hit maxRows, so the list may be truncated. */
  ownersTruncated: boolean
}
