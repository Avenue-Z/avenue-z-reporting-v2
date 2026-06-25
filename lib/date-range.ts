// Pure, client-safe date-range resolution. Single source of truth for turning
// a date-range string (preset or `custom:`) into ISO start/end dates. Imported
// by server query builders (via lib/ga4/client re-export) AND by the client
// date picker, so it must stay free of server-only deps (only date-fns).
import { format } from 'date-fns'

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function _startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday-based
  const r = new Date(d)
  r.setDate(d.getDate() + diff)
  r.setHours(0, 0, 0, 0)
  return r
}
function _endOfWeek(d: Date): Date {
  const s = _startOfWeek(d)
  const e = new Date(s)
  e.setDate(s.getDate() + 6)
  return e
}
function _startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function _endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}
function _startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3)
  return new Date(d.getFullYear(), q * 3, 1)
}
function _endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3)
  return new Date(d.getFullYear(), q * 3 + 3, 0)
}

/**
 * Resolve any date-range preset or custom string to ISO date strings.
 * Always returns { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }.
 */
export function resolveDateRange(dateRange: string): { startDate: string; endDate: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (dateRange.startsWith('custom:')) {
    const [s, e] = dateRange.replace('custom:', '').split(',')
    return { startDate: s.trim(), endDate: e.trim() }
  }

  if (dateRange.includes(',')) {
    const [s, e] = dateRange.split(',')
    return { startDate: s.trim(), endDate: e.trim() }
  }

  const match = dateRange.match(/last_(\d+)_days/)
  if (match) {
    const days = parseInt(match[1])
    // Match Google Ads "Last N days": exactly N days ending YESTERDAY, so
    // today's partial (intraday) data is excluded. The previous behavior
    // returned N+1 days INCLUDING today, which made dashboard cost/clicks
    // disagree with the Google Ads UI for the same nominal range.
    const end = new Date(today); end.setDate(today.getDate() - 1)
    const start = new Date(today); start.setDate(today.getDate() - days)
    return { startDate: toISO(start), endDate: toISO(end) }
  }

  switch (dateRange) {
    case 'this_week':
      return { startDate: toISO(_startOfWeek(today)), endDate: toISO(today) }
    case 'last_week': {
      const prev = new Date(today); prev.setDate(today.getDate() - 7)
      return { startDate: toISO(_startOfWeek(prev)), endDate: toISO(_endOfWeek(prev)) }
    }
    case 'this_month':
      return { startDate: toISO(_startOfMonth(today)), endDate: toISO(today) }
    case 'last_month': {
      const lastM = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      return { startDate: toISO(_startOfMonth(lastM)), endDate: toISO(_endOfMonth(lastM)) }
    }
    case 'this_quarter':
      return { startDate: toISO(_startOfQuarter(today)), endDate: toISO(today) }
    case 'last_quarter': {
      const lq = new Date(today); lq.setMonth(today.getMonth() - 3)
      return { startDate: toISO(_startOfQuarter(lq)), endDate: toISO(_endOfQuarter(lq)) }
    }
    case 'this_year':
    case 'year_to_date':
      return { startDate: `${today.getFullYear()}-01-01`, endDate: toISO(today) }
    case 'last_year': {
      const ly = today.getFullYear() - 1
      return { startDate: `${ly}-01-01`, endDate: `${ly}-12-31` }
    }
    default: {
      const start = new Date(today); start.setDate(today.getDate() - 30)
      const end = new Date(today); end.setDate(today.getDate() - 1)
      return { startDate: toISO(start), endDate: toISO(end) }
    }
  }
}

/**
 * Human-readable resolved range for display, e.g. "Jun 10 – Jun 23, 2026".
 * Parsed as local time (T00:00:00) so the label can't drift a day in
 * negative-UTC timezones.
 */
export function formatResolvedRange(dateRange: string): string {
  const { startDate, endDate } = resolveDateRange(dateRange)
  const s = new Date(`${startDate}T00:00:00`)
  const e = new Date(`${endDate}T00:00:00`)
  return s.getFullYear() === e.getFullYear()
    ? `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
    : `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`
}
