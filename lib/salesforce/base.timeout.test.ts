import { describe, expect, test, vi, beforeEach, type Mock } from 'vitest'

// base.ts pulls in lib/db (-> next-auth) and lib/ga4/client (-> googleapis);
// both are mocked so the module loads under jsdom, the same pattern
// pipeline.orchestration.test.ts uses for its own imports.
vi.mock('@/lib/supermetrics/client', () => ({
  smQuery: vi.fn(() => Promise.resolve({ header: [], rows: [] })),
  parseSmRows: vi.fn(() => []),
  DS_IDS: { SALESFORCE: 'SF' },
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/ga4/client', () => ({
  parseDateRange: vi.fn(() => ({ startDate: '2026-01-01', endDate: '2026-12-31' })),
  deriveCompareRange: vi.fn(() => null),
}))

import { salesforceQuery } from './base'
import { smQuery } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'

describe('salesforceQuery timeout passthrough', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getClientBySlug as Mock).mockResolvedValue({
      salesforceConfig: { salesforceAccountId: 'acct-1' },
      smApiKeyEnvVar: 'SM_API_KEY_TEST',
    })
    process.env.SM_API_KEY_TEST = 'key'
  })

  test('forwards an explicit timeoutMs to smQuery', async () => {
    await salesforceQuery('acme', ['opportunity_count'], '2026-01-01,2026-12-31', { timeoutMs: 60_000 })
    // Second positional arg is smQuery's opts bag.
    expect((smQuery as Mock).mock.calls[0][1]).toMatchObject({ timeoutMs: 60_000 })
  })

  test('leaves smQuery on its own default when no timeoutMs is given', async () => {
    await salesforceQuery('acme', ['opportunity_count'], '2026-01-01,2026-12-31')
    const opts = (smQuery as Mock).mock.calls[0][1]
    // Undefined, not a number: smQuery's `opts.timeoutMs ?? REQUEST_TIMEOUT_MS`
    // must stay the single source of the default, so this layer never pins it.
    expect(opts?.timeoutMs).toBeUndefined()
  })
})
