// KPI starting point (spec docs/superpowers/specs/2026-11-19-kpi-starting-point-design.md, item 3): the start figures are a
// garnish beside the rings, so a failed start read must never put the page in the health beacon's failed set, which
// deriveStatus turns into a page-wide `down` and a Slack page (lib/cache.ts:162, :191). Runs the real cached() and the
// real collector, as kpi-month-tab.health.test.ts does.
import { beforeEach, expect, test, vi } from 'vitest'
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn }))
const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn(async () => 'tok') }))
vi.mock('google-auth-library', () => ({ GoogleAuth: vi.fn(function () { return { getAccessToken } }) }))

import { readKpiStartTab } from './ytd-sheet'
import { getCollected, runWithCollector } from '@/lib/health/collector'

const ID = 'TESTSHEETID_abcdefghij0123'
beforeEach(() => {
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY = Buffer.from(JSON.stringify({ client_email: 'x@y.z', private_key: 'k' })).toString('base64')
  vi.unstubAllGlobals()
})

test('a failed start read (403) is thrown to the part but never recorded against the page', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 403 })))
  const seen = await runWithCollector(async () => ({ result: await readKpiStartTab(ID, 'Start Forbidden').catch((e) => e), health: getCollected() }))
  expect(seen.result.status).toBe('403')
  expect(seen.health).toEqual([])
})

test('a renamed start tab (400) is "gone", not a failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Unable to parse range', { status: 400 })))
  const seen = await runWithCollector(async () => ({ result: await readKpiStartTab(ID, 'Start Renamed'), health: getCollected() }))
  expect(seen.result).toBe('gone')
  // Paul, #469 review: a 400 must never be recorded as a failed fetch either.
  expect(seen.health.filter((h) => !h.ok)).toEqual([])
})
