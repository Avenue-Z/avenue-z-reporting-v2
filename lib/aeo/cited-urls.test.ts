// lib/aeo/cited-urls.test.ts
import { describe, it, expect } from 'vitest'
import {
  joinWindows,
  windowTooLong,
  emptyCitedUrls,
  type UrlWindow,
  type UrlWindowRow,
} from './cited-urls'

function row(key: string, o: Partial<UrlWindowRow> = {}): UrlWindowRow {
  return {
    key,
    url: `https://example.com/${key}`,
    title: null,
    sourceType: 'third_party',
    sourceLabel: 'example.com',
    pageType: null,
    answersUsing: 10,
    citations: 10,
    ...o,
  }
}

function win(rows: UrlWindowRow[], o: Partial<UrlWindow> = {}): UrlWindow {
  return { rows, totalAnswers: 100, totalCitations: 100, complete: true, ...o }
}

describe('joinWindows', () => {
  it('computes used % and rate', () => {
    const r = joinWindows('peec', win([row('a', { answersUsing: 50, citations: 75 })], { totalAnswers: 200 }), null)
    expect(r.rows[0].usedPct).toBe(25)
    expect(r.rows[0].citationRate).toBe(1.5)
  })

  it('marks rows missing from prior as new', () => {
    const cur = win([row('a'), row('b')])
    const prior = win([row('a', { answersUsing: 20 })], { totalAnswers: 100 })
    const r = joinWindows('peec', cur, prior)
    const a = r.rows.find((x) => x.key === 'a')!
    const b = r.rows.find((x) => x.key === 'b')!
    expect(r.compared).toBe(true)
    expect(b.prior).toBeNull()
    expect(a.prior?.usedPct).toBe(20)
    const none = joinWindows('peec', cur, null)
    expect(none.compared).toBe(false)
    expect(none.rows.every((x) => x.prior === null)).toBe(true)
  })

  it('zero denominators give null', () => {
    const r = joinWindows(
      'peec',
      win([row('a', { answersUsing: 0, citations: 4 })], { totalAnswers: 0 }),
      null,
    )
    expect(r.rows[0].usedPct).toBeNull()
    expect(r.rows[0].citationRate).toBeNull()
    const r2 = joinWindows('peec', win([row('a', { answersUsing: 0, citations: 4 })]), null)
    expect(r2.rows[0].usedPct).toBe(0)
    expect(r2.rows[0].citationRate).toBeNull()
  })

  it('ranks and ties are deterministic', () => {
    const r = joinWindows(
      'peec',
      win([
        row('c', { citations: 5 }),
        row('b', { citations: 9 }),
        row('a', { citations: 9 }),
        row('z', { answersUsing: 30 }),
      ]),
      null,
    )
    expect(r.rows.map((x) => x.key)).toEqual(['z', 'a', 'b', 'c'])
    expect(r.rows.map((x) => x.rank)).toEqual([1, 2, 3, 4])
  })

  it('cap keeps every own row', () => {
    const rows: UrlWindowRow[] = []
    for (let i = 0; i < 600; i++) {
      rows.push(row(`t${String(i).padStart(3, '0')}`, { answersUsing: 100 - i / 10 }))
    }
    for (let i = 0; i < 3; i++) rows.push(row(`own${i}`, { sourceType: 'own', answersUsing: 100 - (549 + i) / 10 - 0.001 }))
    const r = joinWindows('peec', win(rows, { totalAnswers: 100 }), null, { cap: 500 })
    expect(r.rows).toHaveLength(503)
    expect(r.totalRows).toBe(603)
    const ownRanks = r.rows.filter((x) => x.sourceType === 'own').map((x) => x.rank)
    expect(ownRanks).toHaveLength(3)
    expect(ownRanks.every((n) => n > 500)).toBe(true)
  })

  it('complete needs both windows', () => {
    expect(joinWindows('peec', win([]), win([], { complete: false })).complete).toBe(false)
    expect(joinWindows('peec', win([]), null).complete).toBe(true)
  })

  it('page type follows the provider', () => {
    expect(joinWindows('peec', win([]), null).hasPageType).toBe(true)
    expect(joinWindows('profound', win([]), null).hasPageType).toBe(false)
    expect(emptyCitedUrls('profound').hasPageType).toBe(false)
  })
})

describe('windowTooLong', () => {
  it('counts days inclusively against 92', () => {
    expect(windowTooLong({ startDate: '2026-01-01', endDate: '2026-04-02' })).toBe(false)
    expect(windowTooLong({ startDate: '2026-01-01', endDate: '2026-04-03' })).toBe(true)
  })
})
