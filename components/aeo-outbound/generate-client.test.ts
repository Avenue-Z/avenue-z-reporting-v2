import { afterEach, expect, test, vi } from 'vitest'
import { requestGenerate } from './generate-client'
import { ACCESS_MESSAGE, ACCESS_UNAVAILABLE, LOST_CONNECTION } from './messages'

afterEach(() => { vi.unstubAllGlobals() })
const answer = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))

// Paul's review of #388 (C1): the generate route answers 503 when settings can't be read, and the hub says try again.
test('a 503 from generate says try again; a 403 still says the tool is limited to the team', async () => {
  answer(503, { error: 'unavailable' })
  expect(await requestGenerate({ projectId: 'or_a' })).toEqual({ kind: 'message', text: ACCESS_UNAVAILABLE, refresh: false })
  // Any other 503 (the platform's, say) is a lost connection, as before.
  answer(503, { message: 'Service Unavailable' })
  expect(await requestGenerate({ projectId: 'or_a' })).toEqual({ kind: 'message', text: LOST_CONNECTION, refresh: true })
  answer(403, { error: 'forbidden' })
  expect(await requestGenerate({ projectId: 'or_a' })).toEqual({ kind: 'message', text: ACCESS_MESSAGE, refresh: false })
})
