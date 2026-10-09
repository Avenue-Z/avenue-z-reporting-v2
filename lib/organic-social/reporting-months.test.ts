import { describe, expect, test } from 'vitest'
import {
  MAX_REPORTING_MONTHS, clockFor, hasReportingMonths, noMonthsText, opensOn, parseReportingMonths,
  resolveLockedRange, viewerForRole, type Clock,
} from './reporting-months'
import { isPeriodOpen } from './frozen'
import { settledThrough } from './lock-day'

const C = (today: string, lastCompleteUtcDay: string, liveDayInProgress = false): Clock => ({ today, lastCompleteUtcDay, liveDayInProgress })
const CFG = { firstMonth: '2026-08' }
const OCT20 = C('2026-10-20', '2026-10-19')
const keys = (r: { months: { key: string }[] }) => r.months.map((m) => m.key)

describe('viewer and opt in', () => {
  test('only the two internal roles are the team; anything else is a client', () => {
    expect(viewerForRole('INTERNAL_ADMIN')).toBe('team')
    expect(viewerForRole('INTERNAL_ANALYST')).toBe('team')
    for (const r of ['CLIENT_VIEWER', 'CLIENT_ADMIN', 'INTERNAL_OTHER', undefined, null, 1, '']) expect(viewerForRole(r)).toBe('client')
  })
  test('opted in means the config has its own reportingMonths key, whatever the value', () => {
    expect(hasReportingMonths({ dashSocialConfig: { brandId: 1, reportingMonths: CFG } })).toBe(true)
    expect(hasReportingMonths({ dashSocialConfig: { brandId: 1, reportingMonths: null } })).toBe(true)
    const inherited = Object.create({ reportingMonths: CFG })
    for (const c of [{ dashSocialConfig: { brandId: 1 } }, { dashSocialConfig: null }, { dashSocialConfig: 'x' }, { dashSocialConfig: [] }, { dashSocialConfig: inherited }, null, undefined, 'c']) {
      expect(hasReportingMonths(c)).toBe(false)
    }
  })
})

describe('clock', () => {
  test('today is New York, the live month ends on the last complete UTC day', () => {
    expect(clockFor(new Date('2026-10-20T14:00:00Z'))).toEqual(C('2026-10-20', '2026-10-19', false))
    expect(clockFor(new Date('2026-10-21T01:00:00Z'))).toEqual(C('2026-10-20', '2026-10-20', true))
    expect(clockFor(new Date('2026-11-02T03:30:00Z'))).toEqual(C('2026-11-01', '2026-11-01', true))
    expect(clockFor(new Date('2026-03-08T07:30:00Z'))).toEqual(C('2026-03-08', '2026-03-07', false))
  })
  // Collected and asserted once: the per-sample expect calls were the cost, not the rule.
  test('the live range is open to the freeze check at every sampled moment of 2026 (edge 17)', () => {
    const closed: string[] = []
    let lives = 0
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 3 * 3600 * 1000) {
      const now = new Date(t)
      const live = resolveLockedRange({ firstMonth: '2025-01' }, 'team', clockFor(now), undefined).months.find((m) => m.live)
      if (!live) continue
      lives++
      // The freeze's boundary on the servers' UTC clock: the UTC date minus one day (rollingRangeEnd there, #282).
      if (!isPeriodOpen(live.dateRange.split(',')[1], new Date(t - 864e5).toISOString().slice(0, 10))) {
        closed.push(`${now.toISOString()}: live range ${live.dateRange} reads closed to the freeze check`)
      }
    }
    expect(closed.slice(0, 5)).toEqual([])
    expect(lives).toBeGreaterThan(2800)
  }, 30000)
})

describe('opening day', () => {
  test('defaults: the 12th, a weekend moves to the Monday after (worked calendar, spec 3.4)', () => {
    expect(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-08'].map((k) => opensOn(k, 12, 'next-monday')))
      .toEqual(['2026-09-14', '2026-10-12', '2026-11-12', '2026-12-14', '2027-01-12', '2027-09-13'])
  })
  test('previous-friday moves a weekend day back; day 4 on a Sunday opens Friday the 2nd', () => {
    expect(opensOn('2026-11', 12, 'previous-friday')).toBe('2026-12-11')
    expect(opensOn('2027-08', 12, 'previous-friday')).toBe('2027-09-10')
    expect(opensOn('2026-09', 4, 'previous-friday')).toBe('2026-10-02')
    expect(isPeriodOpen('2026-09-30', '2026-10-01')).toBe(false) // on 10/2 the rolling end is 10/1: September is closed
  })
})

describe('config (edge 13)', () => {
  test('firstMonth is required; a malformed whole value fails with its key', () => {
    expect(parseReportingMonths(null)).toEqual({ ok: false, key: 'reportingMonths' })
    expect(parseReportingMonths('2026-08')).toEqual({ ok: false, key: 'reportingMonths' })
    expect(parseReportingMonths([])).toEqual({ ok: false, key: 'reportingMonths' })
    expect(parseReportingMonths({})).toEqual({ ok: false, key: 'firstMonth' })
    expect(parseReportingMonths({ firstMonth: '2026-13' })).toEqual({ ok: false, key: 'firstMonth' })
    expect(parseReportingMonths({ firstMonth: 202608 })).toEqual({ ok: false, key: 'firstMonth' })
  })
  test('optional knobs default, validate, and name the first bad one; unknown keys are ignored', () => {
    expect(parseReportingMonths({ firstMonth: '2026-08', extra: 1 })).toEqual({ ok: true, badKey: null, cfg: { firstMonth: '2026-08', opensOnDay: 12, weekendRule: 'next-monday', comparison: 'previous-month' } })
    expect(parseReportingMonths({ firstMonth: '2026-08', opensOnDay: 28, weekendRule: 'previous-friday', comparison: 'previous-year' })).toMatchObject({ ok: true, badKey: null })
    expect(parseReportingMonths({ firstMonth: '2026-08', opensOnDay: 4 })).toMatchObject({ ok: true, badKey: null })
    for (const [k, v] of [['opensOnDay', 3], ['opensOnDay', 29], ['opensOnDay', 4.5], ['opensOnDay', '12'], ['weekendRule', 'x'], ['comparison', 'x']] as const) {
      expect(parseReportingMonths({ firstMonth: '2026-08', [k]: v })).toMatchObject({ ok: true, badKey: k })
    }
  })
  test('clientMonths is a whole number from 1 to 36; absent, it is not in the config at all', () => {
    expect(parseReportingMonths({ firstMonth: '2026-08', clientMonths: 1 })).toMatchObject({ ok: true, badKey: null, cfg: { clientMonths: 1 } })
    expect(parseReportingMonths({ firstMonth: '2026-08', clientMonths: 36 })).toMatchObject({ ok: true, badKey: null, cfg: { clientMonths: 36 } })
    const absent = parseReportingMonths({ firstMonth: '2026-08' })
    expect(absent.ok && absent.cfg).not.toHaveProperty('clientMonths')
    for (const v of [0, 37, 1.5, -1, '1', null, true]) {
      const r = parseReportingMonths({ firstMonth: '2026-08', clientMonths: v })
      expect(r).toMatchObject({ ok: true, badKey: 'clientMonths' })
      expect(r.ok && r.cfg).not.toHaveProperty('clientMonths')
    }
    // Checked after comparison: with two bad knobs the earlier one is named (spec 3.1).
    expect(parseReportingMonths({ firstMonth: '2026-08', opensOnDay: 3, clientMonths: 0 })).toMatchObject({ ok: true, badKey: 'opensOnDay' })
  })
})

describe('months, defaults and comparison on 20 Oct 2026', () => {
  test('a client sees September and August and lands on September', () => {
    const r = resolveLockedRange(CFG, 'client', OCT20, undefined)
    expect(keys(r)).toEqual(['2026-09', '2026-08'])
    expect(r.month).toEqual({
      key: '2026-09', label: 'September 2026', dateRange: 'custom:2026-09-01,2026-09-30',
      compareRange: 'custom:2026-08-01,2026-08-31', compareLabel: 'vs August 2026', live: false, opensOn: '2026-10-12', tag: null,
    })
    expect([r.outcome, r.reason, r.hiddenMonthAttempt]).toEqual(['absent', 'ok', false])
  })
  test('the team also sees October live and lands on the most recent finished month', () => {
    const r = resolveLockedRange(CFG, 'team', OCT20, undefined)
    expect(keys(r)).toEqual(['2026-10', '2026-09', '2026-08'])
    expect(r.months[0]).toMatchObject({
      label: 'October 2026, through Oct 19', dateRange: 'custom:2026-10-01,2026-10-19',
      compareRange: 'custom:2026-09-01,2026-09-19', compareLabel: 'vs Sep 1 to Sep 19', live: true, tag: 'Live, team only',
    })
    expect(r.month?.key).toBe('2026-09')
  })
  test('August compares with July, which is never pickable', () => {
    const aug = resolveLockedRange(CFG, 'client', OCT20, 'custom:2026-08-01,2026-08-31').month
    expect([aug?.compareRange, aug?.compareLabel]).toEqual(['custom:2026-07-01,2026-07-31', 'vs July 2026'])
  })
  test('before the opening day the team sees the finished month tagged; the client does not see it', () => {
    const oct5 = C('2026-10-05', '2026-10-04')
    expect(resolveLockedRange(CFG, 'team', oct5, undefined).months[1]).toMatchObject({ key: '2026-09', tag: 'Team only until Oct 12' })
    expect(keys(resolveLockedRange(CFG, 'client', oct5, undefined))).toEqual(['2026-08'])
    expect(keys(resolveLockedRange(CFG, 'client', C('2026-10-12', '2026-10-11'), undefined))).toEqual(['2026-09', '2026-08'])
    expect(resolveLockedRange(CFG, 'team', C('2026-12-12', '2026-12-11'), undefined).months[1]).toMatchObject({ key: '2026-11', tag: 'Team only until Dec 14' })
  })
  test('on the 1st before 00:00 UTC of the 2nd there is no live month; a new client defaults to the live month', () => {
    const r = resolveLockedRange(CFG, 'team', C('2026-11-01', '2026-10-31'), undefined)
    expect(keys(r)).toEqual(['2026-10', '2026-09', '2026-08'])
    expect(r.months.some((m) => m.live)).toBe(false)
    const fresh = resolveLockedRange({ firstMonth: '2026-10' }, 'team', OCT20, undefined)
    expect([keys(fresh), fresh.month?.key, fresh.month?.live]).toEqual([['2026-10'], '2026-10', true])
  })
  test('the in-progress label shows while the UTC hour is before 4 (edge 28)', () => {
    expect(resolveLockedRange(CFG, 'team', C('2026-10-20', '2026-10-20', true), undefined).months[0].label)
      .toBe('October 2026, through Oct 20 (in progress)')
  })
  test('winter: "(in progress)" follows the Dash window, which ends at 04:00 UTC all year, not New York midnight (edges 27, 28)', () => {
    // 10:30 PM EST on Jan 14: the live range ends Jan 14 and its Dash window runs to Jan 15 04:00 UTC, still open.
    const open = clockFor(new Date('2027-01-15T03:30:00Z'))
    expect(open).toEqual(C('2027-01-14', '2027-01-14', true))
    expect(resolveLockedRange(CFG, 'team', open, undefined).months[0].label).toBe('January 2027, through Jan 14 (in progress)')
    // 11:30 PM EST, still Jan 14 in New York, but that window closed at 04:00 UTC, so nothing new lands in it.
    const closed = clockFor(new Date('2027-01-15T04:30:00Z'))
    expect(closed).toEqual(C('2027-01-14', '2027-01-14', false))
    expect(resolveLockedRange(CFG, 'team', closed, undefined).months[0].label).toBe('January 2027, through Jan 14')
  })
  test('same days of last month, clamped; previous-year across a leap day', () => {
    expect(resolveLockedRange(CFG, 'team', C('2027-03-31', '2027-03-30'), undefined).months[0].compareRange).toBe('custom:2027-02-01,2027-02-28')
    const yearly = { firstMonth: '2026-08', comparison: 'previous-year' }
    expect(resolveLockedRange(yearly, 'team', OCT20, undefined).month).toMatchObject({ compareRange: 'custom:2025-09-01,2025-09-30', compareLabel: 'vs September 2025' })
    expect(resolveLockedRange(yearly, 'team', C('2028-02-29', '2028-02-29', true), undefined).months[0].compareRange).toBe('custom:2027-02-01,2027-02-28')
  })
  test('a malformed comparison falls back to previous-month for the team', () => {
    expect(resolveLockedRange({ firstMonth: '2026-08', comparison: 'x' }, 'team', OCT20, undefined).month?.compareRange).toBe('custom:2026-08-01,2026-08-31')
  })
})

describe('matching a request', () => {
  const client = (req: unknown, clock = OCT20) => resolveLockedRange(CFG, 'client', clock, req)
  // Collected and asserted once, so the run time is the resolutions themselves rather than thousands
  // of expect calls. The count is asserted too, so the sweep can never quietly check nothing.
  test('the canonical string is a fixed point, every day and both viewers (edge 9)', () => {
    const moved: string[] = []
    let checked = 0
    for (let t = Date.UTC(2026, 7, 1); t < Date.UTC(2028, 0, 1); t += 86400000) {
      for (const hour of [2, 14]) {
        const clock = clockFor(new Date(t + hour * 3600000))
        for (const viewer of ['team', 'client'] as const) {
          for (const m of resolveLockedRange(CFG, viewer, clock, undefined).months) {
            const again = resolveLockedRange(CFG, viewer, clock, m.dateRange)
            checked++
            if (again.outcome !== 'canonical' || again.month?.key !== m.key) {
              moved.push(`${clock.today} ${viewer} ${m.key}: ${m.dateRange} came back ${again.outcome} ${again.month?.key}`)
            }
          }
        }
      }
    }
    expect(moved.slice(0, 5)).toEqual([])
    expect(checked).toBe(17210) // every month offered on every sampled day, both viewers
  }, 30000)
  test('a client reaching for the live month is a hidden-month attempt and gets the default', () => {
    expect(client('custom:2026-10-01,2026-10-19')).toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: true, month: { key: '2026-09' } })
    expect(client('custom:2026-10-01,2026-10-05')).toMatchObject({ hiddenMonthAttempt: true })
  })
  test('a client reaching for a whole unopened month is an attempt; a partial one is not', () => {
    const oct5 = C('2026-10-05', '2026-10-04')
    expect(client('custom:2026-09-01,2026-09-30', oct5)).toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: true, month: { key: '2026-08' } })
    expect(client('custom:2026-09-01,2026-09-15', oct5)).toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: false })
  })
  test('the current month is not an attempt while no live month exists', () => {
    expect(client('custom:2026-11-01,2026-11-01', C('2026-11-01', '2026-10-31'))).toMatchObject({ hiddenMonthAttempt: false })
  })
  test('stale presets, junk, arrays, partial or impossible ranges and months before firstMonth are replaced silently (edges 10, 11)', () => {
    for (const req of ['last_30_days', 'junk', '', ['a', 'b'], 'custom:2026-09-01,2026-09-15', 'custom:2026-09-31,2026-09-30', 'custom:2026-09-30,2026-09-01', 'custom:2026-07-01,2026-07-31', 'custom:2026-08-01', 'custom:2026-09-01,2026-10-31']) {
      expect(client(req)).toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: false, month: { key: '2026-09' } })
    }
    expect(client('custom:2026-08-01,2026-08-31')).toMatchObject({ outcome: 'canonical', month: { key: '2026-08' } })
  })
  test("a team member's live link from an earlier day still means the live month", () => {
    expect(resolveLockedRange(CFG, 'team', OCT20, 'custom:2026-10-01,2026-10-05')).toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: false, month: { key: '2026-10', live: true } })
    expect(resolveLockedRange(CFG, 'team', OCT20, 'custom:2026-10-01,2026-10-31')).toMatchObject({ month: { key: '2026-10', dateRange: 'custom:2026-10-01,2026-10-19' } })
  })
})

describe('no months and bad config', () => {
  test('malformed config: no months for anyone, the key named', () => {
    for (const v of ['team', 'client'] as const) {
      expect(resolveLockedRange(null, v, OCT20, 'x')).toEqual({ months: [], month: null, outcome: 'replaced', hiddenMonthAttempt: false, reason: 'malformed-config', malformedKey: 'reportingMonths', firstOpensOn: null })
    }
    expect(resolveLockedRange({}, 'client', OCT20, undefined)).toMatchObject({ outcome: 'absent', malformedKey: 'firstMonth' })
  })
  test('a bad optional knob: the team keeps its months, tagged; clients get none', () => {
    const bad = { firstMonth: '2026-08', opensOnDay: 3 }
    const team = resolveLockedRange(bad, 'team', OCT20, undefined)
    expect([keys(team), team.reason, team.malformedKey, team.month?.key]).toEqual([['2026-10', '2026-09', '2026-08'], 'malformed-config', 'opensOnDay', '2026-09'])
    expect(team.months.map((m) => m.tag)).toEqual(['Live, team only', 'Hidden from clients: config error', 'Hidden from clients: config error'])
    expect(resolveLockedRange(bad, 'client', OCT20, undefined)).toMatchObject({ months: [], month: null, firstOpensOn: null, reason: 'malformed-config' })
  })
  test('a future firstMonth: not started, and the client is told when the first report opens', () => {
    const later = { firstMonth: '2027-01' }
    expect(resolveLockedRange(later, 'team', OCT20, undefined)).toMatchObject({ months: [], month: null, reason: 'not-started' })
    const r = resolveLockedRange(later, 'client', OCT20, undefined)
    expect(r.firstOpensOn).toBe('2027-02-12')
    expect(noMonthsText(r, 'client')).toBe('Your first report opens on Feb 12')
  })
  test('the first month finished but not open yet: the client is told the date', () => {
    const r = resolveLockedRange({ firstMonth: '2026-09' }, 'client', C('2026-10-05', '2026-10-04'), undefined)
    expect([r.reason, r.firstOpensOn, noMonthsText(r, 'client')]).toEqual(['not-open-yet', '2026-10-12', 'Your first report opens on Oct 12'])
  })
  test('the no-months copy for each viewer (spec 3.8)', () => {
    expect(noMonthsText(resolveLockedRange(null, 'client', OCT20, undefined), 'client')).toBe('No reports are available yet')
    expect(noMonthsText(resolveLockedRange(null, 'team', OCT20, undefined), 'team')).toBe('No reporting months yet: the reportingMonths setting is invalid (reportingMonths)')
    expect(noMonthsText(resolveLockedRange({ firstMonth: '2027-01' }, 'team', OCT20, undefined), 'team')).toBe('No reporting months yet: the first reporting month has not started')
  })
  test('the list is capped at MAX_REPORTING_MONTHS, even from an absurd firstMonth (edge 8)', () => {
    expect(MAX_REPORTING_MONTHS).toBe(36)
    for (const v of ['team', 'client'] as const) {
      const r = resolveLockedRange({ firstMonth: '0001-01' }, v, OCT20, undefined)
      expect(r.months).toHaveLength(36)
      expect(r.months[r.months.length - 1].key).toBe(v === 'team' ? '2023-11' : '2023-10')
    }
  })
})

// Jasmine, 2026-09-29: once September is out, clients see only September; the team keeps both.
describe('clientMonths: clients see only the newest opened months', () => {
  const ONE = { firstMonth: '2026-08', clientMonths: 1 }
  const OCT5 = C('2026-10-05', '2026-10-04')

  test('from the opening day a client sees only the newest month and lands on it', () => {
    const r = resolveLockedRange(ONE, 'client', OCT20, undefined)
    expect([keys(r), r.month?.key, r.reason]).toEqual([['2026-09'], '2026-09', 'ok'])
    expect(keys(resolveLockedRange(ONE, 'client', C('2026-10-12', '2026-10-11'), undefined))).toEqual(['2026-09'])
  })

  test('before the opening day the newest opened month is still the one before', () => {
    expect(keys(resolveLockedRange(ONE, 'client', OCT5, undefined))).toEqual(['2026-08'])
  })

  test('the team keeps every month, and the one clients no longer see is tagged', () => {
    const r = resolveLockedRange(ONE, 'team', OCT20, undefined)
    expect(r.months.map((m) => [m.key, m.tag])).toEqual([
      ['2026-10', 'Live, team only'], ['2026-09', null], ['2026-08', 'No longer shown to clients'],
    ])
    expect(r.month?.key).toBe('2026-09')
  })

  test('before the opening day the team sees the newer month as team only and the older one untagged', () => {
    expect(resolveLockedRange(ONE, 'team', OCT5, undefined).months.map((m) => [m.key, m.tag])).toEqual([
      ['2026-10', 'Live, team only'], ['2026-09', 'Team only until Oct 12'], ['2026-08', null],
    ])
  })

  test('an old link to a month clients no longer see goes to the newest month and is not logged as an attempt (T6)', () => {
    expect(resolveLockedRange(ONE, 'client', OCT20, 'custom:2026-08-01,2026-08-31'))
      .toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: false, month: { key: '2026-09' } })
    // A partial range pins today's behaviour: a partial range is never an attempt (reporting-months.ts:197).
    expect(resolveLockedRange(ONE, 'client', OCT20, 'custom:2026-08-01,2026-08-15'))
      .toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: false, month: { key: '2026-09' } })
  })

  test('reaching for the live month or an unopened month is still an attempt', () => {
    expect(resolveLockedRange(ONE, 'client', OCT20, 'custom:2026-10-01,2026-10-19')).toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: true })
    expect(resolveLockedRange(ONE, 'client', OCT5, 'custom:2026-09-01,2026-09-30'))
      .toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: true, month: { key: '2026-08' } })
  })

  test('the newest month is canonical and stays put', () => {
    expect(resolveLockedRange(ONE, 'client', OCT20, 'custom:2026-09-01,2026-09-30')).toMatchObject({ outcome: 'canonical', month: { key: '2026-09' } })
  })

  test('two months: the newest two; absent: every opened month, as today', () => {
    const dec20 = C('2026-12-20', '2026-12-19')
    expect(keys(resolveLockedRange({ ...ONE, clientMonths: 2 }, 'client', dec20, undefined))).toEqual(['2026-11', '2026-10'])
    expect(keys(resolveLockedRange(CFG, 'client', dec20, undefined))).toEqual(['2026-11', '2026-10', '2026-09', '2026-08'])
  })

  test('a cap at or above the opened count drops nothing and tags nothing (T12)', () => {
    const two = { ...ONE, clientMonths: 2 }
    expect(keys(resolveLockedRange(two, 'client', OCT20, undefined))).toEqual(['2026-09', '2026-08'])
    expect(resolveLockedRange(two, 'team', OCT20, undefined).months.map((m) => m.tag)).toEqual(['Live, team only', null, null])
    const all = { firstMonth: '0001-01', clientMonths: 36 }
    const client = resolveLockedRange(all, 'client', OCT20, undefined)
    expect([client.months.length, client.months[35].key]).toEqual([36, '2023-10'])
    expect(resolveLockedRange(all, 'team', OCT20, undefined).months.some((m) => m.tag === 'No longer shown to clients')).toBe(false)
  })

  test("outside the new case, today's attempt rule is kept, bad knobs included (T13)", () => {
    const aug = 'custom:2026-08-01,2026-08-31'
    expect(resolveLockedRange({ firstMonth: '2026-08', opensOnDay: 3 }, 'client', OCT20, aug)).toMatchObject({ hiddenMonthAttempt: true })
    expect(resolveLockedRange({ firstMonth: '2026-08', clientMonths: 0 }, 'client', OCT20, aug)).toMatchObject({ hiddenMonthAttempt: true })
  })

  test('a bad clientMonths hides every month from clients and tags them for the team, like any bad knob', () => {
    const bad = { firstMonth: '2026-08', clientMonths: 0 }
    expect(resolveLockedRange(bad, 'client', OCT20, undefined)).toMatchObject({ months: [], month: null, reason: 'malformed-config', malformedKey: 'clientMonths' })
    expect(resolveLockedRange(bad, 'team', OCT20, undefined).months.map((m) => m.tag))
      .toEqual(['Live, team only', 'Hidden from clients: config error', 'Hidden from clients: config error'])
  })

  // Collected and asserted once, as the edge 9 sweep does, and kept apart from its pinned count. The counts are the
  // spec's (section 6, T11, with their derivation); if a run disagrees, find why before changing a number.
  test('with clientMonths set, all year: offered months are fixed points, aged-out months go to the newest (T11)', () => {
    const drift: string[] = []
    const checked = { team: 0, client: 0 }
    let daysWithAgedOut = 0
    for (let t = Date.UTC(2026, 8, 1, 14); t < Date.UTC(2027, 8, 1, 14); t += 24 * 3600 * 1000) {
      const clock = clockFor(new Date(t))
      for (const v of ['team', 'client'] as const) {
        for (const m of resolveLockedRange(ONE, v, clock, undefined).months) {
          checked[v]++
          const r = resolveLockedRange(ONE, v, clock, m.dateRange)
          if (r.outcome !== 'canonical' || r.month?.key !== m.key) drift.push(`${v} ${clock.today} ${m.dateRange} -> ${r.outcome} ${r.month?.key}`)
        }
      }
      // Every month the team sees tagged as aged out, asked for by a client, goes to the client's newest month, unlogged.
      const newest = resolveLockedRange(ONE, 'client', clock, undefined).months[0]?.key
      const aged = resolveLockedRange(ONE, 'team', clock, undefined).months.filter((m) => m.tag === 'No longer shown to clients')
      if (aged.length > 0) daysWithAgedOut++
      for (const m of aged) {
        const r = resolveLockedRange(ONE, 'client', clock, m.dateRange)
        if (r.outcome !== 'replaced' || r.month?.key !== newest || r.hiddenMonthAttempt) drift.push(`aged ${clock.today} ${m.dateRange} -> ${r.outcome} ${r.month?.key} ${r.hiddenMonthAttempt}`)
      }
    }
    expect(drift.slice(0, 5)).toEqual([])
    expect(checked).toEqual({ team: 2731, client: 352 })
    // From 2026-10-12, when September opens and August drops off, through 2027-08-31: 20 + 30 + 31 + 31 + 28 + 31 + 30 + 31 + 30 + 31 + 31.
    expect(daysWithAgedOut).toBe(324)
  })

  test('locking never reads clientMonths: the settled day is the same with or without it, or with a bad one', () => {
    for (const today of ['2026-10-04', '2026-10-05', '2026-10-20', '2026-11-05']) {
      expect(settledThrough(ONE, today)).toBe(settledThrough(CFG, today))
      expect(settledThrough({ ...ONE, clientMonths: 0 }, today)).toBe(settledThrough(CFG, today))
    }
  })
})
