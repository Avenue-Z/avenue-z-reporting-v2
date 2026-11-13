// lib/organic-social/aeo-informed/windows.ts
// Date windows for the AEO Informed Social adapter. All dates are UTC calendar days as YYYY-MM-DD and every window is
// inclusive of both ends (Peec's start_date and end_date are inclusive: verified against the live reports).

export type Window = { start: string; end: string }

const DAY_MS = 86_400_000
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export function assertIsoDate(s: string): void {
  const m = ISO.exec(s)
  if (!m) throw new RangeError(`not a YYYY-MM-DD date: "${s}"`)
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3])
  if (new Date(t).toISOString().slice(0, 10) !== s) throw new RangeError(`not a real calendar date: "${s}"`)
}

const ms = (s: string): number => {
  assertIsoDate(s)
  return Date.parse(`${s}T00:00:00Z`)
}
const iso = (t: number): string => new Date(t).toISOString().slice(0, 10)
const addDays = (s: string, n: number): string => iso(ms(s) + n * DAY_MS)

function assertWindow(w: Window): void {
  if (ms(w.start) > ms(w.end)) throw new RangeError(`window starts after it ends: ${w.start}..${w.end}`)
}

/** Number of days in the window, counting both ends. */
export function daysIn(w: Window): number {
  assertWindow(w)
  return (ms(w.end) - ms(w.start)) / DAY_MS + 1
}

/** The n days ending on `end` (inclusive). */
export function lastNDays(end: string, n: number): Window {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`n must be a whole number of at least 1, got ${n}`)
  return { start: addDays(end, -(n - 1)), end }
}

/** A calendar month, e.g. '2026-09'. */
export function calendarMonth(ym: string): Window {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  if (!m || +m[2] < 1 || +m[2] > 12) throw new RangeError(`not a YYYY-MM month: "${ym}"`)
  const start = `${m[1]}-${m[2]}-01`
  const lastDay = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate()
  return { start, end: `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}` }
}

/** January 1 of today's year through today. */
export function ytd(today: string): Window {
  assertIsoDate(today)
  return { start: `${today.slice(0, 4)}-01-01`, end: today }
}

/** From the first date the project has data through today. */
export function allTime(first: string, today: string): Window {
  const w = { start: first, end: today }
  assertWindow(w)
  return w
}

/** The window of the same length that ends the day before `w` starts (Peec's "previous period", used for every delta). */
export function previousWindow(w: Window): Window {
  const len = daysIn(w)
  const end = addDays(w.start, -1)
  return { start: addDays(end, -(len - 1)), end }
}

/** n consecutive 7-day buckets starting on `start`. They follow the chart's own start date, not ISO weeks. */
export function weeklyBuckets(start: string, n: number): Window[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`n must be a whole number of at least 1, got ${n}`)
  assertIsoDate(start)
  return Array.from({ length: n }, (_, i) => ({ start: addDays(start, 7 * i), end: addDays(start, 7 * i + 6) }))
}

/** Every calendar day in the window, in order. */
export function eachDay(w: Window): string[] {
  const n = daysIn(w)
  return Array.from({ length: n }, (_, i) => addDays(w.start, i))
}
