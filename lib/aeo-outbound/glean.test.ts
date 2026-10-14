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
test('takes the last CONTENT message that has text, not a trailing citation-only one', () => {
  const r = readGleanReply({ messages: [ai('CONTENT', [{ text: 'the answer' }]), ai('CONTENT', [{ citation: {} }])] })
  expect(r).toEqual({ text: 'the answer', searched: true })
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
const EMAIL = 'ryan@avenuez.com'
let saved: { token?: string; instance?: string; actAs?: string }
beforeEach(() => {
  saved = { token: process.env.GLEAN_API_TOKEN, instance: process.env.GLEAN_INSTANCE, actAs: process.env.GLEAN_ACT_AS }
  process.env.GLEAN_API_TOKEN = FAKE_TOKEN
  process.env.GLEAN_INSTANCE = 'fake-instance'
  delete process.env.GLEAN_ACT_AS
})
afterEach(() => {
  vi.restoreAllMocks()
  for (const [k, v] of [['GLEAN_API_TOKEN', saved.token], ['GLEAN_INSTANCE', saved.instance], ['GLEAN_ACT_AS', saved.actAs]] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

test('gleanOnce: a 500 throws the status only, never the body or the token', async () => {
  const fetchImpl = vi.fn(async () => new Response('secret body ' + FAKE_TOKEN, { status: 500 }))
  const err = await gleanOnce('the prompt', new AbortController().signal, EMAIL, fetchImpl as unknown as typeof fetch).catch((e: Error) => e)
  expect(err).toBeInstanceOf(Error)
  expect((err as Error).message).toBe('Glean chat error 500')
  expect((err as Error).message).not.toContain('the prompt')
  expect((err as Error).message).not.toContain(FAKE_TOKEN)
})
test('gleanOnce: returns the CONTENT reply and sends saveChat false with the signal', async () => {
  const body = { messages: [ai('CONTENT', [{ text: 'hello' }])] }
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  const signal = new AbortController().signal
  const r = await gleanOnce('the prompt', signal, EMAIL, fetchImpl as unknown as typeof fetch)
  expect(r).toEqual({ text: 'hello', searched: false })
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe(`${GLEAN_BASE_URL}/chat`)
  expect(init.signal).toBe(signal)
  expect(JSON.parse(init.body as string).saveChat).toBe(false)
})
// The deployed environments' GLEAN_API_TOKEN is a user token, which refuses act-as with a 400 (seen on staging,
// 2026-10-14); an organization-wide token requires it (probed locally: "Required header missing: X-Glean-ActAs").
// So the tool acts as the user only where the token is organization-wide, GLEAN_ACT_AS=true, and otherwise calls
// Glean the way the Peec synopses do (lib/glean.ts gleanChat), as the token's owner.
test('gleanOnce: by default sends no act-as header, as the synopses do, and needs no email', async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ messages: [ai('CONTENT', [{ text: 'hi' }])] }), { status: 200 }))
  await gleanOnce('p', new AbortController().signal, '', fetchImpl as unknown as typeof fetch)
  const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
  expect(Object.keys(init.headers as Record<string, string>)).not.toContain('X-Scio-Actas')
})
test('gleanOnce: with GLEAN_ACT_AS=true acts as the given email; any other value does not', async () => {
  process.env.GLEAN_ACT_AS = 'true'
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ messages: [ai('CONTENT', [{ text: 'hi' }])] }), { status: 200 }))
  await gleanOnce('p', new AbortController().signal, EMAIL, fetchImpl as unknown as typeof fetch)
  expect(((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>)['X-Scio-Actas']).toBe(EMAIL)
  for (const v of ['1', 'yes', 'TRUE ', '']) {
    process.env.GLEAN_ACT_AS = v
    await gleanOnce('p', new AbortController().signal, EMAIL, fetchImpl as unknown as typeof fetch)
    expect(Object.keys((fetchImpl.mock.calls.at(-1) as unknown as [string, RequestInit])[1].headers as Record<string, string>), v).not.toContain('X-Scio-Actas')
  }
})
test('gleanOnce: a refusal (4xx) logs Glean\'s reason without the token, and throws the status only', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const fetchImpl = vi.fn(async () => new Response(`Required header missing: X-Glean-ActAs ${FAKE_TOKEN}\nNot allowed`, { status: 400 }))
  await expect(gleanOnce('p', new AbortController().signal, EMAIL, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/^Glean chat error 400$/)
  expect(warn.mock.calls.map((c) => c.join(' '))).toEqual(['[aeo-outbound] glean refused status=400 actAs=false detail=Required header missing: X-Glean-ActAs [redacted] Not allowed'])
})
test('gleanOnce: with GLEAN_ACT_AS=true refuses a malformed email before any request', async () => {
  process.env.GLEAN_ACT_AS = 'true'
  for (const bad of ['', 'ryan', 'a@', 'a@b']) {
    const fetchImpl = vi.fn()
    await expect(gleanOnce('p', new AbortController().signal, bad, fetchImpl as unknown as typeof fetch)).rejects.toThrow("Glean needs the signed-in user's email")
    expect(fetchImpl).not.toHaveBeenCalled()
  }
})
test('gleanOnce: not configured when GLEAN_INSTANCE is missing', async () => {
  delete process.env.GLEAN_INSTANCE
  const fetchImpl = vi.fn()
  await expect(gleanOnce('p', new AbortController().signal, EMAIL, fetchImpl as unknown as typeof fetch)).rejects.toThrow('Glean is not configured')
  expect(fetchImpl).not.toHaveBeenCalled()
})
test('gleanOnce: a 200 that is not JSON throws without any body text', async () => {
  const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token < secret')) }))
  const err = await gleanOnce('p', new AbortController().signal, EMAIL, fetchImpl as unknown as typeof fetch).catch((e: Error) => e)
  expect((err as Error).message).toBe('Glean chat returned unreadable JSON')
})
test('gleanOnce: a deadline abort during the body read stays an AbortError', async () => {
  const controller = new AbortController()
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => {
      controller.abort()
      throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    },
  }))
  await expect(gleanOnce('p', controller.signal, EMAIL, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({ name: 'AbortError' })
})
test('gleanOnce: a non-ok response releases the body before throwing', async () => {
  const cancel = vi.fn(async () => {})
  const fetchImpl = vi.fn(async () => ({ ok: false, status: 502, body: { cancel } }))
  await expect(gleanOnce('p', new AbortController().signal, EMAIL, fetchImpl as unknown as typeof fetch)).rejects.toThrow('Glean chat error 502')
  expect(cancel).toHaveBeenCalledTimes(1)
})
