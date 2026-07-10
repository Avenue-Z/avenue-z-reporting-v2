import { expect, test, vi, beforeEach } from 'vitest'
import { FIXTURE_PEEC_CTX } from '../parts/__fixtures__/peec-ctx'

// Un-mocking @/lib/ga4/client below (to keep parseDateRange/deriveCompareRange real)
// transitively imports lib/db/client, which throws at module init without
// DATABASE_URL. Placeholder only, same pattern used elsewhere in the repo
// (e.g. components/charts/capsule-column-chart.test.tsx).
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgresql://user:password@host.tld/dbname'
})

vi.mock('@/lib/peec/client', () => ({ getPeecOverview: vi.fn() }))
vi.mock('@/lib/pr-proof/client', () => ({ getPRProofData: vi.fn() }))
vi.mock('@/lib/peec/url-citations', async (orig) => ({ ...(await orig<object>()), getDomainCoverage: vi.fn(), getUrlCitations: vi.fn() }))
vi.mock('@/lib/ga4/client', async (orig) => ({ ...(await orig<object>()), ga4Query: vi.fn() }))
vi.mock('@/lib/peec/citation-dates', () => ({ getPlacementCitationDates: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))

import { getPeecOverview } from '@/lib/peec/client'
import { getPRProofData } from '@/lib/pr-proof/client'
import { getDomainCoverage, getUrlCitations } from '@/lib/peec/url-citations'
import { ga4Query } from '@/lib/ga4/client'
import { getPlacementCitationDates } from '@/lib/peec/citation-dates'
import { getClientBySlug } from '@/lib/db/queries'
import { buildPrInfluenceCtx } from './ctx'

const EMPTY_COVERAGE = { promptIdsByDomain: {}, tagIdsByDomain: {}, tagIdsByUrlKey: {}, promptIdsByUrlKey: {}, tagNameById: {} }

beforeEach(() => {
  vi.mocked(getPeecOverview).mockResolvedValue(FIXTURE_PEEC_CTX.data as never)
  vi.mocked(getPRProofData).mockResolvedValue({ placements: [], totalPlacements: 0, uniqueDomains: [] } as never)
  vi.mocked(getDomainCoverage).mockResolvedValue(EMPTY_COVERAGE as never)
  vi.mocked(getUrlCitations).mockResolvedValue([] as never)
  vi.mocked(ga4Query).mockResolvedValue({ rows: [{ sessionSource: 'chatgpt.com', sessions: 100 }] } as never)
  vi.mocked(getPlacementCitationDates).mockResolvedValue({} as never)
  vi.mocked(getClientBySlug).mockResolvedValue({ profoundCategoryId: null } as never)
})

test('buildPrInfluenceCtx derivation, no model filter', async () => {
  const ctx = await buildPrInfluenceCtx({ clientSlug: 'fixture', dateRange: 'last_30_days', models: null })
  expect(ctx).toMatchSnapshot()
})

test('buildPrInfluenceCtx derivation, active model filter', async () => {
  const ctx = await buildPrInfluenceCtx({ clientSlug: 'fixture', dateRange: 'last_30_days', models: ['ChatGPT'] as never })
  expect(ctx).toMatchSnapshot()
})
