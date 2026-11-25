// The notes under a Social Listening graph (plan 2026-11-24, Unit E). Every slug, id and text is invented.
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

import { SlNotesPanel } from './notes-panel'
import type { SlChartNotes } from '@/lib/organic-social/social-listening/notes'

const MARK = { at: '2026-10-14', n: 1, label: 'Oct 14', text: 'AMA went live' }
const OPTIONS = [{ key: '2026-10-13', label: 'Oct 13' }, { key: '2026-10-14', label: 'Oct 14' }]
const EDITOR: SlChartNotes = {
  marks: [MARK],
  panel: [
    { key: '2026-10-13', label: 'Oct 13', n: null, text: null, editor: { approvedId: null, approvedPostIds: [], draft: { id: 'd1', text: 'Draft note', postIds: [] } } },
    { key: '2026-10-14', label: 'Oct 14', n: 1, text: 'AMA went live', editor: { approvedId: 'a1', approvedPostIds: [], draft: null } },
  ],
  controls: { clientSlug: 'a-client', chart: 'sl-b-daily', canApprove: true, options: OPTIONS },
}

beforeEach(() => { vi.clearAllMocks(); actions.saveChartNoteAction.mockResolvedValue({ ok: true }) })

test('a graph with no note shows nothing under it', () => {
  const { container } = render(<SlNotesPanel notes={{ marks: [], panel: [] }} title="Results over time" />)
  expect(container.innerHTML).toBe('')
})

test('a client sees each approved note numbered as its mark, as one printable block each, with no buttons', () => {
  render(<SlNotesPanel notes={{ marks: [MARK, { at: '2026-10-20', n: 2, label: 'Oct 20', text: 'Press' }], panel: [] }} title="Results over time" />)
  const list = screen.getByRole('list', { name: 'Notes on Results over time' })
  const items = within(list).getAllByRole('listitem')
  expect(items.map((i) => i.textContent)).toEqual(['1Oct 14: AMA went live', '2Oct 20: Press'])
  expect(items.every((i) => i.hasAttribute('data-export-block'))).toBe(true)
  expect(screen.queryByRole('button')).toBeNull()
})

test('an editor sees every noted day with its number, its approved text, its draft and the note buttons', () => {
  render(<SlNotesPanel notes={EDITOR} title="Results over time" />)
  expect(screen.getByText('AMA went live')).toBeTruthy()
  expect(screen.getByText('Draft: Draft note')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Add annotation' }).closest('.no-print')).not.toBeNull()
})

test("Add annotation saves a draft on the picked day, under Social Listening's channel, with no posts", async () => {
  render(<SlNotesPanel notes={EDITOR} title="Results over time" />)
  fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Day' }), { target: { value: '2026-10-14' } })
  expect(screen.getByText('Oct 14 already has an approved note. Saving drafts a change to it.')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: 'Note text' }), { target: { value: 'Reddit AMA' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft' })) })
  expect(actions.saveChartNoteAction).toHaveBeenCalledWith({ clientSlug: 'a-client', channel: 'SOCIAL_LISTENING', chart: 'sl-b-daily', day: '2026-10-14', body: 'Reddit AMA', postIds: [] })
  expect(refresh).toHaveBeenCalled()
  expect(screen.getByRole('status').textContent).toContain('Saved a draft for Oct 14.')
})

test('a month graph saves on the month\'s 1st and asks for a month', async () => {
  const notes: SlChartNotes = { marks: [], panel: [], controls: { clientSlug: 'a-client', chart: 'sl-b-ytd', canApprove: false, options: [{ key: '2026-10', label: 'Oct' }] } }
  render(<SlNotesPanel notes={notes} title="Sentiment" />)
  fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Month' }), { target: { value: '2026-10' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Note text' }), { target: { value: 'AMA month' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft' })) })
  expect(actions.saveChartNoteAction).toHaveBeenCalledWith(expect.objectContaining({ chart: 'sl-b-ytd', day: '2026-10-01', postIds: [] }))
})

test('a refused save shows the reason and keeps the form open', async () => {
  actions.saveChartNoteAction.mockResolvedValueOnce({ ok: false, error: 'That day has not happened yet.' } as never)
  render(<SlNotesPanel notes={EDITOR} title="Results over time" />)
  fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Day' }), { target: { value: '2026-10-13' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Note text' }), { target: { value: 'x' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft' })) })
  expect(screen.getByRole('alert').textContent).toBe('That day has not happened yet.')
  expect(refresh).not.toHaveBeenCalled()
})
