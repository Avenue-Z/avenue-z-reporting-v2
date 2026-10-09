// Lock every number (D27): when a finished month's Dash answers stop changing. Pure.
import { createHash } from 'node:crypto'
import { opensOn, parseReportingMonths, firstOf, lastOf, monthOf } from './reporting-months'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const nextMonth = (key: string) => monthOf(addDays(lastOf(key), 1))
const prevMonth = (key: string) => monthOf(addDays(firstOf(key), -1))

/** reportingMonths.lockDay: default 5 (the SOP's wrap day); integers 4 to 28. */
export function parseLockDay(rm: unknown): { lockDay: number; bad: boolean } {
  const has = typeof rm === 'object' && rm !== null && Object.prototype.hasOwnProperty.call(rm, 'lockDay')
  if (!has) return { lockDay: 5, bad: false }
  const v = (rm as { lockDay: unknown }).lockDay
  return typeof v === 'number' && Number.isInteger(v) && v >= 4 && v <= 28 ? { lockDay: v, bad: false } : { lockDay: 5, bad: true }
}

/** Day `lockDay` of the month after `key`, the Friday before a weekend, never after the opening day. */
export function lockOn(key: string, lockDay: number, opensOnDate: string): string {
  let day = `${nextMonth(key)}-${String(lockDay).padStart(2, '0')}`
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay()
  if (wd === 6) day = addDays(day, -1)
  if (wd === 0) day = addDays(day, -2)
  return day <= opensOnDate ? day : opensOnDate
}

/** The last day whose numbers are locked on `today` (New York date), or null when the
 *  reportingMonths config is malformed (then nothing locks). At most two months are checked: the
 *  month before last always locked, since a lock day is at most the 28th. */
export function settledThrough(cfgValue: unknown, today: string): string | null {
  const parsed = parseReportingMonths(cfgValue)
  if (!parsed.ok) return null
  const { lockDay } = parseLockDay(cfgValue)
  let key = prevMonth(monthOf(today))
  for (let i = 0; i < 2; i++, key = prevMonth(key)) {
    if (today >= lockOn(key, lockDay, opensOn(key, parsed.cfg.opensOnDay, parsed.cfg.weekendRule))) return lastOf(key)
  }
  return lastOf(key)
}

const DATE_KEYS = ['startDate', 'endDate', 'contextStartDate', 'contextEndDate'] as const
const isDay = (d: string) => { if (!DAY.test(d)) return false; const t = new Date(`${d}T00:00:00Z`); return !Number.isNaN(t.getTime()) && iso(t) === d }
const shiftMonths = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(2000, 0, 1)); d.setUTCFullYear(y, m - 1 + n, 1)
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split('-').map(Number); const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** The latest day a request asks about, or null when it has no endDate or any date is impossible. */
export function requestPeriodEnd(params: Record<string, unknown>): string | null {
  if (params.endDate === undefined || params.endDate === null) return null
  const days: string[] = []
  for (const k of DATE_KEYS) {
    const v = params[k]
    if (v === undefined || v === null) continue
    const d = String(v).slice(0, 10)
    if (!isDay(d)) return null
    days.push(d)
  }
  return days.sort()[days.length - 1]
}

/** The same request one comparison step earlier (1 month, or 12 for previous-year), for the locked
 *  compare baseline. Null unless the compare window is one whole month. Time suffixes are kept. */
export function priorParams(params: Record<string, unknown>): Record<string, unknown> | null {
  const { startDate: s, contextStartDate: cs, contextEndDate: ce } = params
  if (typeof s !== 'string' || typeof cs !== 'string' || typeof ce !== 'string') return null
  const cs10 = cs.slice(0, 10), ce10 = ce.slice(0, 10)
  if (!isDay(cs10) || !isDay(ce10) || !isDay(s.slice(0, 10))) return null
  const ck = monthOf(cs10)
  if (cs10 !== firstOf(ck) || ce10 !== lastOf(ck)) return null
  const step = monthsBetween(ck, monthOf(s.slice(0, 10)))
  if (step !== 1 && step !== 12) return null
  const pk = shiftMonths(ck, -step)
  return { ...params, startDate: cs, endDate: ce, contextStartDate: firstOf(pk) + cs.slice(10), contextEndDate: lastOf(pk) + ce.slice(10) }
}

/** A stable hash of the exact request: method plus parameters, sorted, without undefined values. */
export function requestKey(method: string, params: Record<string, unknown>): string {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return createHash('sha256').update(JSON.stringify({ method, params: clean })).digest('hex')
}

/** A lock captured after its month's lock day (the numbers were captured late). */
export function isLateLock(periodEnd: string, cfgValue: unknown, today: string): boolean {
  const parsed = parseReportingMonths(cfgValue)
  if (!parsed.ok) return false
  const key = monthOf(periodEnd)
  const lock = lockOn(key, parseLockDay(cfgValue).lockDay, opensOn(key, parsed.cfg.opensOnDay, parsed.cfg.weekendRule))
  return today > lock
}
