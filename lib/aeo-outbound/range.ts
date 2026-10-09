// The requested report range (spec §7 step 4). UTC calendar days, YYYY-MM-DD, both ends inclusive.
import { DEFAULT_WINDOW_DAYS, MAX_LOOKBACK_DAYS, MAX_WINDOW_DAYS } from './config'

export interface DayRange { start: string; end: string }

const DAY_MS = 86_400_000
const SHAPE = /^\d{4}-\d{2}-\d{2}$/

export const todayUtc = (nowMs: number): string => new Date(nowMs).toISOString().slice(0, 10)

/** Midnight UTC of a real calendar day, or null. The round trip rejects 2026-02-30. */
function parseDay(s: unknown): number | null {
  if (typeof s !== 'string' || !SHAPE.test(s)) return null
  const ms = Date.parse(`${s}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10) === s ? ms : null
}

export function defaultRange(nowMs: number): DayRange {
  const end = todayUtc(nowMs)
  const start = new Date(Date.parse(`${end}T00:00:00Z`) - (DEFAULT_WINDOW_DAYS - 1) * DAY_MS).toISOString().slice(0, 10)
  return { start, end }
}

export function checkRange(
  input: { start?: unknown; end?: unknown },
  nowMs: number,
): { ok: true; range: DayRange | null } | { ok: false; error: string } {
  const { start, end } = input
  if (start === undefined && end === undefined) return { ok: true, range: null }
  if (start === undefined || end === undefined || start === '' || end === '') {
    return { ok: false, error: 'Pick both a start and an end date, or neither.' }
  }
  const s = parseDay(start)
  const e = parseDay(end)
  if (s === null || e === null) return { ok: false, error: 'Dates must be real days in YYYY-MM-DD.' }
  if (s > e) return { ok: false, error: 'The start date must be on or before the end date.' }
  const today = Date.parse(`${todayUtc(nowMs)}T00:00:00Z`)
  if (e > today) return { ok: false, error: "The end date can't be in the future." }
  if (s < today - MAX_LOOKBACK_DAYS * DAY_MS) return { ok: false, error: `The start date can't be more than ${MAX_LOOKBACK_DAYS} days ago.` }
  if ((e - s) / DAY_MS + 1 > MAX_WINDOW_DAYS) return { ok: false, error: `Pick at most ${MAX_WINDOW_DAYS} days.` }
  return { ok: true, range: { start: start as string, end: end as string } }
}
