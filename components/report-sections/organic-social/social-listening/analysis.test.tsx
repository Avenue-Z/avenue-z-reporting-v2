// The Social Listening analysis box (the approved mockup's renderComm), a drop-in for CommentaryPanel. Made-up text only.
import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { ANALYSIS_LABELS } from '@/lib/commentary/labels'
import type { CommentaryEntry } from '@/lib/commentary/types'

const h = vi.hoisted(() => ({ save: vi.fn(async () => ({ ok: true })), approve: vi.fn(async () => ({ ok: true })), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh }) }))
vi.mock('@/app/actions/commentary', () => ({ saveCommentary: h.save, approveCommentary: h.approve, revokeCommentary: vi.fn(), deleteCommentaryDraft: vi.fn() }))

import { SlAnalysis } from './analysis'

const ENTRY: CommentaryEntry = {
  id: 'e1', viewKey: 'organic-social:social-listening:b-kpis', bodyHtml: '<h3>A heading</h3><p>A made-up note.</p>',
  periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'draft',
  updatedBy: 'writer.person@avenuez.com', updatedAt: '2026-11-02T00:00:00.000Z', approvedBy: null, approvedAt: null, deletedAt: null, deletedBy: null,
}
const STAFF = { canEdit: true, canApprove: false }
const APPROVER = { canEdit: true, canApprove: true }
const CLIENT = { canEdit: false, canApprove: false }
const box = (entries: CommentaryEntry[], capabilities: typeof STAFF, clientEntryId: string | null = null) => (
  <SlAnalysis clientSlug="acme" viewKey="organic-social:social-listening:b-kpis" entries={entries} initialId={entries[0]?.id ?? null}
    clientEntryId={clientEntryId} capabilities={capabilities} history={[]} labels={ANALYSIS_LABELS}
    defaultPeriod={{ start: '2026-10-01', end: '2026-10-31' }} />
)

beforeEach(() => { vi.clearAllMocks() })

test('empty, for staff: only the dashed "+ Add analysis" button', () => {
  render(box([], STAFF))
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['+ Add analysis'])
})

test('empty, for a client: nothing at all', () => {
  const { container } = render(box([], CLIENT))
  expect(container.innerHTML).toBe('')
})

test('the plain text editor saves the month as commentary HTML, "# " lines as headings', async () => {
  render(box([], STAFF))
  fireEvent.click(screen.getByRole('button', { name: '+ Add analysis' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Analysis text' }), { target: { value: '# Theme\nA made-up line.' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
  expect(h.save).toHaveBeenCalledWith({
    clientSlug: 'acme', viewKey: 'organic-social:social-listening:b-kpis', bodyHtml: '<h3>Theme</h3><p>A made-up line.</p>',
    periodStart: '2026-10-01', periodEnd: '2026-10-31',
  })
  expect(h.refresh).toHaveBeenCalled()
})

test('saving nothing says so and does not call the action', async () => {
  render(box([], STAFF))
  fireEvent.click(screen.getByRole('button', { name: '+ Add analysis' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
  expect(h.save).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toBe('Write something first, or Cancel.')
})

test('editing an entry starts from its text and saves to that entry and its period', async () => {
  render(box([ENTRY], STAFF))
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('# A heading\n\nA made-up note.')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
  expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1', periodStart: '2026-10-01', periodEnd: '2026-10-31' }))
})

test('written, for staff: the label, who wrote it, its state and Edit; Approve only for an approver', () => {
  render(box([ENTRY], STAFF))
  expect(screen.getByText('Analysis')).toBeTruthy()
  expect(screen.getByText('Writer')).toBeTruthy()
  expect(screen.getByText('Draft')).toBeTruthy()
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit'])
  document.body.innerHTML = ''
  render(box([ENTRY], APPROVER))
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Approve', 'Edit'])
})

test('a client sees the text with no controls, name or state', () => {
  render(box([{ ...ENTRY, status: 'approved' }], CLIENT))
  expect(screen.getByText('A made-up note.')).toBeTruthy()
  expect(screen.queryAllByRole('button')).toEqual([])
  expect(screen.queryByText('Writer')).toBeNull()
  expect(screen.queryByText('Approved')).toBeNull()
})

test('the PDF prints the client entry, whoever exports, and nothing when there is none', () => {
  const approved = { ...ENTRY, status: 'approved' as const }
  render(<ExportModeProvider>{box([approved], APPROVER, approved.id)}</ExportModeProvider>)
  expect(screen.getByText('A made-up note.')).toBeTruthy()
  expect(screen.queryAllByRole('button')).toEqual([])
  const none = render(<ExportModeProvider>{box([approved], APPROVER, null)}</ExportModeProvider>)
  expect(none.container.innerHTML).toBe('')
})

// Unit G (plan 2026-11-24, F5): a keyword appendix carried from an earlier month.
const SEP: CommentaryEntry = { ...ENTRY, id: 'sep', viewKey: 'organic-social:social-listening:b-keywords', bodyHtml: '<p>September keywords</p>', periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'approved', approvedBy: 'a@avenuez.com', approvedAt: '2026-10-02T00:00:00.000Z' }
const carried = (capabilities: typeof STAFF) => (
  <SlAnalysis clientSlug="acme" viewKey="organic-social:social-listening:b-keywords" entries={[SEP]} initialId="sep" clientEntryId="sep"
    capabilities={capabilities} history={[]} labels={ANALYSIS_LABELS} defaultPeriod={{ start: '2026-10-01', end: '2026-10-31' }} carriedFrom="September 2026" />
)

test("carried, for staff: where it came from, Edit, and no Approve or Revoke", () => {
  render(carried(APPROVER))
  expect(screen.getByText("From September 2026. Edit to write this month's.")).toBeTruthy()
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit'])
})

test("carried: Edit drafts this month's own entry, prefilled, never the earlier month's row", async () => {
  render(carried(STAFF))
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('September keywords')
  expect(screen.queryByRole('button', { name: 'Remove analysis' })).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
  expect(h.save).toHaveBeenCalledWith({ clientSlug: 'acme', viewKey: 'organic-social:social-listening:b-keywords', bodyHtml: '<p>September keywords</p>', periodStart: '2026-10-01', periodEnd: '2026-10-31' })
})

test('carried, for a client and in the PDF: the text, with no note and no button', () => {
  const { unmount } = render(carried(CLIENT))
  expect(screen.getByText('September keywords')).toBeTruthy()
  expect(screen.queryByText(/From September/)).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
  unmount()
  render(<ExportModeProvider>{carried(STAFF)}</ExportModeProvider>)
  expect(screen.getByText('September keywords')).toBeTruthy()
})
