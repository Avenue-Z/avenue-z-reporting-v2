import { describe, expect, test } from 'vitest'
import { validateCommentaryInput, planCommentaryWrite, approvedSiblingsToDemote } from './mutations'
import type { CommentaryEntry } from './types'

const entry = (over: Partial<CommentaryEntry>): CommentaryEntry => ({
  id: 'x', viewKey: 'meta-ads', bodyHtml: '<p>x</p>',
  periodStart: '2026-01-01', periodEnd: '2026-01-31', status: 'approved',
  updatedBy: 'a@avenuez.com', updatedAt: '2026-02-01T00:00:00.000Z',
  approvedBy: 'm@avenuez.com', approvedAt: '2026-02-01T00:00:00.000Z', ...over,
})

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

describe('approvedSiblingsToDemote (supersede same-period on approve)', () => {
  const target = { id: 't', periodStart: '2026-01-01', periodEnd: '2026-01-31' }
  test('returns other APPROVED rows of the SAME period, excluding the target', () => {
    const all = [
      entry({ id: 't', status: 'draft' }),                                    // the target itself (being approved)
      entry({ id: 'a', status: 'approved' }),                                 // same period, approved → demote
      entry({ id: 'c', status: 'approved' }),                                 // same period, approved → demote
    ]
    expect(approvedSiblingsToDemote(target, all).sort()).toEqual(['a', 'c'])
  })
  test('keeps approved rows of a DIFFERENT period (client history)', () => {
    const all = [
      entry({ id: 'a', status: 'approved' }),                                 // same period → demote
      entry({ id: 'feb', status: 'approved', periodStart: '2026-02-01', periodEnd: '2026-02-28' }),
    ]
    expect(approvedSiblingsToDemote(target, all)).toEqual(['a'])
  })
  test('ignores drafts and never returns the target', () => {
    const all = [
      entry({ id: 't', status: 'approved' }),                                 // target — excluded even if approved
      entry({ id: 'd', status: 'draft' }),                                    // draft — ignored
    ]
    expect(approvedSiblingsToDemote(target, all)).toEqual([])
  })
})
