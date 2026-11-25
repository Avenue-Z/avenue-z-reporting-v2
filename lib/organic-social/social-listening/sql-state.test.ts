// The SQLSTATE of a failed query (issue #528, Paul's #518 review): Drizzle wraps the driver's error, so the code can sit on
// a `cause` a level or two down. Only a five-character SQLSTATE counts; a message never does.
import { describe, expect, test } from 'vitest'
import { sqlState, UNDEFINED_TABLE } from './sql-state'

describe('sqlState', () => {
  test('reads the code on the error, on its cause, or on the cause of its cause', () => {
    expect(sqlState({ code: '42P01' })).toBe('42P01')
    expect(sqlState(Object.assign(new Error('Failed query'), { cause: { code: '57014' } }))).toBe('57014')
    expect(sqlState({ cause: { cause: { code: '42703' } } })).toBe('42703')
  })

  test('anything that is not a SQLSTATE reads as none', () => {
    expect(sqlState(new Error('boom'))).toBe('none')
    expect(sqlState({ code: 'ECONNRESET' })).toBe('none')
    expect(sqlState({ code: 42 })).toBe('none')
    expect(sqlState(null)).toBe('none')
    expect(sqlState('42P01')).toBe('none')
  })

  test('a cause chain that loops ends', () => {
    const a: { cause?: unknown } = {}
    a.cause = a
    expect(sqlState(a)).toBe('none')
  })

  test('the missing-table code', () => {
    expect(UNDEFINED_TABLE).toBe('42P01')
  })
})
