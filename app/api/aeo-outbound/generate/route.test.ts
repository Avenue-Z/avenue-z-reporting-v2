import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  listProjects: vi.fn(), generateSnapshot: vi.fn(), gleanOnce: vi.fn(), getReport: vi.fn(),
  insert: vi.fn(), insertArgs: vi.fn(), stale: vi.fn(), draft: vi.fn(), failed: vi.fn(), findGenerating: vi.fn(),
}))
vi.mock('@/lib/aeo-outbound/pull', async (o) => ({ ...(await o<object>()), listProjects: m.listProjects }))
vi.mock('@/lib/aeo-outbound/generate', () => ({ generateSnapshot: m.generateSnapshot }))
vi.mock('@/lib/aeo-outbound/glean', async (o) => ({ ...(await o<object>()), gleanOnce: m.gleanOnce }))
vi.mock('@/lib/aeo-outbound/store', async (o) => ({
  ...(await o<object>()),
  getReport: m.getReport,
  markStaleGeneratingQuery: () => ({ then: (r: (v: unknown) => void) => r(m.stale()) }),
  insertGeneratingQuery: (v: unknown) => { m.insertArgs(v); return { then: (r: (v: unknown) => void, j: (e: unknown) => void) => { try { r(m.insert()) } catch (e) { j(e) } } } },
  finishDraftQuery: () => ({ then: (r: (v: unknown) => void, j: (e: unknown) => void) => { try { r(m.draft()) } catch (e) { j(e) } } }),
  finishFailedQuery: () => ({ then: (r: (v: unknown) => void) => r(m.failed()) }),
  findGeneratingFor: m.findGenerating,
}))

import { POST } from './route'
import { auth } from '@/auth'
import { PeecError } from '@/lib/aeo-outbound/peec'
import { ONE_GENERATING_INDEX } from '@/lib/aeo-outbound/store'

const RERUN = 'c7d8e0a1-1111-4111-8111-111111111111'
const post = (b: unknown, headers: Record<string, string> = {}) =>
  POST(new NextRequest('https://app.example/api/aeo-outbound/generate', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b), headers: { 'content-type': 'application/json', host: 'app.example', ...headers } }))
const as = (email: string, role = 'INTERNAL_ANALYST') => vi.mocked(auth).mockResolvedValue({ user: { role, email, clientSlug: null } } as never)
const storedRow = (over: Record<string, unknown> = {}) => ({ id: RERUN, peecProjectId: 'or_a', requestedStart: null, requestedEnd: null, ...over })

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('AEO_OUTBOUND_USERS', 'ryan@avenuez.com')
  vi.stubEnv('PEEC_AI_CUSTOMER_TOKEN', 'skc-test')
  m.listProjects.mockResolvedValue([{ id: 'or_a', name: 'Alpha', status: 'PITCH' }])
  m.insert.mockReturnValue([{ id: 'row-1' }])
  m.getReport.mockResolvedValue(storedRow())
  m.generateSnapshot.mockResolvedValue({ ok: true, brandName: 'Example Co', data: {}, slots: {}, notes: [] })
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks() })

test('403 for no session, non-allowlisted staff, and a foreign Origin', async () => {
  vi.mocked(auth).mockResolvedValue(null as never)
  expect((await post({ projectId: 'or_a' })).status).toBe(403)
  as('other@avenuez.com')
  expect((await post({ projectId: 'or_a' })).status).toBe(403)
  as('ryan@avenuez.com')
  expect((await post({ projectId: 'or_a' }, { origin: 'https://evil.example' })).status).toBe(403)
  expect(m.generateSnapshot).not.toHaveBeenCalled()
  expect(m.listProjects).not.toHaveBeenCalled()
})

test('400 bad-request for a malformed body, with no Peec call', async () => {
  as('ryan@avenuez.com')
  for (const b of ['not json', {}, { projectId: '' }, { projectId: 5 }, { projectId: 'or_a', rerunOf: 'nope' }, { projectId: 'or_a', rerunOf: 7 }]) {
    const res = await post(b)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad-request', code: 'bad-request' })
  }
  expect(m.listProjects).not.toHaveBeenCalled()
})

test('a rerun with a body start or end is a 400 bad-request', async () => {
  as('ryan@avenuez.com')
  for (const extra of [{ start: '2026-10-01' }, { end: '2026-10-02' }]) {
    const res = await post({ projectId: 'or_a', rerunOf: RERUN, ...extra })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad-request', code: 'bad-request' })
  }
  expect(m.getReport).not.toHaveBeenCalled()
})

test('404 bad-rerun for a missing row and for another project\'s row, before any Peec call', async () => {
  as('ryan@avenuez.com')
  m.getReport.mockResolvedValueOnce(undefined)
  let res = await post({ projectId: 'or_a', rerunOf: RERUN })
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: "That snapshot can't be rerun. Refresh the list.", code: 'bad-rerun' })
  m.getReport.mockResolvedValueOnce(storedRow({ peecProjectId: 'or_other' }))
  res = await post({ projectId: 'or_a', rerunOf: RERUN })
  expect(res.status).toBe(404)
  expect((await res.json()).code).toBe('bad-rerun')
  expect(m.listProjects).not.toHaveBeenCalled()
  expect(m.insert).not.toHaveBeenCalled()
})

test('400 bad-range for a bad fresh range, before any Peec call', async () => {
  as('ryan@avenuez.com')
  for (const b of [{ start: '2026-10-01' }, { start: '2026-02-30', end: '2026-03-01' }, { start: '2999-01-01', end: '2999-01-02' }]) {
    const res = await post({ projectId: 'or_a', ...b })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('bad-range')
  }
  expect(m.listProjects).not.toHaveBeenCalled()
})

test('400 bad-project for an unusable project; 502 when Peec fails at the re-check', async () => {
  as('ryan@avenuez.com')
  const res = await post({ projectId: 'or_customer' })
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: "This Peec project can't be used.", code: 'bad-project' })
  m.listProjects.mockRejectedValueOnce(new PeecError('[PEEC API] /projects: HTTP 500 ()'))
  expect((await post({ projectId: 'or_a' })).status).toBe(502)
  expect(m.insert).not.toHaveBeenCalled()
})

test('409 with the existing id when the one-generating index is hit; another 23505 is not a 409', async () => {
  as('ryan@avenuez.com')
  m.insert.mockImplementation(() => { throw Object.assign(new Error('dup'), { code: '23505', constraint: ONE_GENERATING_INDEX }) })
  m.findGenerating.mockResolvedValue('row-0')
  const res = await post({ projectId: 'or_a' })
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'already-generating', id: 'row-0' })
  m.insert.mockImplementation(() => { throw Object.assign(new Error('dup'), { code: '23505', constraint: 'some_other_index' }) })
  expect((await post({ projectId: 'or_a' })).status).toBe(500)
  expect(m.generateSnapshot).not.toHaveBeenCalled()
})

test('a non-409 insert failure answers 500 and no log carries the email or the message', async () => {
  as('ryan@avenuez.com')
  const cause = Object.assign(new Error('connection'), { code: '08006' })
  m.insert.mockImplementation(() => { throw Object.assign(new Error('Failed query: insert ...\nparams: ryan@avenuez.com'), { name: 'DrizzleQueryError', cause }) })
  const spies = (['error', 'warn', 'info', 'log'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
  const res = await post({ projectId: 'or_a' })
  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({ error: 'Could not start generation. Try again.' })
  const logged = spies.flatMap((s) => s.mock.calls.flat()).map(String)
  expect(logged.join(' ')).toContain('insert failed project=or_a reason=08006')
  expect(logged.join(' ')).not.toContain('@')
  expect(m.generateSnapshot).not.toHaveBeenCalled()
})

test('200 draft and 200 failed, with the row inserted with its range', async () => {
  as('ryan@avenuez.com')
  expect(await (await post({ projectId: 'or_a' })).json()).toEqual({ id: 'row-1', status: 'draft' })
  expect(m.insertArgs).toHaveBeenLastCalledWith({ projectId: 'or_a', projectName: 'Alpha', createdBy: 'ryan@avenuez.com', rerunOf: null, range: null })
  m.generateSnapshot.mockResolvedValueOnce({ ok: false, error: 'Copy generation failed. Rerun.', brandName: 'Example Co' })
  expect(await (await post({ projectId: 'or_a', rerunOf: RERUN })).json()).toEqual({ id: 'row-1', status: 'failed', error: 'Copy generation failed. Rerun.' })
  expect(m.insertArgs).toHaveBeenLastCalledWith({ projectId: 'or_a', projectName: 'Alpha', createdBy: 'ryan@avenuez.com', rerunOf: RERUN, range: null })
  expect(m.failed).toHaveBeenCalled()
})

test('a picked range reaches the insert and the pipeline; no range passes null', async () => {
  as('ryan@avenuez.com')
  const d = new Date(); d.setUTCDate(d.getUTCDate() - 3)
  const end = d.toISOString().slice(0, 10)
  d.setUTCDate(d.getUTCDate() - 4)
  const start = d.toISOString().slice(0, 10)
  await post({ projectId: 'or_a', start, end })
  expect(m.insertArgs).toHaveBeenLastCalledWith(expect.objectContaining({ range: { start, end } }))
  expect(m.generateSnapshot).toHaveBeenLastCalledWith('or_a', expect.anything(), { start, end })
  await post({ projectId: 'or_a' })
  expect(m.generateSnapshot).toHaveBeenLastCalledWith('or_a', expect.anything(), null)
})

test('a rerun uses the stored range, even one older than the lookback', async () => {
  as('ryan@avenuez.com')
  m.getReport.mockResolvedValue(storedRow({ requestedStart: '2020-01-01', requestedEnd: '2020-01-07' }))
  const res = await post({ projectId: 'or_a', rerunOf: RERUN })
  expect(res.status).toBe(200)
  const range = { start: '2020-01-01', end: '2020-01-07' }
  expect(m.insertArgs).toHaveBeenLastCalledWith(expect.objectContaining({ rerunOf: RERUN, range }))
  expect(m.generateSnapshot).toHaveBeenLastCalledWith('or_a', expect.anything(), range)
})

test('glean acts as the session email, never a body field, and a failure logs the id and reason but no email', async () => {
  as('ryan@avenuez.com')
  await post({ projectId: 'or_a', email: 'someone@avenuez.com' })
  const deps = m.generateSnapshot.mock.calls[0][1] as { glean: (p: string, s: AbortSignal) => Promise<unknown> }
  const signal = new AbortController().signal
  m.gleanOnce.mockResolvedValueOnce({ text: 'ok', searched: false })
  await deps.glean('p', signal)
  expect(m.gleanOnce).toHaveBeenCalledWith('p', signal, 'ryan@avenuez.com')
  m.gleanOnce.mockRejectedValueOnce(new Error('Glean chat error 500'))
  await expect(deps.glean('p', signal)).rejects.toThrow('Glean chat error 500')
  const warn = vi.mocked(console.warn)
  expect(warn).toHaveBeenCalledTimes(1)
  const line = String(warn.mock.calls[0][0])
  expect(line).toContain('id=row-1')
  expect(line).toContain('Glean chat error 500')
  expect(line).not.toMatch(/@avenuez\.com/)
})

test('a throw while finishing still fails the row and answers', async () => {
  as('ryan@avenuez.com')
  m.draft.mockImplementationOnce(() => { throw new Error('db down') })
  expect(await (await post({ projectId: 'or_a' })).json()).toEqual({ id: 'row-1', status: 'failed', error: 'Generation failed. Rerun.' })
  expect(m.failed).toHaveBeenCalled()
})

test('the finish log names the error, never its message', async () => {
  as('ryan@avenuez.com')
  m.draft.mockImplementationOnce(() => { throw new Error('Failed query: update params: prospect data') })
  await post({ projectId: 'or_a' })
  const line = vi.mocked(console.error).mock.calls.flat().map(String).join(' ')
  expect(line).toContain('outcome=error step=finish')
  expect(line).toContain('reason=Error')
  expect(line).not.toContain('prospect')
})
