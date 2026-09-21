// Locked months: which reporting months a viewer may pick, which one to serve, and what it compares
// against. Pure: no I/O, no React, no clock read (the clock is an argument). The rules are in
// docs/superpowers/specs/2026-09-21-locked-months-design.md, section 3. Inputs are `unknown` on
// purpose: the jsonb config and the URL param are untrusted at runtime whatever their types say.

export const MAX_REPORTING_MONTHS = 36

export type Clock = { today: string; lastCompleteUtcDay: string; liveDayInProgress: boolean }
export type Viewer = 'team' | 'client'
export type MonthOption = {
  key: string
  label: string
  dateRange: string
  compareRange: string
  compareLabel: string
  live: boolean
  opensOn: string
  tag: string | null
}
export type LockedRange = {
  months: MonthOption[]
  month: MonthOption | null
  outcome: 'canonical' | 'absent' | 'replaced'
  hiddenMonthAttempt: boolean
  reason: 'ok' | 'malformed-config' | 'not-started' | 'not-open-yet'
  malformedKey: string | null
  firstOpensOn: string | null
}

type WeekendRule = 'next-monday' | 'previous-friday'
type Comparison = 'previous-month' | 'previous-year'
type Config = { firstMonth: string; opensOnDay: number; weekendRule: WeekendRule; comparison: Comparison }
type Parsed = { ok: true; cfg: Config; badKey: string | null } | { ok: false; key: string }

const TEAM_ROLES = new Set(['INTERNAL_ADMIN', 'INTERNAL_ANALYST'])
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const CUSTOM_RE = /^custom:(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const hasOwn = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k)
const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const utc = (day: string) => new Date(`${day}T00:00:00Z`)
const addDays = (day: string, n: number) => { const d = utc(day); d.setUTCDate(d.getUTCDate() + n); return isoDay(d) }
const addMonths = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(2000, 0, 1))
  d.setUTCFullYear(y, m - 1 + n, 1)
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad(d.getUTCMonth() + 1)}`
}
const isDay = (s: string) => { const d = utc(s); return !Number.isNaN(d.getTime()) && isoDay(d) === s }

export const firstOf = (key: string) => `${key}-01`
export const lastOf = (key: string) => addDays(`${addMonths(key, 1)}-01`, -1)
export const monthOf = (day: string) => day.slice(0, 7)
const daysIn = (key: string) => Number(lastOf(key).slice(8))

export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}
export function shortDay(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  return `${MONTH_SHORT[m - 1]} ${d}`
}

export function viewerForRole(role: unknown): Viewer {
  return typeof role === 'string' && TEAM_ROLES.has(role) ? 'team' : 'client'
}

/** Opted in = dash_social_config is a plain object with its OWN reportingMonths key, whatever its
 *  value (spec 3.1). Synchronous, no I/O. */
export function hasReportingMonths(client: unknown): boolean {
  if (!isPlainObject(client)) return false
  const cfg = client.dashSocialConfig
  return isPlainObject(cfg) && hasOwn(cfg, 'reportingMonths')
}

/** One clock per request (spec 3.2). */
export function clockFor(now: Date): Clock {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    today: `${part('year')}-${part('month')}-${part('day')}`,
    lastCompleteUtcDay: addDays(isoDay(now), -1),
    liveDayInProgress: now.getUTCHours() < 4,
  }
}

/** The day finished month `key` opens to clients: day `opensOnDay` of the next month, off a weekend. */
export function opensOn(key: string, opensOnDay: number, weekendRule: WeekendRule): string {
  const day = `${addMonths(key, 1)}-${pad(opensOnDay)}`
  const weekday = utc(day).getUTCDay()
  if (weekday === 6) return addDays(day, weekendRule === 'next-monday' ? 2 : -1)
  if (weekday === 0) return addDays(day, weekendRule === 'next-monday' ? 1 : -2)
  return day
}

export function parseReportingMonths(value: unknown): Parsed {
  if (!isPlainObject(value)) return { ok: false, key: 'reportingMonths' }
  const firstMonth = value.firstMonth
  if (typeof firstMonth !== 'string' || !MONTH_RE.test(firstMonth)) return { ok: false, key: 'firstMonth' }
  let badKey: string | null = null
  const bad = (k: string) => { if (badKey === null) badKey = k }
  let opensOnDay = 12
  if (hasOwn(value, 'opensOnDay')) {
    const v = value.opensOnDay
    if (typeof v === 'number' && Number.isInteger(v) && v >= 4 && v <= 28) opensOnDay = v
    else bad('opensOnDay')
  }
  let weekendRule: WeekendRule = 'next-monday'
  if (hasOwn(value, 'weekendRule')) {
    const v = value.weekendRule
    if (v === 'next-monday' || v === 'previous-friday') weekendRule = v
    else bad('weekendRule')
  }
  let comparison: Comparison = 'previous-month'
  if (hasOwn(value, 'comparison')) {
    const v = value.comparison
    if (v === 'previous-month' || v === 'previous-year') comparison = v
    else bad('comparison')
  }
  return { ok: true, cfg: { firstMonth, opensOnDay, weekendRule, comparison }, badKey }
}

function comparisonFor(key: string, end: string, live: boolean, comparison: Comparison) {
  const ref = addMonths(key, comparison === 'previous-year' ? -12 : -1)
  if (!live) return { range: `custom:${firstOf(ref)},${lastOf(ref)}`, label: `vs ${monthTitle(ref)}` }
  const refEnd = `${ref}-${pad(Math.min(Number(end.slice(8)), daysIn(ref)))}`
  return { range: `custom:${firstOf(ref)},${refEnd}`, label: `vs ${shortDay(firstOf(ref))} to ${shortDay(refEnd)}` }
}

function option(key: string, live: boolean, end: string, cfg: Config, badKey: string | null, viewer: Viewer, clock: Clock): MonthOption {
  const open = opensOn(key, cfg.opensOnDay, cfg.weekendRule)
  const cmp = comparisonFor(key, end, live, cfg.comparison)
  const label = live
    ? `${monthTitle(key)}, through ${shortDay(end)}${clock.liveDayInProgress ? ' (in progress)' : ''}`
    : monthTitle(key)
  let tag: string | null = null
  if (viewer === 'team') {
    if (live) tag = 'Live, team only'
    else if (badKey) tag = 'Hidden from clients: config error'
    else if (clock.today < open) tag = `Team only until ${shortDay(open)}`
  }
  return { key, label, dateRange: `custom:${firstOf(key)},${end}`, compareRange: cmp.range, compareLabel: cmp.label, live, opensOn: open, tag }
}

const liveExists = (current: string, clock: Clock) => clock.lastCompleteUtcDay >= firstOf(current)

/** Newest first: the team gets the live month (when there is one) and every finished month back to
 *  firstMonth; a client gets the finished months that have opened. Bounded by MAX_REPORTING_MONTHS. */
function monthsFor(cfg: Config, badKey: string | null, viewer: Viewer, clock: Clock): MonthOption[] {
  const current = monthOf(clock.today)
  const out: MonthOption[] = []
  if (viewer === 'team' && current >= cfg.firstMonth && liveExists(current, clock)) {
    out.push(option(current, true, clock.lastCompleteUtcDay, cfg, badKey, viewer, clock))
  }
  if (viewer === 'client' && badKey) return out
  let key = addMonths(current, -1)
  for (let i = 0; i < MAX_REPORTING_MONTHS + 2 && key >= cfg.firstMonth && out.length < MAX_REPORTING_MONTHS; i++, key = addMonths(key, -1)) {
    if (viewer === 'client' && clock.today < opensOn(key, cfg.opensOnDay, cfg.weekendRule)) continue
    out.push(option(key, false, lastOf(key), cfg, badKey, viewer, clock))
  }
  return out
}

function parseCustom(s: string): { start: string; end: string } | null {
  const m = CUSTOM_RE.exec(s)
  if (!m) return null
  const [, start, end] = m
  return isDay(start) && isDay(end) && start <= end ? { start, end } : null
}

export function resolveLockedRange(cfgValue: unknown, viewer: Viewer, clock: Clock, requested: unknown): LockedRange {
  const present = requested !== undefined
  const parsed = parseReportingMonths(cfgValue)
  if (!parsed.ok) {
    return { months: [], month: null, outcome: present ? 'replaced' : 'absent', hiddenMonthAttempt: false, reason: 'malformed-config', malformedKey: parsed.key, firstOpensOn: null }
  }
  const { cfg, badKey } = parsed
  const current = monthOf(clock.today)
  const months = monthsFor(cfg, badKey, viewer, clock)
  const req = typeof requested === 'string' ? parseCustom(requested) : null
  const reqKey = req && req.start === firstOf(monthOf(req.start)) && monthOf(req.end) === monthOf(req.start) ? monthOf(req.start) : null
  const match = reqKey
    ? months.find((m) => m.key === reqKey && (m.live || req!.end === lastOf(m.key))) ?? null
    : null
  const month = match ?? (viewer === 'team' ? months.find((m) => !m.live) ?? months[0] : months[0]) ?? null
  const outcome: LockedRange['outcome'] = !present ? 'absent' : month && requested === month.dateRange ? 'canonical' : 'replaced'
  // A hidden-month attempt (logged): a whole-month or live-month request for a month that exists but
  // is not in a CLIENT's list, i.e. the live month or a finished month that has not opened (spec 3.7).
  const wholeOrLive = reqKey !== null && (reqKey === current ? liveExists(current, clock) : req!.end === lastOf(reqKey))
  const hiddenMonthAttempt = viewer === 'client' && match === null && wholeOrLive
    && reqKey! >= cfg.firstMonth && reqKey! <= current && !months.some((m) => m.key === reqKey)
  const reason: LockedRange['reason'] = badKey ? 'malformed-config'
    : months.length ? 'ok'
    : cfg.firstMonth > current ? 'not-started' : 'not-open-yet'
  const firstOpensOn = months.length === 0 && viewer === 'client' && !badKey ? opensOn(cfg.firstMonth, cfg.opensOnDay, cfg.weekendRule) : null
  return { months, month, outcome, hiddenMonthAttempt, reason, malformedKey: badKey, firstOpensOn }
}

/** The one line shown when a viewer has no months (spec 3.8). */
export function noMonthsText(r: LockedRange, viewer: Viewer): string {
  if (viewer === 'client') return r.firstOpensOn ? `Your first report opens on ${shortDay(r.firstOpensOn)}` : 'No reports are available yet'
  if (r.reason === 'malformed-config') return `No reporting months yet: the reportingMonths setting is invalid (${r.malformedKey ?? 'reportingMonths'})`
  if (r.reason === 'not-started') return 'No reporting months yet: the first reporting month has not started'
  return 'No reporting months yet'
}
