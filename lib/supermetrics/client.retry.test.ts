import { describe, expect, test, vi } from 'vitest'
import { smQuery } from './client'
import { SmTimeoutError } from './types'

const OK_BODY = {
  meta: { status_code: 'SUCCESS', query: { fields: [{ field_id: 'Cost', data_column: 0 }] } },
  data: [['Cost'], ['10']],
}
const ok = () => ({
  ok: true, status: 200, headers: { get: () => null }, json: async () => OK_BODY,
}) as unknown as Response

/** Node's fetch surfaces every socket-level failure this way: a TypeError whose
 *  message is exactly 'fetch failed', with the real reason on .cause. This is the
 *  shape observed live on staging (`write ETIMEDOUT`, errno -110). */
function networkError(code = 'ETIMEDOUT'): Error {
  const cause = Object.assign(new Error(`write ${code}`), { code, errno: -110, syscall: 'write' })
  return Object.assign(new TypeError('fetch failed'), { cause })
}

const params = { apiKey: 'k', dsId: 'SF', dsAccounts: '1', fields: ['Cost'], dateRange: 'x' }

describe('transient network failures are retried', () => {
  // The incident this guards: one socket-level timeout on a cold render killed
  // all four Salesforce queries at once, because a rejected fetch propagated on
  // the first try. Only HTTP 429 was retried. The degraded result was then cached
  // for an hour, so a blip lasting seconds cost a full hour of dashed tiles.
  test('recovers when the first attempt fails at the socket level', async () => {
    let calls = 0
    const flaky = vi.fn(async () => {
      calls++
      if (calls === 1) throw networkError()
      return ok()
    }) as unknown as typeof fetch
    const res = await smQuery(params, { fetchImpl: flaky, retryDelayMs: 1 })
    expect(res.rows).toEqual([['10']])
    expect(calls).toBe(2)
  })

  test('gives up after a bounded number of attempts rather than retrying forever', async () => {
    let calls = 0
    const dead = vi.fn(async () => { calls++; throw networkError('ECONNRESET') }) as unknown as typeof fetch
    await expect(smQuery(params, { fetchImpl: dead, retryDelayMs: 1 })).rejects.toThrow(/fetch failed/)
    expect(calls).toBe(3)
  })

  test('never retries a deliberate abort: the hang guard must stay a hard stop', async () => {
    // Retrying here would multiply a 60s wide-window guard into minutes and blow
    // the function budget, which is the opposite of what the guard is for.
    let calls = 0
    const hanging = ((_u: string, init?: RequestInit) => {
      calls++
      return new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted'); e.name = 'AbortError'; rej(e)
        })
      })
    }) as unknown as typeof fetch
    await expect(smQuery(params, { fetchImpl: hanging, timeoutMs: 20, retryDelayMs: 1 }))
      .rejects.toBeInstanceOf(SmTimeoutError)
    expect(calls).toBe(1)
  })

  test('retries a 5xx: a server error is the vendor failing, not an answer', async () => {
    // Observed live on staging 2026-08-26: `SmQueryError: Supermetrics 500` on
    // the wide open-pipeline query, while the other three queries in the same
    // fan-out succeeded. One 500 degraded the tiles and the degraded object was
    // then cached over a good entry, so tiles that had been showing real figures
    // went back to dashes.
    let calls = 0
    const flaky500 = vi.fn(async () => {
      calls++
      if (calls === 1) {
        return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) } as unknown as Response
      }
      return ok()
    }) as unknown as typeof fetch
    const res = await smQuery(params, { fetchImpl: flaky500, retryDelayMs: 1 })
    expect(res.rows).toEqual([['10']])
    expect(calls).toBe(2)
  })

  test('gives up on a persistent 5xx rather than retrying forever', async () => {
    let calls = 0
    const dead500 = vi.fn(async () => {
      calls++
      return { ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) } as unknown as Response
    }) as unknown as typeof fetch
    await expect(smQuery(params, { fetchImpl: dead500, retryDelayMs: 1 })).rejects.toThrow(/503/)
    expect(calls).toBe(3)
  })

  test('does not retry a genuine API rejection: a 400 is an answer, not a blip', async () => {
    let calls = 0
    const bad = vi.fn(async () => {
      calls++
      return { ok: false, status: 400, headers: { get: () => null }, json: async () => ({}) } as unknown as Response
    }) as unknown as typeof fetch
    await expect(smQuery(params, { fetchImpl: bad, retryDelayMs: 1 })).rejects.toThrow(/400/)
    expect(calls).toBe(1)
  })
})
