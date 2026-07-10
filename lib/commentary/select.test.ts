import { describe, expect, test } from 'vitest'
import { visibleEntries, pickDefaultEntry, mostRecentApprovedPerPeriod } from './select'
import type { CommentaryEntry } from './types'

const e = (over: Partial<CommentaryEntry>): CommentaryEntry => ({
  id: 'x', viewKey: 'meta-ads', bodyHtml: '<p>x</p>',
  periodStart: '2026-01-01', periodEnd: '2026-01-31', status: 'approved',
  updatedBy: 'a@avenuez.com', updatedAt: '2026-02-01T00:00:00.000Z',
  approvedBy: null, approvedAt: null, ...over,
})

describe('visibleEntries', () => {
  const entries = [e({ id: 'd', status: 'draft' }), e({ id: 'a', status: 'approved' })]
  test('Avenue Z sees all', () => {
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
  test('staff still see every version (no dedupe)', () => {
    const all = [e({ id: 'B', status: 'approved' }), e({ id: 'A', status: 'approved' }), e({ id: 'd', status: 'draft' })]
    expect(visibleEntries(all, { canEdit: true, canApprove: false }).map((x) => x.id)).toEqual(['B', 'A', 'd'])
  })
  test('mostRecentApprovedPerPeriod: tie on approvedAt breaks on updatedAt', () => {
    const a = e({ id: 'a', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' })
    const b = e({ id: 'b', status: 'approved', approvedAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z' })
    expect(mostRecentApprovedPerPeriod([a, b]).map((x) => x.id)).toEqual(['b'])
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
