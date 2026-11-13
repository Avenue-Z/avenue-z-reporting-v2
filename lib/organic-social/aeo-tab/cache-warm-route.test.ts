import { beforeEach, expect, test, vi } from 'vitest'

/** The hourly cache warmer (plan Task 10): each client with the AEO tab gets its three views warmed, after every URL it warmed before. */
const { getAllClients, runWarm } = vi.hoisted(() => ({ getAllClients: vi.fn(), runWarm: vi.fn(async (urls: string[]) => ({ ok: urls.length })) }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getAllClients }))
vi.mock('@/lib/cache-warm/run', () => ({ warmContext: async () => ({ baseUrl: 'https://app', cookieHeader: 'c=1' }), runWarm }))

import { GET } from '@/app/api/cache-warm/route'

const plain = { slug: 'plain', enabledReports: ['organic-social', 'ga4'], hiddenReports: [], dashSocialConfig: { brandId: 1 } }
const aeo = { slug: 'aeo', enabledReports: ['organic-social'], hiddenReports: [], peecCustomerProjectId: 'or_p', dashSocialConfig: { brandId: 2, aeoInformedSocial: { enabled: true, allTimeFrom: '2026-01-22' } } }

beforeEach(() => { runWarm.mockClear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-12T15:00:00Z')) })

test('every URL warmed before is still warmed, in order, and the AEO client\'s three views follow', async () => {
  getAllClients.mockResolvedValue([plain])
  await GET(new Request('https://app/api/cache-warm'))
  const before = runWarm.mock.calls[0][0] as string[]
  getAllClients.mockResolvedValue([plain, aeo])
  await GET(new Request('https://app/api/cache-warm'))
  const after = runWarm.mock.calls[1][0] as string[]
  const aeoBase = after.filter((u) => u.includes('/aeo/'))
  expect(after.slice(0, before.length)).toEqual(before)
  expect(after.filter((u) => u.includes('organic-aeo-informed'))).toEqual([
    'https://app/portal/aeo/reports?section=organic-social&subsection=organic-aeo-informed&dateRange=last_30_days',
    'https://app/portal/aeo/reports?section=organic-social&subsection=organic-aeo-informed&aeo=ytd&dateRange=last_30_days',
    'https://app/portal/aeo/reports?section=organic-social&subsection=organic-aeo-informed&aeo=all&dateRange=last_30_days',
  ])
  expect(aeoBase.length).toBe(5) // its two existing base URLs, then its three AEO views
  vi.useRealTimers()
})

// Spec 2026-11-13 (warm every month a client can pick): every client's served views come first, then every client's extra month, so no
// URL warmed today moves behind a new one, across clients as well as within one.
test('with two AEO clients on two client months, every served URL comes before any extra-month URL, and today\'s URLs keep their order', async () => {
  const lockedAeo = (slug: string) => ({ ...aeo, slug, dashSocialConfig: { ...aeo.dashSocialConfig, reportingMonths: { firstMonth: '2026-08', clientMonths: 2 } } })
  getAllClients.mockResolvedValue([plain, lockedAeo('aeo-a'), lockedAeo('aeo-b')])
  await GET(new Request('https://app/api/cache-warm'))
  const all = runWarm.mock.calls[0][0] as string[]
  const aeoUrls = all.filter((u) => u.includes('organic-aeo-informed'))
  const oct = encodeURIComponent('custom:2026-10-01,2026-10-31'), sep = encodeURIComponent('custom:2026-09-01,2026-09-30')
  expect(aeoUrls.map((u) => `${u.split('/portal/')[1].split('/')[0]}:${u.includes(oct) ? 'oct' : u.includes(sep) ? 'sep' : '?'}`)).toEqual([
    'aeo-a:oct', 'aeo-a:oct', 'aeo-a:oct', 'aeo-b:oct', 'aeo-b:oct', 'aeo-b:oct', 'aeo-a:sep', 'aeo-a:sep', 'aeo-a:sep', 'aeo-b:sep', 'aeo-b:sep', 'aeo-b:sep',
  ])
  expect(all.slice(-12)).toEqual(aeoUrls) // still after every other URL
  vi.useRealTimers()
})

