// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { logId, refusalLine } from './log-id'

// An undefined secret falls back to AUTH_SECRET (log-id.ts:5), so the "no secret" case needs it empty
// here, whatever the shell running the tests has exported.
beforeEach(() => { vi.stubEnv('AUTH_SECRET', '') })
afterEach(() => { vi.unstubAllEnvs() })

test('eight hex characters, stable for one person, different for two, whatever the case', async () => {
  const a = await logId('a@acme.example', 's1')
  expect(a).toMatch(/^[0-9a-f]{8}$/)
  expect(await logId('A@Acme.Example', 's1')).toBe(a)
  expect(await logId('b@acme.example', 's1')).not.toBe(a)
})

test('keyed with the secret, so a list of guessed emails cannot reverse it without the secret', async () => {
  expect(await logId('a@acme.example', 's1')).not.toBe(await logId('a@acme.example', 's2'))
})

test('no email is "none"; no secret is "unkeyed", never an unkeyed hash', async () => {
  expect(await logId(null, 's1')).toBe('none')
  expect(await logId('', 's1')).toBe('none')
  expect(await logId('a@acme.example', undefined)).toBe('unkeyed')
  expect(await logId('a@acme.example', '')).toBe('unkeyed')
})

test('a refusal line: event, the caller-controlled value escaped and capped, then role, client and the keyed id', async () => {
  expect(await refusalLine('page refused', { role: 'CLIENT_ADMIN', clientSlug: 'acme', email: null }, ['slug', 'other']))
    .toBe('[access] page refused slug="other" role=CLIENT_ADMIN client=acme who=none')
  expect(await refusalLine('page refused staff-only', { role: 'SOMETHING_ELSE', clientSlug: 'acme' }))
    .toBe('[access] page refused staff-only role=SOMETHING_ELSE client=acme who=none')
  expect(await refusalLine('refused', undefined, ['path', '/dashboard'])).toBe('[access] refused path="/dashboard" role=none client=none who=none')
})

test('nothing a caller sends can start a new log line, and only 120 characters of it are kept', async () => {
  const line = await refusalLine('refused', { role: 'CLIENT_VIEWER', clientSlug: 'acme' }, ['slug', 'x\n[access] fake\u2028y\u2029'])
  expect(line).not.toMatch(/[\n\u2028\u2029]/)
  expect(line).toContain('slug="x\\n[access] fake\\u2028y\\u2029"')
  const long = await refusalLine('refused', undefined, ['path', 'a'.repeat(500)])
  expect(long.match(/path="(a*)"/)![1]).toHaveLength(120)
})
