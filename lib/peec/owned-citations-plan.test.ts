import { expect, test, vi } from 'vitest'
import { planOwnedCitations, OWNED_UNAVAILABLE } from './owned-citations-plan'
import { buildContentPerformanceRows } from './content-performance-rows'
import { EMPTY_COVERAGE_PROJECTION } from './coverage-projection'
import type { OwnedUrlCitations } from './url-citations'
import type { CalendarPage } from '@/lib/content-calendar/pages'

const OK: OwnedUrlCitations = { rows: [], totalCitationCount: 50, complete: true }
const cmp = { startDate: '2026-01-01', endDate: '2026-01-30' }

test('no owned hosts: fetcher never called, result unavailable', async () => {
  const fetcher = vi.fn()
  const r = await planOwnedCitations({ clientSlug: 'c', ownedHosts: [], dateRange: 'last_30_days', compareDates: cmp, fetcher })
  expect(fetcher).not.toHaveBeenCalled()
  expect(r.owned).toBe(OWNED_UNAVAILABLE)
  expect(r.owned.complete).toBe(false)
})

test('no owned hosts: Avenue Z rows get citation share null (--), not 0', () => {
  const page: CalendarPage = { urlKey: 'x.com/a', url: 'https://x.com/a', topic: 'A', contentType: '', published: true, badge: 'new', publishDate: null, lastOptimizedDate: null }
  const rows = buildContentPerformanceRows({
    pages: [page], owned: OWNED_UNAVAILABLE, ownedPrior: null,
    coverage: EMPTY_COVERAGE_PROJECTION, coveragePrior: null, totalTrackedPrompts: 10,
    current: () => ({ aiReferred: 1, organic: 1, engagementRate: 0.5 }), prior: null,
  })
  expect(rows[0].citationShare).toBeNull()
})

test('non-last_30_days range: prior not fetched, so citation-share delta is --', async () => {
  const fetcher = vi.fn().mockResolvedValue(OK)
  const r = await planOwnedCitations({ clientSlug: 'c', ownedHosts: ['b.com', 'a.com'], dateRange: 'last_7_days', compareDates: cmp, fetcher })
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher).toHaveBeenCalledWith('c', ['a.com', 'b.com'])
  expect(r.ownedPrior).toBeNull()
})

test('other deltas still compute when the citation prior is gated off', () => {
  const page: CalendarPage = { urlKey: 'x.com/a', url: 'https://x.com/a', topic: 'A', contentType: '', published: true, badge: 'new', publishDate: null, lastOptimizedDate: null }
  const rows = buildContentPerformanceRows({
    pages: [page], owned: OK, ownedPrior: null,
    coverage: EMPTY_COVERAGE_PROJECTION, coveragePrior: null, totalTrackedPrompts: 10,
    current: () => ({ aiReferred: 20, organic: 1, engagementRate: 0.5 }),
    prior: () => ({ aiReferred: 10, organic: 1, engagementRate: 0.4 }),
  })
  expect(rows[0].citationShareDelta).toBeNull()
  expect(rows[0].aiReferredDelta).toBe(100)
})

test('last_30_days with compare: prior fetched with compare window', async () => {
  const fetcher = vi.fn().mockResolvedValue(OK)
  const r = await planOwnedCitations({ clientSlug: 'c', ownedHosts: ['a.com'], dateRange: 'last_30_days', compareDates: cmp, fetcher })
  expect(fetcher).toHaveBeenCalledWith('c', ['a.com'], cmp)
  expect(r.ownedPrior).toBe(OK)
})
