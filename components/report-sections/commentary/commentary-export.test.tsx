import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { CommentaryEntry } from '@/lib/commentary/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/app/actions/commentary', () => ({ approveCommentary: vi.fn(), revokeCommentary: vi.fn(), deleteCommentaryDraft: vi.fn() }))

import { CommentaryPanel } from './commentary-panel'
import { ExportModeProvider } from '@/components/export/export-mode'

const entry = (id: string, status: 'approved' | 'draft', start: string, end: string, body: string): CommentaryEntry => ({
  id, viewKey: 'organic-social', bodyHtml: `<p>${body}</p>`, periodStart: start, periodEnd: end, status,
  updatedBy: 'x@avenuez.com', updatedAt: '2026-10-01T00:00:00Z', approvedBy: null, approvedAt: null, deletedAt: null, deletedBy: null,
})
const SEP_APPROVED = entry('a', 'approved', '2026-09-01', '2026-09-30', 'September went well.')
const SEP_DRAFT = entry('d', 'draft', '2026-09-01', '2026-09-30', 'Draft rewrite, not approved.')
const AUG_APPROVED = entry('b', 'approved', '2026-08-01', '2026-08-31', 'August recap.')
const staff = { canEdit: true, canApprove: true }

// initialId is the staff's default (newest, drafts included); clientEntryId is the client's, worked out server-side
// (index.tsx, monthly.tsx). The export prints the client's.
const exportPanel = (entries: CommentaryEntry[], initialId: string | null, clientEntryId: string | null) => render(
  <ExportModeProvider>
    <CommentaryPanel clientSlug="c" viewKey="organic-social" entries={entries} initialId={initialId} clientEntryId={clientEntryId} capabilities={staff} history={[]} />
  </ExportModeProvider>,
)

test("a staff export prints the approved commentary for the page's period, never the draft", () => {
  exportPanel([SEP_DRAFT, SEP_APPROVED, AUG_APPROVED], 'd', 'a')
  expect(screen.getByText('September went well.')).toBeTruthy()
  expect(screen.queryByText('Draft rewrite, not approved.')).toBeNull()
  expect(screen.getByText('Reporting period: Sep 1, 2026 – Sep 30, 2026')).toBeTruthy()
})

// Staff open on the newest entry including drafts; a staff export must print the client's, not nothing (review of #332).
test('a staff export with a newer draft for another period prints the commentary the client sees', () => {
  const OCT_DRAFT = entry('o', 'draft', '2026-10-01', '2026-10-31', 'October draft.')
  exportPanel([OCT_DRAFT, SEP_APPROVED, AUG_APPROVED], 'o', 'a')
  expect(screen.getByText('September went well.')).toBeTruthy()
  expect(screen.queryByText('October draft.')).toBeNull()
})

test('with no approved commentary at all, nothing prints', () => {
  const { container } = exportPanel([SEP_DRAFT], 'd', null)
  expect(container.textContent).toBe('')
})

test('no editor controls, selector or status badges, and the panel is one block', () => {
  const { container } = exportPanel([SEP_APPROVED], 'a', 'a')
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.queryByText('Approved')).toBeNull()
  expect(container.querySelector('section[data-export-block]')).not.toBeNull()
  expect(screen.getByRole('heading', { name: 'Insights' })).toBeTruthy()
})

// #334 (task A7): the PDF prints the title of the box it was given, so the Recommendations box is not printed as
// "Insights" (or as #332's original "Commentary").
test('the export heading is the box title: Insights by default, Recommendations for that box', () => {
  render(
    <ExportModeProvider>
      <CommentaryPanel clientSlug="c" viewKey="organic-social:recommendations" entries={[SEP_APPROVED]} initialId="a" clientEntryId="a"
        capabilities={staff} history={[]} labels={{ title: 'Recommendations', noun: 'recommendations', outline: null }} />
    </ExportModeProvider>,
  )
  expect(screen.getByRole('heading', { name: 'Recommendations' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Insights' })).toBeNull()
})
