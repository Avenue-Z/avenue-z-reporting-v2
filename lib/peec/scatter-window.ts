// FB-048 / CI-3c: pure resolver for the Content Impact bot-vs-human scatter
// (Section D) human-axis GA4 window.
//
// The bot axis (agentData.byPath) comes from Peec, which only retains 30
// days of bot-crawl data, so it can never be widened past a rolling last-30
// window. The human axis (GA4 sessions) used to be hardcoded to that same
// last-30 window regardless of the page date picker, so a client-selected
// range that was entirely inside the last 30 days still showed the wrong
// numbers (Paul's live QA flag CI-3c).
//
// This resolver lets the human axis follow the picker whenever the selected
// range fits inside the last 30 days. Outside that window (partially or
// fully older than 30 days) it falls back to the last-30 window, matching
// the previous unconditional behavior, so the two axes stay comparable and
// the default case is unchanged.

export interface ScatterWindowRange {
  startDate: string
  endDate: string
}

export interface ScatterWindowResult {
  start_date: string
  end_date: string
  locked: boolean
}

/**
 * Resolves the GA4 date window for the scatter's human axis.
 *
 * `effectiveRange` is the already-parsed selected range (startDate/endDate,
 * 'YYYY-MM-DD'). `today` is 'YYYY-MM-DD', matching how the rest of this file
 * derives "now" (new Date().toISOString().slice(0, 10)).
 */
export function resolveScatterWindow(
  effectiveRange: ScatterWindowRange,
  today: string
): ScatterWindowResult {
  const floor = minusDays(today, 30)
  const { startDate, endDate } = effectiveRange

  // Selected range is entirely older than the 30-day floor: no overlap with
  // the bot side's data at all, so fall back to the default last-30 window
  // (identical to the old unconditional behavior).
  if (endDate < floor) {
    return { start_date: floor, end_date: today, locked: true }
  }

  const clampedStart = startDate > floor ? startDate : floor
  const clampedEnd = endDate < today ? endDate : today
  const locked = clampedStart !== startDate || clampedEnd !== endDate

  return { start_date: clampedStart, end_date: clampedEnd, locked }
}

function minusDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
