import { describe, expect, test } from 'vitest'
import { visibleEntries, pickDefaultEntry } from './select'
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
