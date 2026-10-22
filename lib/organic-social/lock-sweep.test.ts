import { expect, test } from 'vitest'
import { lockSweepUrls } from './lock-sweep'
import type { Client } from '@/lib/db/schema'
import { organicSocialSubsections } from '@/lib/constants'

const client = (over: Record<string, unknown> = {}): Client => ({
  slug: 'client-a', enabledReports: ['organic-social'], hiddenReports: ['organic-overview'],
  dashSocialConfig: { brandId: 7, channels: ['instagram', 'facebook'], reportingMonths: { firstMonth: '2026-08' } },
  ...over,
} as unknown as Client)
const AUG = encodeURIComponent('custom:2026-08-01,2026-08-31')
const SEP = encodeURIComponent('custom:2026-09-01,2026-09-30')

test('on a lock day the sweep renders every tab of the month that just locked, not the one before', () => {
  const c = client()
  // The tab list comes from the shared helper on purpose: PR 255 drops Overview for a client that
  // hides it, and this sweep must follow whatever that helper says in any merge order.
  const tabs = organicSocialSubsections(c)
  const url = (tab: string | null, range: string) =>
    `https://app/dashboard/client-a/reports?section=organic-social${tab ? `&subsection=${tab}` : ''}&dateRange=${range}`
  // September locks on Monday 2026-10-05. August locked on Friday 2026-09-04, a month ago, so it
  // is long captured and re-rendering it hourly only re-reads its stored answers from Neon.
  expect(lockSweepUrls('https://app', c, '2026-10-05')).toEqual(tabs.map((t) => url(t.id, SEP)))
  expect(tabs.map((t) => t.id)).toEqual(expect.arrayContaining(['organic-instagram', 'organic-facebook']))
})

test('a month is swept from its lock day through two days after, then never again', () => {
  const c = client()
  const sep = (today: string) => lockSweepUrls('https://app', c, today).filter((u) => u.endsWith(SEP)).length
  const tabs = organicSocialSubsections(c).length
  expect(sep('2026-10-04')).toBe(0)
  expect(sep('2026-10-05')).toBe(tabs)
  expect(sep('2026-10-07')).toBe(tabs)
  expect(lockSweepUrls('https://app', c, '2026-10-08')).toEqual([])
  expect(lockSweepUrls('https://app', c, '2026-10-21')).toEqual([])
})

test('a lock day moved off a weekend starts the window on the Friday', () => {
  // 2026-12-05 is a Saturday, so November locks on Friday 2026-12-04 and is swept through 12-06.
  const c = client()
  const NOV = encodeURIComponent('custom:2026-11-01,2026-11-30')
  const nov = (today: string) => lockSweepUrls('https://app', c, today).filter((u) => u.endsWith(NOV)).length
  expect(nov('2026-12-04')).toBe(organicSocialSubsections(c).length)
  expect(nov('2026-12-06')).toBe(organicSocialSubsections(c).length)
  expect(lockSweepUrls('https://app', c, '2026-12-07')).toEqual([])
})

test('a month before firstMonth is dropped, and Overview is swept when it is not hidden', () => {
  // August's lock day (Friday 2026-09-04): July is before firstMonth.
  const urls = lockSweepUrls('https://app', client({ hiddenReports: [] }), '2026-09-04')
  expect(urls).toEqual([
    `https://app/dashboard/client-a/reports?section=organic-social&dateRange=${AUG}`,
    // The Influencer tab is swept too (its request is the Instagram tab's, so no new lock row).
    `https://app/dashboard/client-a/reports?section=organic-social&subsection=organic-influencer&dateRange=${AUG}`,
    `https://app/dashboard/client-a/reports?section=organic-social&subsection=organic-instagram&dateRange=${AUG}`,
    `https://app/dashboard/client-a/reports?section=organic-social&subsection=organic-facebook&dateRange=${AUG}`,
  ])
})

test('nothing to sweep: no reportingMonths, Organic Social not enabled, or a malformed config', () => {
  expect(lockSweepUrls('https://app', client({ dashSocialConfig: { brandId: 7, channels: ['instagram'] } }), '2026-10-05')).toEqual([])
  expect(lockSweepUrls('https://app', client({ enabledReports: ['ga4'] }), '2026-10-05')).toEqual([])
  expect(lockSweepUrls('https://app', client({ dashSocialConfig: { brandId: 7, channels: ['instagram'], reportingMonths: { firstMonth: 'nope' } } }), '2026-10-05')).toEqual([])
})
