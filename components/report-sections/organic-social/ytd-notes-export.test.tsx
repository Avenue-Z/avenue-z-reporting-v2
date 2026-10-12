import { expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('@/app/actions/chart-notes', () => ({
  saveChartNoteAction: vi.fn(), approveChartNoteAction: vi.fn(), revokeChartNoteAction: vi.fn(), deleteChartNoteDraftAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { YtdNotesPanel } from './ytd-notes-panel'
import { ExportModeProvider } from '@/components/export/export-mode'
import type { YtdGraphNotes, YtdNoteControls } from './parts/ytd-notes'

// The PDF export prints what a client sees, whoever exports (spec 2026-10-06-organic-social-pdf-export-v2 §7). The live
// panel's no-print wrapper does nothing in the export, which renders in screen media (Thomas, #332 round 2, item 1).
// Every slug, id and text is invented.
const MONTHS = [{ key: '2026-07', label: 'Jul' }, { key: '2026-08', label: 'Aug' }, { key: '2026-09', label: 'Sep' }]
const CONTROLS: YtdNoteControls = { clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'ytd-followers', canApprove: true, months: MONTHS }
const DRAFT = { key: '2026-07', label: 'Jul', text: null, editor: { approvedId: null, approvedPostIds: [], draft: { id: 'd1', text: 'Draft July', postIds: [] } } }
const APPROVED_ON_POINT = { key: '2026-08', label: 'Aug', text: 'Approved August', editor: { approvedId: 'a1', approvedPostIds: [], draft: { id: 'd2', text: 'Draft rewrite of August', postIds: [] } } }
const exportPanel = (notes: YtdGraphNotes) => render(<ExportModeProvider><YtdNotesPanel notes={notes} title="Follower Growth, Year to Date" /></ExportModeProvider>)

test("a staff export prints the client's notes: approved text only, no editor, drafts or buttons", () => {
  const { container } = exportPanel({ notes: { Aug: 'Approved August' }, marks: [{ x: 'Aug' }], panel: [DRAFT, APPROVED_ON_POINT], controls: CONTROLS })
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.queryByRole('group', { name: 'Note' })).toBeNull()
  expect(container.textContent).not.toMatch(/Draft/)
  expect(container.textContent).not.toMatch(/Add annotation/)
  const items = within(screen.getByRole('list', { name: 'Notes on Follower Growth, Year to Date' })).getAllByRole('listitem')
  expect(items.map((li) => li.textContent)).toEqual(['1Aug: Approved August'])
})

test('a note on a point is numbered like its mark; a note the chart cannot show on a point is listed unnumbered', () => {
  exportPanel({ notes: { Aug: 'Approved August' }, marks: [{ x: 'Aug' }], panel: [{ key: '2026-09', label: 'Sep', text: 'September, not on a point' }] })
  const items = within(screen.getByRole('list', { name: 'Notes on Follower Growth, Year to Date' })).getAllByRole('listitem')
  expect(items.map((li) => li.textContent)).toEqual(['1Aug: Approved August', 'Sep: September, not on a point'])
  for (const li of items) expect(li.hasAttribute('data-export-block')).toBe(true)
})

test('with no approved note, the export prints nothing (a draft alone is not a note a client sees)', () => {
  const { container } = exportPanel({ panel: [DRAFT], controls: CONTROLS })
  expect(container.textContent).toBe('')
})

test('outside the export a staff viewer still gets the editor', () => {
  render(<YtdNotesPanel notes={{ panel: [DRAFT], controls: CONTROLS }} title="Follower Growth, Year to Date" />)
  expect(screen.getByRole('button', { name: 'Add annotation' })).toBeTruthy()
})
