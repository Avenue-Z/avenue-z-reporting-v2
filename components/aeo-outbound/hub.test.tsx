import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { OutboundHub, opensSummary, type HubRow, type OutboundHubProps } from './hub'

const { refresh, push, actions } = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  actions: { approveSnapshotAction: vi.fn(), revokeSnapshotAction: vi.fn(), discardSnapshotAction: vi.fn(), copySnapshotAsDraftAction: vi.fn() },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
vi.mock('@/app/actions/aeo-outbound', () => actions)

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const PROJECTS = [{ id: 'p1', name: 'Acme pitch', status: 'PITCH' }, { id: 'p2', name: 'Globex pitch', status: 'PITCH_ENDED' }]
const COUNTS = { all: 0, draft: 0, live: 0, revoked: 0, failed: 0 }
const row = (over: Partial<HubRow>): HubRow => ({
  id: ID(1), brand: 'Acme', linkBrand: null, projectId: 'p1', projectName: 'Acme pitch', status: 'draft',
  createdAt: '2026-10-01T15:00:00.000Z', createdBy: 'ryan@avenuez.com', approvedAt: null, error: null, errorCode: null, progressStep: 0,
  token: null, recipient: null, openCount: 0, opensPerson: 0, opensAutomated: 0, firstOpenedAt: null, lastOpenedAt: null,
  requestedStart: null, requestedEnd: null, ...over,
})
const props = (over: Partial<OutboundHubProps> = {}): OutboundHubProps => ({ rows: [], counts: COUNTS, cursor: null, q: '', projectStats: {}, isAdmin: false, shareOrigin: null, ...over })
const hub = (over: Partial<OutboundHubProps> = {}) => render(<OutboundHub {...props(over)} />)

let generate: () => Promise<Response>
let projects: () => Promise<Response>
let older: (url: string) => Promise<Response>
let progress: (url: string) => Promise<Response>
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  if (url === '/api/aeo-outbound/projects') return projects()
  if (url === '/api/aeo-outbound/generate') return generate()
  if (url.startsWith('/api/aeo-outbound/reports?')) return older(url)
  if (url.startsWith('/api/aeo-outbound/progress?')) return progress(url)
  throw new Error(`unexpected fetch ${url}`)
})
const bodies = () => fetchMock.mock.calls.filter(([u]) => u === '/api/aeo-outbound/generate').map(([, init]) => JSON.parse(String(init?.body)))

beforeEach(() => {
  refresh.mockReset(); push.mockReset(); fetchMock.mockClear()
  Object.values(actions).forEach((a) => a.mockReset())
  projects = async () => json(200, PROJECTS)
  generate = async () => json(200, { id: ID(9), status: 'draft' })
  older = async () => json(200, { rows: [], cursor: null })
  progress = async () => json(200, { step: null })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const box = () => screen.getByRole('combobox', { name: 'Peec project' })
const loaded = () => waitFor(() => expect(box()).toBeEnabled())
async function pick(name = 'Acme pitch') {
  await loaded()
  fireEvent.focus(box())
  fireEvent.click(screen.getByRole('option', { name: new RegExp(`^${name}`) }))
}
async function pickAndGenerate(rows: HubRow[] = []) {
  const r = hub({ rows, counts: { ...COUNTS, all: rows.length } })
  await pick()
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  return r
}
const rowEl = (id: string) => within(screen.getByTestId(`row-${id}`))

test('the header has the title and subtitle, refreshes on mount, and admins get a Settings link', async () => {
  hub()
  expect(screen.getByRole('heading', { name: 'AEO Outbound Snapshot' })).toBeInTheDocument()
  expect(screen.getByText('One-page AI visibility snapshots for prospects. Generate, edit, approve, send and track.')).toBeInTheDocument()
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  await loaded()
  cleanup()
  hub({ isAdmin: true })
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/tools/new-business/settings')
  await loaded()
})

test('refreshes every 5s only while a row is generating', async () => {
  vi.useFakeTimers()
  const { unmount } = hub({ rows: [row({ status: 'generating' })] })
  expect(refresh).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(refresh).toHaveBeenCalledTimes(2)
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(refresh).toHaveBeenCalledTimes(3)
  unmount()
  refresh.mockReset()
  hub({ rows: [row({ status: 'draft' })] })
  await act(() => vi.advanceTimersByTimeAsync(15000))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('the empty-date helper names the full history, and the dates are limited to the last 400 days', async () => {
  hub()
  expect(screen.getByText("Left empty, the report covers the project's full history, up to 400 days back.")).toBeInTheDocument()
  const today = new Date().toISOString().slice(0, 10)
  const earliest = new Date(Date.parse(`${today}T00:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10)
  for (const label of ['Start date', 'End date']) {
    expect(screen.getByLabelText(label)).toHaveAttribute('max', today)
    expect(screen.getByLabelText(label)).toHaveAttribute('min', earliest)
  }
  await loaded()
})

test('the project picker is a searchable combobox showing each status and snapshot history', async () => {
  let release: (r: Response) => void = () => {}
  projects = () => new Promise((r) => { release = r })
  hub({ projectStats: { p1: { count: 3, last: '2026-10-05T15:00:00.000Z' } } })
  expect(box()).toBeDisabled()
  expect(box()).toHaveAttribute('placeholder', 'Loading Peec projects…')
  await act(async () => release(json(200, PROJECTS)))
  await loaded()
  fireEvent.focus(box())
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Acme pitchPitch · 3 snapshots, last Oct 5, 2026', 'Globex pitchPitch ended · No snapshots yet'])
  fireEvent.change(box(), { target: { value: 'glo' } })
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Globex pitchPitch ended · No snapshots yet'])
  fireEvent.keyDown(box(), { key: 'Enter' })
  expect(box()).toHaveValue('Globex pitch')
})

test('Generate shows a local progress row with the keep-open advice, and 200 draft opens the new draft', async () => {
  let release: (r: Response) => void = () => {}
  generate = () => new Promise((r) => { release = r })
  await pickAndGenerate()
  const box = await screen.findByRole('status', { name: 'Generation progress' })
  expect(within(box).getByText('Starting…')).toBeInTheDocument()
  expect(within(box).getByText(/^0:0\d$/)).toBeInTheDocument()
  expect(within(box).getByText('Keep this tab open until it finishes.')).toBeInTheDocument()
  expect(within(box).getByText('Usually 35 to 45 seconds')).toBeInTheDocument()
  expect(bodies()).toEqual([{ projectId: 'p1' }])
  await act(async () => release(json(200, { id: ID(9), status: 'draft' })))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(9)}`))
})

test('200 failed shows the reason in plain words when it has a code, else the stored text, and refreshes', async () => {
  generate = async () => json(200, { id: ID(9), status: 'failed', error: 'No day between 2026-09-01 and 2026-09-30 has any Peec data for this project', code: 'no_data' })
  await pickAndGenerate()
  expect(await screen.findByText('Peec has no data for this project in that period. Pick other dates.')).toBeInTheDocument()
  expect(refresh).toHaveBeenCalledTimes(2)
  cleanup()
  generate = async () => json(200, { id: ID(9), status: 'failed', error: 'Copy generation failed. Rerun.' })
  await pickAndGenerate()
  expect(await screen.findByText('Copy generation failed. Rerun.')).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
})

test.each([
  [400, { error: "This Peec project can't be used.", code: 'bad-project' }, "This Peec project can't be used."],
  [400, { error: 'bad-request', code: 'bad-request' }, "That request wasn't valid. Refresh the page and try again."],
  [403, { error: 'forbidden' }, 'This tool is limited to the New Business team.'],
  [404, { error: "That snapshot can't be rerun. Refresh the list.", code: 'bad-rerun' }, "That snapshot can't be rerun. Refresh the list."],
  [500, { error: 'Could not start generation. Try again.' }, 'Could not start generation. Try again.'],
  [502, { error: "Peec isn't configured on this server. Tell engineering." }, "Peec isn't configured on this server. Tell engineering."],
])('a %i answer shows its message', async (status, body, text) => {
  generate = async () => json(status, body)
  await pickAndGenerate()
  expect(await screen.findByText(text)).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
  expect(screen.queryByText(/^Starting…/)).not.toBeInTheDocument()
  expect(refresh).toHaveBeenCalledTimes(2)
})

test('a 400 bad-range shows inline by the dates, and clears when a date changes', async () => {
  generate = async () => json(400, { error: 'Pick at most 90 days.', code: 'bad-range' })
  await pickAndGenerate()
  const msg = await screen.findByText('Pick at most 90 days.')
  expect(msg.closest('[data-range]')).not.toBeNull()
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } })
  expect(screen.queryByText('Pick at most 90 days.')).not.toBeInTheDocument()
})

test('a 409 opens the snapshot already generating, or refreshes when its id is unknown', async () => {
  generate = async () => json(409, { error: 'already-generating', id: ID(7) })
  await pickAndGenerate()
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(7)}`))
  cleanup(); push.mockReset(); refresh.mockReset()
  generate = async () => json(409, { error: 'already-generating', id: null })
  await pickAndGenerate()
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
  expect(push).not.toHaveBeenCalled()
})

test('a network error or a 5xx with no JSON is a lost connection that refreshes', async () => {
  generate = async () => { throw new TypeError('Failed to fetch') }
  await pickAndGenerate()
  expect(await screen.findByText('Lost connection. Refreshing')).toBeInTheDocument()
  cleanup()
  generate = async () => new Response('<html>gateway</html>', { status: 504 })
  await pickAndGenerate()
  expect(await screen.findByText('Lost connection. Refreshing')).toBeInTheDocument()
})

test('each filled date is sent, so a lone date reaches the route and its 400 shows inline; no dates sends only the project', async () => {
  generate = async () => json(400, { error: 'Pick both a start and an end date, or neither.', code: 'bad-range' })
  hub()
  await pick()
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect((await screen.findByText('Pick both a start and an end date, or neither.')).closest('[data-range]')).not.toBeNull()
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-09-30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(bodies()).toHaveLength(2))
  generate = async () => json(200, { id: ID(9), status: 'draft' })
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(push).toHaveBeenCalledTimes(1))
  expect(bodies()).toEqual([{ projectId: 'p1', start: '2026-09-01' }, { projectId: 'p1', end: '2026-09-30' }, { projectId: 'p1', start: '2026-09-01', end: '2026-09-30' }])
  cleanup(); fetchMock.mockClear()
  await pickAndGenerate()
  await waitFor(() => expect(bodies()).toEqual([{ projectId: 'p1' }]))
})

test('a failed projects load shows "Peec is unavailable. Retry" and the table still renders', async () => {
  projects = async () => json(502, { error: 'Peec is unavailable. Try again.' })
  hub({ rows: [row({ brand: 'Initech' })], counts: { ...COUNTS, all: 1, draft: 1 } })
  const retry = await screen.findByRole('button', { name: 'Peec is unavailable. Retry' })
  expect(screen.getByText('Initech')).toBeInTheDocument()
  projects = async () => json(200, PROJECTS)
  fireEvent.click(retry)
  await loaded()
  expect(screen.queryByRole('button', { name: 'Peec is unavailable. Retry' })).not.toBeInTheDocument()
})

test('Rerun posts only the project and the row id, and opens the new draft', async () => {
  hub({ rows: [row({ status: 'live', token: 'tok', approvedAt: '2026-10-02T15:00:00.000Z', recipient: 'Jane Doe, Acme' })], counts: { ...COUNTS, all: 1, live: 1 } })
  await loaded()
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(9)}`))
  expect(bodies()).toEqual([{ projectId: 'p1', rerunOf: ID(1) }])
})

test('each status shows exactly its actions; a failed row gets Open and shows its reason as visible text', async () => {
  hub({ rows: [
    row({ id: ID(1), status: 'draft' }),
    row({ id: ID(2), status: 'live', token: 't', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' }),
    row({ id: ID(3), status: 'revoked', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' }),
    row({ id: ID(4), status: 'failed', error: 'Peec project needs exactly one own brand (found 2)', errorCode: 'own_brand_count' }),
    row({ id: ID(5), status: 'generating' }),
  ], counts: { ...COUNTS, all: 5 } })
  const labels = (id: string) => Array.from(rowEl(id).getAllByRole('cell').at(-1)!.querySelectorAll('a,button')).map((e) => e.textContent)
  await loaded()
  expect(labels(ID(1))).toEqual(['Open', 'Rerun', 'Discard'])
  expect(labels(ID(2))).toEqual(['Open', 'Copy link', 'Revoke', 'Edit a copy', 'Rerun'])
  expect(labels(ID(3))).toEqual(['Open', 'Edit a copy', 'Rerun'])
  expect(labels(ID(4))).toEqual(['Open', 'Rerun', 'Discard'])
  expect(labels(ID(5))).toEqual([])
  expect(rowEl(ID(4)).getByRole('link', { name: 'Open' })).toHaveAttribute('href', `/tools/new-business/${ID(4)}`)
  expect(rowEl(ID(4)).getByText("In Peec, mark exactly one brand as the client's own brand, then Rerun.")).toBeInTheDocument()
})

test('the columns: created with who, sent as date and time, sent to, the requested range, and opens split by likely people and automated', async () => {
  hub({ rows: [
    row({ id: ID(1), status: 'draft', requestedStart: '2026-09-01', requestedEnd: '2026-09-30' }),
    row({ id: ID(2), status: 'live', token: 't', recipient: 'Jane Doe, Acme', approvedAt: '2026-10-02T15:00:00.000Z', openCount: 3, opensPerson: 1, opensAutomated: 2, firstOpenedAt: '2026-10-03T15:00:00.000Z', lastOpenedAt: '2026-10-05T15:00:00.000Z' }),
  ], counts: { ...COUNTS, all: 2 } })
  const cells = (id: string) => rowEl(id).getAllByRole('cell')
  expect(cells(ID(1))[1]).toHaveTextContent('Sep 1, 2026 to Sep 30, 2026')
  for (const i of [4, 5, 6]) expect(cells(ID(1))[i].textContent).toBe('')
  expect(cells(ID(2))[3]).toHaveTextContent('Oct 1, 2026, 11:00 AM')
  expect(cells(ID(2))[3]).toHaveTextContent('by ryan@avenuez.com')
  expect(cells(ID(2))[4].textContent).toBe('Oct 2, 2026, 11:00 AM')
  expect(cells(ID(2))[5].textContent).toBe('Jane Doe, Acme')
  expect(cells(ID(2))[6]).toHaveTextContent('3 opens: 1 likely person, 2 likely automated')
  expect(cells(ID(2))[6]).toHaveTextContent('First opened Oct 3, 2026, 11:00 AM')
  expect(cells(ID(2))[6]).toHaveTextContent('Last opened Oct 5, 2026, 11:00 AM')
  expect(screen.getByText('Email security scanners can open links automatically. Opens marked automated are likely scanners. The marking is best effort.')).toBeInTheDocument()
  await loaded()
})

test('opensSummary: people and automated, and opens from before v1.1 counted as not classified', () => {
  expect(opensSummary({ openCount: 0, opensPerson: 0, opensAutomated: 0 })).toBe('No opens yet')
  expect(opensSummary({ openCount: 3, opensPerson: 1, opensAutomated: 2 })).toBe('3 opens: 1 likely person, 2 likely automated')
  expect(opensSummary({ openCount: 1, opensPerson: 0, opensAutomated: 0 })).toBe('1 open: 0 likely people, 0 likely automated, 1 not classified')
  expect(opensSummary({ openCount: 5, opensPerson: 2, opensAutomated: 1 })).toBe('5 opens: 2 likely people, 1 likely automated, 2 not classified')
})

test('a generating row shows its step and time', async () => {
  hub({ rows: [row({ status: 'generating', progressStep: 9, createdAt: new Date(Date.now() - 41_000).toISOString() })], counts: { ...COUNTS, all: 1 } })
  expect(rowEl(ID(1)).getByText(/^Writing the copy… 0:4[12]$/)).toBeInTheDocument()
  await loaded()
})

test('status tabs show the server counts and filter the list', async () => {
  hub({ counts: { all: 12, draft: 3, live: 4, revoked: 1, failed: 2 }, rows: [row({ id: ID(1), status: 'draft' }), row({ id: ID(2), status: 'live', token: 't' }), row({ id: ID(3), status: 'failed' })] })
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['All (12)', 'Drafts (3)', 'Sent (4)', 'Revoked (1)', 'Failed (2)'])
  fireEvent.click(screen.getByRole('tab', { name: 'Sent (4)' }))
  expect(screen.getAllByTestId(/^row-/).map((r) => r.dataset.testid)).toEqual([`row-${ID(2)}`])
  expect(screen.getByRole('tab', { name: 'Sent (4)' })).toHaveAttribute('aria-selected', 'true')
  await loaded()
})

test('search is server-side: typing sends ?q= after a pause, and the box starts with the current search', async () => {
  hub({ q: 'globex' })
  const search = screen.getByRole('searchbox', { name: 'Search' })
  expect(search).toHaveValue('globex')
  fireEvent.change(search, { target: { value: ' Acme & co ' } })
  await waitFor(() => expect(push).toHaveBeenCalledWith('/tools/new-business?q=Acme%20%26%20co'))
  fireEvent.change(search, { target: { value: '' } })
  await waitFor(() => expect(push).toHaveBeenLastCalledWith('/tools/new-business'))
  await loaded()
})

test('empty states: first use, and no match with Clear filters', async () => {
  hub()
  expect(screen.getByText('No snapshots yet. Pick a Peec project above and click Generate.')).toBeInTheDocument()
  await loaded()
  cleanup()
  hub({ q: 'zzz' })
  expect(screen.getByText('No snapshots match.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(push).toHaveBeenCalledWith('/tools/new-business')
  await loaded()
  cleanup()
  hub({ rows: [row({ status: 'draft' })], counts: { ...COUNTS, all: 1, draft: 1 } })
  fireEvent.click(screen.getByRole('tab', { name: 'Failed (0)' }))
  expect(screen.getByText('No snapshots match.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByRole('tab', { name: 'All (1)' })).toHaveAttribute('aria-selected', 'true')
  await loaded()
})

test('columns sort: Created newest first by default; Brand ascending, then descending', async () => {
  hub({ rows: [
    row({ id: ID(1), brand: 'Beta', createdAt: '2026-10-01T15:00:00.000Z' }),
    row({ id: ID(2), brand: 'alpha', createdAt: '2026-10-03T15:00:00.000Z' }),
    row({ id: ID(3), brand: 'Gamma', createdAt: '2026-10-02T15:00:00.000Z' }),
  ], counts: { ...COUNTS, all: 3 } })
  const order = () => screen.getAllByTestId(/^row-/).map((r) => within(r).getAllByRole('cell')[0].textContent)
  expect(order()).toEqual(['alpha', 'Gamma', 'Beta'])
  fireEvent.click(screen.getByRole('button', { name: 'Brand' }))
  expect(order()).toEqual(['alpha', 'Beta', 'Gamma'])
  expect(screen.getByRole('columnheader', { name: 'Brand' })).toHaveAttribute('aria-sort', 'ascending')
  fireEvent.click(screen.getByRole('button', { name: 'Brand' }))
  expect(order()).toEqual(['Gamma', 'Beta', 'alpha'])
  await loaded()
})

test('50 rows a page', async () => {
  const many = Array.from({ length: 120 }, (_, i) => row({ id: ID(i + 1), brand: `Brand ${String(i).padStart(3, '0')}`, createdAt: new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString() }))
  hub({ rows: many, counts: { ...COUNTS, all: 120, draft: 120 } })
  expect(screen.getAllByTestId(/^row-/)).toHaveLength(50)
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getAllByTestId(/^row-/)).toHaveLength(20)
  expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  await loaded()
})

test('Show older appends older rows once each and follows the next cursor', async () => {
  const cursor = { before: '2026-09-01T00:00:00.000Z', beforeId: ID(5) }
  const asked: Record<string, string>[] = []
  older = async (url) => {
    asked.push(Object.fromEntries(new URLSearchParams(url.split('?')[1])))
    return json(200, { rows: [row({ id: ID(1) }), row({ id: ID(6), brand: 'Older Co' })], cursor: null })
  }
  hub({ q: 'acme', rows: [row({ id: ID(1), status: 'live', token: 't' })], cursor, counts: { ...COUNTS, all: 2 } })
  fireEvent.click(screen.getByRole('button', { name: 'Show older' }))
  expect(await screen.findByText('Older Co')).toBeInTheDocument()
  expect(asked).toEqual([{ before: cursor.before, beforeId: ID(5), q: 'acme' }])
  expect(screen.getAllByTestId(`row-${ID(1)}`)).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Show older' })).not.toBeInTheDocument()
  await loaded()
})

test('a failed Show older says so and keeps the button', async () => {
  older = async () => json(503, { error: 'unavailable' })
  hub({ rows: [row({})], cursor: { before: '2026-09-01T00:00:00.000Z', beforeId: ID(5) }, counts: { ...COUNTS, all: 1 } })
  fireEvent.click(screen.getByRole('button', { name: 'Show older' }))
  expect(await screen.findByText("Couldn't load older snapshots. Try again.")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Show older' })).toBeEnabled()
  await loaded()
})

test('pending generation is per project; Rerun is disabled only on the row being rerun', async () => {
  let release: (r: Response) => void = () => {}
  generate = () => new Promise((r) => { release = r })
  hub({ rows: [row({ id: ID(1), projectId: 'p1', status: 'live', token: 't' }), row({ id: ID(2), projectId: 'p2', projectName: 'Globex pitch', brand: 'Globex', status: 'draft' })], counts: { ...COUNTS, all: 2 } })
  await pick('Acme pitch')
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  await pick('Globex pitch')
  expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
  expect(rowEl(ID(1)).getByRole('button', { name: 'Rerun' })).toBeEnabled()
  fireEvent.click(rowEl(ID(2)).getByRole('button', { name: 'Rerun' }))
  expect(rowEl(ID(2)).getByRole('button', { name: 'Rerun' })).toBeDisabled()
  expect(rowEl(ID(1)).getByRole('button', { name: 'Rerun' })).toBeEnabled()
  await act(async () => release(json(200, { id: ID(9), status: 'draft' })))
})

test('a generation that finishes while another runs says Draft ready on its row instead of leaving the hub', async () => {
  const releases: ((r: Response) => void)[] = []
  generate = () => new Promise((r) => { releases.push(r) })
  const { rerender } = hub()
  await pick('Acme pitch')
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await pick('Globex pitch')
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await act(async () => releases[0](json(200, { id: ID(8), status: 'draft' })))
  expect(push).not.toHaveBeenCalled()
  rerender(<OutboundHub {...props({ rows: [row({ id: ID(8), brand: 'Acme', status: 'draft' })], counts: { ...COUNTS, all: 1, draft: 1 } })} />)
  expect(rowEl(ID(8)).getByText('Draft ready: Acme.')).toBeInTheDocument()
  expect(rowEl(ID(8)).getAllByRole('link', { name: 'Open' })[0]).toHaveAttribute('href', `/tools/new-business/${ID(8)}`)
  await act(async () => releases[1](json(200, { id: ID(9), status: 'draft' })))
  expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(9)}`)
})

test('the hub never jumps Ryan to a draft after he left it', async () => {
  let release: (r: Response) => void = () => {}
  generate = () => new Promise((r) => { release = r })
  const { unmount } = await pickAndGenerate()
  unmount()
  await act(async () => release(json(200, { id: ID(9), status: 'draft' })))
  expect(push).not.toHaveBeenCalled()
})

test('Copy link writes the public link and says Copied', async () => {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  hub({ rows: [row({ status: 'live', token: 'tok_123', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })], counts: { ...COUNTS, all: 1 } })
  fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/snapshot/tok_123`))
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  expect(screen.getByText('Test link: it works on this environment only.')).toBeInTheDocument()
  await loaded()
})

test('Copy link uses the locked origin and the brand slug when the server passes them, with no test-link note (spec v1.1 §16.2)', async () => {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  hub({ shareOrigin: 'https://reporting.avenuez.com', rows: [row({ status: 'live', token: 'tok_123', linkBrand: 'Example Co', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })], counts: { ...COUNTS, all: 1 } })
  fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://reporting.avenuez.com/snapshot/example-co-tok_123'))
  expect(screen.queryByText('Test link: it works on this environment only.')).not.toBeInTheDocument()
  await loaded()
})

test('no test-link note when no row has a link', async () => {
  hub({ rows: [row({ status: 'draft' })], counts: { ...COUNTS, all: 1 } })
  expect(screen.queryByText('Test link: it works on this environment only.')).not.toBeInTheDocument()
  await loaded()
})

test('Revoke and Discard open in-app dialogs naming the brand and recipient, then act and refresh', async () => {
  actions.revokeSnapshotAction.mockResolvedValue({ ok: true })
  actions.discardSnapshotAction.mockResolvedValue({ ok: true })
  hub({ rows: [row({ id: ID(2), status: 'live', token: 't', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' }), row({ id: ID(4), status: 'failed', error: 'Timed out' })], counts: { ...COUNTS, all: 2 } })
  await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  expect(screen.getByRole('dialog')).toHaveTextContent("Revoke the link for Acme sent to R? It stops working right away and can't be turned back on.")
  fireEvent.click(screen.getByRole('button', { name: 'Keep link' }))
  expect(actions.revokeSnapshotAction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
  await waitFor(() => expect(actions.revokeSnapshotAction).toHaveBeenCalledWith(ID(2)))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Discard the snapshot for Acme? It is removed from the hub.')
  fireEvent.click(screen.getByRole('button', { name: 'Discard snapshot' }))
  await waitFor(() => expect(actions.discardSnapshotAction).toHaveBeenCalledWith(ID(4)))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(3))
})

test.each([
  ['Revoke', 'revokeSnapshotAction', 'live', 'Revoke link'],
  ['Discard', 'discardSnapshotAction', 'draft', 'Discard snapshot'],
  ['Edit a copy', 'copySnapshotAsDraftAction', 'revoked', null],
] as const)('%s answered unavailable shows the lost connection message', async (name, action, status, verb) => {
  actions[action].mockResolvedValue({ ok: false, error: 'unavailable' })
  hub({ rows: [row({ status, token: status === 'draft' ? null : 't', recipient: status === 'draft' ? null : 'R', approvedAt: status === 'draft' ? null : '2026-10-02T15:00:00.000Z' })], counts: { ...COUNTS, all: 1 } })
  await loaded()
  fireEvent.click(screen.getByRole('button', { name }))
  if (verb) fireEvent.click(screen.getByRole('button', { name: verb }))
  expect(await screen.findByText('Lost connection. Try again.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name })).toBeEnabled()
})

test('Edit a copy is disabled while pending and opens the new draft; a refusal shows its error', async () => {
  let release: (v: unknown) => void = () => {}
  actions.copySnapshotAsDraftAction.mockReturnValueOnce(new Promise((r) => { release = r }))
  hub({ rows: [row({ status: 'revoked', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })], counts: { ...COUNTS, all: 1 } })
  await loaded()
  const btn = screen.getByRole('button', { name: 'Edit a copy' })
  fireEvent.click(btn)
  await waitFor(() => expect(btn).toBeDisabled())
  await act(async () => release({ ok: true, id: ID(8) }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(8)}`))
  actions.copySnapshotAsDraftAction.mockResolvedValueOnce({ ok: false, error: 'forbidden' })
  fireEvent.click(screen.getByRole('button', { name: 'Edit a copy' }))
  expect(await screen.findByText('This tool is limited to the New Business team.')).toBeInTheDocument()
})

test('a revoke or Edit a copy that throws shows a message and unlocks the row', async () => {
  actions.revokeSnapshotAction.mockRejectedValue(new Error('dropped'))
  actions.copySnapshotAsDraftAction.mockRejectedValue(new Error('dropped'))
  hub({ rows: [row({ status: 'live', token: 't', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })], counts: { ...COUNTS, all: 1 } })
  await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
  expect(await screen.findByText('Lost connection. Try again.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Edit a copy' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit a copy' })).toBeEnabled())
  expect(push).not.toHaveBeenCalled()
})

test('Back undoes a search: the box follows q, nothing is pushed, and a typed value pushes once, cleaned', async () => {
  vi.useFakeTimers()
  const { rerender } = hub({ q: 'acme' })
  const search = screen.getByRole('searchbox', { name: 'Search' })
  expect(search).toHaveValue('acme')
  rerender(<OutboundHub {...props({ q: '' })} />)
  expect(search).toHaveValue('')
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(push).not.toHaveBeenCalled()
  fireEvent.change(search, { target: { value: 'acme  co' } })
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(push).toHaveBeenCalledTimes(1)
  expect(push).toHaveBeenCalledWith('/tools/new-business?q=acme%20co')
  rerender(<OutboundHub {...props({ q: 'acme co' })} />)
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(push).toHaveBeenCalledTimes(1)
})

test('Clear filters pushes once', async () => {
  vi.useFakeTimers()
  hub({ q: 'zzz' })
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(push).toHaveBeenCalledTimes(1)
})

test('a discarded row loaded by Show older leaves the list once the refreshed props arrive', async () => {
  actions.discardSnapshotAction.mockResolvedValue({ ok: true })
  older = async () => json(200, { rows: [row({ id: ID(6), brand: 'Older Co' })], cursor: null })
  const cursor = { before: '2026-09-01T00:00:00.000Z', beforeId: ID(5) }
  const base = props({ rows: [row({ id: ID(1) })], cursor, counts: { ...COUNTS, all: 2 } })
  const { rerender } = render(<OutboundHub {...base} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show older' }))
  await screen.findByText('Older Co')
  fireEvent.click(within(screen.getByTestId(`row-${ID(6)}`)).getByRole('button', { name: 'Discard' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard snapshot' }))
  await waitFor(() => expect(actions.discardSnapshotAction).toHaveBeenCalledWith(ID(6)))
  rerender(<OutboundHub {...base} />)
  await waitFor(() => expect(screen.queryByText('Older Co')).not.toBeInTheDocument())
})

test('the page is clamped when the list shrinks', async () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => row({ id: ID(i + 1), brand: `Brand ${i}`, createdAt: new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString() }))
  const { rerender } = hub({ rows: many(51), counts: { ...COUNTS, all: 51 } })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
  rerender(<OutboundHub {...props({ rows: many(50), counts: { ...COUNTS, all: 50 } })} />)
  expect(screen.getAllByTestId(/^row-/)).toHaveLength(50)
})

test('a discard refused with not found says the snapshot is gone; Edit a copy passes the row id', async () => {
  actions.discardSnapshotAction.mockResolvedValue({ ok: false, error: 'not found' })
  actions.copySnapshotAsDraftAction.mockResolvedValue({ ok: true, id: ID(8) })
  hub({ rows: [row({ id: ID(4), status: 'failed', error: 'Timed out' }), row({ id: ID(3), status: 'revoked', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })], counts: { ...COUNTS, all: 2 } })
  fireEvent.click(within(screen.getByTestId(`row-${ID(4)}`)).getByRole('button', { name: 'Discard' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard snapshot' }))
  expect(await screen.findByText('This snapshot no longer exists.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Edit a copy' }))
  await waitFor(() => expect(actions.copySnapshotAsDraftAction).toHaveBeenCalledWith(ID(3)))
})

test('while its Generate request runs, the hub polls progress by project and shows each step, then stops when the request answers (spec v1.1 §16.3)', async () => {
  let release: (r: Response) => void = () => {}
  generate = () => new Promise((r) => { release = r })
  const created = new Date(Date.now() + 1000).toISOString()
  const answers = [{ step: null }, { id: ID(9), step: 2, createdAt: created }, { id: ID(9), step: 9, createdAt: created }]
  progress = async () => json(200, answers.length > 1 ? answers.shift() : answers[0])
  await pickAndGenerate()
  const box = await screen.findByRole('status', { name: 'Generation progress' })
  await waitFor(() => expect(within(box).getByText('Reading the brands tracked…')).toBeInTheDocument(), { timeout: 3000 })
  await waitFor(() => expect(within(box).getByText('Writing the copy…')).toBeInTheDocument(), { timeout: 3000 })
  expect(fetchMock.mock.calls.some(([u]) => u === '/api/aeo-outbound/progress?projectId=p1')).toBe(true)
  await act(async () => release(json(200, { id: ID(9), status: 'draft' })))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(9)}`))
  const calls = fetchMock.mock.calls.length
  await new Promise((r) => setTimeout(r, 1500))
  expect(fetchMock.mock.calls.slice(calls).filter(([u]) => String(u).startsWith('/api/aeo-outbound/progress'))).toHaveLength(0)
}, 10_000)
