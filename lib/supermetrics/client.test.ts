// Run: npx tsx lib/supermetrics/client.test.ts
import { strict as assert } from 'node:assert'
import { smQuery, parseSmRows } from './client'
import { SmTimeoutError } from './types'

// A fake fetch that returns a schedule id, then "completed" with rows.
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

async function main() {
  // Happy path: submit returns schedule_id, poll returns completed.
  const fetchImpl = fakeFetch([
    { status: 200, body: { data: { schedule_id: 'abc' } } },
    { status: 200, body: { data: { status: 'completed', data: [['Date', 'Cost'], ['2026-01-01', '10']] } } },
  ])
  const res = await smQuery(
    { apiKey: 'k', dsId: 'AW', dsAccounts: '4136001852', fields: ['Date', 'Cost'], dateRange: '2026-01-01,2026-01-31' },
    { pollMs: 1, maxPolls: 3, fetchImpl },
  )
  assert.deepEqual(res.header, ['Date', 'Cost'])
  assert.deepEqual(parseSmRows(res), [{ Date: '2026-01-01', Cost: '10' }])

  // Timeout: never completes within maxPolls.
  const slow = fakeFetch([
    { status: 200, body: { data: { schedule_id: 'abc' } } },
    { status: 200, body: { data: { status: 'pending' } } },
  ])
  await assert.rejects(
    smQuery({ apiKey: 'k', dsId: 'AW', dsAccounts: '1', fields: ['Date'], dateRange: 'x' }, { pollMs: 1, maxPolls: 2, fetchImpl: slow }),
    (e: unknown) => e instanceof SmTimeoutError,
  )
  console.log('ok')
}
main()
