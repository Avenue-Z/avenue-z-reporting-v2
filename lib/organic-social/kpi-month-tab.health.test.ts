// Paul, #445 review (#447): a renamed month tab answers 400, which the section treats as "missing". It must not reach the
// health beacon as a failed fetch, because deriveStatus turns any failed source into a page-wide `down`
// (lib/health/derive.ts:31-32). This runs the real cached() (lib/cache.ts) and the real collector, as
// lib/cache.negative.test.ts does.
import { beforeEach, expect, test, vi } from 'vitest'
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn }))
const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn(async () => 'tok') }))
vi.mock('google-auth-library', () => ({ GoogleAuth: vi.fn(function () { return { getAccessToken } }) }))

import { readMonthTab } from './ytd-sheet'
import { getCollected, runWithCollector } from '@/lib/health/collector'

const ID = 'TESTSHEETID_abcdefghij0123'
beforeEach(() => {
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY = Buffer.from(JSON.stringify({ client_email: 'x@y.z', private_key: 'k' })).toString('base64')
  vi.unstubAllGlobals()
})

test('a 400 on a month tab is recorded as a healthy fetch, never as an outage', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Unable to parse range', { status: 400 })))
  const seen = await runWithCollector(async () => ({ result: await readMonthTab(ID, 'Renamed 2026'), health: getCollected() }))
  expect(seen.result).toBe('gone')
  expect(seen.health).toEqual([{ vendor: 'google-sheets', fn: 'kpiMonthTab', ok: true }])
})

test('a real failure on a month tab (403) still counts against the page', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 403 })))
  const seen = await runWithCollector(async () => ({ result: await readMonthTab(ID, 'Forbidden 2026').catch((e) => e), health: getCollected() }))
  expect(seen.result.status).toBe('403')
  expect(seen.health).toEqual([expect.objectContaining({ vendor: 'google-sheets', fn: 'kpiMonthTab', ok: false })])
})
