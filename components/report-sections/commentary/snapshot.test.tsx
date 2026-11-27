import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { CommentaryEntry } from '@/lib/commentary/types'

let captured: Record<string, unknown> | null = null
vi.mock('./commentary-panel', () => ({
  CommentaryPanel: (props: Record<string, unknown>) => { captured = props; return null },
}))
const save = vi.hoisted(() => vi.fn(async () => ({ ok: true })))
vi.mock('@/app/actions/commentary', () => ({ saveCommentary: save }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

const entry = (over: Partial<CommentaryEntry>): CommentaryEntry => ({
  id: 'x', viewKey: 'peec-ai:technical-audit', bodyHtml: '<p>BODY</p>',
  periodStart: '2026-11-01', periodEnd: '2026-11-01', status: 'approved',
  updatedBy: 'paul@avenuez.com', updatedAt: '2026-11-02T10:00:00.000Z',
  approvedBy: 'thomas@avenuez.com', approvedAt: '2026-11-02T11:00:00.000Z',
  deletedAt: null, deletedBy: null, ...over,
})
const ROWS: CommentaryEntry[] = [
  entry({ id: 'nov' }),
  entry({ id: 'oct', periodStart: '2026-10-01', periodEnd: '2026-10-01', bodyHtml: '<p>OCT</p>' }),
  entry({ id: 'range', periodStart: '2026-11-01', periodEnd: '2026-11-30' }),
  entry({ id: 'nov-draft', status: 'draft', approvedBy: null, approvedAt: null }),
]
vi.mock('@/lib/db/queries', () => ({ getCommentaryForView: async () => ROWS }))

const client = { id: 'c1', slug: 'acme' }
async function run(email: string | null, rows?: CommentaryEntry[]) {
  captured = null
  const { snapshotCommentary } = await import('./snapshot')
  const el = await snapshotCommentary({ client, email, viewKey: 'peec-ai:technical-audit', snapshotDate: '2026-11-01' })
  if (el) render(el)
  return { el, props: captured as Record<string, unknown> | null, rows }
}

describe('snapshotCommentary', () => {
  beforeEach(() => vi.stubEnv('COMMENTARY_APPROVERS', 'thomas@avenuez.com'))
  afterEach(() => vi.unstubAllEnvs())

  test('shows only entries for the selected snapshot', async () => {
    const { props } = await run('thomas@avenuez.com')
    expect((props?.entries as CommentaryEntry[]).map((e) => e.id).sort()).toEqual(['nov', 'nov-draft'])
    expect(props?.defaultPeriod).toEqual({ start: '2026-11-01', end: '2026-11-01' })
    expect(props?.periodLabel).toBe('Snapshot: Nov 1, 2026')
  })

  test('client sees only the approved entry, redacted, with no history', async () => {
    const { props } = await run('viewer@client.example')
    expect((props?.entries as CommentaryEntry[]).map((e) => e.id)).toEqual(['nov'])
    expect(props?.history).toEqual([])
    const payload = JSON.stringify(props)
    expect(payload).not.toContain('avenuez.com')
    expect(payload).not.toContain('nov-draft')
  })

  test('client sees nothing without an approved entry; staff still get the panel', async () => {
    const q = await import('@/lib/db/queries')
    const spy = vi.spyOn(q, 'getCommentaryForView').mockResolvedValue([entry({ id: 'd', status: 'draft', approvedBy: null, approvedAt: null })])
    expect((await run('viewer@client.example')).el).toBeNull()
    const staff = await run('editor@avenuez.com')
    expect(staff.el).not.toBeNull()
    expect((staff.props?.entries as CommentaryEntry[]).map((e) => e.id)).toEqual(['d'])
    spy.mockRestore()
  })

  test('a non-approver editor gets no history', async () => {
    const { props } = await run('editor@avenuez.com')
    expect(props?.history).toEqual([])
  })
})

describe('snapshotDateOf', () => {
  test('only an equal-date range is a snapshot', async () => {
    const { snapshotDateOf } = await import('./snapshot')
    expect(snapshotDateOf('2026-11-01,2026-11-01')).toBe('2026-11-01')
    expect(snapshotDateOf('2026-11-01,2026-11-30')).toBeNull()
    expect(snapshotDateOf(undefined)).toBeNull()
    expect(snapshotDateOf('last_30_days')).toBeNull()
  })
})

describe('CommentaryEditor with periodLabel', () => {
  test('has no date inputs and saves the snapshot date', async () => {
    vi.doUnmock('./commentary-panel')
    const { CommentaryEditor } = await import('./commentary-editor')
    const { container } = render(
      <CommentaryEditor clientSlug="acme" viewKey="peec-ai:technical-audit" onDone={() => {}} outline={null}
        defaultPeriod={{ start: '2026-11-01', end: '2026-11-01' }} periodLabel="Snapshot: Nov 1, 2026" />,
    )
    expect(await screen.findByText('Snapshot: Nov 1, 2026')).toBeTruthy()
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(0)
    fireEvent.click(screen.getByText('Save draft'))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ periodStart: '2026-11-01', periodEnd: '2026-11-01', viewKey: 'peec-ai:technical-audit' }))
  })
})
