import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ChartNote } from '@/lib/db/schema'

const { getChartNotes } = vi.hoisted(() => ({ getChartNotes: vi.fn() }))
vi.mock('@/lib/organic-social/chart-notes/select', () => ({ getChartNotes }))

import { readYtdNotes, ytdMonthLabel } from './ytd-notes'
import { ytdSheetSeries, type YtdGraph, type YtdMonth } from '@/lib/organic-social/ytd'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

// Every slug, email, id, date and text is invented. Spec 2026-10-06-os-ytd-notes-design.md.
const t = (iso: string) => new Date(iso)
const row = (over: Partial<ChartNote>): ChartNote => ({
  id: 'n1', clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'ytd-followers', day: '2026-08-01',
  body: 'Event', postIds: [], status: 'approved', createdBy: 'a@avenuez.com', updatedBy: 'a@avenuez.com',
  approvedBy: 'b@avenuez.com', createdAt: t('2026-09-01T00:00:00Z'), updatedAt: t('2026-09-01T00:00:00Z'),
  approvedAt: t('2026-09-01T00:00:00Z'), deletedAt: null, deletedBy: null, ...over,
})
const month = (key: string, partial = false): YtdMonth => ({ key, dateRange: `custom:${key}-01,${key}-28`, compareRange: null, partial })
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((m) => month(`2026-${m}`))
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const graph = (keys: string[]): YtdGraph => ({ points: keys.map((k) => ({ key: k, label: SHORT[+k.slice(5, 7) - 1], value: 1 })), gaps: [] })
// Followers have a point every month; views start in February, so a January views note has no point.
const GRAPHS = { followers: graph(MONTHS.map((m) => m.key)), views: graph(MONTHS.slice(1).map((m) => m.key)) }
const NOTES_ON = { id: 'client-uuid', dashSocialConfig: { brandId: 1, chartNotes: true } }
const CTX = { ...FIXTURE_ORGANIC_SOCIAL_CTX, clientSlug: 'a-client', channel: 'INSTAGRAM' as const }
const CLIENT = { ...CTX, role: 'CLIENT_VIEWER' }
const EDITOR = { ...CTX, role: 'INTERNAL_ANALYST', email: 'writer@avenuez.com' }
const ROWS = [
  row({ id: 'a', day: '2026-08-01', body: 'Approved August' }),
  row({ id: 'd', day: '2026-07-01', body: 'Draft July', status: 'draft', approvedAt: null, approvedBy: null }),
  row({ id: 'v', chart: 'ytd-views', day: '2026-01-01', body: 'Approved January views' }),
  row({ id: 'old', day: '2025-12-01', body: 'Last year' }),
  row({ id: 'later', day: '2026-10-01', body: 'After the block' }),
  row({ id: 'daily', chart: 'followers', day: '2026-08-01', body: 'A daily note' }),
]
const logs = () => vi.mocked(console.error).mock.calls.map((c) => c.join(' '))

beforeEach(() => {
  vi.restoreAllMocks()
  getChartNotes.mockReset()
  getChartNotes.mockResolvedValue(ROWS)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  delete process.env.CHART_NOTES_APPROVERS
})
afterEach(() => { delete process.env.CHART_NOTES_APPROVERS })

test('a client gets approved notes only: on a point, the hover text and a dot; off a point, a panel line', async () => {
  const r = (await readYtdNotes(NOTES_ON, CLIENT, MONTHS, GRAPHS))!
  expect(getChartNotes).toHaveBeenCalledWith('client-uuid', 'INSTAGRAM')
  expect(r.followers).toEqual({ notes: { Aug: 'Approved August' }, marks: [{ x: 'Aug' }], panel: [] })
  expect(r.views).toEqual({ panel: [{ key: '2026-01', label: 'Jan', text: 'Approved January views' }] })
})

test('notes outside the block, and daily notes, are never shown on a YTD graph', async () => {
  const r = (await readYtdNotes(NOTES_ON, EDITOR, MONTHS, GRAPHS))!
  const texts = JSON.stringify(r)
  for (const t of ['Last year', 'After the block', 'A daily note']) expect(texts).not.toContain(t)
})

test('an editor also gets drafts and ids in the panel, and the controls with every month of the block', async () => {
  const r = (await readYtdNotes(NOTES_ON, EDITOR, MONTHS, GRAPHS))!
  expect(r.followers.notes).toEqual({ Aug: 'Approved August' })
  expect(r.followers.marks).toEqual([{ x: 'Aug' }])
  expect(r.followers.panel).toEqual([
    { key: '2026-07', label: 'Jul', text: null, editor: { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Draft July', postIds: [] } } },
    { key: '2026-08', label: 'Aug', text: 'Approved August', editor: { approvedId: 'a', approvedPostIds: [], draft: null } },
  ])
  expect(r.followers.controls).toEqual({
    clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'ytd-followers', canApprove: false,
    months: MONTHS.map((m) => ({ key: m.key, label: SHORT[+m.key.slice(5, 7) - 1] })),
  })
  expect(r.views.controls?.chart).toBe('ytd-views')
  process.env.CHART_NOTES_APPROVERS = 'writer@avenuez.com'
  expect((await readYtdNotes(NOTES_ON, EDITOR, MONTHS, GRAPHS))!.followers.controls?.canApprove).toBe(true)
})

test('a client never receives editor fields or controls', async () => {
  const r = (await readYtdNotes(NOTES_ON, CLIENT, MONTHS, GRAPHS))!
  for (const g of [r.followers, r.views]) {
    expect(g.controls).toBeUndefined()
    for (const p of g.panel) expect(p).not.toHaveProperty('editor')
  }
  expect(JSON.stringify(r)).not.toContain('Draft July')
})

test('a team role without an @avenuez.com email is treated as a viewer: no controls, no drafts', async () => {
  const r = (await readYtdNotes(NOTES_ON, { ...CTX, role: 'INTERNAL_ANALYST', email: 'someone@example.com' }, MONTHS, GRAPHS))!
  expect(r.followers.controls).toBeUndefined()
  expect(JSON.stringify(r)).not.toContain('Draft July')
})

test('the month in progress ("(live)") is matched by its key, so its note shows under that label', async () => {
  const months = [...MONTHS, month('2026-10', true)]
  getChartNotes.mockResolvedValue([row({ id: 'live', day: '2026-10-01', body: 'October so far' })])
  const graphs = { followers: { points: [...GRAPHS.followers.points, { key: '2026-10', label: 'Oct (live)', value: 2 }], gaps: [] }, views: GRAPHS.views }
  const r = (await readYtdNotes(NOTES_ON, CLIENT, months, graphs))!
  expect(r.followers.notes).toEqual({ 'Oct (live)': 'October so far' })
  expect(r.followers.marks).toEqual([{ x: 'Oct (live)' }])
})

test('a one-point year (drawn as a bar) lists its approved note in the panel, with no hover text or dot', async () => {
  getChartNotes.mockResolvedValue([row({ id: 'jan', day: '2027-01-01', body: 'January' })])
  const r = (await readYtdNotes(NOTES_ON, CLIENT, [month('2027-01')], { followers: graph(['2027-01']), views: graph(['2027-01']) }))!
  expect(r.followers).toEqual({ panel: [{ key: '2027-01', label: 'Jan', text: 'January' }] })
})

test('a graph with no points still lists approved notes for a client', async () => {
  getChartNotes.mockResolvedValue([row({ id: 'x', day: '2026-03-01', body: 'March' })])
  const r = (await readYtdNotes(NOTES_ON, CLIENT, MONTHS, { followers: graph([]), views: graph([]) }))!
  expect(r.followers).toEqual({ panel: [{ key: '2026-03', label: 'Mar', text: 'March' }] })
})

test('with notes off for the client, nothing is read and nothing is returned', async () => {
  expect(await readYtdNotes({ id: 'client-uuid', dashSocialConfig: { brandId: 1 } }, EDITOR, MONTHS, GRAPHS)).toBeUndefined()
  expect(getChartNotes).not.toHaveBeenCalled()
})

test('Overview (no channel) and an empty month list read nothing', async () => {
  expect(await readYtdNotes(NOTES_ON, { ...EDITOR, channel: null }, MONTHS, GRAPHS)).toBeUndefined()
  expect(await readYtdNotes(NOTES_ON, EDITOR, [], GRAPHS)).toBeUndefined()
  expect(getChartNotes).not.toHaveBeenCalled()
})

test('a failed read shows no notes and logs one line with the slug and platform, never the error or a note', async () => {
  getChartNotes.mockRejectedValue(new Error('connection refused: secret-host'))
  expect(await readYtdNotes(NOTES_ON, EDITOR, MONTHS, GRAPHS)).toBeUndefined()
  expect(logs()).toEqual(['[organic-social] ytd notes unreadable slug=a-client channel=INSTAGRAM; showing none'])
})

test('the month labels match the labels the YTD graphs draw (ytdSheetSeries), including "(live)"', () => {
  const months = [month('2026-01'), month('2026-09'), month('2026-10', true)]
  const col = Array.from({ length: 12 }, () => ({ kind: 'number' as const, value: 1 }))
  const tab = { followers: { INSTAGRAM: col }, views: { INSTAGRAM: col } }
  const s = ytdSheetSeries(months, tab, 'INSTAGRAM', '2026-01', {})
  expect(months.map(ytdMonthLabel)).toEqual(s.followers.points.map((p) => p.label))
})
