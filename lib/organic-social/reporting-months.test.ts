import { describe, expect, test } from 'vitest'
import {
  MAX_REPORTING_MONTHS, clockFor, hasReportingMonths, noMonthsText, opensOn, parseReportingMonths,
  resolveLockedRange, viewerForRole, type Clock,
} from './reporting-months'
import { isPeriodOpen } from './frozen'

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
  test('the live range is open to the freeze check at every sampled moment of 2026 (edge 17)', () => {
    let lives = 0
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 3 * 3600 * 1000) {
      const now = new Date(t)
      const live = resolveLockedRange({ firstMonth: '2025-01' }, 'team', clockFor(now), undefined).months.find((m) => m.live)
      if (!live) continue
      lives++
      expect(isPeriodOpen(live.dateRange.split(',')[1], now.toISOString().slice(0, 10))).toBe(true)
    }
    expect(lives).toBeGreaterThan(2800)
  })
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
    expect(isPeriodOpen('2026-09-30', '2026-10-02')).toBe(false)
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
  test('the canonical string is a fixed point, every day and both viewers (edge 9)', () => {
    for (let t = Date.UTC(2026, 7, 1); t < Date.UTC(2028, 0, 1); t += 86400000) {
      for (const hour of [2, 14]) {
        const clock = clockFor(new Date(t + hour * 3600000))
        for (const viewer of ['team', 'client'] as const) {
          for (const m of resolveLockedRange(CFG, viewer, clock, undefined).months) {
            const again = resolveLockedRange(CFG, viewer, clock, m.dateRange)
            expect([again.outcome, again.month?.key]).toEqual(['canonical', m.key])
          }
        }
      }
    }
  })
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
