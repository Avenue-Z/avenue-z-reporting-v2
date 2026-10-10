import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ getReport: vi.fn() }))
vi.mock('@/lib/aeo-outbound/store', async (o) => ({ ...(await o<object>()), getReport: m.getReport }))

import { GET } from './route'
import { auth } from '@/auth'
import type { SnapshotData } from '@/lib/aeo-outbound/metrics'
import { SHARE_BUTTON, renderSnapshotHtml } from '@/lib/aeo-outbound/render'
import { AIVX_SHARE_BLOCK } from '@/lib/aeo-outbound/aivx/share'
import type { Slots } from '@/lib/aeo-outbound/slots'

const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const BRANDS = [
  { id: 'a', name: 'Alpha', isOwn: false, visibilityPct: 26.1, sovPct: 22.5, position: 2.4, rank: 1 },
  { id: 'o', name: 'Example Co', isOwn: true, visibilityPct: 15.1, sovPct: 15.9, position: 3.1, rank: 2 },
]
const DATA = {
  projectId: 'or_a', projectName: 'p', brand: 'Example Co', generatedAt: '2026-10-08T15:00:00Z',
  window: { start: '2026-10-01', end: '2026-10-08' }, windowLabel: 'Oct 1, 2026 to Oct 8, 2026',
  category: 'Fintech', market: 'United States', brands: BRANDS, own: BRANDS[1],
  kpis: [{ label: 'AI visibility', value: '15.1%' }, { label: 'AI share of voice', value: '15.9%' }, { label: 'Average answer position', value: '#3.1' }, { label: 'Competitive rank', value: '#2 of 2 brands' }],
  competitorsTracked: 1, rankN: 2, leaderGaps: [], ownDomains: ['example.com'], ownRetrievedChats: 10, ownRetrievedPct: 22.4,
  sourceMix: [{ label: 'Corporate', weight: 5, pct: 50 }, { label: 'You', weight: 5, pct: 50 }], gapDomains: [], actions: [],
  promptCount: 100, models: ['ChatGPT UI'], notes: [],
} as SnapshotData
const SLOTS: Slots = {
  category: 'Fintech', market: 'United States', headline: 'Headline.', summary: 'Summary.',
  context: 'Context.', competitive_bullets: [{ lead: 'Lead:', text: 'Text.' }, { lead: 'L2:', text: 'T2.' }],
  sources_bullets: [{ lead: 'Gap:', text: 'G.' }, { lead: 'G2:', text: 'G2.' }], why: 'Why.',
  opportunities: [0, 1, 2].map((i) => ({ signal: `s${i}`, opportunity: `o${i}`, workstream: 'Content / AEO' })),
  methodology: 'Method.', next_step: 'Next.',
}
const row = (over: Record<string, unknown> = {}) => ({ id: ID, status: 'draft', data: DATA, slots: SLOTS, html: null, approvedAt: null, revision: 0, ...over })
const get = (id = ID, qs = '') => GET(new NextRequest(`https://app.example/api/aeo-outbound/reports/${id}/view${qs}`), { params: Promise.resolve({ id }) })
const as = (email: string) => vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ANALYST', email, clientSlug: null } } as never)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('AEO_OUTBOUND_USERS', 'ryan@avenuez.com')
  as('ryan@avenuez.com')
  m.getReport.mockResolvedValue(row())
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks() })

test('403 for no session and for non-allowlisted staff, before any read', async () => {
  vi.mocked(auth).mockResolvedValue(null as never)
  expect((await get()).status).toBe(403)
  as('other@avenuez.com')
  expect((await get()).status).toBe(403)
  expect(m.getReport).not.toHaveBeenCalled()
})

test('404 for a malformed, unknown or discarded id', async () => {
  expect((await get('nope')).status).toBe(404)
  expect(m.getReport).not.toHaveBeenCalled()
  m.getReport.mockResolvedValue(undefined)
  expect((await get()).status).toBe(404)
})

test('503 with no-store and one safe log line when the read rejects', async () => {
  m.getReport.mockRejectedValue(Object.assign(new Error('params ryan@avenuez.com'), { code: '57P01' }))
  const res = await get()
  expect(res.status).toBe(503)
  expect(await res.text()).toBe('Unavailable')
  expect(res.headers.get('Cache-Control')).toBe('no-store')
  const lines = vi.mocked(console.error).mock.calls.map((c) => c.join(' '))
  expect(lines).toEqual([`[aeo-outbound] view read failed id=${ID} reason=57P01`])
  expect(lines[0]).not.toContain('@')
})

test('404 for generating and failed rows', async () => {
  for (const status of ['generating', 'failed']) {
    m.getReport.mockResolvedValue(row({ status, data: null, slots: null }))
    expect((await get()).status).toBe(404)
  }
})

test('draft: editing hooks and the three headers', async () => {
  const res = await get()
  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
  expect(res.headers.get('Cache-Control')).toBe('no-store')
  expect(res.headers.get('Content-Security-Policy')).toBe('sandbox allow-scripts')
  const h = await res.text()
  expect(h).toContain('data-slot')
})

test('draft with mode=preview: no data-slot and no share button', async () => {
  const h = await (await get(ID, '?mode=preview')).text()
  expect(h).not.toContain('data-slot')
  expect(h).not.toContain('class="share-btn"')
})

test('a hostile slot value is escaped in the served draft', async () => {
  m.getReport.mockResolvedValue(row({ slots: { ...SLOTS, headline: '<script>alert(1)</script>' } }))
  const h = await (await get()).text()
  expect(h).not.toContain('<script>alert(1)</script>')
  expect(h).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
})

test('approved: row.html byte for byte, with the headers', async () => {
  const html = '<!DOCTYPE html><p>frozen <b>page</b> class="share-btn"</p>'
  m.getReport.mockResolvedValue(row({ status: 'approved', html, approvedAt: new Date('2026-10-09T14:00:00Z') }))
  const res = await get()
  expect(await res.text()).toBe(html)
  expect(res.headers.get('Content-Security-Policy')).toBe('sandbox allow-scripts')
  expect(res.headers.get('Cache-Control')).toBe('no-store')
})

// A real final render of synthetic data: what approve stores in row.html.
const FROZEN = renderSnapshotHtml(DATA, SLOTS, 'final', 'Oct 9, 2026')
const approved = (html: string) => row({ status: 'approved', html, approvedAt: new Date('2026-10-09T14:00:00Z') })

test('approved with mode=preview: the frozen HTML with exactly the share button and share block removed', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(FROZEN.split(SHARE_BUTTON)).toHaveLength(2)
  expect(FROZEN.split(AIVX_SHARE_BLOCK)).toHaveLength(2)
  m.getReport.mockResolvedValue(approved(FROZEN))
  const res = await get(ID, '?mode=preview')
  expect(res.headers.get('Content-Security-Policy')).toBe('sandbox allow-scripts')
  const h = await res.text()
  expect(h).toBe(FROZEN.replace(SHARE_BUTTON, '').replace(AIVX_SHARE_BLOCK, ''))
  expect(h).not.toContain('class="share-btn"')
  expect(h).not.toContain('share-toast" role')
  expect(h).not.toContain('data-slot')
  expect(console.error).not.toHaveBeenCalled()
  expect(warn).not.toHaveBeenCalled()
})

test('approved with mode=preview: a later render change cannot alter what the editor shows', async () => {
  // The frozen page has text no current render would produce; the preview keeps it.
  const frozen = FROZEN.replace('Headline.', 'Headline frozen at approval.')
  m.getReport.mockResolvedValue(approved(frozen))
  const h = await (await get(ID, '?mode=preview')).text()
  expect(h).toContain('Headline frozen at approval.')
  expect(h).toBe(frozen.replace(SHARE_BUTTON, '').replace(AIVX_SHARE_BLOCK, ''))
})

test.each([
  ['no anchors', '<!DOCTYPE html><html><head><title>x</title></head><body><p>frozen</p></body></html>'],
  ['a duplicated share button', FROZEN.replace(SHARE_BUTTON, SHARE_BUTTON + SHARE_BUTTON)],
])('approved with mode=preview and %s: the CSS fallback hides the share UI, with one log line', async (_n, html) => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  m.getReport.mockResolvedValue(approved(html))
  const h = await (await get(ID, '?mode=preview')).text()
  const style = '<style>.share-btn,.share-toast{display:none!important}</style>'
  expect(h).toBe(html.replace('</head>', `${style}</head>`))
  expect(warn.mock.calls.map((c) => c.join(' '))).toEqual([`[aeo-outbound] view share strip fallback id=${ID}`])
})

test('approved without mode=preview: a real frozen page is returned byte for byte', async () => {
  m.getReport.mockResolvedValue(approved(FROZEN))
  expect(await (await get()).text()).toBe(FROZEN)
})
