import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { StoredNote } from '@/lib/aeo-outbound/notes'
import { RECIPIENT_ERROR } from '@/lib/aeo-outbound/recipient'
import { OutboundEditor } from './editor'

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
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let patch: () => Promise<Response>
let progress: (url: string) => Promise<Response> = async () => json(200, { step: null })
let generateAnswer: () => Promise<Response> = async () => json(200, { id: NEW_ID, status: 'draft' })
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  if (url.startsWith(`/api/aeo-outbound/reports/${ID}/view`)) return new Response(`<p>${url}</p>`, { status: 200 })
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
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function setup(over: Partial<Props> = {}) {
  const utils = render(<OutboundEditor {...base} {...over} />)
  const iframe = utils.container.querySelector('iframe')
  if (iframe) await waitFor(() => expect(iframe.getAttribute('srcdoc')).toContain('/view'))
  return { ...utils, iframe: iframe as HTMLIFrameElement }
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
  expect(JSON.parse(String(patches()[0][1]?.body))).toEqual({ path: 'headline', value: 'Hi', revision: 4 })
  expect(patches()[0][1]?.method).toBe('PATCH')
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
  const box = screen.getByRole('status', { name: 'Generation progress' })
  expect(within(box).getByText('Finding the days with data…')).toBeInTheDocument()
  expect(within(box).getByText('0:18')).toBeInTheDocument()
  expect(within(box).getByText('Usually 35 to 45 seconds')).toBeInTheDocument()
  expect(within(box).getByText('Keep this tab open until it finishes.')).toBeInTheDocument()
  expect(container.querySelector('iframe')).toBeNull()
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(within(box).getByText('Loading the sources AI used…')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith(`/api/aeo-outbound/progress?id=${ID}`, { cache: 'no-store' })
  const before = refresh.mock.calls.length
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(refresh.mock.calls.length).toBe(before + 1)
  expect(fetchMock.mock.calls.filter(([u]) => u.includes('/view'))).toHaveLength(0)
})

test("while the editor's Rerun request runs, the checklist replaces the action bar and polls by project (spec v1.1 §16.3)", async () => {
  let release: (r: Response) => void = () => {}
  generateAnswer = () => new Promise<Response>((r) => { release = r })
  progress = async () => json(200, { id: NEW_ID, step: 3, createdAt: new Date(Date.now() + 1000).toISOString() })
  await setup({ status: 'failed', errorCode: 'no_data', error: 'x' })
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  const box = await screen.findByRole('status', { name: 'Generation progress' })
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
  expect(screen.getByText('Charts come from Peec data. Change the dates and Rerun to update them.')).toBeInTheDocument()
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
    { path: 'headline', value: 'H', revision: 4 },
    { path: 'competitive_bullets.add', value: 'structure', revision: 5 },
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

test('while the report loads, the frame area is black and says Loading report…', async () => {
  let release: (r: Response) => void = () => {}
  fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { release = r }))
  const { container } = render(<OutboundEditor {...base} />)
  expect(screen.getByText('Loading report…')).toBeInTheDocument()
  expect(container.querySelector('iframe')).toHaveClass('bg-black')
  await act(async () => release(new Response('<p>x</p>')))
  await waitFor(() => expect(screen.queryByText('Loading report…')).not.toBeInTheDocument())
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
  patch = async () => json(400, { error: 'Keep at least two bullets.' })
  const { iframe } = await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  await fromFrame(iframe, { type: 'structure', op: 'remove', path: 'competitive_bullets.0' })
  expect(post).toHaveBeenCalledWith({ type: 'mode', edit: false }, '*')
  await waitFor(() => expect(post).toHaveBeenLastCalledWith({ type: 'mode', edit: true }, '*'))
  expect(await screen.findByText(/Keep at least two bullets\./)).toBeInTheDocument()
})

test('Approve is not offered on an unreadable draft', () => {
  render(<OutboundEditor {...base} unreadable />)
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
})
