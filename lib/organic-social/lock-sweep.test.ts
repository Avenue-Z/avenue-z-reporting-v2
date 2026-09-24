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

test('on a lock day the sweep renders every tab of the two newest locked months, oldest first', () => {
  const c = client()
  // The tab list comes from the shared helper on purpose: PR 255 drops Overview for a client that
  // hides it, and this sweep must follow whatever that helper says in any merge order.
  const tabs = organicSocialSubsections(c)
  const url = (tab: string | null, range: string) =>
    `https://app/dashboard/client-a/reports?section=organic-social${tab ? `&subsection=${tab}` : ''}&dateRange=${range}`
  expect(lockSweepUrls('https://app', c, '2026-10-05')).toEqual([
    ...tabs.map((t) => url(t.id, AUG)),
    ...tabs.map((t) => url(t.id, SEP)),
  ])
  expect(tabs.map((t) => t.id)).toEqual(expect.arrayContaining(['organic-instagram', 'organic-facebook']))
})

test('a month before firstMonth is dropped, and Overview is swept when it is not hidden', () => {
  const urls = lockSweepUrls('https://app', client({ hiddenReports: [] }), '2026-10-04')
  expect(urls).toEqual([
    `https://app/dashboard/client-a/reports?section=organic-social&dateRange=${AUG}`,
    `https://app/dashboard/client-a/reports?section=organic-social&subsection=organic-instagram&dateRange=${AUG}`,
    `https://app/dashboard/client-a/reports?section=organic-social&subsection=organic-facebook&dateRange=${AUG}`,
  ])
})

test('nothing to sweep: no reportingMonths, Organic Social not enabled, or a malformed config', () => {
  expect(lockSweepUrls('https://app', client({ dashSocialConfig: { brandId: 7, channels: ['instagram'] } }), '2026-10-05')).toEqual([])
  expect(lockSweepUrls('https://app', client({ enabledReports: ['ga4'] }), '2026-10-05')).toEqual([])
  expect(lockSweepUrls('https://app', client({ dashSocialConfig: { brandId: 7, channels: ['instagram'], reportingMonths: { firstMonth: 'nope' } } }), '2026-10-05')).toEqual([])
})
