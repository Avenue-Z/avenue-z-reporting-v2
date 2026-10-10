import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { OutboundHub, type HubRow } from './hub'

const { refresh, push, actions } = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  actions: {
    approveSnapshotAction: vi.fn(),
    revokeSnapshotAction: vi.fn(),
    discardSnapshotAction: vi.fn(),
    copySnapshotAsDraftAction: vi.fn(),
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
vi.mock('@/app/actions/aeo-outbound', () => actions)

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const PROJECTS = [{ id: 'p1', name: 'Acme pitch', status: 'PITCH' }, { id: 'p2', name: 'Globex pitch', status: 'PITCH' }]

const row = (over: Partial<HubRow>): HubRow => ({
  id: ID(1), brand: 'Acme', projectId: 'p1', projectName: 'Acme pitch', status: 'draft',
  createdAt: '2026-10-01T15:00:00.000Z', approvedAt: null, error: null, token: null,
  recipient: null, openCount: 0, firstOpenedAt: null, lastOpenedAt: null, ...over,
})

let generate: () => Promise<Response>
let projects: () => Promise<Response>
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  if (url === '/api/aeo-outbound/projects') return projects()
  if (url === '/api/aeo-outbound/generate') return generate()
  throw new Error(`unexpected fetch ${url}`)
})
const bodies = () => fetchMock.mock.calls.filter(([u]) => u === '/api/aeo-outbound/generate').map(([, init]) => JSON.parse(String(init?.body)))

beforeEach(() => {
  refresh.mockReset(); push.mockReset(); fetchMock.mockClear()
  Object.values(actions).forEach((a) => a.mockReset())
  projects = async () => json(200, PROJECTS)
  generate = async () => json(200, { id: ID(9), status: 'draft' })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function pickAndGenerate(rows: HubRow[] = []) {
  render(<OutboundHub rows={rows} />)
  await screen.findByRole('option', { name: 'Acme pitch' })
  fireEvent.change(screen.getByLabelText('Peec project'), { target: { value: 'p1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
}

test('shows the header and refreshes on mount', async () => {
  render(<OutboundHub rows={[]} />)
  expect(screen.getByRole('heading', { name: 'AEO Outbound Snapshot' })).toBeInTheDocument()
  expect(refresh).toHaveBeenCalledTimes(1)
  await screen.findByRole('option', { name: 'Acme pitch' })
})

test('refreshes every 5s only while a row is generating', async () => {
  vi.useFakeTimers()
  const { unmount } = render(<OutboundHub rows={[row({ status: 'generating' })]} />)
  expect(refresh).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(refresh).toHaveBeenCalledTimes(2)
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(refresh).toHaveBeenCalledTimes(3)
  unmount()
  refresh.mockReset()
  render(<OutboundHub rows={[row({ status: 'draft' })]} />)
  await act(() => vi.advanceTimersByTimeAsync(15000))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('the empty-date helper names the default window', async () => {
  render(<OutboundHub rows={[]} />)
  expect(screen.getByText('Left empty, the report covers the last 30 days.')).toBeInTheDocument()
  await screen.findByRole('option', { name: 'Acme pitch' })
})

test('Generate shows a local Generating row, and 200 draft opens the new draft', async () => {
  let release: (r: Response) => void = () => {}
  generate = () => new Promise((r) => { release = r })
  await pickAndGenerate()
  expect(await screen.findByText('Generating…')).toBeInTheDocument()
  expect(bodies()).toEqual([{ projectId: 'p1' }])
  await act(async () => release(json(200, { id: ID(9), status: 'draft' })))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(9)}`))
})

test('200 failed shows the reason and refreshes', async () => {
  generate = async () => json(200, { id: ID(9), status: 'failed', error: 'No day between 2026-09-01 and 2026-09-30 has any Peec data for this project' })
  await pickAndGenerate()
  expect(await screen.findByText(/No day between 2026-09-01/)).toBeInTheDocument()
  expect(refresh).toHaveBeenCalledTimes(2)
  expect(push).not.toHaveBeenCalled()
})

test.each([
  [400, { error: "This Peec project can't be used.", code: 'bad-project' }, "This Peec project can't be used."],
  [400, { error: 'bad-request', code: 'bad-request' }, "This Peec project can't be used."],
  [403, { error: 'forbidden' }, 'This tool is limited to the New Business team.'],
  [404, { error: "That snapshot can't be rerun. Refresh the list.", code: 'bad-rerun' }, "That snapshot can't be rerun. Refresh the list."],
  [500, { error: 'Could not start generation. Try again.' }, 'Could not start generation. Try again.'],
  [502, { error: 'Peec is unavailable. Try again.' }, 'Peec is unavailable. Try again.'],
])('a %i answer shows its message', async (status, body, text) => {
  generate = async () => json(status, body)
  await pickAndGenerate()
  expect(await screen.findByText(text)).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
  expect(screen.queryByText('Generating…')).not.toBeInTheDocument()
  expect(refresh).toHaveBeenCalledTimes(2)
})

test('a 400 bad-range shows the route reason inline by the dates', async () => {
  generate = async () => json(400, { error: 'The end date must be on or after the start date.', code: 'bad-range' })
  await pickAndGenerate()
  const msg = await screen.findByText('The end date must be on or after the start date.')
  expect(msg.closest('[data-range]')).not.toBeNull()
  expect(refresh).toHaveBeenCalledTimes(2)
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

test('a network error shows "Lost connection. Refreshing" and refreshes', async () => {
  generate = async () => { throw new TypeError('Failed to fetch') }
  await pickAndGenerate()
  expect(await screen.findByText('Lost connection. Refreshing')).toBeInTheDocument()
  expect(refresh).toHaveBeenCalledTimes(2)
})

test('a 5xx with no JSON body is a lost connection', async () => {
  generate = async () => new Response('<html>gateway</html>', { status: 504 })
  await pickAndGenerate()
  expect(await screen.findByText('Lost connection. Refreshing')).toBeInTheDocument()
  expect(refresh).toHaveBeenCalledTimes(2)
})

test('each filled date is sent, so a lone date reaches the route and its 400 bad-range shows inline (spec §7 step 4, §14)', async () => {
  generate = async () => json(400, { error: 'Pick both a start and an end date, or neither.', code: 'bad-range' })
  render(<OutboundHub rows={[]} />)
  await screen.findByRole('option', { name: 'Acme pitch' })
  fireEvent.change(screen.getByLabelText('Peec project'), { target: { value: 'p1' } })
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  const msg = await screen.findByText('Pick both a start and an end date, or neither.')
  expect(msg.closest('[data-range]')).not.toBeNull()
  expect(push).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-09-30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(bodies()).toHaveLength(2))
  generate = async () => json(200, { id: ID(9), status: 'draft' })
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(push).toHaveBeenCalledTimes(1))
  expect(bodies()).toEqual([
    { projectId: 'p1', start: '2026-09-01' },
    { projectId: 'p1', end: '2026-09-30' },
    { projectId: 'p1', start: '2026-09-01', end: '2026-09-30' },
  ])
})

test('no dates sends only the project', async () => {
  await pickAndGenerate()
  await waitFor(() => expect(push).toHaveBeenCalledTimes(1))
  expect(bodies()).toEqual([{ projectId: 'p1' }])
})

test('a failed projects load shows "Peec is unavailable. Retry" and the table still renders', async () => {
  projects = async () => json(502, { error: 'Peec is unavailable. Try again.' })
  render(<OutboundHub rows={[row({ brand: 'Initech' })]} />)
  const retry = await screen.findByRole('button', { name: 'Peec is unavailable. Retry' })
  expect(screen.getByText('Initech')).toBeInTheDocument()
  projects = async () => json(200, PROJECTS)
  fireEvent.click(retry)
  expect(await screen.findByRole('option', { name: 'Acme pitch' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Peec is unavailable. Retry' })).not.toBeInTheDocument()
})

test('Rerun posts only the project and the row id, and opens the new draft', async () => {
  render(<OutboundHub rows={[row({ status: 'live', token: 'tok', approvedAt: '2026-10-02T15:00:00.000Z', recipient: 'Jane Doe, Acme' })]} />)
  await screen.findByRole('option', { name: 'Acme pitch' })
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } })
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-09-30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(9)}`))
  expect(bodies()).toEqual([{ projectId: 'p1', rerunOf: ID(1) }])
})

test('each status shows exactly its actions', async () => {
  render(<OutboundHub rows={[
    row({ id: ID(1), status: 'draft' }),
    row({ id: ID(2), status: 'live', token: 't', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' }),
    row({ id: ID(3), status: 'revoked', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' }),
    row({ id: ID(4), status: 'failed', error: 'Timed out' }),
    row({ id: ID(5), status: 'generating' }),
  ]} />)
  const names = (id: string) => within(screen.getByTestId(`row-${id}`)).queryAllByRole('cell').at(-1)!
  const labels = (id: string) => Array.from(names(id).querySelectorAll('a,button')).map((e) => e.textContent)
  expect(labels(ID(1))).toEqual(['Open', 'Rerun', 'Discard'])
  expect(labels(ID(2))).toEqual(['Open', 'Copy link', 'Revoke', 'Edit a copy', 'Rerun'])
  expect(labels(ID(3))).toEqual(['Open', 'Edit a copy', 'Rerun'])
  expect(labels(ID(4))).toEqual(['Rerun', 'Discard'])
  expect(labels(ID(5))).toEqual([])
  expect(within(screen.getByTestId(`row-${ID(1)}`)).getByRole('link', { name: 'Open' })).toHaveAttribute('href', `/tools/new-business/${ID(1)}`)
  expect(within(screen.getByTestId(`row-${ID(4)}`)).getByText('Failed')).toHaveAttribute('title', 'Timed out')
  await screen.findByRole('option', { name: 'Acme pitch' })
})

test('For and Opens show the recipient, the count and first and last opened, and are empty on a draft', async () => {
  render(<OutboundHub rows={[
    row({ id: ID(1), status: 'draft' }),
    row({
      id: ID(2), status: 'live', token: 't', recipient: 'Jane Doe, Acme', approvedAt: '2026-10-02T15:00:00.000Z',
      openCount: 3, firstOpenedAt: '2026-10-03T15:00:00.000Z', lastOpenedAt: '2026-10-05T15:00:00.000Z',
    }),
  ]} />)
  const cells = (id: string) => within(screen.getByTestId(`row-${id}`)).getAllByRole('cell')
  expect(cells(ID(1))[5].textContent).toBe('')
  expect(cells(ID(1))[6].textContent).toBe('')
  expect(cells(ID(2))[5].textContent).toBe('Jane Doe, Acme')
  const opens = cells(ID(2))[6]
  expect(opens).toHaveTextContent('3')
  expect(opens).toHaveTextContent('First opened Oct 3, 2026')
  expect(opens).toHaveTextContent('Last opened Oct 5, 2026')
  expect(opens.querySelector('[title="Email security scanners can count as an open"]')).not.toBeNull()
  expect(cells(ID(2))[3].textContent).toBe('Oct 1, 2026')
  expect(cells(ID(2))[4].textContent).toBe('Oct 2, 2026')
  await screen.findByRole('option', { name: 'Acme pitch' })
})

test('Copy link writes the public link', async () => {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  render(<OutboundHub rows={[row({ status: 'live', token: 'tok_123', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/snapshot/tok_123`)
  await screen.findByRole('option', { name: 'Acme pitch' })
})

test('Revoke and Discard confirm first, then call the action and refresh', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true)
  actions.revokeSnapshotAction.mockResolvedValue({ ok: true })
  actions.discardSnapshotAction.mockResolvedValue({ ok: true })
  render(<OutboundHub rows={[
    row({ id: ID(2), status: 'live', token: 't', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' }),
    row({ id: ID(4), status: 'failed', error: 'Timed out' }),
  ]} />)
  await screen.findByRole('option', { name: 'Acme pitch' })
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  expect(confirm).toHaveBeenLastCalledWith('Revoke this link? The link stops working immediately and permanently.')
  expect(actions.revokeSnapshotAction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  await waitFor(() => expect(actions.revokeSnapshotAction).toHaveBeenCalledWith(ID(2)))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(confirm).toHaveBeenLastCalledWith('Discard this snapshot? This removes it from the hub.')
  await waitFor(() => expect(actions.discardSnapshotAction).toHaveBeenCalledWith(ID(4)))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(3))
})

test('a refused action shows its message', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  actions.discardSnapshotAction.mockResolvedValue({ ok: false, error: 'not found' })
  render(<OutboundHub rows={[row({ status: 'draft' })]} />)
  await screen.findByRole('option', { name: 'Acme pitch' })
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(await screen.findByText('This snapshot no longer exists.')).toBeInTheDocument()
})

test.each([
  ['Revoke', 'revokeSnapshotAction', 'live'],
  ['Discard', 'discardSnapshotAction', 'draft'],
  ['Edit a copy', 'copySnapshotAsDraftAction', 'revoked'],
] as const)('%s answered unavailable shows the lost connection message', async (name, action, status) => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  actions[action].mockResolvedValue({ ok: false, error: 'unavailable' })
  render(<OutboundHub rows={[row({ status, token: status === 'draft' ? null : 't', recipient: status === 'draft' ? null : 'R', approvedAt: status === 'draft' ? null : '2026-10-02T15:00:00.000Z' })]} />)
  await screen.findByRole('option', { name: 'Acme pitch' })
  fireEvent.click(screen.getByRole('button', { name }))
  expect(await screen.findByText('Lost connection. Try again.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name })).toBeEnabled()
})

test('Edit a copy is disabled while pending and opens the new draft; a refusal shows its error', async () => {
  let release: (v: unknown) => void = () => {}
  actions.copySnapshotAsDraftAction.mockReturnValueOnce(new Promise((r) => { release = r }))
  render(<OutboundHub rows={[row({ status: 'revoked', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })]} />)
  await screen.findByRole('option', { name: 'Acme pitch' })
  const btn = screen.getByRole('button', { name: 'Edit a copy' })
  fireEvent.click(btn)
  await waitFor(() => expect(btn).toBeDisabled())
  await act(async () => release({ ok: true, id: ID(8) }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(8)}`))
  expect(actions.copySnapshotAsDraftAction).toHaveBeenCalledWith(ID(1))
  actions.copySnapshotAsDraftAction.mockResolvedValueOnce({ ok: false, error: 'forbidden' })
  fireEvent.click(screen.getByRole('button', { name: 'Edit a copy' }))
  expect(await screen.findByText('This tool is limited to the New Business team.')).toBeInTheDocument()
})

test('a revoke that throws shows a message and unlocks the row', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  actions.revokeSnapshotAction.mockRejectedValue(new Error('dropped'))
  render(<OutboundHub rows={[row({ status: 'live', token: 't', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })]} />)
  await screen.findByRole('option', { name: 'Acme pitch' })
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  expect(await screen.findByText('Lost connection. Try again.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled()
})

test('an Edit a copy that throws shows a message', async () => {
  actions.copySnapshotAsDraftAction.mockRejectedValue(new Error('dropped'))
  render(<OutboundHub rows={[row({ status: 'revoked', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })]} />)
  await screen.findByRole('option', { name: 'Acme pitch' })
  fireEvent.click(screen.getByRole('button', { name: 'Edit a copy' }))
  expect(await screen.findByText('Lost connection. Try again.')).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
})
