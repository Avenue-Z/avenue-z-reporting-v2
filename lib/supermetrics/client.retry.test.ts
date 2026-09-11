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

  test('retries a 5xx, because a transient one is far more expensive to misread', async () => {
    // Not "a 5xx is the vendor failing rather than an answer" — Supermetrics
    // 500s deterministically on convert_to_default_currency for a single-currency
    // org, so a 5xx is ambiguous. The retry is justified by the asymmetry: a
    // misread transient 500 cost an hour of dashed tiles live on staging
    // 2026-08-26 (`SmQueryError: Supermetrics 500` on the wide open-pipeline
    // query while the other three in the same fan-out succeeded, degrading the
    // tiles and caching the degraded object over a good entry); a misread
    // deterministic 500 costs two extra round trips to the same answer.
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

  test('spends one budget across the whole retry chain, not a fresh timeout per attempt', async () => {
    // The abort timer used to be armed inside each attempt, so a retry got a
    // fresh full timeoutMs. Harmless while a 5xx threw on the first response;
    // load-bearing once 5xx is retried, because the Salesforce ceiling is 60s
    // and 3 x 60s + back-off is 181.5s — on report pages that declare no
    // maxDuration and under a health sweep that declares 60s. Wide pipeline
    // queries genuinely run 41-49s cold, so a late-arriving 500 is ordinary.
    const TIMEOUT = 300
    const FETCH_MS = 200
    let calls = 0
    const slow503 = ((_u: string, init?: RequestInit) => {
      calls++
      return new Promise<Response>((resolve, reject) => {
        const t = setTimeout(
          () => resolve({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) } as unknown as Response),
          FETCH_MS,
        )
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t)
          const e = new Error('aborted'); e.name = 'AbortError'; reject(e)
        })
      })
    }) as unknown as typeof fetch
    const start = Date.now()
    await expect(smQuery(params, { fetchImpl: slow503, timeoutMs: TIMEOUT, retryDelayMs: 10 }))
      .rejects.toBeInstanceOf(SmTimeoutError)
    // A per-attempt timeout would allow three 200ms fetches plus back-off (~630ms).
    expect(Date.now() - start).toBeLessThan(TIMEOUT + 150)
    // And the bound is the deadline, not an early give-up: it did retry.
    expect(calls).toBeGreaterThan(1)
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

describe('a retryable response is handled without wasting the vendor\'s hint or our sockets', () => {
  /** A 503 that names its own back-off, plus a spy on the body it hands back. */
  const unavailable = (retryAfter: string | null) => {
    const cancel = vi.fn(async () => {})
    return {
      res: {
        ok: false,
        status: 503,
        headers: { get: (h: string) => (h === 'Retry-After' ? retryAfter : null) },
        body: { cancel },
        json: async () => ({}),
      } as unknown as Response,
      cancel,
    }
  }

  test('waits the interval a 503 asks for instead of its own back-off', async () => {
    // The 429 branch has always parsed Retry-After; the 5xx branch shipped
    // without it, so a vendor asking for a specific pause got our 500ms guess.
    // retryDelayMs is 1ms here, so anything near the requested 200ms can only
    // have come from the header.
    const { res } = unavailable('0.2')
    let calls = 0
    const impl = vi.fn(async () => { calls++; return res }) as unknown as typeof fetch
    const start = Date.now()
    await expect(smQuery(params, { fetchImpl: impl, retryDelayMs: 1 })).rejects.toThrow(/503/)
    // Two back-offs across three attempts, 200ms each.
    expect(Date.now() - start).toBeGreaterThanOrEqual(300)
    expect(calls).toBe(3)
  })

  test('honours the HTTP-date form of Retry-After rather than reading it as NaN', async () => {
    // `Number('Wed, 26 Aug 2026 …')` is NaN and `setTimeout(NaN)` fires
    // immediately, so parsing the date form as a number silently converts a
    // back-off request into a hot retry loop against a struggling vendor.
    //
    // Two seconds out, not two hundred milliseconds: HTTP-date has one-second
    // granularity, so toUTCString() floors the fractional part and a sub-second
    // offset serialises to a moment already in the past. The assertion is
    // therefore only that we waited at all — the exact interval is the previous
    // test's job — which is the whole distinction between a back-off and a
    // hot loop.
    const { res } = unavailable(new Date(Date.now() + 2000).toUTCString())
    const impl = vi.fn(async () => res) as unknown as typeof fetch
    const start = Date.now()
    await expect(smQuery(params, { fetchImpl: impl, retryDelayMs: 1 })).rejects.toThrow(/503/)
    expect(Date.now() - start).toBeGreaterThanOrEqual(900)
  })

  test('falls back to its own back-off when Retry-After is unparseable', async () => {
    const { res } = unavailable('whenever')
    let calls = 0
    const impl = vi.fn(async () => { calls++; return res }) as unknown as typeof fetch
    await expect(smQuery(params, { fetchImpl: impl, retryDelayMs: 1 })).rejects.toThrow(/503/)
    expect(calls).toBe(3)
  })

  test('releases the body of every response it does not read', async () => {
    // undici keeps the connection checked out until the body is consumed or
    // cancelled, so retrying off an unread response pins one socket per attempt
    // until GC — starving the pool of the connections the retry itself needs.
    // Three attempts, none of them read: three releases, including the last one
    // that unwinds into the throw.
    const { res, cancel } = unavailable(null)
    const impl = vi.fn(async () => res) as unknown as typeof fetch
    await expect(smQuery(params, { fetchImpl: impl, retryDelayMs: 1 })).rejects.toThrow(/503/)
    expect(cancel).toHaveBeenCalledTimes(3)
  })

  /** A 429 that hands back a spy on the body it never gets read. */
  const rateLimited = () => {
    const cancel = vi.fn(async () => {})
    return {
      res: {
        ok: false, status: 429, headers: { get: () => null }, body: { cancel }, json: async () => ({}),
      } as unknown as Response,
      cancel,
    }
  }

  test('retries a 429 and recovers, the branch that had no coverage at all', async () => {
    const { res } = rateLimited()
    let calls = 0
    const impl = vi.fn(async () => { calls++; return calls === 1 ? res : ok() }) as unknown as typeof fetch
    const out = await smQuery(params, { fetchImpl: impl, retryDelayMs: 1 })
    expect(out.rows).toEqual([['10']])
    expect(calls).toBe(2)
  })

  test('gives a persistent 429 the same 3 attempts as every other branch, and releases every body', async () => {
    // Two defects met here. The give-up test was a hardcoded `attempt >= 3`
    // sharing one counter with the 5xx branch's MAX_NETWORK_RETRIES, so a run
    // of 429s quietly got four attempts while the docblock promised three. And
    // the throw it guarded was the one unread-response path in the file with no
    // discardBody: four requests, three bodies cancelled, the last socket pinned
    // until GC — precisely when connections are scarcest.
    const { res, cancel } = rateLimited()
    let calls = 0
    const impl = vi.fn(async () => { calls++; return res }) as unknown as typeof fetch
    const start = Date.now()
    await expect(smQuery(params, { fetchImpl: impl, retryDelayMs: 1 })).rejects.toThrow(/rate limit/)
    expect(calls).toBe(3)
    expect(cancel).toHaveBeenCalledTimes(3)
    // The back-off derives from retryDelayMs (1ms here, so 4ms then 8ms). The
    // hardcoded 2000ms literal it replaces would put this run past 4 seconds —
    // which is why no suite ever covered this branch.
    expect(Date.now() - start).toBeLessThan(1000)
  })

  test('releases the body of a 4xx too, which is thrown without ever being read', async () => {
    const cancel = vi.fn(async () => {})
    const impl = vi.fn(async () => ({
      ok: false, status: 400, headers: { get: () => null }, body: { cancel }, json: async () => ({}),
    })) as unknown as typeof fetch
    await expect(smQuery(params, { fetchImpl: impl, retryDelayMs: 1 })).rejects.toThrow(/400/)
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
