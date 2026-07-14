import { describe, expect, test } from 'vitest'
import { visibleEntries, pickDefaultEntry, mostRecentApprovedPerPeriod, historyEntries, tagVersion } from './select'
import type { CommentaryEntry } from './types'

const e = (over: Partial<CommentaryEntry>): CommentaryEntry => ({
  id: 'x', viewKey: 'meta-ads', bodyHtml: '<p>x</p>',
  periodStart: '2026-01-01', periodEnd: '2026-01-31', status: 'approved',
  updatedBy: 'a@avenuez.com', updatedAt: '2026-02-01T00:00:00.000Z',
  approvedBy: null, approvedAt: null, deletedAt: null, deletedBy: null, ...over,
})

describe('visibleEntries', () => {
  const entries = [e({ id: 'd', status: 'draft' }), e({ id: 'a', status: 'approved' })]
  test('Avenue Z sees drafts alongside the live approved entry', () => {
    expect(visibleEntries(entries, { canEdit: true, canApprove: false }).map((x) => x.id)).toEqual(['d', 'a'])
  })
  test('clients see approved only', () => {
    expect(visibleEntries(entries, { canEdit: false, canApprove: false }).map((x) => x.id)).toEqual(['a'])
  })
})

describe('visibleEntries — client sees one approved per period (replace + fallback)', () => {
  const client = { canEdit: false, canApprove: false }
  test('shows only the most-recently-approved entry per period', () => {
    const older = e({ id: 'A', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z' })
    const newer = e({ id: 'B', status: 'approved', approvedAt: '2026-02-05T00:00:00.000Z' })
    expect(visibleEntries([newer, older], client).map((x) => x.id)).toEqual(['B'])
  })
  test('revoking the newest falls back to the previously-approved version', () => {
    // B was revoked (now draft); A remains approved for the same period → client sees A
    const A = e({ id: 'A', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z' })
    const Bdraft = e({ id: 'B', status: 'draft', approvedAt: '2026-02-05T00:00:00.000Z' })
    expect(visibleEntries([Bdraft, A], client).map((x) => x.id)).toEqual(['A'])
  })
  test('different periods are each kept', () => {
    const jan = e({ id: 'jan', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z' })
    const feb = e({ id: 'feb', status: 'approved', periodStart: '2026-02-01', periodEnd: '2026-02-28', approvedAt: '2026-03-01T00:00:00.000Z' })
    expect(visibleEntries([feb, jan], client).map((x) => x.id).sort()).toEqual(['feb', 'jan'])
  })
  test('mostRecentApprovedPerPeriod: tie on approvedAt breaks on updatedAt', () => {
    const a = e({ id: 'a', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' })
    const b = e({ id: 'b', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z' })
    expect(mostRecentApprovedPerPeriod([a, b]).map((x) => x.id)).toEqual(['b'])
  })
})

describe('visibleEntries — staff dropdown: an approved re-edit replaces the original', () => {
  const staff = { canEdit: true, canApprove: false }
  // The lifecycle: editing an approved entry forks a new draft (planCommentaryWrite),
  // so approving it leaves TWO approved rows for the same period. Only the new one shows.
  const original = e({ id: 'A', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z' })
  const reApproved = e({ id: 'B', status: 'approved', approvedAt: '2026-02-05T00:00:00.000Z' })

  test('the superseded original drops out of the dropdown', () => {
    expect(visibleEntries([reApproved, original], staff).map((x) => x.id)).toEqual(['B'])
  })
  test('a pending draft is still shown next to the live approved entry', () => {
    const pending = e({ id: 'C', status: 'draft' })
    expect(visibleEntries([pending, reApproved, original], staff).map((x) => x.id)).toEqual(['C', 'B'])
  })
  test('revoking the newest brings the superseded original back', () => {
    const revoked = e({ id: 'B', status: 'draft', approvedAt: null })
    expect(visibleEntries([revoked, original], staff).map((x) => x.id)).toEqual(['B', 'A'])
  })
  test('other periods keep their own live entry', () => {
    const feb = e({ id: 'feb', status: 'approved', periodStart: '2026-02-01', periodEnd: '2026-02-28', approvedAt: '2026-03-01T00:00:00.000Z' })
    expect(visibleEntries([feb, reApproved, original], staff).map((x) => x.id)).toEqual(['feb', 'B'])
  })
  test('input order (period desc) is preserved, not regrouped', () => {
    const janOld = e({ id: 'janOld', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z' })
    const janNew = e({ id: 'janNew', status: 'approved', approvedAt: '2026-02-09T00:00:00.000Z' })
    const mar = e({ id: 'mar', status: 'approved', periodStart: '2026-03-01', periodEnd: '2026-03-31', approvedAt: '2026-04-01T00:00:00.000Z' })
    expect(visibleEntries([mar, janNew, janOld], staff).map((x) => x.id)).toEqual(['mar', 'janNew'])
  })
})

describe('pickDefaultEntry', () => {
  test('most recent by periodStart, tiebreak updatedAt', () => {
    const older = e({ id: 'old', periodStart: '2026-01-01' })
    const newer = e({ id: 'new', periodStart: '2026-02-01' })
    const sameStartNewer = e({ id: 'tie', periodStart: '2026-02-01', updatedAt: '2026-03-01T00:00:00.000Z' })
    expect(pickDefaultEntry([older, newer, sameStartNewer])?.id).toBe('tie')
  })
  test('empty → null', () => {
    expect(pickDefaultEntry([])).toBeNull()
  })
  test('does not mutate input order', () => {
    const arr = [e({ id: '1', periodStart: '2026-01-01' }), e({ id: '2', periodStart: '2026-02-01' })]
    pickDefaultEntry(arr)
    expect(arr.map((x) => x.id)).toEqual(['1', '2'])
  })
})

describe('visibleEntries — deleted rows are hidden from BOTH views', () => {
  // §2 claims one filter fixes client and staff simultaneously. Prove both; don't infer.
  const del = e({ id: 'D', status: 'draft', deletedAt: '2026-02-10T00:00:00.000Z' })
  const live = e({ id: 'L', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z' })
  const draft = e({ id: 'P', status: 'draft' })

  test('client view excludes a deleted row', () => {
    // Hand-built approved+deleted row: the DB CHECK constraint forbids this state (a
    // deleted row always keeps status='draft'), but the pure function must be robust to
    // it anyway — same rationale as the tagVersion precedence test below. Without that,
    // a `status: 'draft'` deleted fixture is excluded by the client's status filter alone
    // and never exercises the deleted-filter at all. DA's later approvedAt would make it
    // the period's live winner over L if the deleted-filter were removed.
    const deletedApproved = e({
      id: 'DA', status: 'approved',
      approvedAt: '2026-02-20T00:00:00.000Z', deletedAt: '2026-02-21T00:00:00.000Z',
    })
    const out = visibleEntries([deletedApproved, live], { canEdit: false, canApprove: false })
    expect(out.map((x) => x.id)).toEqual(['L'])
  })
  test('staff dropdown excludes a deleted row but keeps live drafts', () => {
    const out = visibleEntries([del, draft, live], { canEdit: true, canApprove: false })
    expect(out.map((x) => x.id)).toEqual(['P', 'L'])
  })
  test('a deleted row never becomes the live approved entry by falling back', () => {
    // An approved row that was revoked to draft and then deleted must not resurface.
    const deletedFallback = e({ id: 'X', status: 'draft', approvedAt: '2026-02-09T00:00:00.000Z', deletedAt: '2026-02-11T00:00:00.000Z' })
    const out = visibleEntries([deletedFallback, live], { canEdit: true, canApprove: false })
    expect(out.map((x) => x.id)).toEqual(['L'])
  })
})

describe('tagVersion — precedence: deleted wins over live', () => {
  test('deleted beats live even when the row is in the live set', () => {
    // Hand-built approved+deleted row: the DB now FORBIDS this state (CHECK constraint),
    // and historyEntries never puts a deleted row in liveIds. The pure function must be
    // robust to it anyway, so a later refactor widening the winner set cannot relabel
    // a deleted row as 'live'.
    const row = e({ id: 'Z', status: 'approved', deletedAt: '2026-02-10T00:00:00.000Z' })
    expect(tagVersion(row, new Set(['Z']))).toBe('deleted')
  })
  test('live when it wins the period', () => {
    expect(tagVersion(e({ id: 'A', status: 'approved' }), new Set(['A']))).toBe('live')
  })
  test('superseded when approved but not the winner', () => {
    expect(tagVersion(e({ id: 'B', status: 'approved' }), new Set(['A']))).toBe('superseded')
  })
  test('draft otherwise', () => {
    expect(tagVersion(e({ id: 'C', status: 'draft' }), new Set(['A']))).toBe('draft')
  })
})

describe('historyEntries', () => {
  const approver = { canEdit: true, canApprove: true }

  test('returns [] for a non-approver, even an editor', () => {
    const entries = [e({ id: 'A', status: 'approved' })]
    expect(historyEntries(entries, { canEdit: true, canApprove: false })).toEqual([])
    expect(historyEntries(entries, { canEdit: false, canApprove: false })).toEqual([])
  })

  test('groups every version by period and tags each one', () => {
    const liveRow = e({ id: 'B', status: 'approved', approvedAt: '2026-02-05T00:00:00.000Z' })
    const oldRow = e({ id: 'A', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z' })
    const goneRow = e({ id: 'D', status: 'draft', deletedAt: '2026-02-02T00:00:00.000Z' })
    const out = historyEntries([liveRow, oldRow, goneRow], approver)

    expect(out).toHaveLength(1)
    expect(out[0].periodStart).toBe('2026-01-01')
    expect(out[0].versions.map((v) => [v.entry.id, v.tag])).toEqual([
      ['B', 'live'],
      ['A', 'superseded'],
      ['D', 'deleted'],
    ])
  })

  test('separate periods become separate groups, input order preserved', () => {
    const feb = e({ id: 'feb', periodStart: '2026-02-01', periodEnd: '2026-02-28', status: 'approved' })
    const jan = e({ id: 'jan', status: 'approved' })
    const out = historyEntries([feb, jan], approver)
    expect(out.map((g) => g.periodStart)).toEqual(['2026-02-01', '2026-01-01'])
  })
})
