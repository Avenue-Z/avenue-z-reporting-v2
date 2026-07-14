import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CommentaryPanel } from './commentary-panel'
import type { CommentaryEntry, CommentaryPeriodHistory } from '@/lib/commentary/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/app/actions/commentary', () => ({
  approveCommentary: vi.fn(),
  revokeCommentary: vi.fn(),
  saveCommentary: vi.fn(),
  deleteCommentaryDraft: vi.fn(),
}))

const ENTRY: CommentaryEntry = {
  id: 'e1',
  viewKey: 'peec-ai',
  bodyHtml: '<p>Visibility climbed this month.</p>',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  status: 'approved',
  updatedBy: 'paul.ramirez@avenuez.com',
  updatedAt: '2026-07-09T20:01:00.000Z',
  approvedBy: 'thomas@avenuez.com',
  approvedAt: '2026-07-10T13:12:00.000Z',
  deletedAt: null,
  deletedBy: null,
}

function renderPanel(canEdit: boolean) {
  return render(
    <CommentaryPanel
      clientSlug="acme"
      viewKey="peec-ai"
      entries={[ENTRY]}
      initialId={ENTRY.id}
      capabilities={{ canEdit, canApprove: false }}
      history={[]}
    />,
  )
}

test('client view hides the updated/approved attribution and timestamps', () => {
  const { container } = renderPanel(false)

  // The commentary itself still renders.
  expect(screen.getByText('Visibility climbed this month.')).toBeTruthy()

  // Neither who touched it nor when leaks to the client.
  expect(container.textContent).not.toMatch(/Last updated by|Approved by/)
  expect(container.textContent).not.toMatch(/avenuez\.com/)
  expect(container.textContent).not.toMatch(/2026, \d+:\d\d/) // fmtDateTime output
})

test('staff view still shows who updated/approved it and when', () => {
  const { container } = renderPanel(true)

  expect(container.textContent).toContain('Last updated by paul.ramirez@avenuez.com')
  expect(container.textContent).toContain('Approved by thomas@avenuez.com')
  expect(container.textContent).toMatch(/2026, \d+:\d\d/)
})

const DRAFT: CommentaryEntry = { ...ENTRY, id: 'd1', status: 'draft', approvedBy: null, approvedAt: null }

function renderWith(opts: {
  entry?: CommentaryEntry
  canEdit?: boolean
  canApprove?: boolean
  history?: CommentaryPeriodHistory[]
}) {
  const entry = opts.entry ?? ENTRY
  return render(
    <CommentaryPanel
      clientSlug="acme"
      viewKey="peec-ai"
      entries={[entry]}
      initialId={entry.id}
      capabilities={{ canEdit: opts.canEdit ?? false, canApprove: opts.canApprove ?? false }}
      history={opts.history ?? []}
    />,
  )
}

describe('delete draft button', () => {
  test('an editor sees Delete on a draft', () => {
    renderWith({ entry: DRAFT, canEdit: true })
    expect(screen.getByRole('button', { name: 'Delete draft' })).toBeTruthy()
  })
  test('no Delete on an approved entry — it may be client-visible', () => {
    renderWith({ entry: ENTRY, canEdit: true })
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()
  })
  test('a client never sees Delete', () => {
    renderWith({ entry: DRAFT, canEdit: false })
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()
  })
  test('Delete calls the action only after the confirm is accepted', async () => {
    const { deleteCommentaryDraft } = await import('@/app/actions/commentary')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderWith({ entry: DRAFT, canEdit: true })
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    expect(deleteCommentaryDraft).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    expect(deleteCommentaryDraft).toHaveBeenCalledWith('acme', 'd1')

    confirmSpy.mockRestore()
  })
})

describe('deleting the dropdown-selected draft', () => {
  test('falls back to the RSC default instead of stranding on "No commentary yet."', async () => {
    const { deleteCommentaryDraft } = await import('@/app/actions/commentary')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const juneApproved = ENTRY // approved, id 'e1', is `initialId`
    const mayDraft: CommentaryEntry = { ...DRAFT, id: 'may-draft', periodStart: '2026-05-01', periodEnd: '2026-05-31' }

    const props = {
      clientSlug: 'acme',
      viewKey: 'peec-ai' as const,
      capabilities: { canEdit: true, canApprove: false },
      history: [] as CommentaryPeriodHistory[],
    }

    const { rerender } = render(
      <CommentaryPanel {...props} entries={[juneApproved, mayDraft]} initialId={juneApproved.id} />,
    )

    // Editor explicitly picks the May draft from the dropdown (not the default June entry).
    fireEvent.change(screen.getByRole('combobox'), { target: { value: mayDraft.id } })
    expect(screen.getByRole('button', { name: 'Delete draft' })).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    })

    expect(deleteCommentaryDraft).toHaveBeenCalledWith('acme', mayDraft.id)

    // Simulate the RSC's post-refresh render: the deleted draft is gone from `entries`.
    rerender(<CommentaryPanel {...props} entries={[juneApproved]} initialId={juneApproved.id} />)

    expect(screen.queryByText('No commentary yet.')).toBeNull()
    expect(screen.getByText('Visibility climbed this month.')).toBeTruthy()

    confirmSpy.mockRestore()
  })
})

describe('history disclosure', () => {
  const HISTORY: CommentaryPeriodHistory[] = [{
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    versions: [
      { entry: ENTRY, tag: 'live' },
      { entry: { ...ENTRY, id: 'old', bodyHtml: '<p>OLD</p>' }, tag: 'superseded' },
      { entry: { ...DRAFT, id: 'gone', bodyHtml: '<p>GONE</p>' }, tag: 'deleted' },
    ],
  }]

  test('an approver sees the History disclosure', () => {
    renderWith({ canEdit: true, canApprove: true, history: HISTORY })
    expect(screen.getByText(/History/)).toBeTruthy()
  })
  test('an editor with an empty history sees no disclosure', () => {
    renderWith({ canEdit: true, canApprove: false, history: [] })
    expect(screen.queryByText(/History/)).toBeNull()
  })
  test('a non-approver never sees the disclosure, even with a non-empty history — the capability gate is real, not just the empty-array RSC default', () => {
    renderWith({ canEdit: true, canApprove: false, history: HISTORY })
    expect(screen.queryByText(/History/)).toBeNull()
  })
  test('expanding shows every version with its tag', () => {
    renderWith({ canEdit: true, canApprove: true, history: HISTORY })
    fireEvent.click(screen.getByText(/History/))
    expect(screen.getByText('live')).toBeTruthy()
    expect(screen.getByText('superseded')).toBeTruthy()
    expect(screen.getByText('deleted')).toBeTruthy()
  })
})
