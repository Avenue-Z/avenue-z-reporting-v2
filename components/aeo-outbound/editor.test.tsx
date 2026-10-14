import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { StoredNote } from '@/lib/aeo-outbound/notes'
import { RECIPIENT_ERROR } from '@/lib/aeo-outbound/recipient'
import { OutboundEditor } from './editor'
import { LOADING_REPORT } from './messages'
import { EDITOR_MARKER } from './frame-height'

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

const ID = '00000000-0000-4000-8000-000000000001'
const NEW_ID = '00000000-0000-4000-8000-000000000009'
const LEAD = 'competitive_bullets.0.lead'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let patch: () => Promise<Response>
let progress: (url: string) => Promise<Response> = async () => json(200, { step: null })
let generateAnswer: () => Promise<Response> = async () => json(200, { id: NEW_ID, status: 'draft' })
// Spec v1.1 §19.7: the revision the view route says it rendered (none by default), and an optional view answer.
let viewRevision: number | null = null
let viewAnswer: ((url: string) => Response) | null = null
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  if (url.startsWith(`/api/aeo-outbound/reports/${ID}/view`)) {
    if (viewAnswer) return viewAnswer(url)
    return new Response(`<p>${url}</p>`, { status: 200, headers: viewRevision === null ? {} : { 'X-Report-Revision': String(viewRevision) } })
  }
  if (url === `/api/aeo-outbound/reports/${ID}/slots`) return patch()
  if (url === '/api/aeo-outbound/generate') return generateAnswer()
  if (url.startsWith('/api/aeo-outbound/progress?')) return progress(url)
  throw new Error(`unexpected fetch ${url}`)
})
const patches = () => fetchMock.mock.calls.filter(([u]) => u.endsWith('/slots'))
const views = () => fetchMock.mock.calls.filter(([u]) => u.includes('/view')).map(([u]) => u)

type Props = Parameters<typeof OutboundEditor>[0]
const base: Props = {
  id: ID, brand: 'Acme', linkBrand: null, shareOrigin: null, projectId: 'p1', status: 'draft', revision: 4,
  notes: ['Window used: Sep 1, 2026 to Sep 30, 2026'], needsValidation: [], token: null, error: null, errorCode: null, recipient: null,
  sectionTitles: ['Category data', 'Competitive visibility'], about: null, opens: [], openCount: 0,
  needsValidationBlocksApprove: true, unreadable: false, progressStep: 0, createdAt: '2026-10-08T15:00:00.000Z',
}
const panel = () => screen.getByRole('complementary', { name: 'Before you send' })

beforeEach(() => {
  refresh.mockReset(); push.mockReset(); fetchMock.mockClear()
  Object.values(actions).forEach((a) => a.mockReset())
  patch = async () => json(200, { revision: 5, notes: ['Window used: Sep 1, 2026 to Sep 30, 2026'], needsValidation: [] })
  generateAnswer = async () => json(200, { id: NEW_ID, status: 'draft' })
  progress = async () => json(200, { id: ID, step: 4, createdAt: '2026-10-08T15:00:00.000Z' })
  viewRevision = null
  viewAnswer = null
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

// Spec v1.1 §19.7: the frame is mounted only once its report has arrived, as a new element per load.
const frameIn = (c: HTMLElement) => c.querySelector('iframe') as HTMLIFrameElement
async function setup(over: Partial<Props> = {}) {
  const utils = render(<OutboundEditor {...base} {...over} />)
  const status = over.status ?? base.status
  if (!over.unreadable && ['draft', 'live', 'revoked'].includes(status)) await waitFor(() => expect(frameIn(utils.container)?.getAttribute('srcdoc')).toContain('/view'))
  return { ...utils, iframe: frameIn(utils.container) }
}
const fromFrame = (iframe: HTMLIFrameElement, data: unknown) =>
  act(() => { window.dispatchEvent(new MessageEvent('message', { data, source: iframe.contentWindow })) })
const approveBtn = () => screen.getByRole('button', { name: 'Approve' })

test('a draft loads the editable view into a sandboxed iframe', async () => {
  const { iframe } = await setup()
  expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-popups allow-popups-to-escape-sandbox')
  expect(views()).toEqual([`/api/aeo-outbound/reports/${ID}/view`])
  expect(screen.getByRole('link', { name: 'Open full size' })).toHaveAttribute('href', `/api/aeo-outbound/reports/${ID}/view?mode=preview`)
  expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/tools/new-business')
  expect(within(screen.getByRole('toolbar', { name: 'Snapshot actions' })).getAllByRole('button')[0]).toHaveTextContent('Edit')
})

test('a message whose source is not the iframe is ignored', async () => {
  const { iframe } = await setup()
  act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'edit', path: 'headline', value: 'Hi' }, source: window })) })
  act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'edit', path: 'headline', value: 'Hi' } })) })
  await new Promise((r) => setTimeout(r, 20))
  expect(patches()).toHaveLength(0)
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'Hi' })
  await waitFor(() => expect(patches()).toHaveLength(1))
  expect(JSON.parse(String(patches()[0][1]?.body))).toEqual({ path: 'headline', value: 'Hi', revision: 4, writer: expect.stringMatching(UUID), seq: 1 })
  expect(patches()[0][1]?.method).toBe('PATCH')
})

test('every PATCH body carries the queue\'s one writer and each item\'s seq, in send order (spec v1.1 18.4)', async () => {
  let rev = 4
  patch = async () => json(200, { revision: ++rev, notes: [], needsValidation: [] })
  const { iframe } = await setup()
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'A' })
  await waitFor(() => expect(patches()).toHaveLength(1))
  await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull())
  await fromFrame(iframe, { type: 'edit', path: 'summary', value: 'B' })
  await waitFor(() => expect(patches()).toHaveLength(2))
  const bodies = patches().map(([, init]) => JSON.parse(String(init?.body)) as { writer: string; seq: number })
  expect(bodies.map((b) => b.seq)).toEqual([1, 2])
  expect(bodies[0].writer).toMatch(UUID)
  expect(bodies[1].writer).toBe(bodies[0].writer)
})

test('each PATCH carries the save queue\'s abort signal, so leaving the draft aborts a hung save (spec v1.1 18.4)', async () => {
  patch = () => new Promise<Response>(() => {})
  const { iframe, unmount } = await setup()
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'Hi' })
  await waitFor(() => expect(patches()).toHaveLength(1))
  const signal = patches()[0][1]?.signal
  expect(signal).toBeDefined()
  expect(signal?.aborted).toBe(false)
  unmount()
  expect(signal?.aborted).toBe(true)
})

test('a dirty message from the iframe disables Approve and shows Saving…, and the save shows Saved', async () => {
  const { iframe } = await setup()
  expect(approveBtn()).toBeEnabled()
  await fromFrame(iframe, { type: 'dirty', path: 'headline' })
  expect(approveBtn()).toBeDisabled()
  expect(screen.getByText('Saving…')).toBeInTheDocument()
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'New headline' })
  await waitFor(() => expect(approveBtn()).toBeEnabled())
  expect(screen.getByText('Saved')).toBeInTheDocument()
})

test('Approve with open Fill these in items opens the panel at the first one and says how many', async () => {
  await setup({ needsValidation: ['market', 'category'] })
  fireEvent.click(screen.getByRole('button', { name: /^Before you send/ }))
  expect(screen.queryByRole('complementary', { name: 'Before you send' })).not.toBeInTheDocument()
  expect(approveBtn()).toBeEnabled()
  fireEvent.click(approveBtn())
  expect(screen.getByText('Fill in 2 items first')).toBeInTheDocument()
  expect(within(panel()).getByRole('button', { name: 'Market: Needs validation' })).toHaveAttribute('aria-current', 'true')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('one open item reads Fill in 1 item first; a build where Needs validation does not block opens the dialog', async () => {
  await setup({ needsValidation: ['market'] })
  fireEvent.click(approveBtn())
  expect(screen.getByText('Fill in 1 item first')).toBeInTheDocument()
  cleanup()
  await setup({ needsValidation: ['market'], needsValidationBlocksApprove: false })
  fireEvent.click(approveBtn())
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})

test("a save's response replaces the panel's items, named in plain words", async () => {
  patch = async () => json(200, { revision: 5, notes: [{ kind: 'number_not_in_data', path: 'why', text: '"41%" is not in the Peec data' }], needsValidation: [] })
  const { iframe } = await setup()
  expect(within(panel()).getByText('Window used: Sep 1, 2026 to Sep 30, 2026')).toBeInTheDocument()
  await fromFrame(iframe, { type: 'edit', path: 'summary', value: 'x' })
  expect(await within(panel()).findByText('Why it matters: "41%" is not in the Peec data')).toBeInTheDocument()
  expect(within(panel()).queryByText('Window used: Sep 1, 2026 to Sep 30, 2026')).not.toBeInTheDocument()
})

test('a 400 names the refused field in the save state', async () => {
  patch = async () => json(400, { error: 'Keep this under 80 characters.' })
  const { iframe } = await setup()
  await fromFrame(iframe, { type: 'dirty', path: LEAD })
  await fromFrame(iframe, { type: 'edit', path: LEAD, value: 'x'.repeat(81) })
  expect(await screen.findByText('Category data, bullet 1, bold lead-in: Keep this under 80 characters.')).toBeInTheDocument()
  expect(approveBtn()).toBeDisabled()
})

test('a 409 stops saving and offers a reload', async () => {
  patch = async () => json(409, { error: 'stale', revision: 9 })
  const { iframe } = await setup()
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'x' })
  expect(await screen.findByText('This snapshot changed. Reload.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
})

test('Approve posts a flush to the iframe first, and waits for a field still dirty', async () => {
  const { iframe } = await setup()
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  vi.useFakeTimers()
  fireEvent.click(approveBtn())
  expect(post).toHaveBeenCalledWith({ type: 'flush' }, '*')
  await fromFrame(iframe, { type: 'dirty', path: 'headline' })
  await act(() => vi.advanceTimersByTimeAsync(2100))
  expect(screen.getByText('Saving. Try again in a moment.')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

async function openDialog() {
  const r = await setup()
  fireEvent.click(approveBtn())
  await screen.findByRole('dialog')
  return r
}

test('the Approve dialog shows the confirm text and requires who it is for', async () => {
  actions.approveSnapshotAction.mockResolvedValue({ ok: true, token: 'tok_123' })
  await openDialog()
  expect(screen.getByText("Approving freezes this report. You can't edit it after this. To change it, use Edit a copy.")).toBeInTheDocument()
  const field = screen.getByLabelText('Who is this for?')
  expect(field).toHaveAttribute('maxLength', '200')
  const confirm = screen.getByRole('button', { name: 'Approve and create link' })
  expect(confirm).toBeDisabled()
  fireEvent.change(field, { target: { value: '   ' } })
  expect(confirm).toBeDisabled()
  fireEvent.change(field, { target: { value: 'Jane Doe, Acme' } })
  refresh.mockClear()
  fireEvent.click(confirm)
  await waitFor(() => expect(actions.approveSnapshotAction).toHaveBeenCalledWith(ID, 4, 'Jane Doe, Acme'))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(views()).toContain(`/api/aeo-outbound/reports/${ID}/view?mode=preview`))
  expect(refresh).toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Link' })).toHaveValue(`${window.location.origin}/snapshot/tok_123`)
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
})

test.each([
  [{ ok: false, error: RECIPIENT_ERROR }, RECIPIENT_ERROR],
  [{ ok: false, error: 'Fill in every "Needs validation" first.' }, 'Fill in every "Needs validation" first.'],
  [{ ok: false, error: 'not found' }, 'This snapshot no longer exists.'],
  [{ ok: false, error: 'unavailable' }, 'Lost connection. Try again.'],
])('an approve refusal shows its message in the dialog (%o)', async (result, text) => {
  actions.approveSnapshotAction.mockResolvedValue(result)
  await openDialog()
  fireEvent.change(screen.getByLabelText('Who is this for?'), { target: { value: 'Jane Doe, Acme' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve and create link' }))
  const dialog = screen.getByRole('dialog')
  await waitFor(() => expect(dialog).toHaveTextContent(text))
})

test('Rerun over a draft asks first in the in-app dialog, then posts the project and this id; on a live row it does not ask', async () => {
  await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Rerun Acme? This makes a new draft with fresh Peec data and new copy. This draft stays as it is.')
  fireEvent.click(screen.getByRole('button', { name: 'Make a new draft' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${NEW_ID}`))
  expect(fetchMock).toHaveBeenCalledWith('/api/aeo-outbound/generate', { method: 'POST', body: JSON.stringify({ projectId: 'p1', rerunOf: ID }) })
  cleanup(); push.mockReset()
  await setup({ status: 'live', token: 'tok_123' })
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${NEW_ID}`))
})

test('a live snapshot loads the preview, never saves, and offers Copy link, Revoke and Edit a copy', async () => {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const { iframe } = await setup({ status: 'live', token: 'tok_123' })
  expect(views()).toEqual([`/api/aeo-outbound/reports/${ID}/view?mode=preview`])
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'x' })
  await new Promise((r) => setTimeout(r, 20))
  expect(patches()).toHaveLength(0)
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/snapshot/tok_123`))
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit a copy' })).toBeInTheDocument()
})

test('Revoke opens an in-app dialog naming the brand and the recipient, then revokes and refreshes', async () => {
  actions.revokeSnapshotAction.mockResolvedValue({ ok: true })
  await setup({ status: 'live', token: 'tok_123', recipient: 'Jane Doe, Acme' })
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  expect(screen.getByRole('dialog')).toHaveTextContent("Revoke the link for Acme sent to Jane Doe, Acme? It stops working right away and can't be turned back on.")
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep link' }))
  fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
  await waitFor(() => expect(actions.revokeSnapshotAction).toHaveBeenCalledWith(ID))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
})

test('Edit a copy is disabled while pending and opens the new draft', async () => {
  let release: (v: unknown) => void = () => {}
  actions.copySnapshotAsDraftAction.mockReturnValueOnce(new Promise((r) => { release = r }))
  await setup({ status: 'revoked' })
  const btn = screen.getByRole('button', { name: 'Edit a copy' })
  fireEvent.click(btn)
  await waitFor(() => expect(btn).toBeDisabled())
  await act(async () => release({ ok: true, id: NEW_ID }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${NEW_ID}`))
  expect(actions.copySnapshotAsDraftAction).toHaveBeenCalledWith(ID)
})

test('a generating snapshot shows the checklist, polls its row by id every second, and refreshes at once when it finishes (spec v1.1 §16.3)', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T15:00:18.000Z'))
  const answers: unknown[] = [{ id: ID, step: 4, createdAt: '2026-10-08T15:00:00.000Z' }, { id: ID, step: 6, createdAt: '2026-10-08T15:00:00.000Z' }, { step: null }]
  progress = async () => json(200, answers.length > 1 ? answers.shift() : answers[0])
  const { container } = render(<OutboundEditor {...base} status="generating" progressStep={4} />)
  const box = screen.getByRole('status', { name: 'Generation progress' }).closest('.max-w-sm') as HTMLElement
  expect(within(box).getByText('Finding the days with data…')).toBeInTheDocument()
  expect(within(box).getByText('0:18')).toBeInTheDocument()
  expect(within(box).getByText('Usually 35 to 45 seconds')).toBeInTheDocument()
  expect(within(box).getByText('Keep this tab open until it finishes.')).toBeInTheDocument()
  expect(container.querySelector('iframe')).toBeNull()
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(within(box).getByText('Loading the sources AI used…')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith(`/api/aeo-outbound/progress?id=${ID}`, expect.objectContaining({ cache: 'no-store' }))
  const before = refresh.mock.calls.length
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(refresh.mock.calls.length).toBe(before + 1)
  // The 5 second refresh while generating, apart from the one finish refresh above.
  const finished = refresh.mock.calls.length
  progress = async () => json(200, { id: ID, step: 6, createdAt: '2026-10-08T15:00:00.000Z' })
  await act(() => vi.advanceTimersByTimeAsync(10_000))
  expect(refresh.mock.calls.length).toBe(finished + 2)
  expect(fetchMock.mock.calls.filter(([u]) => u.includes('/view'))).toHaveLength(0)
})

test("while the editor's Rerun request runs, the checklist replaces the action bar and polls by project (spec v1.1 §16.3)", async () => {
  let release: (r: Response) => void = () => {}
  generateAnswer = () => new Promise<Response>((r) => { release = r })
  progress = async () => json(200, { id: NEW_ID, step: 3, createdAt: new Date(Date.now() + 1000).toISOString() })
  await setup({ status: 'failed', errorCode: 'no_data', error: 'x' })
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  const box = (await screen.findByRole('status', { name: 'Generation progress' })).closest('.max-w-sm') as HTMLElement
  expect(screen.queryByRole('toolbar', { name: 'Snapshot actions' })).not.toBeInTheDocument()
  await waitFor(() => expect(within(box).getByText('Reading the project profile…')).toBeInTheDocument(), { timeout: 3000 })
  expect(fetchMock.mock.calls.some(([u]) => u === '/api/aeo-outbound/progress?projectId=p1')).toBe(true)
  await act(async () => release(json(200, { id: NEW_ID, status: 'draft' })))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${NEW_ID}`))
  expect(screen.queryByRole('status', { name: 'Generation progress' })).not.toBeInTheDocument()
}, 10_000)

test('a failed snapshot shows its reason with Rerun and Discard and no iframe', async () => {
  actions.discardSnapshotAction.mockResolvedValue({ ok: true })
  const { container } = render(<OutboundEditor {...base} status="failed" error="Timed out at step 4" />)
  expect(screen.getByText('Timed out at step 4')).toBeInTheDocument()
  expect(container.querySelector('iframe')).toBeNull()
  expect(screen.getByRole('button', { name: 'Rerun' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Discard the snapshot for Acme? It is removed from the hub.')
  fireEvent.click(screen.getByRole('button', { name: 'Discard snapshot' }))
  await waitFor(() => expect(actions.discardSnapshotAction).toHaveBeenCalledWith(ID))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/tools/new-business'))
})

test('a stale approve closes the dialog, stops saving and offers a reload', async () => {
  actions.approveSnapshotAction.mockResolvedValue({ ok: false, error: 'stale' })
  const { iframe } = await openDialog()
  fireEvent.change(screen.getByLabelText('Who is this for?'), { target: { value: 'Jane Doe, Acme' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve and create link' }))
  expect(await screen.findByText('This snapshot changed. Reload.')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  expect(approveBtn()).toBeDisabled()
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'x' })
  await new Promise((r) => setTimeout(r, 20))
  expect(patches()).toHaveLength(0)
})

test('an approve that throws unlocks the dialog and shows a message', async () => {
  let reject: (e: unknown) => void = () => {}
  actions.approveSnapshotAction.mockReturnValue(new Promise((_, r) => { reject = r }))
  await openDialog()
  const field = screen.getByLabelText('Who is this for?')
  fireEvent.change(field, { target: { value: 'Jane Doe, Acme' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve and create link' }))
  await waitFor(() => expect(field).toBeDisabled())
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await act(async () => reject(new Error('db down')))
  const dialog = screen.getByRole('dialog')
  await waitFor(() => expect(dialog).toHaveTextContent('Lost connection. Try again.'))
  expect(field).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Approve and create link' })).toBeEnabled()
})

test.each([
  ['Revoke', 'revokeSnapshotAction', true],
  ['Edit a copy', 'copySnapshotAsDraftAction', false],
] as const)('%s answered unavailable shows the lost connection message', async (name, action, confirms) => {
  actions[action].mockResolvedValue({ ok: false, error: 'unavailable' })
  await setup({ status: 'live', token: 'tok_123' })
  fireEvent.click(screen.getByRole('button', { name }))
  if (confirms) fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
  expect(await screen.findByText('Lost connection. Try again.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name })).toBeEnabled()
})

test('Discard answered unavailable shows the lost connection message', async () => {
  actions.discardSnapshotAction.mockResolvedValue({ ok: false, error: 'unavailable' })
  await setup({ status: 'failed', error: 'Peec had no data.' })
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard snapshot' }))
  expect(await screen.findByText('Lost connection. Try again.')).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
})

test('Edit a copy that throws shows a message and unlocks', async () => {
  actions.copySnapshotAsDraftAction.mockRejectedValue(new Error('dropped'))
  await setup({ status: 'live', token: 'tok_123' })
  const btn = screen.getByRole('button', { name: 'Edit a copy' })
  fireEvent.click(btn)
  expect(await screen.findByText('Lost connection. Try again.')).toBeInTheDocument()
  expect(btn).toBeEnabled()
  expect(push).not.toHaveBeenCalled()
})

test('the dialog re-checks at Confirm: an edit that arrived after it opened blocks the approve', async () => {
  const { iframe } = await openDialog()
  fireEvent.change(screen.getByLabelText('Who is this for?'), { target: { value: 'Jane Doe, Acme' } })
  await fromFrame(iframe, { type: 'dirty', path: 'headline' })
  fireEvent.click(screen.getByRole('button', { name: 'Approve and create link' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Saving. Try again in a moment.')
  expect(actions.approveSnapshotAction).not.toHaveBeenCalled()
})

test('Approve flushes, and the dialog opens as soon as the queue is clean, well inside 2s', async () => {
  const { iframe } = await setup()
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  vi.useFakeTimers()
  fireEvent.click(approveBtn())
  expect(post).toHaveBeenCalledWith({ type: 'flush' }, '*')
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'flushed' })
  await act(() => vi.advanceTimersByTimeAsync(300))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(patches()).toHaveLength(1)
  expect(screen.queryByText('Saving. Try again in a moment.')).not.toBeInTheDocument()
})

test('with an unsaved edit the browser warns on unload, and Back and Rerun open the in-app leave dialog', async () => {
  const confirm = vi.spyOn(window, 'confirm')
  const { iframe } = await setup()
  const clean = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(clean)
  expect(clean.defaultPrevented).toBe(false)
  await fromFrame(iframe, { type: 'dirty', path: 'headline' })
  const dirty = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(dirty)
  expect(dirty.defaultPrevented).toBe(true)
  expect(fireEvent.click(screen.getByRole('link', { name: 'Back' }))).toBe(false)
  expect(screen.getByRole('dialog')).toHaveTextContent('You have unsaved edits. Leave anyway?')
  fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
  expect(push).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('link', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
  expect(push).toHaveBeenCalledWith('/tools/new-business')
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${NEW_ID}`))
  expect(confirm).not.toHaveBeenCalled()
})

test('a clean editor opens Edit a copy without asking', async () => {
  const confirm = vi.spyOn(window, 'confirm')
  actions.copySnapshotAsDraftAction.mockResolvedValue({ ok: true, id: NEW_ID })
  await setup({ status: 'live', token: 'tok_123' })
  fireEvent.click(screen.getByRole('button', { name: 'Edit a copy' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${NEW_ID}`))
  expect(confirm).not.toHaveBeenCalled()
})

test('a live snapshot copies the locked link with the brand slug (spec v1.1 §16.2)', async () => {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  await setup({ status: 'live', token: 'tok_123', linkBrand: 'Example Co', shareOrigin: 'https://reporting.avenuez.com' })
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://reporting.avenuez.com/snapshot/example-co-tok_123'))
  expect(screen.queryByText('Test link: it works on this environment only.')).not.toBeInTheDocument()
})

test('a live snapshot with no locked origin labels the link as a test link', async () => {
  await setup({ status: 'live', token: 'tok_123' })
  expect(screen.getByText('Test link: it works on this environment only.')).toBeInTheDocument()
})

test('a draft opens in Preview; ready gets the mode; Edit switches to edit mode without reloading; Done editing switches back', async () => {
  const { iframe } = await setup()
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  await fromFrame(iframe, { type: 'ready' })
  expect(post).toHaveBeenLastCalledWith({ type: 'mode', edit: false }, '*')
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  expect(post.mock.calls.slice(-2)).toEqual([[{ type: 'flush' }, '*'], [{ type: 'mode', edit: true }, '*']])
  expect(screen.getByText('Editing. Click any outlined text to change it. Changes save automatically. Charts come from Peec: to change them, change the dates and Rerun.')).toBeInTheDocument()
  await fromFrame(iframe, { type: 'ready' })
  expect(post).toHaveBeenLastCalledWith({ type: 'mode', edit: true }, '*')
  fireEvent.click(screen.getByRole('button', { name: 'Done editing' }))
  expect(post.mock.calls.slice(-2)).toEqual([[{ type: 'flush' }, '*'], [{ type: 'mode', edit: false }, '*']])
  expect(screen.queryByText(/^Editing\./)).not.toBeInTheDocument()
  expect(views()).toHaveLength(1)
})

test('a locked click shows its message for 3 seconds: a chart, a fixed word, a mirror', async () => {
  const { iframe } = await setup()
  vi.useFakeTimers()
  await fromFrame(iframe, { type: 'locked', what: 'chart' })
  expect(screen.getByText('Charts come from Peec data and can\'t be edited. For other dates, start a new report from the main page.')).toBeInTheDocument()
  await act(() => vi.advanceTimersByTimeAsync(3000))
  expect(screen.queryByText(/^Charts come from Peec data/)).not.toBeInTheDocument()
  await fromFrame(iframe, { type: 'locked', what: 'fixed' })
  expect(screen.getByText('This part is set automatically.')).toBeInTheDocument()
  await fromFrame(iframe, { type: 'locked', what: 'fixed', path: 'brand' })
  expect(screen.getByText('Edit this where it first appears on the page.')).toBeInTheDocument()
})

test('dirty, edit and structure need a path; ready and locked do not', async () => {
  const { iframe } = await setup()
  await fromFrame(iframe, { type: 'edit', value: 'x' })
  await fromFrame(iframe, { type: 'structure', op: 'add' })
  await fromFrame(iframe, { type: 'structure', op: 'explode', path: 'competitive_bullets' })
  await new Promise((r) => setTimeout(r, 20))
  expect(patches()).toHaveLength(0)
  await fromFrame(iframe, { type: 'locked', what: 'chart' })
  expect(screen.getByText(/^Charts come from Peec data/)).toBeInTheDocument()
})

test('Live and Revoked show Edit a copy, first, with the frozen hint', async () => {
  await setup({ status: 'revoked' })
  expect(within(screen.getByRole('toolbar', { name: 'Snapshot actions' })).getAllByRole('button')[0]).toHaveTextContent('Edit a copy')
  expect(screen.getByText('This report is frozen. Editing makes a new draft.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
})

const NOTES: StoredNote[] = [
  { kind: 'number_not_in_data', path: 'competitive_bullets.0.text', text: '"42%" is not in the Peec data' },
  { kind: 'high_visibility', text: "Alpha shows 95.0% AI visibility, which is unusually high. Check this brand's setup in Peec before sending: a name that is a common word can match unrelated answers." },
  { kind: 'rank_basis', text: 'Rank is by visibility among the 12 brands tracked in Peec.' },
  { kind: 'project', text: 'Peec project or_x (PITCH_ENDED). Window 2026-10-01 to 2026-10-08, all models: ChatGPT UI.' },
  'An old note',
]
const ABOUT = { projectId: 'or_x', projectName: 'Acme pitch', projectStatus: 'PITCH_ENDED', windowLabel: 'Oct 1, 2026 to Oct 8, 2026', models: ['ChatGPT UI'] }

test('Before you send is open on a draft, counts open items, groups them and names each field in plain words', async () => {
  await setup({ notes: NOTES, needsValidation: ['market'], about: ABOUT, sectionTitles: ['Strengths', 'Gaps'] })
  expect(screen.getByRole('button', { name: 'Before you send (4)' })).toHaveAttribute('aria-expanded', 'true')
  const p = panel()
  expect(within(p).getByText('Market: Needs validation')).toBeInTheDocument()
  expect(within(p).getByText('Strengths, bullet 1, text: "42%" is not in the Peec data')).toBeInTheDocument()
  expect(within(p).getByText('An old note')).toBeInTheDocument()
  for (const t of ['Every claim matches the numbers on the page', 'No mention of the discovery call, pricing or other agencies', 'Findings and hypotheses are kept apart']) expect(within(p).getByLabelText(t)).toBeInTheDocument()
  expect(within(p).getByText('Peec project: Acme pitch (pitch ended). Covers Oct 1, 2026 to Oct 8, 2026. Models: ChatGPT UI.')).toBeInTheDocument()
  expect(within(p).getByText('Rank is by visibility among the 12 brands tracked in Peec.')).toBeInTheDocument()
  expect(within(p).getByText('Project id or_x (for support).')).toBeInTheDocument()
  expect(within(p).queryByText(/^Peec project or_x/)).not.toBeInTheDocument()
  fireEvent.click(within(p).getAllByRole('checkbox', { name: 'Looks right' })[0])
  expect(screen.getByRole('button', { name: 'Before you send (3)' })).toBeInTheDocument()
  fireEvent.click(within(p).getByLabelText('Findings and hypotheses are kept apart'))
  expect(screen.getByRole('button', { name: 'Before you send (3)' })).toBeInTheDocument()
})

test("a version 1 row's About this data has no project status", async () => {
  await setup({ about: { ...ABOUT, projectStatus: null } })
  expect(within(panel()).getByText('Peec project: Acme pitch. Covers Oct 1, 2026 to Oct 8, 2026. Models: ChatGPT UI.')).toBeInTheDocument()
})

test('clicking an item enters edit mode and focuses its field', async () => {
  const { iframe } = await setup({ notes: NOTES })
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  fireEvent.click(within(panel()).getByRole('button', { name: /bullet 1, text: "42%"/ }))
  expect(post.mock.calls.map((c) => c[0])).toEqual([{ type: 'flush' }, { type: 'mode', edit: true }, { type: 'focus', path: 'competitive_bullets.0.text' }])
  expect(screen.getByRole('button', { name: 'Done editing' })).toBeInTheDocument()
})

test('the panel and Approve re-sync from the server when the revision changes', async () => {
  const { rerender } = await setup({ needsValidation: ['market'] })
  expect(screen.getByRole('button', { name: 'Before you send (2)' })).toBeInTheDocument()
  rerender(<OutboundEditor {...base} revision={9} needsValidation={[]} notes={[]} />)
  expect(screen.getByRole('button', { name: 'Before you send (0)' })).toBeInTheDocument()
})

test("a structure message waits for pending edits, makes the frame read-only, then reloads it and clears that list's ticks only", async () => {
  const notes: StoredNote[] = [
    { kind: 'number_not_in_data', path: 'competitive_bullets.1.text', text: '"9%" is not in the Peec data' },
    { kind: 'number_not_in_data', path: 'why', text: '"8%" is not in the Peec data' },
  ]
  const { iframe } = await setup({ notes, revision: 4 })
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  for (const box of within(panel()).getAllByRole('checkbox', { name: 'Looks right' })) fireEvent.click(box)
  expect(screen.getByRole('button', { name: 'Before you send (0)' })).toBeInTheDocument()
  let rev = 4
  patch = async () => json(200, { revision: ++rev, notes, needsValidation: [], slots: {} })
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'H' })
  await fromFrame(iframe, { type: 'structure', op: 'add', path: 'competitive_bullets' })
  expect(post).toHaveBeenCalledWith({ type: 'mode', edit: false }, '*')
  await waitFor(() => expect(patches()).toHaveLength(2))
  expect(patches().map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
    { path: 'headline', value: 'H', revision: 4, writer: expect.stringMatching(UUID), seq: 1 },
    { path: 'competitive_bullets.add', value: 'structure', revision: 5, writer: expect.stringMatching(UUID), seq: 2 },
  ])
  await waitFor(() => expect(views()).toHaveLength(2))
  // The competitive_bullets tick is dropped (its bullets moved); the why tick stays.
  expect(screen.getByRole('button', { name: 'Before you send (1)' })).toBeInTheDocument()
})


test('an unreadable draft says so, offers Rerun and shows no frame', () => {
  const { container } = render(<OutboundEditor {...base} unreadable />)
  expect(screen.getByText("This snapshot was saved by an older version and can't be shown. Rerun it.")).toBeInTheDocument()
  expect(container.querySelector('iframe')).toBeNull()
  expect(screen.getByRole('button', { name: 'Rerun' })).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('a live row lists its opens with the caveat, and counts opens from before v1.1 as not classified', async () => {
  await setup({ status: 'live', token: 'tok_123', openCount: 3, opens: [
    { openedAt: '2026-10-02T15:00:00.000Z', uaFamily: 'Chrome on Mac', likelyAutomated: false, reason: null },
    { openedAt: '2026-10-02T14:00:30.000Z', uaFamily: 'Other', likelyAutomated: true, reason: 'Not a known browser' },
  ] })
  const list = screen.getByRole('region', { name: 'Opens' })
  expect(within(list).getByText('Email security scanners can open links automatically. Opens marked automated are likely scanners. The marking is best effort.')).toBeInTheDocument()
  expect(within(list).getByText('Oct 2, 2026, 11:00 AM')).toBeInTheDocument()
  expect(within(list).getByText('Person')).toBeInTheDocument()
  expect(within(list).getByText('Automated')).toBeInTheDocument()
  expect(within(list).getByText('Not a known browser')).toBeInTheDocument()
  expect(within(list).getByText('1 not classified')).toBeInTheDocument()
})

test('while the report loads, the area says Loading report… and holds no frame, so no empty page enters the history (spec v1.1 §19.7)', async () => {
  let release: (r: Response) => void = () => {}
  fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { release = r }))
  const { container } = render(<OutboundEditor {...base} />)
  expect(screen.getByText('Loading report…')).toBeInTheDocument()
  expect(container.querySelector('iframe')).toBeNull()
  await act(async () => release(new Response('<p>x</p>')))
  await waitFor(() => expect(screen.queryByText('Loading report…')).not.toBeInTheDocument())
  expect(frameIn(container)).toHaveClass('bg-black')
  expect(frameIn(container).getAttribute('srcdoc')).toBe('<p>x</p>')
})

test('a brand save renames the toolbar and the frame title', async () => {
  const { iframe } = await setup()
  await fromFrame(iframe, { type: 'edit', path: 'brand', value: '  New  Co ' })
  await waitFor(() => expect(iframe).toHaveAttribute('title', 'New Co'))
  expect(screen.getByText('New Co')).toBeInTheDocument()
})

test('a failed row shows its reason in plain words with the next step', () => {
  render(<OutboundEditor {...base} status="failed" errorCode="no_data" error="No day between 2026-09-01 and 2026-09-07 has any Peec data for this project" />)
  expect(screen.getByText('Peec has no data for this project in that period. Pick other dates.')).toBeInTheDocument()
})

test('a plain in-app link outside the editor asks first while an edit is unsaved, and is left alone otherwise', async () => {
  const { iframe } = await setup()
  const seen = vi.fn((e: React.MouseEvent) => e.preventDefault())
  render(<a href="/tools" onClick={seen}>Tools</a>)
  fireEvent.click(screen.getByRole('link', { name: 'Tools' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(seen).toHaveBeenCalledTimes(1)
  await fromFrame(iframe, { type: 'dirty', path: 'headline' })
  expect(fireEvent.click(screen.getByRole('link', { name: 'Tools' }))).toBe(false)
  expect(seen).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('dialog')).toHaveTextContent('You have unsaved edits. Leave anyway?')
  expect(push).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
  expect(push).toHaveBeenCalledWith('/tools')
})

test('a generating row that becomes a draft opens the Before you send panel', async () => {
  const { rerender } = render(<OutboundEditor {...base} status="generating" notes={[]} />)
  expect(screen.queryByRole('complementary', { name: 'Before you send' })).not.toBeInTheDocument()
  rerender(<OutboundEditor {...base} status="draft" revision={1} notes={['An old note']} />)
  await waitFor(() => expect(panel()).toBeInTheDocument())
})

test('a structure the server refuses hands edit mode back to the frame and shows the error', async () => {
  patch = async () => json(400, { error: 'A list needs at least one bullet.' })
  const { iframe } = await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  await fromFrame(iframe, { type: 'structure', op: 'remove', path: 'competitive_bullets.0' })
  expect(post).toHaveBeenCalledWith({ type: 'mode', edit: false }, '*')
  await waitFor(() => expect(post).toHaveBeenLastCalledWith({ type: 'mode', edit: true }, '*'))
  expect(await screen.findByText(/A list needs at least one bullet\./)).toBeInTheDocument()
})

// Spec v1.1 18.12: one structure click at a time, and no stale index after a structure save.
const structurePatches = () => patches().map(([, init]) => JSON.parse(String(init?.body)) as { path: string }).filter((b) => b.path.endsWith('.add') || b.path.endsWith('.remove'))

test('a second structure message is dropped while the first is unfinished, so a double click on Add adds one bullet (spec v1.1 18.12)', async () => {
  let answer: (r: Response) => void = () => {}
  patch = () => new Promise<Response>((r) => { answer = r })
  const { iframe } = await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await fromFrame(iframe, { type: 'structure', op: 'add', path: 'competitive_bullets' })
  await fromFrame(iframe, { type: 'structure', op: 'add', path: 'competitive_bullets' })
  await fromFrame(iframe, { type: 'structure', op: 'remove', path: 'sources_bullets.0' })
  await waitFor(() => expect(structurePatches()).toHaveLength(1))
  await act(async () => { answer(json(200, { revision: 5, notes: [], needsValidation: [], slots: {} })) })
  await waitFor(() => expect(views()).toHaveLength(2))
  await new Promise((r) => setTimeout(r, 20))
  expect(structurePatches().map((b) => b.path)).toEqual(['competitive_bullets.add'])
})

test('after a refused structure (400) the next structure message is accepted (spec v1.1 18.12)', async () => {
  patch = async () => json(400, { error: 'A list can have at most six bullets.' })
  const { iframe } = await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await fromFrame(iframe, { type: 'structure', op: 'add', path: 'competitive_bullets' })
  expect(await screen.findByText(/at most six bullets/)).toBeInTheDocument()
  await fromFrame(iframe, { type: 'structure', op: 'remove', path: 'competitive_bullets.0' })
  await waitFor(() => expect(structurePatches().map((b) => b.path)).toEqual(['competitive_bullets.add', 'competitive_bullets.0.remove']))
})

test('a structure message during a retry backoff is dropped; after the retry lands with 200 the next is accepted (spec v1.1 18.12)', async () => {
  const answers = [json(503, { error: 'unavailable' }), json(200, { revision: 5, notes: [], needsValidation: [], slots: {} }), json(200, { revision: 6, notes: [], needsValidation: [], slots: {} })]
  patch = async () => answers.shift()!
  const { iframe, container } = await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await fromFrame(iframe, { type: 'structure', op: 'add', path: 'competitive_bullets' })
  await waitFor(() => expect(screen.getByText(/Couldn't save, retrying/)).toBeInTheDocument())
  await fromFrame(iframe, { type: 'structure', op: 'add', path: 'sources_bullets' })
  await waitFor(() => expect(views()).toHaveLength(2), { timeout: 3000 })
  expect(structurePatches().map((b) => b.path)).toEqual(['competitive_bullets.add', 'competitive_bullets.add'])
  // The reloaded report is a new frame (spec v1.1 §19.7); its next click is accepted.
  await waitFor(() => expect(frameIn(container)).not.toBe(iframe))
  const next = frameIn(container)
  await fromFrame(next, { type: 'ready' })
  await fromFrame(next, { type: 'structure', op: 'add', path: 'sources_bullets' })
  await waitFor(() => expect(structurePatches().map((b) => b.path)).toEqual(['competitive_bullets.add', 'competitive_bullets.add', 'sources_bullets.add']))
})

test('between a structure 200 and the new frame\'s ready, no edit mode reaches the frame; ready then hands it back (spec v1.1 18.12)', async () => {
  patch = async () => json(200, { revision: 5, notes: [], needsValidation: [], slots: {} })
  const { iframe, container } = await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  await fromFrame(iframe, { type: 'structure', op: 'remove', path: 'competitive_bullets.4' })
  expect(post).toHaveBeenLastCalledWith({ type: 'mode', edit: false }, '*')
  await waitFor(() => expect(views()).toHaveLength(2))
  await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull())
  await new Promise((r) => setTimeout(r, 20))
  expect(post.mock.calls.filter(([m]) => (m as { type?: string; edit?: boolean }).type === 'mode' && (m as { edit?: boolean }).edit === true)).toEqual([])
  // The reloaded report is a new frame element (spec v1.1 §19.7). Switching modes before its ready hands it no edit mode.
  await waitFor(() => expect(frameIn(container)).not.toBe(iframe))
  const next = frameIn(container)
  const nextPost = vi.spyOn(next.contentWindow!, 'postMessage')
  fireEvent.click(screen.getByRole('button', { name: 'Done editing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const editOn = (spy: typeof post) => spy.mock.calls.filter(([m]) => (m as { type?: string; edit?: boolean }).type === 'mode' && (m as { edit?: boolean }).edit === true)
  expect(editOn(post)).toEqual([])
  expect(editOn(nextPost)).toEqual([])
  await fromFrame(next, { type: 'ready' })
  expect(nextPost).toHaveBeenLastCalledWith({ type: 'mode', edit: true }, '*')
})

test('Approve is not offered on an unreadable draft', () => {
  render(<OutboundEditor {...base} unreadable />)
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
})

test('D7: 200 opens show the cap line; 199 do not', async () => {
  const open = (i: number) => ({ openedAt: new Date(Date.UTC(2026, 9, 2, 15, 0, 0) - i * 60_000).toISOString(), uaFamily: 'Chrome on Mac', likelyAutomated: false, reason: null })
  await setup({ status: 'live', token: 'tok_123', openCount: 200, opens: Array.from({ length: 200 }, (_, i) => open(i)) })
  expect(screen.getByText('Showing the latest 200 opens.')).toBeInTheDocument()
  cleanup()
  await setup({ status: 'live', token: 'tok_123', openCount: 199, opens: Array.from({ length: 199 }, (_, i) => open(i)) })
  expect(screen.queryByText('Showing the latest 200 opens.')).not.toBeInTheDocument()
})

test('D8: the copied link uses the brand as saved in this session, not the stale prop', async () => {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  actions.approveSnapshotAction.mockResolvedValue({ ok: true, token: 'tok_123' })
  const { iframe } = await setup({ linkBrand: 'Acme', shareOrigin: 'https://reporting.avenuez.com' })
  await fromFrame(iframe, { type: 'edit', path: 'brand', value: '  Renamed   Co ' })
  await waitFor(() => expect(iframe).toHaveAttribute('title', 'Renamed Co'))
  fireEvent.click(approveBtn())
  await screen.findByRole('dialog')
  fireEvent.change(screen.getByLabelText('Who is this for?'), { target: { value: 'Jane Doe, Acme' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve and create link' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://reporting.avenuez.com/snapshot/renamed-co-tok_123'))
})

test('Minimize closes the panel and leaves a pill with the current count; the pill reopens it', async () => {
  await setup({ needsValidation: ['market', 'category'] })
  expect(screen.queryByRole('button', { name: /^Show Before you send/ })).not.toBeInTheDocument()
  fireEvent.click(within(panel()).getByRole('button', { name: 'Minimize' }))
  expect(screen.queryByRole('complementary', { name: 'Before you send' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^Show Before you send \(3\)$/ }))
  expect(panel()).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Show Before you send/ })).not.toBeInTheDocument()
})

test.each(['live', 'revoked'] as const)('a %s report has no Before you send pill when the panel is closed', async (status) => {
  await setup({ status, token: 'tok_123', needsValidation: ['market'] })
  expect(screen.queryByRole('complementary', { name: 'Before you send' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Show Before you send/ })).not.toBeInTheDocument()
})

// Spec v1.1 §19.7: the editor never loses or stalls.
test('each report load is a new frame element created with its report, and a bullet change reloads into a new one', async () => {
  patch = async () => json(200, { revision: 5, notes: [], needsValidation: [], slots: {} })
  const { iframe, container } = await setup()
  expect(container.querySelectorAll('iframe')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await fromFrame(iframe, { type: 'structure', op: 'add', path: 'competitive_bullets' })
  await waitFor(() => expect(views()).toHaveLength(2))
  await waitFor(() => expect(frameIn(container)).not.toBe(iframe))
  expect(container.querySelectorAll('iframe')).toHaveLength(1)
  expect(frameIn(container).getAttribute('srcdoc')).toContain('/view')
})

test('the queue adopts the revision the view rendered, so an editor reopened from the cache saves against the current row (A1)', async () => {
  viewRevision = 9
  const { iframe } = await setup({ revision: 4 })
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'H' })
  await waitFor(() => expect(patches()).toHaveLength(1))
  expect(JSON.parse(String(patches()[0][1]?.body))).toMatchObject({ revision: 9 })
  // Adopting is not a save: the toolbar does not say Saved before anything was saved.
  cleanup(); fetchMock.mockClear()
  viewRevision = 9
  await setup({ revision: 4 })
  expect(screen.queryByText('Saved')).toBeNull()
})

// Paul's review of #388 (C5): refresh only when the page's props are older than the report the view rendered (the Back
// case, A1), only on the first load, and only for a draft; a normal open renders once.
test('a draft refreshes its page data on open only when the view rendered a newer revision than its props (A1)', async () => {
  viewRevision = 4
  await setup({ revision: 4 })
  expect(refresh).not.toHaveBeenCalled()
  cleanup(); refresh.mockReset(); fetchMock.mockClear()
  viewRevision = 9
  const { iframe } = await setup({ revision: 4 })
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  // A bullet change reloads the view (still revision 9 here, props still 4): no second refresh.
  patch = async () => json(200, { revision: 10, notes: [], needsValidation: [] })
  await fromFrame(iframe, { type: 'structure', op: 'add', path: 'competitive_bullets' })
  await waitFor(() => expect(views()).toHaveLength(2))
  expect(refresh).toHaveBeenCalledTimes(1)
  cleanup(); refresh.mockReset()
  viewRevision = 9
  await setup({ status: 'live', token: 'tok_1', revision: 4 })
  expect(refresh).not.toHaveBeenCalled()
})

// Paul's review of #388 (C5): a refresh that answers with a revision older than a save this page already made never
// resets the panel, so a filled item does not come back.
test('server props older than a save this page made never reset the panel; newer ones still do', async () => {
  const { iframe, rerender } = await setup({ revision: 4, needsValidation: ['market'] })
  expect(screen.getByRole('button', { name: 'Before you send (2)' })).toBeInTheDocument()
  patch = async () => json(200, { revision: 6, notes: [], needsValidation: [] })
  await fromFrame(iframe, { type: 'edit', path: 'market', value: 'United States' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Before you send (0)' })).toBeInTheDocument())
  rerender(<OutboundEditor {...base} revision={5} needsValidation={['market']} />)
  expect(screen.getByRole('button', { name: 'Before you send (0)' })).toBeInTheDocument()
  rerender(<OutboundEditor {...base} revision={7} needsValidation={['market']} />)
  expect(screen.getByRole('button', { name: 'Before you send (2)' })).toBeInTheDocument()
})

test('the report load retries a 503 twice, after 1 and 2 seconds, before showing its error', async () => {
  // A fully fake clock, stepped exactly, so the test does not depend on how busy the machine is.
  vi.useFakeTimers()
  let n = 0
  viewAnswer = () => (++n <= 2 ? new Response('Unavailable', { status: 503 }) : new Response('<p>ok</p>'))
  const { container } = render(<OutboundEditor {...base} />)
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(n).toBe(1)
  await act(() => vi.advanceTimersByTimeAsync(999))
  expect(n).toBe(1)
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(n).toBe(2)
  await act(() => vi.advanceTimersByTimeAsync(1999))
  expect(n).toBe(2)
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(n).toBe(3)
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(frameIn(container)?.getAttribute('srcdoc')).toBe('<p>ok</p>')
  cleanup()
  n = 0
  viewAnswer = () => { n++; return new Response('Unavailable', { status: 503 }) }
  render(<OutboundEditor {...base} />)
  await act(() => vi.advanceTimersByTimeAsync(3000))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(n).toBe(3)
  expect(screen.getByText('Lost connection.')).toBeInTheDocument()
})

test('a stopped queue makes the frame read-only, and Edit cannot hand it edit mode back', async () => {
  patch = async () => json(409, { error: 'stale', revision: 9 })
  const { iframe } = await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'x' })
  expect(await screen.findByText('This snapshot changed. Reload.')).toBeInTheDocument()
  await waitFor(() => expect(post).toHaveBeenLastCalledWith({ type: 'mode', edit: false }, '*'))
  fireEvent.click(screen.getByRole('button', { name: 'Done editing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  expect(post).toHaveBeenLastCalledWith({ type: 'mode', edit: false }, '*')
})

test('after a bullet change the new frame is sent back to where Ryan had scrolled', async () => {
  patch = async () => json(200, { revision: 5, notes: [], needsValidation: [], slots: {} })
  const { iframe, container } = await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await fromFrame(iframe, { type: 'scroll', y: 1840 })
  await fromFrame(iframe, { type: 'structure', op: 'add', path: 'sources_bullets' })
  await waitFor(() => expect(frameIn(container)).not.toBe(iframe))
  const next = frameIn(container)
  const post = vi.spyOn(next.contentWindow!, 'postMessage')
  await fromFrame(next, { type: 'ready' })
  expect(post).toHaveBeenCalledWith({ type: 'scroll', y: 1840 }, '*')
  // A later ready (no bullet change since) sends no scroll.
  post.mockClear()
  await fromFrame(next, { type: 'ready' })
  expect(post.mock.calls.some(([m]) => (m as { type?: string }).type === 'scroll')).toBe(false)
})

test('Approve\'s tooltip names the real reason: the refused field, the stop, else saving', async () => {
  patch = async () => json(400, { error: "This field can't be empty." })
  const { iframe } = await setup()
  await fromFrame(iframe, { type: 'dirty', path: 'headline' })
  expect(approveBtn()).toHaveAttribute('title', 'Saving. Try again in a moment.')
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: '' })
  await waitFor(() => expect(approveBtn()).toHaveAttribute('title', "Headline: This field can't be empty."))
  cleanup()
  patch = async () => json(409, { error: 'stale', revision: 9 })
  const again = await setup()
  await fromFrame(again.iframe, { type: 'edit', path: 'why', value: 'x' })
  await waitFor(() => expect(approveBtn()).toHaveAttribute('title', 'This snapshot changed. Reload.'))
})

test('the Fill in message follows the count and clears at zero', async () => {
  const { iframe } = await setup({ needsValidation: ['market', 'category'] })
  fireEvent.click(approveBtn())
  expect(await screen.findByText('Fill in 2 items first')).toBeInTheDocument()
  patch = async () => json(200, { revision: 5, notes: [], needsValidation: ['market'] })
  await fromFrame(iframe, { type: 'edit', path: 'category', value: 'Senior care' })
  expect(await screen.findByText('Fill in 1 item first')).toBeInTheDocument()
  patch = async () => json(200, { revision: 6, notes: [], needsValidation: [] })
  await fromFrame(iframe, { type: 'edit', path: 'market', value: 'United States' })
  await waitFor(() => expect(screen.queryByText(/^Fill in \d/)).toBeNull())
  // Once cleared it stays cleared: an item that comes back later does not bring the message back unasked.
  patch = async () => json(200, { revision: 7, notes: [], needsValidation: ['market'] })
  await fromFrame(iframe, { type: 'edit', path: 'market', value: 'Needs validation' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Before you send (1)' })).toBeInTheDocument())
  expect(screen.queryByText(/^Fill in \d/)).toBeNull()
})

// Spec 2026-10-14 editor space (#396): the editor uses the whole screen.
const root = (c: HTMLElement) => c.querySelector(`[${EDITOR_MARKER}]`) as HTMLElement

test('#396: the editor marks its root in every status, so the tools layout drops its width cap only here', async () => {
  for (const over of [{}, { status: 'live' as const, token: 'tok' }, { status: 'revoked' as const }, { status: 'generating' as const }, { status: 'failed' as const }, { unreadable: true }]) {
    const { container } = await setup(over)
    expect(root(container)).not.toBeNull()
    cleanup()
  }
})

test('#396: the frame and the loading box fill the screen under the toolbar, floored at 320px', async () => {
  const { container } = render(<OutboundEditor {...base} />)
  const loading = screen.getByText(LOADING_REPORT)
  expect(loading.style.height).toBe('calc(100vh - var(--aeo-toolbar-h, 108px) - 32px)')
  expect(loading.style.minHeight).toBe('320px')
  await waitFor(() => expect(frameIn(container)).not.toBeNull())
  expect(frameIn(container).style.height).toBe('calc(100vh - var(--aeo-toolbar-h, 108px) - 32px)')
  expect(frameIn(container).style.minHeight).toBe('320px')
})

test('#396: the 32px in the frame height is the toolbar\'s mb-4 above and the root\'s pb-4 below, both in the editor', async () => {
  const { container } = await setup()
  expect(root(container).className.split(' ')).toContain('pb-4')
  expect((root(container).firstElementChild as HTMLElement).className.split(' ')).toContain('mb-4')
})

test('#396: the toolbar height follows the toolbar, measured as its border box, and stops being watched on unmount', async () => {
  let height = 51
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height, width: 0, top: 0, left: 0, bottom: height, right: 0, x: 0, y: 0, toJSON: () => ({}) }))
  const watchers: { cb: () => void; disconnect: ReturnType<typeof vi.fn>; watched: { el: Element; box?: string }[] }[] = []
  vi.stubGlobal('ResizeObserver', class {
    cb: () => void; disconnect = vi.fn(); watched: { el: Element; box?: string }[] = []
    constructor(cb: () => void) { this.cb = cb; watchers.push(this) }
    observe(el: Element, opts?: { box?: string }) { this.watched.push({ el, box: opts?.box }) }
    unobserve() {}
  })
  const { container, unmount } = await setup()
  expect(root(container).style.getPropertyValue('--aeo-toolbar-h')).toBe('51px')
  // The toolbar, by its border box, so a change to its padding or border is seen too, not only its content. Other
  // observers in the tree, if any are added later, do not matter here (Paul, #399 review).
  const toolbar = root(container).firstElementChild
  expect(watchers.flatMap((w) => w.watched).filter((x) => x.el === toolbar)).toEqual([{ el: toolbar, box: 'border-box' }])
  height = 75
  act(() => { for (const w of watchers) w.cb() })
  expect(root(container).style.getPropertyValue('--aeo-toolbar-h')).toBe('75px')
  unmount()
  expect(watchers.length).toBeGreaterThan(0)
  expect(watchers.every((w) => w.disconnect.mock.calls.length === 1)).toBe(true)
})

test('#396: without ResizeObserver nothing is measured, so the frame keeps the old 140px height', async () => {
  expect(typeof ResizeObserver).toBe('undefined')
  const { container } = await setup()
  expect(root(container).style.getPropertyValue('--aeo-toolbar-h')).toBe('')
})

test('#396 (Paul, #399): the 3s locked message floats just under the toolbar, out of its flow, so it never resizes the report', async () => {
  const { container, iframe } = await setup()
  await fromFrame(iframe, { type: 'locked', what: 'chart' })
  const message = screen.getByText(/^Charts come from Peec data/)
  // A child of the measured toolbar, positioned against it: absolute, so the toolbar's height (and the frame's) stays put.
  expect(message.parentElement).toBe(root(container).firstElementChild)
  expect(message.className.split(' ')).toEqual(expect.arrayContaining(['absolute', 'top-full']))
  expect(message).toHaveAttribute('role', 'status')
})
