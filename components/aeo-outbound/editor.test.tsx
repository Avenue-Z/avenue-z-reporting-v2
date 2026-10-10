import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  if (url.startsWith(`/api/aeo-outbound/reports/${ID}/view`)) return new Response(`<p>${url}</p>`, { status: 200 })
  if (url === `/api/aeo-outbound/reports/${ID}/slots`) return patch()
  if (url === '/api/aeo-outbound/generate') return json(200, { id: NEW_ID, status: 'draft' })
  throw new Error(`unexpected fetch ${url}`)
})
const patches = () => fetchMock.mock.calls.filter(([u]) => u.endsWith('/slots'))
const views = () => fetchMock.mock.calls.filter(([u]) => u.includes('/view')).map(([u]) => u)

type Props = Parameters<typeof OutboundEditor>[0]
const base: Props = {
  id: ID, brand: 'Acme', projectId: 'p1', status: 'draft', revision: 4,
  notes: ['Window used: Sep 1, 2026 to Sep 30, 2026'], needsValidation: [], token: null, error: null,
}

beforeEach(() => {
  refresh.mockReset(); push.mockReset(); fetchMock.mockClear()
  Object.values(actions).forEach((a) => a.mockReset())
  patch = async () => json(200, { revision: 5, notes: ['Window used: Sep 1, 2026 to Sep 30, 2026'], needsValidation: [] })
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
  expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
  expect(views()).toEqual([`/api/aeo-outbound/reports/${ID}/view`])
  expect(screen.getByRole('link', { name: 'Open full size' })).toHaveAttribute('href', `/api/aeo-outbound/reports/${ID}/view?mode=preview`)
  expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/tools/new-business')
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

test('Approve is disabled while Needs validation remains, and enables after a save returns none', async () => {
  const { iframe } = await setup({ needsValidation: ['headline'] })
  expect(approveBtn()).toBeDisabled()
  expect(approveBtn()).toHaveAttribute('title', 'Fill in every "Needs validation" first.')
  await fromFrame(iframe, { type: 'dirty', path: 'headline' })
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'Checked headline' })
  await waitFor(() => expect(approveBtn()).toBeEnabled())
})

test("a save's response replaces the notes in the drawer", async () => {
  patch = async () => json(200, { revision: 5, notes: ['The copy says 41% but the data says 40%'], needsValidation: [] })
  const { iframe } = await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
  expect(screen.getByText('Window used: Sep 1, 2026 to Sep 30, 2026')).toBeInTheDocument()
  await fromFrame(iframe, { type: 'edit', path: 'summary', value: 'x' })
  expect(await screen.findByText('The copy says 41% but the data says 40%')).toBeInTheDocument()
  expect(screen.queryByText('Window used: Sep 1, 2026 to Sep 30, 2026')).not.toBeInTheDocument()
})

test('a 400 names the refused field in the save state', async () => {
  patch = async () => json(400, { error: 'Keep this under 80 characters.' })
  const { iframe } = await setup()
  await fromFrame(iframe, { type: 'dirty', path: LEAD })
  await fromFrame(iframe, { type: 'edit', path: LEAD, value: 'x'.repeat(81) })
  expect(await screen.findByText(`${LEAD}: Keep this under 80 characters.`)).toBeInTheDocument()
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
  const confirm = screen.getByRole('button', { name: 'Confirm' })
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
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
})

test.each([
  [{ ok: false, error: RECIPIENT_ERROR }, RECIPIENT_ERROR],
  [{ ok: false, error: 'Fill in every "Needs validation" first.' }, 'Fill in every "Needs validation" first.'],
  [{ ok: false, error: 'stale' }, 'This snapshot changed. Reload.'],
  [{ ok: false, error: 'not found' }, 'This snapshot no longer exists.'],
])('an approve refusal shows its message in the dialog (%o)', async (result, text) => {
  actions.approveSnapshotAction.mockResolvedValue(result)
  await openDialog()
  fireEvent.change(screen.getByLabelText('Who is this for?'), { target: { value: 'Jane Doe, Acme' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  const dialog = screen.getByRole('dialog')
  await waitFor(() => expect(dialog).toHaveTextContent(text))
})

test('Rerun posts the project and this id to generate and opens the new draft', async () => {
  await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${NEW_ID}`))
  expect(fetchMock).toHaveBeenCalledWith('/api/aeo-outbound/generate', { method: 'POST', body: JSON.stringify({ projectId: 'p1', rerunOf: ID }) })
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
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/snapshot/tok_123`)
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit a copy' })).toBeInTheDocument()
})

test('Revoke confirms, calls the action and refreshes', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  actions.revokeSnapshotAction.mockResolvedValue({ ok: true })
  await setup({ status: 'live', token: 'tok_123' })
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  expect(window.confirm).toHaveBeenCalledWith('Revoke this link? The link stops working immediately and permanently.')
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

test('a generating snapshot shows the wait message and refreshes every 5s', async () => {
  vi.useFakeTimers()
  const { container } = render(<OutboundEditor {...base} status="generating" />)
  expect(screen.getByText('Generating. This takes about a minute.')).toBeInTheDocument()
  expect(container.querySelector('iframe')).toBeNull()
  await act(() => vi.advanceTimersByTimeAsync(10_000))
  expect(refresh).toHaveBeenCalledTimes(2)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('a failed snapshot shows its reason with Rerun and Discard and no iframe', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  actions.discardSnapshotAction.mockResolvedValue({ ok: true })
  const { container } = render(<OutboundEditor {...base} status="failed" error="Timed out at step 4" />)
  expect(screen.getByText('Timed out at step 4')).toBeInTheDocument()
  expect(container.querySelector('iframe')).toBeNull()
  expect(screen.getByRole('button', { name: 'Rerun' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(window.confirm).toHaveBeenCalledWith('Discard this snapshot? This removes it from the hub.')
  await waitFor(() => expect(actions.discardSnapshotAction).toHaveBeenCalledWith(ID))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/tools/new-business'))
})
