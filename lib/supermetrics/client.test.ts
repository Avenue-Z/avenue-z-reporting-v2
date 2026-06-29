// Run: npx tsx lib/supermetrics/client.test.ts
import { strict as assert } from 'node:assert'
import { smQuery, parseSmRows } from './client'
import { SmTimeoutError } from './types'

// A fake fetch returning queued responses (matches the real { meta, data } shape).
function fakeFetch(seq: Array<{ status: number; body: unknown }>): typeof fetch {
  let i = 0
  return (async () => {
    const step = seq[Math.min(i++, seq.length - 1)]
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      headers: { get: () => null },
      json: async () => step.body,
    } as unknown as Response
  }) as unknown as typeof fetch
}

// A fetch that never resolves on its own but rejects with an AbortError when the
// caller's AbortController fires — simulates a hung Supermetrics data source.
function hangingFetch(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        reject(err)
      })
    })) as unknown as typeof fetch
}

async function main() {
  // Happy path: synchronous response. The data[0] header uses DISPLAY names, but
  // meta.query.fields gives canonical field_ids — rows must be keyed by field_id.
  const fetchImpl = fakeFetch([
    {
      status: 200,
      body: {
        meta: {
          status_code: 'SUCCESS',
          query: { fields: [{ field_id: 'Campaignname', data_column: 0 }, { field_id: 'Cost', data_column: 1 }] },
        },
        data: [['Campaign name', 'Cost'], ['REN | Brand', '10']],
      },
    },
  ])
  const res = await smQuery(
    { apiKey: 'k', dsId: 'AW', dsAccounts: '4136001852', fields: ['Campaignname', 'Cost'], dateRange: '2026-01-01,2026-01-31' },
    { pollMs: 1, maxPolls: 3, fetchImpl },
  )
  assert.deepEqual(res.header, ['Campaignname', 'Cost']) // field_ids, NOT display names
  assert.deepEqual(parseSmRows(res), [{ Campaignname: 'REN | Brand', Cost: '10' }])

  // Async fallback that never returns data within maxPolls → SmTimeoutError.
  const slow = fakeFetch([
    { status: 200, body: { meta: { schedule_id: 'abc' } } }, // submit: schedule_id, no data
    { status: 200, body: { meta: { schedule_id: 'abc' } } }, // polls: still no data
  ])
  await assert.rejects(
    smQuery({ apiKey: 'k', dsId: 'AW', dsAccounts: '1', fields: ['Date'], dateRange: 'x' }, { pollMs: 1, maxPolls: 2, fetchImpl: slow }),
    (e: unknown) => e instanceof SmTimeoutError,
  )

  // Request-level timeout: a hung connection is aborted and surfaces SmTimeoutError
  // rather than spinning forever.
  await assert.rejects(
    smQuery({ apiKey: 'k', dsId: 'SHP', dsAccounts: '1', fields: ['total_sales'], dateRange: 'x' }, { timeoutMs: 20, fetchImpl: hangingFetch() }),
    (e: unknown) => e instanceof SmTimeoutError,
  )

  // Non-success status_code surfaces as SmQueryError.
  const failed = fakeFetch([{ status: 200, body: { meta: { status_code: 'FAILURE' } } }])
  await assert.rejects(
    smQuery({ apiKey: 'k', dsId: 'AW', dsAccounts: '1', fields: ['Date'], dateRange: 'x' }, { pollMs: 1, maxPolls: 2, fetchImpl: failed }),
  )
  console.log('ok')
}
main()
