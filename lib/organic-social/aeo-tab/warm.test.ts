import { describe, expect, it } from 'vitest'
import type { Client } from '@/lib/db/schema'
import { aeoWarmUrls } from './warm'

const CLOCK = { today: '2026-10-20', lastCompleteUtcDay: '2026-10-19', liveDayInProgress: false }
const client = (o: Record<string, unknown> = {}, dsc: Record<string, unknown> = {}): Client => ({
  slug: 'client-a', enabledReports: ['organic-social'], hiddenReports: [], peecCustomerProjectId: 'or_p',
  dashSocialConfig: { brandId: 1, aeoInformedSocial: { enabled: true, allTimeFrom: '2026-01-22' }, ...dsc }, ...o,
} as unknown as Client)
const url = (range: string, aeo?: string) =>
  `https://app/portal/client-a/reports?section=organic-social&subsection=organic-aeo-informed${aeo ? `&aeo=${aeo}` : ''}&dateRange=${encodeURIComponent(range)}`

describe('aeoWarmUrls: the three views a client viewer opens first', () => {
  it('a client without the tab, or without Organic Social, gets none', () => {
    expect(aeoWarmUrls('https://app', client({}, { aeoInformedSocial: undefined }), CLOCK)).toEqual([])
    expect(aeoWarmUrls('https://app', client({ peecCustomerProjectId: null }), CLOCK)).toEqual([])
    expect(aeoWarmUrls('https://app', client({ hiddenReports: ['organic-aeo-informed'] }), CLOCK)).toEqual([])
    expect(aeoWarmUrls('https://app', client({ enabledReports: ['ga4'] }), CLOCK)).toEqual([])
    expect(aeoWarmUrls('https://app', client({ hiddenReports: ['organic-social'] }), CLOCK)).toEqual([])
  })
  it('a client not on locked months: Month, YTD and All time on the page\'s default range, the default min', () => {
    expect(aeoWarmUrls('https://app', client(), CLOCK)).toEqual([url('last_30_days'), url('last_30_days', 'ytd'), url('last_30_days', 'all')])
  })
  it('a client on locked months: on the newest month a client viewer is served', () => {
    const c = client({}, { reportingMonths: { firstMonth: '2026-08' } })
    const sep = 'custom:2026-09-01,2026-09-30'
    expect(aeoWarmUrls('https://app', c, CLOCK)).toEqual([url(sep), url(sep, 'ytd'), url(sep, 'all')])
  })
  it('a client on locked months with no month open to clients yet gets none', () => {
    expect(aeoWarmUrls('https://app', client({}, { reportingMonths: { firstMonth: '2026-11' } }), CLOCK)).toEqual([])
  })
})
