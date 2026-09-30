// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { logId } from './log-id'

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
