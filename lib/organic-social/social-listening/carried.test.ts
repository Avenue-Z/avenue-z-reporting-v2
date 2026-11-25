// The keyword appendix carries over (plan 2026-11-24, Unit G, F5, D10). Made-up text only.
import { describe, expect, test } from 'vitest'
import { carriedEntry, hasOwnEntry, isCarriedBox } from './carried'
import type { CommentaryEntry } from '@/lib/commentary/types'

const KEY = 'organic-social:social-listening:b-keywords' as CommentaryEntry['viewKey']
const last = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10)
let n = 0
const entry = (month: string, over: Partial<CommentaryEntry> = {}): CommentaryEntry => ({
  id: `e${n++}`, viewKey: KEY, bodyHtml: `<p>${month}</p>`, periodStart: `${month}-01`, periodEnd: last(month), status: 'approved',
  updatedBy: 's@avenuez.com', updatedAt: `${month}-20T00:00:00.000Z`, approvedBy: 'a@avenuez.com', approvedAt: `${month}-20T00:00:00.000Z`,
  deletedAt: null, deletedBy: null, ...over,
})
const STAFF = { clientView: false, caps: { canEdit: true, canApprove: true }, clientMonths: [{ key: '2026-11' }, { key: '2026-10' }] }
const CLIENT = { clientView: true, caps: { canEdit: false, canApprove: false }, clientMonths: [{ key: '2026-11' }, { key: '2026-10' }] }

describe('carriedEntry', () => {
  test('the newest earlier approved appendix', () => {
    const sep = entry('2026-09'), oct = entry('2026-10')
    expect(carriedEntry([sep, oct], '2026-11')?.id).toBe(oct.id)
  })
  test('a draft, a deleted entry, or the month itself or a later one never carries', () => {
    const draft = entry('2026-10', { status: 'draft', approvedAt: null, approvedBy: null })
    const deleted = entry('2026-10', { status: 'draft', approvedAt: null, approvedBy: null, deletedAt: '2026-10-21T00:00:00.000Z', deletedBy: 'x' })
    expect(carriedEntry([draft, deleted, entry('2026-11'), entry('2026-12')], '2026-11')).toBeNull()
  })
  test('an approved September carries past a draft-only October', () => {
    const sep = entry('2026-09')
    expect(carriedEntry([sep, entry('2026-10', { status: 'draft', approvedAt: null, approvedBy: null })], '2026-11')?.id).toBe(sep.id)
  })
  test('only the keyword boxes carry over', () => {
    expect(isCarriedBox('b-keywords') && isCarriedBox('i-keywords')).toBe(true)
    expect(['b-takeaways', 'b-conv', 'i-takeaways', 'b-kpis'].some((id) => isCarriedBox(id as never))).toBe(false)
  })
})

describe('hasOwnEntry', () => {
  const novDraft = entry('2026-11', { status: 'draft', approvedAt: null, approvedBy: null })
  test("a staff draft is staff's own entry, but not the client's: the client keeps the carried text until it is approved", () => {
    expect(hasOwnEntry([entry('2026-10'), novDraft], '2026-11', STAFF)).toBe(true)
    expect(hasOwnEntry([entry('2026-10'), novDraft], '2026-11', CLIENT)).toBe(false)
  })
  test("an approved entry for the month is everyone's own", () => {
    const nov = entry('2026-11')
    expect(hasOwnEntry([nov], '2026-11', STAFF)).toBe(true)
    expect(hasOwnEntry([nov], '2026-11', CLIENT)).toBe(true)
  })
  test('no entry of the month: nobody has one', () => {
    expect(hasOwnEntry([entry('2026-10')], '2026-11', STAFF)).toBe(false)
    expect(hasOwnEntry([entry('2026-10')], '2026-11', CLIENT)).toBe(false)
  })
})
