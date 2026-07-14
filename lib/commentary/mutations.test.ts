import { describe, expect, test } from 'vitest'
import { validateCommentaryInput, planCommentaryWrite, authorizeRowForClient, canDeleteDraft } from './mutations'

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

describe('canDeleteDraft', () => {
  test('a live draft is deletable', () => {
    expect(canDeleteDraft({ status: 'draft', deletedAt: null })).toEqual({ ok: true })
  })
  test('an approved entry is NOT deletable — it may be client-visible', () => {
    expect(canDeleteDraft({ status: 'approved', deletedAt: null }).ok).toBe(false)
  })
  test('an already-deleted row returns an explicit failure, not a silent ok', () => {
    // A silent { ok: true } would let the UI report "deleted" for a no-op.
    expect(canDeleteDraft({ status: 'draft', deletedAt: new Date() })).toEqual({ ok: false, error: 'not found' })
  })
  test('a missing row is rejected', () => {
    expect(canDeleteDraft(undefined).ok).toBe(false)
  })
})
