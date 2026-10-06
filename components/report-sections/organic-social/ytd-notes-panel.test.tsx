import { beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

const actions = vi.hoisted(() => ({
  saveChartNoteAction: vi.fn(async () => ({ ok: true })),
  approveChartNoteAction: vi.fn(async () => ({ ok: true })),
  revokeChartNoteAction: vi.fn(async () => ({ ok: true })),
  deleteChartNoteDraftAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/app/actions/chart-notes', () => actions)
const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { YtdNotesPanel } from './ytd-notes-panel'
import type { YtdGraphNotes, YtdNoteControls } from './parts/ytd-notes'

// Every slug, id and text is invented. Spec 2026-10-06-os-ytd-notes-design.md.
const MONTHS = [{ key: '2026-07', label: 'Jul' }, { key: '2026-08', label: 'Aug' }, { key: '2026-09', label: 'Sep' }]
const CONTROLS: YtdNoteControls = { clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'ytd-followers', canApprove: false, months: MONTHS }
const DRAFT = { key: '2026-07', label: 'Jul', text: null, editor: { approvedId: null, approvedPostIds: [], draft: { id: 'd1', text: 'Draft July', postIds: [] } } }
const APPROVED = { key: '2026-08', label: 'Aug', text: 'Approved August', editor: { approvedId: 'a1', approvedPostIds: [], draft: null } }
const EDITOR_NOTES: YtdGraphNotes = { notes: { Aug: 'Approved August' }, marks: [{ x: 'Aug' }], panel: [DRAFT, APPROVED], controls: CONTROLS }

beforeEach(() => {
  vi.clearAllMocks()
  actions.saveChartNoteAction.mockResolvedValue({ ok: true })
})

test('a client with nothing off a point sees nothing at all, and no router is needed', () => {
  const { container } = render(<YtdNotesPanel notes={{ notes: { Aug: 'x' }, marks: [{ x: 'Aug' }], panel: [] }} title="Follower Growth, Year to Date" />)
  expect(container.innerHTML).toBe('')
})

test('a client sees each off-point approved note as a printable line, with no buttons', () => {
  render(<YtdNotesPanel notes={{ panel: [{ key: '2026-01', label: 'Jan', text: 'Approved January' }] }} title="Views, Year to Date" />)
  const list = screen.getByRole('list', { name: 'Notes on Views, Year to Date' })
  expect(within(list).getByText('Jan: Approved January')).toBeTruthy()
  expect(list.closest('.no-print')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
})

test('an editor sees every noted month with its approved text, its draft, and the existing note buttons', () => {
  render(<YtdNotesPanel notes={EDITOR_NOTES} title="Follower Growth, Year to Date" />)
  expect(screen.getByText('Approved August')).toBeTruthy()
  expect(screen.getByText('Draft: Draft July')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Edit note' })).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Delete draft' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull() // not an approver
})

test('an approver also gets Approve on a draft and Revoke on an approved note, acting on the month\'s 1st', async () => {
  render(<YtdNotesPanel notes={{ ...EDITOR_NOTES, controls: { ...CONTROLS, canApprove: true } }} title="T" />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Approve' })) })
  expect(actions.approveChartNoteAction).toHaveBeenCalledWith('a-client', 'd1', { text: 'Draft July', postIds: [] })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Revoke' })) })
  expect(actions.revokeChartNoteAction).toHaveBeenCalledWith('a-client', 'a1')
  expect(refresh).toHaveBeenCalled()
})

test('Add annotation offers every month of the block and saves a draft on the month\'s 1st, with no posts', async () => {
  render(<YtdNotesPanel notes={EDITOR_NOTES} title="Follower Growth, Year to Date" />)
  fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
  const month = screen.getByRole('combobox', { name: 'Month' }) as HTMLSelectElement
  expect([...month.options].map((o) => o.textContent)).toEqual(['Pick a month', 'Jul', 'Aug', 'Sep'])
  fireEvent.change(month, { target: { value: '2026-09' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Note text' }), { target: { value: '  Campaign launched  ' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft' })) })
  expect(actions.saveChartNoteAction).toHaveBeenCalledWith({
    clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'ytd-followers', day: '2026-09-01', body: '  Campaign launched  ', postIds: [],
  })
  expect(refresh).toHaveBeenCalled()
  expect(screen.getByRole('status').textContent).toBe("Saved a draft for Sep. Clients see it once it's approved.")
})

test('Save draft waits for a month and some text', () => {
  render(<YtdNotesPanel notes={EDITOR_NOTES} title="T" />)
  fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
  const save = screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement
  expect(save.disabled).toBe(true)
  fireEvent.change(screen.getByRole('combobox', { name: 'Month' }), { target: { value: '2026-09' } })
  expect(save.disabled).toBe(true)
  fireEvent.change(screen.getByRole('textbox', { name: 'Note text' }), { target: { value: 'x' } })
  expect(save.disabled).toBe(false)
})

test('choosing a month that already has a note says what saving will do', () => {
  render(<YtdNotesPanel notes={EDITOR_NOTES} title="T" />)
  fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Month' }), { target: { value: '2026-07' } })
  expect(screen.getByText('Jul already has a draft. Saving updates it.')).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox', { name: 'Month' }), { target: { value: '2026-08' } })
  expect(screen.getByText('Aug already has an approved note. Saving drafts a change to it.')).toBeTruthy()
})

test('the line after a save says what the month had, and tells an approver where to approve', async () => {
  render(<YtdNotesPanel notes={{ ...EDITOR_NOTES, controls: { ...CONTROLS, canApprove: true } }} title="T" />)
  fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Month' }), { target: { value: '2026-07' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Note text' }), { target: { value: 'Better' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft' })) })
  expect(screen.getByRole('status').textContent).toBe("Updated the draft for Jul. Clients see it once it's approved. Approve it in the list below.")
})

test('Edit opens the form fixed to that month, filled with its draft, else its approved text', () => {
  render(<YtdNotesPanel notes={EDITOR_NOTES} title="T" />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit note' })[1]) // August, approved only
  expect(screen.queryByRole('combobox', { name: 'Month' })).toBeNull()
  expect(screen.getByText('Note for Aug')).toBeTruthy()
  expect((screen.getByRole('textbox', { name: 'Note text' }) as HTMLInputElement).value).toBe('Approved August')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit note' })[0]) // July, draft
  expect((screen.getByRole('textbox', { name: 'Note text' }) as HTMLInputElement).value).toBe('Draft July')
})

test('after a save, that month\'s Approve, Revoke and Delete wait until the refreshed answer arrives', async () => {
  const notes = { ...EDITOR_NOTES, controls: { ...CONTROLS, canApprove: true } }
  const { rerender } = render(<YtdNotesPanel notes={notes} title="T" />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit note' })[0])
  fireEvent.change(screen.getByRole('textbox', { name: 'Note text' }), { target: { value: 'Changed' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft' })) })
  expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
  rerender(<YtdNotesPanel notes={{ ...notes, panel: [...notes.panel] }} title="T" />)
  expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false)
})

test('a failed save shows its message and keeps the form open', async () => {
  actions.saveChartNoteAction.mockResolvedValue({ ok: false, error: "That month is before this client's first reporting year." } as never)
  render(<YtdNotesPanel notes={EDITOR_NOTES} title="T" />)
  fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Month' }), { target: { value: '2026-09' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Note text' }), { target: { value: 'x' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft' })) })
  expect(screen.getByRole('alert').textContent).toBe("That month is before this client's first reporting year.")
  expect(screen.getByRole('textbox', { name: 'Note text' })).toBeTruthy()
  expect(refresh).not.toHaveBeenCalled()
})

test('the editor controls never print', () => {
  const { container } = render(<YtdNotesPanel notes={EDITOR_NOTES} title="T" />)
  expect(container.firstElementChild?.className).toContain('no-print')
})
