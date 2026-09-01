import { CHART_COLORS } from '@/lib/constants'
import type { DemandStage } from './demand-journey'
import type { TrendRow } from './sessions-trend-chart'
import type { PipelineData, WeeklyContacts } from '@/lib/salesforce/types'
import { fmtNum, fmtPct, fmtUsd, pct } from './reshape'

export interface StageInput {
  totals: Record<string, unknown> | null
  cmpTotals: Record<string, unknown> | null
  peec: {
    weeklyVisibility?: { weekStart: string; visibility: number }[]
    /**
     * False when lib/peec/client.ts could not determine which tracked brand is
     * the client (no peec_your_brand column and no PEEC_AI_YOUR_BRAND env
     * fallback). In that state filterYou keeps every brand, so weeklyVisibility
     * is an all-brands average rather than the client's own visibility. Absent
     * on older callers, which are treated as resolved.
     */
    yourBrandResolved?: boolean
    brandRankings?: { name: string; sov: number; isYou?: boolean }[]
    trackedPrompts?: unknown[]
  } | null
  trendRows: TrendRow[]
  /**
   * Whether the client is CONFIGURED for AI-visibility tracking (has a Peec
   * project), independent of whether this fetch returned data. A configured
   * client whose fetch failed or came back empty must NOT read "not connected";
   * it dashes like the GA4 hero card. Only a genuinely unconfigured client is
   * unconnected. When omitted, falls back to `peec != null` for older callers.
   */
  peecConnected?: boolean
  /** Pipeline tile data, or null when the fetch failed or the client has no CRM. */
  pipeline?: PipelineData | null
  /** Weekly contact data, or null when the fetch failed or the client has no CRM. */
  contacts?: WeeklyContacts | null
  /**
   * Whether the CLIENT is CONFIGURED for a CRM, independent of whether either
   * fetch returned data. Exactly the same distinction peecConnected draws
   * above: a configured client whose fetch failed must NOT read "not
   * connected", it dashes. Comes from isSalesforceConfigured (client row
   * state), never from canQuerySalesforce: a deployment missing the shared
   * Supermetrics key is a load failure, not an unconnected CRM. When omitted,
   * falls back to data presence for older callers.
   */
  crmConnected?: boolean
  /**
   * Whether this client's CRM figures are scoped to configured campaigns.
   *
   * Only affects wording: the inbound card counts LEADS for a scoped client
   * (leads are the only inbound object carrying a campaign — see lib/salesforce/
   * leads.ts) and CONTACTS for everyone else, and it must name the object it is
   * actually counting. The section heading in index.tsx already switches on the
   * same predicate; this keeps the journey card from contradicting it.
   *
   * Must come from hasCampaignScope (lib/salesforce/campaign-filter.ts), never
   * from a hand-rolled `campaignNames.length > 0`.
   */
  crmScoped?: boolean
  /**
   * Injectable "current time" for the partial-week detection below. Defaults
   * to the real current time; tests pass a fixed Date so the AI Visibility
   * delta assertions are not time-dependent.
   */
  now?: Date
}

/** ISO date (UTC) of the Monday that starts the week containing `date`. Mirrors
 *  the Monday key computed by groupByWeek in lib/peec/client.ts, so the two
 *  stay in lockstep, this must keep matching that function's math exactly. */
function isoWeekStart(date: Date): string {
  const day  = date.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(date)
  monday.setUTCDate(date.getUTCDate() + diff)
  return monday.toISOString().split('T')[0]
}

/**
 * Drops the final bucket of a weeklyVisibility series when it is the current,
 * still-accumulating ISO week. The last bucket from Peec's weekly grouping is
 * the in-progress week (e.g. two days of data on a Tuesday), so comparing it
 * to a full prior week understates or inflates the delta depending on the day
 * it's read. A no-op when the final bucket is not the current week (Peec may
 * already exclude it).
 */
function dropPartialWeek<T extends { weekStart: string }>(weekly: T[], now: Date): T[] {
  if (weekly.length === 0) return weekly
  const last = weekly[weekly.length - 1]
  return last.weekStart === isoWeekStart(now) ? weekly.slice(0, -1) : weekly
}

export function buildStages({ totals, cmpTotals, peec, trendRows, peecConnected, pipeline, contacts, crmConnected, crmScoped = false, now = new Date() }: StageInput): DemandStage[] {
  // A contacts object with no weeks is a successful fetch that found nothing,
  // not data. See the inbound stage below for why the distinction matters.
  const withWeeks = contacts && contacts.weeks.length > 0 ? contacts : null
  // With no resolvable "your brand", weeklyVisibility is an average across every
  // tracked brand (filterYou degrades to a pass-through), which is emphatically
  // not this client's visibility rate. Dash instead of publishing a number that
  // means something else. Share of Voice already dashes in this state, since
  // isYou is false for every brand, so this also keeps the card self-consistent.
  const brandResolved = peec?.yourBrandResolved !== false
  const completeWeeks = brandResolved ? dropPartialWeek(peec?.weeklyVisibility ?? [], now) : []
  const latest   = completeWeeks.at(-1)?.visibility ?? null
  const previous = completeWeeks.at(-2)?.visibility ?? null
  // isYou is computed from clients.peec_your_brand. Matching on a literal brand
  // name here would blank share of voice for every client but the one hardcoded.
  const aeoSov   = peec?.brandRankings?.find((b) => b.isYou)?.sov ?? null

  // The pipeline card must dash on EVERY state that makes the figure unknowable,
  // not only the two it already knew about. campaignUnmatched is the third: the
  // scoped window returned rows and none were on the configured campaigns, so
  // the tiles compute 0 from an empty set. Left unread, this card headlined a
  // confident $0 and "0 open deals" immediately above a Pipeline Performance
  // block saying those very totals could not be trusted — the funnel and the
  // block contradicting each other on one screen.
  //
  // Split the same way PipelineData splits it: the open windows and the won
  // window can be unmatched independently, so a client with open pipeline and no
  // close yet keeps a live hero metric and dashes only the Closed Won stat.
  //
  // Both read the value flags rather than re-OR'ing the narrow ones, which is
  // also what keeps this card and the block below agreeing on a fourth state
  // neither of them can compute: a capped response whose scoped set is empty.
  // The campaign flags are false there on purpose (a capped response cannot
  // support the rename accusation), so an OR of them would have put a confident
  // $0 back in the hero metric while the block dashed — the same contradiction
  // in the opposite direction.
  const openGone = !!pipeline && pipeline.openValueUnknown
  const wonGone  = !!pipeline && pipeline.wonValueUnknown

  return [
    {
      key: 'aeo', source: 'AEO', label: 'AI Visibility',
      metric: latest != null ? `${latest.toFixed(1)}%` : '—',
      // Share of voice is genuinely year-to-date (it comes from the same
      // year_to_date-scoped brandRankings query), while the hero metric above
      // is the last complete week. Naming the window inline keeps the card
      // honest instead of implying both numbers share one window.
      subMetric: aeoSov != null ? `${aeoSov.toFixed(1)}% share of voice, year to date` : undefined,
      delta: latest != null && previous != null ? pct(latest, previous) : undefined,
      color: CHART_COLORS.primary,
      connector: 'drives discovery',
      // The hero metric is the latest COMPLETE week's visibility (see
      // dropPartialWeek above), not a year-to-date figure, so the badge names
      // that window instead of claiming YTD.
      badge: 'LAST FULL WEEK',
      deltaLabel: 'vs prior week',
      heroLabel: 'visibility rate across tracked prompts',
      stats: [
        { label: 'Share of Voice',  value: aeoSov != null ? `${aeoSov.toFixed(1)}%` : '—' },
        { label: 'Tracked Brands',  value: peec?.brandRankings?.length?.toLocaleString() ?? '—' },
        { label: 'Tracked Prompts', value: peec?.trackedPrompts?.length?.toLocaleString() ?? '—' },
      ],
      // Connected reflects whether the source is CONFIGURED, not whether this
      // fetch returned data. A configured client whose fetch failed or came
      // back empty dashes (metric falls back to the null glyph above), the same
      // as the GA4 hero card on a GA4 outage, rather than being told to connect
      // a source that is already connected. Only a genuinely unconfigured
      // client is unconnected. Falls back to the old peec-presence check for
      // callers that do not pass the flag.
      connected: peecConnected ?? (peec != null),
      // Vendor-neutral: this is AI-visibility tracking, not a CRM. The generic
      // "Not connected" branch used to hardcode CRM wording for every
      // unconnected stage, which told an unconfigured AEO client to go connect
      // a CRM that has nothing to do with it.
      unconnectedHint: 'Connect AI visibility tracking to see this',
    },
    {
      key: 'ga4', source: 'Web Analytics', label: 'Site Sessions',
      metric: fmtNum(totals?.sessions as number),
      subMetric: `${fmtPct(totals?.sessionConversionRate as number)} conv. rate`,
      delta: pct(totals?.sessions as number, cmpTotals?.sessions as number),
      color: CHART_COLORS.ga4,
      connector: 'converts to leads',
      heroLabel: 'sessions in the last 30 days',
      spark: trendRows.map((r) => ({ date: r.date, sessions: r.sessions })),
      stats: [
        { label: 'Active Users', value: fmtNum(totals?.activeUsers as number) },
        { label: 'New Users',    value: fmtNum(totals?.newUsers as number) },
        { label: 'Conversions',  value: fmtNum(totals?.conversions as number) },
        { label: 'Bounce Rate',  value: fmtPct(totals?.bounceRate as number) },
      ],
    },
    {
      // The label names the object being counted, which differs by scope: a
      // scoped client's series is agency-sourced LEADS, everyone else's is every
      // CONTACT created. index.tsx:176 already switches its section heading the
      // same way; leaving this hardcoded put "Online Contacts" on the card
      // heading a block titled "Lead Creation".
      key: 'inbound', source: 'Inbound Funnel', label: crmScoped ? 'Online Leads' : 'Online Contacts',
      color: CHART_COLORS.positive,
      connector: 'becomes pipeline',
      // withWeeks, not `contacts`: a fetch that SUCCEEDS but returns zero
      // usable rows still yields a non-null object, with weeks: [] and
      // currentWeek: 0 (`?? 0` at contacts.ts:150), so gating on presence alone
      // headlines a confident 0 under a WEEK TO DATE badge. That is the same
      // confident-zero-under-degrade the Contact Creation block already refuses
      // (ContactPacing returns <NoData /> on weeks.length === 0,
      // contact-pacing.tsx:25); the card beside it must not claim a figure the
      // block declines to claim. The stats below stay gated on `contacts`: they
      // already dash individually in this state, which is the right treatment
      // for a configured client with no data.
      metric: withWeeks ? fmtNum(withWeeks.currentWeek) : '—',
      // The window label for this card: the hero is week to date, not the
      // page's 30 days.
      badge: withWeeks ? 'WEEK TO DATE' : undefined,
      subMetric: withWeeks ? `${withWeeks.daysElapsedInCurrentWeek} of 7 days so far` : undefined,
      // Never a delta on this metric: it is a partial week, and the only
      // comparison the source offers is between two COMPLETE weeks.
      delta: undefined,
      // Written out, not "retained": the stub this replaces carried no
      // heroLabel at all, so retaining would ship a blank hover reveal.
      heroLabel: withWeeks
        ? `new ${crmScoped ? 'leads' : 'contacts'} created so far this week`
        : undefined,
      stats: contacts ? [
        // weeks.length < 2 means no completed week exists, so previousWeek's 0
        // is the `?? 0` at contacts.ts:153 rather than a count.
        { label: 'Previous Week',  value: contacts.weeks.length >= 2 ? fmtNum(contacts.previousWeek) : '—' },
        { label: 'Week over Week', value: contacts.completedWeekOverWeek != null ? `${contacts.completedWeekOverWeek > 0 ? '+' : ''}${contacts.completedWeekOverWeek.toFixed(1)}%` : '—' },
        { label: 'Prior Year Week', value: contacts.priorYearWeek != null ? fmtNum(contacts.priorYearWeek) : '—' },
      ] : undefined,
      // Only `false` triggers the unconnected treatment (demand-journey.tsx:128-133),
      // so a configured client with no data omits this and simply dashes.
      connected: (crmConnected ?? (contacts != null)) ? undefined : false,
      unconnectedHint: 'Connect your CRM to see this',
    },
    {
      key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline',
      color: CHART_COLORS.neutral,
      // No connector: last stage in the row.
      metric: pipeline && !openGone ? fmtUsd(pipeline.totalPipeline.value) : '—',
      badge: pipeline ? 'AS OF TODAY' : undefined,
      // Must not keep stating a deal count beside a dashed value: that is the
      // same defect as a live delta under a dashed number, in a different field.
      subMetric: pipeline
        ? (pipeline.openUnavailable ? "Couldn't load open pipeline."
           : pipeline.openCampaignUnmatched ? 'No open deals on the agency-sourced campaigns.'
           // Same tail as the block's tile caveat: the only state left where
           // the value is unknown but no named flag explains it.
           : pipeline.openValueUnknown ? 'Row limit reached before any agency-sourced deal.'
           : `${fmtNum(pipeline.openDeals.value)} open deals`)
        : undefined,
      // Named explicitly rather than reading totalPipeline.delta, which is
      // always undefined but would read like a live wire waiting to be fixed.
      delta: undefined,
      heroLabel: pipeline ? 'open pipeline as of today' : undefined,
      stats: pipeline ? [
        // Dashes under both flags, matching the block below: a renamed stage
        // makes the true figure unknown, not zero.
        { label: 'Closed Won',        value: wonGone  ? '—' : fmtUsd(pipeline.closedWon.value) },
        { label: 'Weighted Pipeline', value: openGone ? '—' : fmtUsd(pipeline.weightedPipeline.value) },
      ] : undefined,
      connected: (crmConnected ?? (pipeline != null)) ? undefined : false,
      unconnectedHint: 'Connect your CRM to see this',
    },
  ]
}
