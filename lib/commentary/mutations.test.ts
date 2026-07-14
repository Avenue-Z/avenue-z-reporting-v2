import { describe, expect, test } from 'vitest'
import { validateCommentaryInput, planCommentaryWrite, authorizeRowForClient } from './mutations'

describe('validateCommentaryInput', () => {
  const base = { bodyHtml: '<p>Solid month.</p>', periodStart: '2026-01-01', periodEnd: '2026-01-31' }
  test('accepts a well-formed entry', () => {
    expect(validateCommentaryInput(base)).toEqual({ ok: true })
  })
  test('rejects empty body (tags only / whitespace)', () => {
    expect(validateCommentaryInput({ ...base, bodyHtml: '<p></p>' }).ok).toBe(false)
    expect(validateCommentaryInput({ ...base, bodyHtml: '   ' }).ok).toBe(false)
  })
  test('requires both dates', () => {
    expect(validateCommentaryInput({ ...base, periodStart: '' }).ok).toBe(false)
    expect(validateCommentaryInput({ ...base, periodEnd: '' }).ok).toBe(false)
  })
  test('rejects start after end', () => {
    expect(validateCommentaryInput({ ...base, periodStart: '2026-02-01', periodEnd: '2026-01-01' }).ok).toBe(false)
  })
})

describe('planCommentaryWrite (fork-on-edit-of-approved)', () => {
  test('editing an approved entry inserts a new draft', () => {
    expect(planCommentaryWrite('approved')).toEqual({ op: 'insert' })
  })
  test('editing a draft updates in place', () => {
    expect(planCommentaryWrite('draft')).toEqual({ op: 'update' })
  })
  test('no existing row inserts', () => {
    expect(planCommentaryWrite(null)).toEqual({ op: 'insert' })
  })
})

describe('authorizeRowForClient (cross-client row scoping)', () => {
  test('a row belonging to the requesting client is allowed', () => {
    expect(authorizeRowForClient({ clientId: 'c1' }, 'c1')).toEqual({ ok: true })
  })
  test("another client's row is rejected", () => {
    expect(authorizeRowForClient({ clientId: 'c2' }, 'c1').ok).toBe(false)
  })
  test('a missing row is rejected', () => {
    expect(authorizeRowForClient(undefined, 'c1').ok).toBe(false)
  })
  test('missing and foreign rows are indistinguishable (no id probing)', () => {
    expect(authorizeRowForClient(undefined, 'c1')).toEqual(authorizeRowForClient({ clientId: 'c2' }, 'c1'))
  })
})
