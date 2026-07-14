import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CommentaryPanel } from './commentary-panel'
import type { CommentaryEntry } from '@/lib/commentary/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/app/actions/commentary', () => ({
  approveCommentary: vi.fn(),
  revokeCommentary: vi.fn(),
  saveCommentary: vi.fn(),
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
