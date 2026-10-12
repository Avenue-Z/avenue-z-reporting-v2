import { expect, test } from 'vitest'
import { approveNoteQuery, isOpenDraftConflict, revokeNoteQuery } from './mutations'

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

// Paul's second review of #273 (R1): revoke matched the id alone, so a Revoke from a page opened before a
// newer approval turned the older, superseded approval into the day's open draft and reported success,
// while clients kept seeing the newer note. The write now also requires that the row is the approval
// clients see: approved, not deleted, and no live approved row of the same day ranks after it, by
// latestApproved's rule (pick.ts:16-25). One statement, so no approval can land between check and write.
test('revoke only ever matches the approved note clients see', () => {
  const q = revokeNoteQuery('c7d8e0a1-1111-4111-8111-111111111111').toSQL()
  const set = q.sql.slice(0, q.sql.indexOf(' where '))
  const where = q.sql.slice(q.sql.indexOf(' where '))
  const params = (s: string, col: string) => [...s.matchAll(new RegExp(`"${col}" = \\$(\\d+)`, 'g'))].map((m) => q.params[Number(m[1]) - 1])
  // The row goes back to draft...
  expect(params(set, 'status')).toEqual(['draft'])
  // ...only if it is approved and live,
  expect(where).toContain('"chart_notes"."status" = $')
  expect(where).toContain('"chart_notes"."deleted_at" is null')
  // and no live approved row of the same client, platform, chart and day was approved after it
  // (or at the same moment and updated after it).
  expect(where).toContain('not exists')
  for (const col of ['client_id', 'channel', 'chart', 'day']) expect(where).toContain(`"newer"."${col}" = "chart_notes"."${col}"`)
  expect(where).toContain('"newer"."deleted_at" is null')
  expect(where).toContain('"newer"."approved_at" > "chart_notes"."approved_at"')
  expect(where).toContain('"newer"."approved_at" = "chart_notes"."approved_at"')
  expect(where).toContain('"newer"."updated_at" > "chart_notes"."updated_at"')
  // Both status checks in the WHERE (the row's own and the newer row's) ask for 'approved'.
  expect(params(where, 'status')).toEqual(['approved', 'approved'])
})
