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

const none = { served: [], extra: [] }
const views = (range: string) => [url(range), url(range, 'ytd'), url(range, 'all')]
const SEP = 'custom:2026-09-01,2026-09-30', AUG = 'custom:2026-08-01,2026-08-31'
const locked = (rm: Record<string, unknown>) => client({}, { reportingMonths: { firstMonth: '2026-08', ...rm } })

// Spec docs/superpowers/specs/2026-11-13-aeo-warm-client-months-design.md: `served` is exactly today's list; `extra` is the next month a
// client can pick, at most one more (WARM_MONTHS = 2). On CLOCK (2026-10-20) a client can pick September (served) and August.
describe('aeoWarmUrls: the three views a client viewer opens first, for each month they can pick (at most two)', () => {
  it('a client without the tab, or without Organic Social, gets none', () => {
    expect(aeoWarmUrls('https://app', client({}, { aeoInformedSocial: undefined }), CLOCK)).toEqual(none)
    expect(aeoWarmUrls('https://app', client({ peecCustomerProjectId: null }), CLOCK)).toEqual(none)
    expect(aeoWarmUrls('https://app', client({ hiddenReports: ['organic-aeo-informed'] }), CLOCK)).toEqual(none)
    expect(aeoWarmUrls('https://app', client({ enabledReports: ['ga4'] }), CLOCK)).toEqual(none)
    expect(aeoWarmUrls('https://app', client({ hiddenReports: ['organic-social'] }), CLOCK)).toEqual(none)
  })
  it('a client not on locked months: the page\'s default range only, no extra month (edge 6)', () => {
    expect(aeoWarmUrls('https://app', client(), CLOCK)).toEqual({ served: views('last_30_days'), extra: [] })
  })
  it('clientMonths 1: the served month only, exactly today\'s list (edge 1)', () => {
    expect(aeoWarmUrls('https://app', locked({ clientMonths: 1 }), CLOCK)).toEqual({ served: views(SEP), extra: [] })
  })
  it('clientMonths 2: the served month, then the next month a client can pick (edge 2)', () => {
    expect(aeoWarmUrls('https://app', locked({ clientMonths: 2 }), CLOCK)).toEqual({ served: views(SEP), extra: views(AUG) })
  })
  it('no clientMonths (every opened month offered) or clientMonths 3: still at most one extra month (edge 3)', () => {
    expect(aeoWarmUrls('https://app', locked({}), CLOCK)).toEqual({ served: views(SEP), extra: views(AUG) })
    const july = client({}, { reportingMonths: { firstMonth: '2026-07', clientMonths: 3 } })
    expect(aeoWarmUrls('https://app', july, CLOCK)).toEqual({ served: views(SEP), extra: views(AUG) })
  })
  it('only one month open to clients yet: that month, no extra (edge 4)', () => {
    expect(aeoWarmUrls('https://app', client({}, { reportingMonths: { firstMonth: '2026-09', clientMonths: 2 } }), CLOCK)).toEqual({ served: views(SEP), extra: [] })
  })
  it('no month open to clients yet, or a malformed reportingMonths: none (edge 5)', () => {
    expect(aeoWarmUrls('https://app', client({}, { reportingMonths: { firstMonth: '2026-11' } }), CLOCK)).toEqual(none)
    expect(aeoWarmUrls('https://app', client({}, { reportingMonths: { firstMonth: 'August' } }), CLOCK)).toEqual(none)
    expect(aeoWarmUrls('https://app', locked({ clientMonths: 0 }), CLOCK)).toEqual(none)
  })
})
