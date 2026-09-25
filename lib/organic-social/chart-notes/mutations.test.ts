import { expect, test } from 'vitest'
import { approveNoteQuery, isOpenDraftConflict } from './mutations'

// Unverified until staging (Task 11): the exact shape neon-http gives a unique violation. The
// check accepts the constraint name in either the `constraint` field or the message, and walks
// `cause`, because Drizzle 0.45 wraps driver errors in DrizzleQueryError
// (node_modules/drizzle-orm/errors.d.ts:9-14).
const violation = { code: '23505', constraint: 'chart_notes_one_open_draft' }

test('the open-draft index losing a race is recognized, bare or wrapped', () => {
  expect(isOpenDraftConflict(violation)).toBe(true)
  expect(isOpenDraftConflict({ message: 'query failed', cause: violation })).toBe(true)
  expect(isOpenDraftConflict({ code: '23505', message: 'duplicate key value violates unique constraint "chart_notes_one_open_draft"' })).toBe(true)
})

test('any other error is not ours to swallow', () => {
  expect(isOpenDraftConflict({ code: '23505', constraint: 'some_other_key' })).toBe(false)
  expect(isOpenDraftConflict({ code: '23514', constraint: 'chart_notes_one_open_draft' })).toBe(false)
  expect(isOpenDraftConflict(new Error('connection reset'))).toBe(false)
  expect(isOpenDraftConflict(null)).toBe(false)
  expect(isOpenDraftConflict('23505')).toBe(false)
})

test('a cause chain that loops ends instead of spinning', () => {
  const a: { cause?: unknown } = {}
  a.cause = a
  expect(isOpenDraftConflict(a)).toBe(false)
})

// Paul's review of #273 (C2): approve matched the row, its text and its posts, but not that it was still
// a draft. A stale Approve on a note approved and since superseded re-stamped its approval time, and
// clients went back to the older text. Built offline: `.toSQL()` needs no connection.
test('approve only ever matches a live draft holding exactly what the approver saw', () => {
  const q = approveNoteQuery('c7d8e0a1-1111-4111-8111-111111111111', 'approver@avenuez.com', { text: 'Went live', postIds: [11] }).toSQL()
  const where = q.sql.slice(q.sql.indexOf(' where '))
  const param = (col: string) => {
    const m = where.match(new RegExp(`"chart_notes"\\."${col}" = \\$(\\d+)`))
    return m ? q.params[Number(m[1]) - 1] : undefined
  }
  expect(param('status')).toBe('draft')
  expect(param('body')).toBe('Went live')
  expect(where).toContain('"chart_notes"."deleted_at" is null')
})
