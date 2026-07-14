import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import type { CommentaryEntry } from '@/lib/commentary/types'

// Capture the props that actually cross the RSC → client boundary.
// This is the point of the test: NOT what renders, but what ships.
let captured: Record<string, unknown> | null = null
vi.mock('./commentary-panel', () => ({
  CommentaryPanel: (props: Record<string, unknown>) => {
    captured = props
    return null
  },
}))

const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: () => mockAuth() }))

const ENTRIES: CommentaryEntry[] = [
  {
    id: 'live', viewKey: 'peec-ai', bodyHtml: '<p>APPROVED BODY</p>',
    periodStart: '2026-06-01', periodEnd: '2026-06-30', status: 'approved',
    updatedBy: 'paul@avenuez.com', updatedAt: '2026-07-09T20:01:00.000Z',
    approvedBy: 'thomas@avenuez.com', approvedAt: '2026-07-10T13:12:00.000Z',
    deletedAt: null, deletedBy: null,
  },
  {
    id: 'superseded', viewKey: 'peec-ai', bodyHtml: '<p>SUPERSEDED SECRET</p>',
    periodStart: '2026-06-01', periodEnd: '2026-06-30', status: 'approved',
    updatedBy: 'paul@avenuez.com', updatedAt: '2026-07-03T14:40:00.000Z',
    approvedBy: 'paul@avenuez.com', approvedAt: '2026-07-03T14:40:00.000Z',
    deletedAt: null, deletedBy: null,
  },
  {
    id: 'deleted', viewKey: 'peec-ai', bodyHtml: '<p>DELETED SECRET</p>',
    periodStart: '2026-06-01', periodEnd: '2026-06-30', status: 'draft',
    updatedBy: 'paul@avenuez.com', updatedAt: '2026-07-02T11:03:00.000Z',
    approvedBy: null, approvedAt: null,
    deletedAt: '2026-07-02T12:00:00.000Z', deletedBy: 'paul@avenuez.com',
  },
]

vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: async () => ({ id: 'client-1', slug: 'acme' }),
  getCommentaryForView: async () => ENTRIES,
}))

// Render the async RSC and hand its element to the DOM so the mocked panel runs.
async function renderSection() {
  const { CommentarySection } = await import('./index')
  const element = await CommentarySection({ clientSlug: 'acme', viewKey: 'peec-ai' })
  render(element)
  return captured
}

describe('CommentarySection — RSC boundary', () => {
  beforeEach(() => {
    captured = null
    process.env.COMMENTARY_APPROVERS = 'thomas@avenuez.com'
  })

  test('a CLIENT receives no history across the boundary', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'someone@clientco.com' } })
    const props = await renderSection()

    expect(props?.history).toEqual([])
    // Belt and braces: no superseded or deleted body may appear ANYWHERE in the payload.
    const payload = JSON.stringify(props)
    expect(payload).not.toContain('SUPERSEDED SECRET')
    expect(payload).not.toContain('DELETED SECRET')
  })

  test('a NON-APPROVER EDITOR receives no history either', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'editor@avenuez.com' } })
    const props = await renderSection()

    expect(props?.history).toEqual([])
    const payload = JSON.stringify(props)
    expect(payload).not.toContain('SUPERSEDED SECRET')
    expect(payload).not.toContain('DELETED SECRET')
  })

  test('an APPROVER receives the full history', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'thomas@avenuez.com' } })
    const props = await renderSection()

    const history = props?.history as { versions: { entry: { id: string }; tag: string }[] }[]
    expect(history).toHaveLength(1)
    expect(history[0].versions.map((v) => [v.entry.id, v.tag])).toEqual([
      ['live', 'live'],
      ['superseded', 'superseded'],
      ['deleted', 'deleted'],
    ])
  })

  test('the deleted draft never reaches the visible entries, for anyone', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'thomas@avenuez.com' } })
    const props = await renderSection()

    const entries = props?.entries as CommentaryEntry[]
    expect(entries.map((x) => x.id)).toEqual(['live'])
  })
})
