// ─── Content Calendar Types ───────────────────────────────────────────────────
//
// Used by lib/content-calendar/client.ts and content-impact.tsx.
// PRD source: Content Impact Tracker Dashboard PRD (FR2, FR3, FR4, FR5).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How content was intentionally acted on (PRD FR5).
 * Drives Section D: Net-New vs Optimized Content Lift.
 */
export type ContentAction = 'new' | 'optimized' | 'other'

/**
 * Whether a planned URL could be matched to a live data source (PRD FR4).
 * Drives Section A: % Null / Unmatched KPI.
 */
export type MatchStatus =
  | 'matched'      // URL is live and matched to GA4 / Peec data
  | 'unmatched'    // URL exists but no GA4 / Peec data found
  | 'redirected'   // URL redirects to another destination
  | 'unpublished'  // Planned but not yet live
  | 'unknown'      // Cannot determine -- needs QA

/**
 * A single row from the content calendar Google Sheet.
 * PRD Section B columns: Topic, URL, Content Type, Status,
 * Content Action, Publish Date, Update Date.
 * aiCitations and aiBotVisits are enriched at render time
 * by cross-referencing Peec and Agent Analytics data.
 */
export interface ContentCalendarRow {
  topic:          string
  url:            string | null   // null = placeholder / TBD
  contentType:    string
  status:         string          // raw value from sheet (Live, Draft, Planned, etc.)
  contentAction:  ContentAction
  publishDate:    string | null   // ISO date or raw text; null = TBD / not set
  updateDate:     string | null
  // Enriched at render time by cross-referencing live data sources
  matchStatus:    MatchStatus
  aiCitations:    number | null   // from Peec domain match
  aiBotVisits:    number | null   // from Agent Analytics path match
}

/**
 * Aggregated summary returned by getContentCalendarData().
 * Drives Section A KPI strip.
 */
export interface ContentCalendarData {
  rows:           ContentCalendarRow[]
  plannedCount:   number   // total rows in calendar
  liveCount:      number   // rows with a discoverable live URL
  newCount:       number   // contentAction === 'new'
  optimizedCount: number   // contentAction === 'optimized'
  unmatchedCount: number   // matchStatus !== 'matched'
}
