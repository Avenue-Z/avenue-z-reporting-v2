import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const m = vi.hoisted(() => ({ listProjects: vi.fn() }))
vi.mock('@/lib/aeo-outbound/pull', async (o) => ({ ...(await o<object>()), listProjects: m.listProjects }))
import { GET } from './route'
import { auth } from '@/auth'
import { PeecError } from '@/lib/aeo-outbound/peec'

beforeEach(() => { vi.stubEnv('AEO_OUTBOUND_USERS', 'ryan@avenuez.com'); vi.stubEnv('PEEC_AI_CUSTOMER_TOKEN', 'skc-test') })
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

test('403 without the allowlist; 200 list; 502 when Peec fails', async () => {
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ADMIN', email: 'x@avenuez.com' } } as never)
  expect((await GET()).status).toBe(403)
  expect(m.listProjects).not.toHaveBeenCalled()
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ANALYST', email: 'ryan@avenuez.com' } } as never)
  m.listProjects.mockResolvedValue([{ id: 'or_a', name: 'Alpha', status: 'PITCH' }])
  const ok = await GET()
  expect(ok.status).toBe(200)
  expect(await ok.json()).toEqual([{ id: 'or_a', name: 'Alpha', status: 'PITCH' }])
  m.listProjects.mockRejectedValue(new PeecError('down'))
  expect((await GET()).status).toBe(502)
})
