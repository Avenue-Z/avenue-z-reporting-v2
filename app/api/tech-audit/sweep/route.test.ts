// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const m = vi.hoisted(() => ({ runSweep: vi.fn() }))
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/technical-audit/store', () => ({ claimRun: vi.fn(), completeRun: vi.fn(), ensureSnapshot: vi.fn(), failRun: vi.fn(), getSnapshots: vi.fn() }))
vi.mock('@/lib/technical-audit/sf', () => ({ listSfRuns: vi.fn(), fetchIssuesOverview: vi.fn(), parseSfIssuesOverview: vi.fn() }))
vi.mock('@/lib/technical-audit/ahrefs', () => ({ fetchAhrefs: vi.fn() }))
vi.mock('@/lib/technical-audit/sweep', () => ({ runSweep: m.runSweep }))
import { GET, dynamic, maxDuration } from './route'

const REPORT = { brands: 2, created: 1, completed: ['a 2026-11-01 sf'], failed: [], staleCrawl: [] }
const call = (auth?: string) => GET(new Request('https://app.example/api/tech-audit/sweep', { headers: auth ? { authorization: auth } : {} }))

beforeEach(() => { vi.stubEnv('CRON_SECRET', 's3cret'); m.runSweep.mockResolvedValue(REPORT) })
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

test('401 without the cron secret, and the sweep never runs', async () => {
  expect((await call()).status).toBe(401)
  expect((await call('Bearer wrong')).status).toBe(401)
  expect(m.runSweep).not.toHaveBeenCalled()
})

test('500 when CRON_SECRET is not configured, even for a bare "Bearer undefined"', async () => {
  vi.stubEnv('CRON_SECRET', '')
  expect((await call('Bearer undefined')).status).toBe(500)
  expect(m.runSweep).not.toHaveBeenCalled()
})

test('200 with the secret returns the report', async () => {
  const r = await call('Bearer s3cret')
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual(REPORT)
})

test('is dynamic with a 300 s budget', () => {
  expect(dynamic).toBe('force-dynamic')
  expect(maxDuration).toBe(300)
})
