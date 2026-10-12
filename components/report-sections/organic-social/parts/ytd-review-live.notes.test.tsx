import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'

const { getOutlineKpis, getClientBySlug, readYtdTab, getChartNotes } = vi.hoisted(() => ({
  getOutlineKpis: vi.fn(), getClientBySlug: vi.fn(), readYtdTab: vi.fn(), getChartNotes: vi.fn(async (): Promise<unknown[]> => []),
}))
vi.mock('@/lib/organic-social/outline-headlines', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/outline-headlines')>('@/lib/organic-social/outline-headlines')),
  getOutlineKpis,
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/ytd-sheet', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/ytd-sheet')>('@/lib/organic-social/ytd-sheet')),
  readYtdTab,
}))
vi.mock('@/lib/organic-social/chart-notes/select', () => ({ getChartNotes }))

import { YtdLiveReviewSection } from './ytd-review-live'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

// Notes on Renaissance's YTD graphs (version 3; spec 2026-10-06-os-ytd-notes-design.md). Made-up sheet id, numbers and
// note text. Every assertion is about September, a finished month at this clock whichever rule picks the months
// (finished months only, or through the month in progress), so this file passes in either merge order with the PR that
// changes version 3's months.
const ID = 'TESTSHEETID_abcdefghij0123'
const CTX = { ...FIXTURE_ORGANIC_SOCIAL_CTX, clientSlug: 'live-co', channel: 'INSTAGRAM' as const }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const sheet = () => [
  ['CLIENT: Live Co'], ['FOLLOWER GROWTH'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, i < 9 ? String(100 + i) : '']),
  [], ['VIEWS'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, i < 9 ? String(10 + i) : '']),
]
const kpis = () => ({ noData: false, kpis: { followers: { key: 'followers', label: 'Total Followers', format: 'number', value: 5 }, exposure: { key: 'exposure', label: 'Views', format: 'number', value: 6 } } }) as never
const live = (dsc: Record<string, unknown>) => ({ id: 'c1', dashSocialConfig: { brandId: 1, ytdSheets: { 2026: { sheetId: ID, tab: 'Live Co' } }, ...dsc } })
const note = { id: 'n9', clientId: 'c1', channel: 'INSTAGRAM', chart: 'ytd-followers', day: '2026-09-01', body: 'September note', postIds: [],
  status: 'approved', createdBy: 'a@avenuez.com', updatedBy: 'a@avenuez.com', approvedBy: 'b@avenuez.com',
  createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z'), approvedAt: new Date('2026-09-01T00:00:00Z'),
  deletedAt: null, deletedBy: null }

type Found = { name: string; props: Record<string, unknown> }
function find(node: unknown, names: string[], found: Found[] = []): Found[] {
  const el = node as ReactElement<Record<string, unknown>> | null
  if (!el || typeof el !== 'object') return found
  const type = (el as { type?: { name?: string } }).type
  if (typeof type === 'function' && type.name && names.includes(type.name)) found.push({ name: type.name, props: el.props })
  const kids = (el.props as { children?: unknown } | undefined)?.children
  for (const k of Array.isArray(kids) ? kids : [kids]) find(k, names, found)
  return found
}

beforeEach(() => {
  vi.restoreAllMocks()
  getOutlineKpis.mockReset(); getClientBySlug.mockReset(); readYtdTab.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
  readYtdTab.mockResolvedValue(sheet())
  getOutlineKpis.mockResolvedValue(kpis())
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

test('with notes on (chartNotes), version 3 hands the followers line its approved September note and a dot', async () => {
  getClientBySlug.mockResolvedValue(live({ chartNotes: true }))
  getChartNotes.mockResolvedValueOnce([note])
  const lines = find(await YtdLiveReviewSection({ ctx: CTX }), ['LineChart'])
  expect(getChartNotes).toHaveBeenCalledWith('c1', 'INSTAGRAM')
  expect(lines[0].props.notes).toEqual({ Sep: 'September note' })
  expect(lines[0].props.marks).toEqual([{ x: 'Sep' }])
  expect(lines[1].props).not.toHaveProperty('notes')
})

test('an editor gets each graph\'s controls, with September among the months', async () => {
  getClientBySlug.mockResolvedValue(live({ chartNotes: true }))
  const ps = find(await YtdLiveReviewSection({ ctx: { ...CTX, role: 'INTERNAL_ANALYST', email: 'writer@avenuez.com' } }), ['YtdNotesPanel'])
  expect(ps).toHaveLength(2)
  for (const p of ps) {
    const controls = (p.props.notes as { controls: { months: { key: string; label: string }[] } }).controls
    expect(controls.months).toContainEqual({ key: '2026-09', label: 'Sep' })
  }
})

test('with notes off, version 3 reads nothing and its graphs are exactly as before', async () => {
  getClientBySlug.mockResolvedValue(live({}))
  const el = await YtdLiveReviewSection({ ctx: CTX })
  expect(getChartNotes).not.toHaveBeenCalled()
  for (const l of find(el, ['LineChart'])) { expect(l.props).not.toHaveProperty('notes'); expect(l.props).not.toHaveProperty('marks') }
  expect(find(el, ['YtdNotesPanel'])).toEqual([])
})
