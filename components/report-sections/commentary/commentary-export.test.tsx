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

const exportPanel = (entries: CommentaryEntry[], initialId: string | null) => render(
  <ExportModeProvider>
    <CommentaryPanel clientSlug="c" viewKey="organic-social" entries={entries} initialId={initialId} capabilities={staff} history={[]} />
  </ExportModeProvider>,
)

test("a staff export prints the approved commentary for the page's period, never the draft", () => {
  exportPanel([SEP_DRAFT, SEP_APPROVED, AUG_APPROVED], 'd')
  expect(screen.getByText('September went well.')).toBeTruthy()
  expect(screen.queryByText('Draft rewrite, not approved.')).toBeNull()
  expect(screen.getByText('Reporting period: Sep 1, 2026 – Sep 30, 2026')).toBeTruthy()
})

test("with no approved commentary for the page's period, nothing prints (not another period's)", () => {
  const { container } = exportPanel([SEP_DRAFT, AUG_APPROVED], 'd')
  expect(container.textContent).toBe('')
})

test('no editor controls, selector or status badges, and the panel is one block', () => {
  const { container } = exportPanel([SEP_APPROVED], 'a')
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.queryByText('Approved')).toBeNull()
  expect(container.querySelector('section[data-export-block]')).not.toBeNull()
  expect(screen.getByRole('heading', { name: 'Commentary' })).toBeTruthy()
})
