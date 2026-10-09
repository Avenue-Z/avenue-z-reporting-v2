import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { GLEAN_BASE_URL } from '@/lib/glean'
import { gleanOnce, readGleanReply } from './glean'

const ai = (messageType: string, fragments: Record<string, unknown>[]) => ({ author: 'GLEAN_AI', messageType, fragments })
test('takes the last CONTENT message, not the longest one (T3 probe B)', () => {
  const r = readGleanReply({ messages: [ai('UPDATE', [{ text: '**Clarifying data constraints** with a long heading' }]), ai('CONTENT', [{ text: 'NOT IN DATA' }])] })
  expect(r).toEqual({ text: 'NOT IN DATA', searched: false })
})
test('any search fragment or citation marks the reply as searched (T3 probe A)', () => {
  for (const f of [{ querySuggestion: {} }, { structuredResults: [] }, { action: {} }, { citation: {} }]) {
    expect(readGleanReply({ messages: [ai('UPDATE', [f]), ai('CONTENT', [{ text: '{}' }])] }).searched).toBe(true)
  }
  expect(readGleanReply({ messages: [{ author: 'GLEAN_AI', messageType: 'CONTENT', fragments: [{ text: 'x' }], citations: [{}] }] }).searched).toBe(true)
})
test('no answer is an error', () => {
  expect(() => readGleanReply({ messages: [ai('UPDATE', [{ text: 'x' }])] })).toThrow('no answer')
  expect(() => readGleanReply({})).toThrow('no answer')
})
test('malformed payloads never throw a TypeError', () => {
  expect(() => readGleanReply({ messages: 'x' })).toThrow('no answer')
  expect(() => readGleanReply({ messages: [null, 7, { author: 'GLEAN_AI', messageType: 'CONTENT', fragments: 'x' }] })).toThrow('no answer')
  expect(
    readGleanReply({ messages: [{ author: 'GLEAN_AI', messageType: 'CONTENT', fragments: [null, 5, { text: 'ok' }], citations: 'x' }] }),
  ).toEqual({ text: 'ok', searched: false })
})

const FAKE_TOKEN = 'fake-token-abc123'
let saved: { token?: string; instance?: string }
beforeEach(() => {
  saved = { token: process.env.GLEAN_API_TOKEN, instance: process.env.GLEAN_INSTANCE }
  process.env.GLEAN_API_TOKEN = FAKE_TOKEN
  process.env.GLEAN_INSTANCE = 'fake-instance'
})
afterEach(() => {
  for (const [k, v] of [['GLEAN_API_TOKEN', saved.token], ['GLEAN_INSTANCE', saved.instance]] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

test('gleanOnce: a 500 throws the status only, never the body or the token', async () => {
  const fetchImpl = vi.fn(async () => new Response('secret body ' + FAKE_TOKEN, { status: 500 }))
  const err = await gleanOnce('the prompt', new AbortController().signal, fetchImpl as unknown as typeof fetch).catch((e: Error) => e)
  expect(err).toBeInstanceOf(Error)
  expect((err as Error).message).toBe('Glean chat error 500')
  expect((err as Error).message).not.toContain('the prompt')
  expect((err as Error).message).not.toContain(FAKE_TOKEN)
})
test('gleanOnce: returns the CONTENT reply and sends saveChat false with the signal', async () => {
  const body = { messages: [ai('CONTENT', [{ text: 'hello' }])] }
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  const signal = new AbortController().signal
  const r = await gleanOnce('the prompt', signal, fetchImpl as unknown as typeof fetch)
  expect(r).toEqual({ text: 'hello', searched: false })
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe(`${GLEAN_BASE_URL}/chat`)
  expect(init.signal).toBe(signal)
  expect(JSON.parse(init.body as string).saveChat).toBe(false)
})
