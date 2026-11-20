import { describe, expect, test } from 'vitest'
import { computeUrlTiming } from './content-derive'

describe('computeUrlTiming (first search visit, first AI visit)', () => {
  test('publish-day non-search traffic does not count; first search visit is measured', () => {
    const t = computeUrlTiming({
      publishDate: '2026-01-01',
      days: [
        { date: '2026-01-01', aiSessions: 0, searchSessions: 0 }, // team visit, not search
        { date: '2026-01-04', aiSessions: 0, searchSessions: 2 },
      ],
    })
    expect(t.daysToFirstSearch).toBe(3)
    expect(t.daysToFirstAi).toBeNull()
  })

  test('only AI sessions: no search timing, AI timing set', () => {
    const t = computeUrlTiming({
      publishDate: '2026-01-01',
      days: [{ date: '2026-01-06', aiSessions: 1, searchSessions: 0 }],
    })
    expect(t.daysToFirstSearch).toBeNull()
    expect(t.daysToFirstAi).toBe(5)
  })

  test('pre-publish days ignored; same-day clamps to 0', () => {
    const t = computeUrlTiming({
      publishDate: '2026-01-10',
      days: [
        { date: '2026-01-05', aiSessions: 9, searchSessions: 9 },
        { date: '2026-01-10', aiSessions: 1, searchSessions: 1 },
      ],
    })
    expect(t.daysToFirstSearch).toBe(0)
    expect(t.daysToFirstAi).toBe(0)
  })
})
