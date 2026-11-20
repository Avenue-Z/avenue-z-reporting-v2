import { describe, expect, test } from 'vitest'
import { clockFor } from '../reporting-months'
import { slCapabilities } from './capabilities'
import { uploadMonth } from './upload-month'

// Made-up client. October 2026 opens to clients on Thursday 2026-11-12 (opensOnDay 12 by default).
const client = (reportingMonths: unknown = { firstMonth: '2026-08' }) => ({ id: 'c1', slug: 'a-client', dashSocialConfig: { reportingMonths } })
const at = (iso: string) => clockFor(new Date(iso))
const OCT = 'custom:2026-10-01,2026-10-31'

describe('slCapabilities (Commentary rules, COMMENTARY_APPROVERS)', () => {
  test('a client role is a client whatever its email', () => {
    expect(slCapabilities('CLIENT_ADMIN', 'a@avenuez.com', 'a@avenuez.com')).toEqual({ canEdit: false, canApprove: false })
    expect(slCapabilities('CLIENT_VIEWER', 'a@avenuez.com', 'a@avenuez.com')).toEqual({ canEdit: false, canApprove: false })
  })
  test('staff edit with an @avenuez.com email; only the allowlist approves', () => {
    expect(slCapabilities('INTERNAL_ANALYST', 'w@avenuez.com', 'a@avenuez.com')).toEqual({ canEdit: true, canApprove: false })
    expect(slCapabilities('INTERNAL_ADMIN', 'A@AvenueZ.com', 'a@avenuez.com')).toEqual({ canEdit: true, canApprove: true })
    expect(slCapabilities('INTERNAL_ADMIN', 'w@example.com', 'w@example.com')).toEqual({ canEdit: false, canApprove: false })
    expect(slCapabilities('INTERNAL_ADMIN', null, 'a@avenuez.com')).toEqual({ canEdit: false, canApprove: false })
  })
  test('an unset allowlist means nobody approves (fail closed)', () => {
    expect(slCapabilities('INTERNAL_ADMIN', 'a@avenuez.com', undefined)).toEqual({ canEdit: true, canApprove: false })
  })
})

describe('uploadMonth', () => {
  test('the served finished month, from the range, as the page resolves it', () => {
    expect(uploadMonth(client(), OCT, at('2026-11-19T15:00:00Z'))).toEqual({ ok: true, month: '2026-10', beforeOpen: false })
    expect(uploadMonth(client(), 'custom:2026-09-01,2026-09-30', at('2026-11-19T15:00:00Z'))).toMatchObject({ ok: true, month: '2026-09' })
  })

  test('no range or an unknown one serves what the page serves: the newest finished month', () => {
    expect(uploadMonth(client(), undefined, at('2026-11-19T15:00:00Z'))).toMatchObject({ ok: true, month: '2026-10' })
    expect(uploadMonth(client(), 'last_30_days', at('2026-11-19T15:00:00Z'))).toMatchObject({ ok: true, month: '2026-10' })
  })

  test('a month before the first reporting month is never chosen', () => {
    expect(uploadMonth(client(), 'custom:2026-07-01,2026-07-31', at('2026-11-19T15:00:00Z'))).toMatchObject({ ok: true, month: '2026-10' })
  })

  test('the live month is refused (R2-13)', () => {
    expect(uploadMonth(client(), 'custom:2026-11-01,2026-11-18', at('2026-11-19T15:00:00Z')))
      .toEqual({ ok: false, error: 'Upload opens when November 2026 ends.' })
    // The only month a client starting this month has is the live one.
    expect(uploadMonth(client({ firstMonth: '2026-11' }), undefined, at('2026-11-19T15:00:00Z')))
      .toEqual({ ok: false, error: 'Upload opens when November 2026 ends.' })
  })

  test('no reporting months at all is refused', () => {
    expect(uploadMonth(client({ firstMonth: '2026-12' }), undefined, at('2026-11-19T15:00:00Z'))).toEqual({ ok: false, error: 'No reporting months yet.' })
    expect(uploadMonth(client({ firstMonth: 'soon' }), undefined, at('2026-11-19T15:00:00Z'))).toEqual({ ok: false, error: 'No reporting months yet.' })
    expect(uploadMonth({ id: 'c1', slug: 's', dashSocialConfig: {} }, undefined, at('2026-11-19T15:00:00Z'))).toEqual({ ok: false, error: 'No reporting months yet.' })
  })

  test('before the open date is decided at 00:00 New York on the open day (R2-15)', () => {
    // 2026-11-12 00:00 in New York is 05:00 UTC (standard time).
    expect(uploadMonth(client(), OCT, at('2026-11-12T04:59:59Z'))).toEqual({ ok: true, month: '2026-10', beforeOpen: true })
    expect(uploadMonth(client(), OCT, at('2026-11-12T05:00:00Z'))).toEqual({ ok: true, month: '2026-10', beforeOpen: false })
  })

  test('the open day follows the client settings at upload time (opensOnDay, weekend rule)', () => {
    // opensOnDay 14 lands on Saturday 2026-11-14; previous-friday moves it to Friday 2026-11-13.
    const c = client({ firstMonth: '2026-08', opensOnDay: 14, weekendRule: 'previous-friday' })
    expect(uploadMonth(c, OCT, at('2026-11-13T04:59:59Z'))).toMatchObject({ beforeOpen: true })
    expect(uploadMonth(c, OCT, at('2026-11-13T05:00:00Z'))).toMatchObject({ beforeOpen: false })
  })
})
