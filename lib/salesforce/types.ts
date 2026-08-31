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
  /**
   * True when the open-pipeline query failed and degraded. openDeals,
   * totalPipeline and weightedPipeline are then 0 because there was nothing to
   * sum, not because the client has no open deals: render them as unavailable,
   * the same distinction byOwner draws between null and [].
   */
  openUnavailable: boolean
  /** True when the closed-won query failed and degraded; closedWon is 0 for want of data. */
  wonUnavailable: boolean
  /**
   * True when these figures were scoped to the client's configured campaigns
   * (`salesforceConfig.campaignNames`) rather than covering the whole CRM.
   *
   * The UI MUST say so. Scoped and unscoped numbers differ by orders of
   * magnitude for a client whose CRM also holds business the agency did not
   * source, and a reader cannot tell which they are looking at from the figure
   * alone. False means whole-org, which is the pre-existing behaviour.
   */
  campaignScoped: boolean
  /**
   * True when the OPEN row set arrived with rows but NONE were on the configured
   * campaigns, so openDeals, totalPipeline and weightedPipeline each computed 0
   * from an empty scoped set.
   *
   * Same hazard as `wonStageUnmatched`: a plausible $0 that actually means the
   * campaign was renamed in the CRM. Render a caveat rather than a confident
   * zero. False when no filter is configured, and false for an empty fetch —
   * that is missing data, which `openUnavailable` / `wonUnavailable` cover.
   */
  openCampaignUnmatched: boolean
  /**
   * The same statement for the CLOSED-WON row set, which backs only the
   * closedWon tile.
   *
   * Kept separate from `openCampaignUnmatched` rather than OR'd into one flag,
   * because the two describe different windows on different date bases (open is
   * a wide created-date window evaluated as of now; won is year to date on the
   * close date). Either can be true alone, and won-alone is the ORDINARY state
   * of a client scoped mid-year who has open pipeline and no close yet. A single
   * flag made the UI disclaim all four tiles whenever either window was empty.
   */
  wonCampaignUnmatched: boolean
  /**
   * The same statement for the OWNER row set, which backs the Open Deals by
   * Owner breakdown and no tile at all.
   *
   * A FOURTH flag rather than widening the tile caveat's wording, because the
   * breakdown is not a tile and the caveat region explains dashed tiles. When
   * the owner rows are filtered to empty, `byOwner` is `[]` and the list renders
   * its ordinary empty copy — "No open deals by owner." — which is a different
   * claim from "no owners matched the configured campaigns" and, in this case,
   * the false one. Only the UI can tell them apart, and only if it is told.
   *
   * Same contract as the other two: false when no filter is configured, and
   * false for an empty fetch, which is missing data rather than a mismatch.
   */
  ownerCampaignUnmatched: boolean
}

export interface WeekBucket {
  /** ISO year and week, e.g. '2026-W33'. Normalized from the API's 'YYYY|WW'. */
  week: string
  contacts: number
}

export interface WeeklyContacts {
  /** Every ISO week from the first with data through the current one, gap-filled
   * with zeros where the API omitted a week, so consecutive entries are genuinely
   * consecutive calendar weeks. */
  weeks: WeekBucket[]
  /** Contacts in the ISO week currently in progress, covering only the days
   * elapsed so far. Always read this together with daysElapsedInCurrentWeek:
   * on its own it looks like a collapsed week rather than a partial one. */
  currentWeek: number
  /** True whenever currentWeek covers a week still in progress, which is every
   * live render. Present so a consumer cannot use currentWeek without meeting
   * the fact that it is partial. */
  currentWeekPartial: boolean
  /** 1 (Monday) through 7 (Sunday): how much of the current week currentWeek covers. */
  daysElapsedInCurrentWeek: number
  /** The most recent COMPLETE ISO week. This, not currentWeek, is the figure to
   * headline when a full week is what the reader expects. */
  previousWeek: number
  /** The same ISO week last year as previousWeek, so both sides are full weeks.
   * Undefined when the compare query failed or had no matching week. */
  priorYearWeek?: number
  /**
   * True when rows arrived but NONE were on the client's configured campaigns,
   * so this series is empty because the filter matched nothing — not because
   * the client created no leads.
   *
   * The distinction is the whole point. An empty series renders NoData, whose
   * message claims the PERIOD was empty, and that is simply false here: the
   * query returned plenty of rows. Same hazard as
   * PipelineData.campaignUnmatched, and the two blocks sit on the same page,
   * so they must not explain one renamed campaign two different ways.
   *
   * Always false on the contacts path, which cannot be campaign-scoped at all.
   */
  campaignUnmatched: boolean
  /**
   * True when the underlying query returned at least as many rows as its cap, so
   * the weekly counts may be undercounted.
   *
   * Optional because only the LEADS path currently computes it: that query is
   * one row per lead PER CAMPAIGN, so its row count scales with the campaign
   * programme rather than with the 53 weeks of the window, and the cap is
   * reachable in a way the contacts query's is not. Undefined means "not
   * measured", which is why the UI must treat only an explicit `true` as a
   * caveat.
   */
  truncated?: boolean
  /**
   * How many in-scope rows were discarded because they carried no lead id.
   *
   * `dedupeLeadWeeks` must drop them — admitting them would collapse every
   * id-less row onto one key and report them all as a single lead — but dropping
   * them silently reaches the same false explanation `campaignUnmatched` exists
   * to prevent, by a different route: if every in-scope row is id-less the
   * series is empty and the block would claim the PERIOD was empty. Surfaced so
   * the UI can say what actually happened. Undefined on the contacts path, which
   * has no per-lead identity to lose.
   */
  unusableRows?: number
  /** Percent change between the two most recent COMPLETE weeks. Deliberately not
   * a comparison against currentWeek: a partial week against a complete one is
   * structurally invalid and renders as a large false decline early in the week.
   * Undefined when there is no second complete week, or the earlier one is 0. */
  completedWeekOverWeek?: number
}
