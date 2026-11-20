import { describe, expect, test } from 'vitest'
import { checkTrendLists, clientTrends, formatTrendLines, MAX_TRENDS, parseTrendLines } from './trends'
import type { SlTrends } from './types'

// Made-up themes only.
describe('parseTrendLines', () => {
  test('one theme per line, with an optional trailing change as the deck writes it', () => {
    expect(parseTrendLines('made up theme +5.1K%\nanother theme -77%\nthird theme 12.5%\nno change here')).toEqual([
      { theme: 'made up theme', change: '+5.1K%' },
      { theme: 'another theme', change: '-77%' },
      { theme: 'third theme', change: '12.5%' },
      { theme: 'no change here', change: null },
    ])
  })
  test('blank lines and surrounding spaces are dropped; Windows line ends are fine', () => {
    expect(parseTrendLines('  one  \r\n\r\n  two  4.9K% \n   \n')).toEqual([
      { theme: 'one', change: null },
      { theme: 'two', change: '4.9K%' },
    ])
  })
  test('a change alone on a line is a theme, never an empty theme', () => {
    expect(parseTrendLines('+5%')).toEqual([{ theme: '+5%', change: null }])
  })
  test('empty text is an empty list', () => {
    expect(parseTrendLines('')).toEqual([])
    expect(parseTrendLines(' \n \n')).toEqual([])
  })
})

describe('formatTrendLines', () => {
  test('round-trips with parseTrendLines, for the editor', () => {
    const list = [{ theme: 'made up theme', change: '+5.1K%' }, { theme: 'plain', change: null }]
    expect(formatTrendLines(list)).toBe('made up theme +5.1K%\nplain')
    expect(parseTrendLines(formatTrendLines(list))).toEqual(list)
  })
})

describe('checkTrendLists', () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `theme ${i}`).join('\n')
  test('at most 25 per list, each theme at most 100 characters', () => {
    expect(MAX_TRENDS).toBe(25)
    expect(checkTrendLists({ emerging: lines(25), decreasing: '', newThemes: 'x' })).toMatchObject({ ok: true })
    expect(checkTrendLists({ emerging: '', decreasing: lines(26), newThemes: '' })).toEqual({ ok: false, error: 'Decreasing has more than 25 themes.' })
    expect(checkTrendLists({ emerging: '', decreasing: '', newThemes: 'a'.repeat(101) })).toEqual({ ok: false, error: 'A theme in New themes is over 100 characters.' })
  })
  test('the three lists parsed', () => {
    expect(checkTrendLists({ emerging: 'a +1%', decreasing: 'b -2%', newThemes: 'c' })).toEqual({
      ok: true, lists: { emerging: [{ theme: 'a', change: '+1%' }], decreasing: [{ theme: 'b', change: '-2%' }], newThemes: [{ theme: 'c', change: null }] },
    })
  })
  test('anything that is not text is refused, and so is a NUL', () => {
    expect(checkTrendLists({ emerging: 5, decreasing: '', newThemes: '' })).toEqual({ ok: false, error: 'invalid trends' })
    expect(checkTrendLists(null)).toEqual({ ok: false, error: 'invalid trends' })
    expect(checkTrendLists({ emerging: 'a\u0000b', decreasing: '', newThemes: '' })).toEqual({ ok: false, error: 'Emerging holds a character that cannot be saved.' })
  })
})

describe('clientTrends (R2-11: clients see the approved lists only)', () => {
  const lists = (theme: string) => ({ emerging: [{ theme, change: '+1%' }], decreasing: [], newThemes: [] })
  const t = (over: Partial<SlTrends>): SlTrends => ({ month: '2026-10', draft: lists('draft'), approved: null, status: 'draft', ...over })
  test('none before the first approval', () => {
    expect(clientTrends(t({}))).toBeNull()
    expect(clientTrends(null)).toBeNull()
  })
  test('the approved lists, even while a newer draft is being edited', () => {
    expect(clientTrends(t({ approved: lists('approved') }))).toEqual(lists('approved'))
    expect(clientTrends(t({ status: 'approved', draft: lists('approved'), approved: lists('approved') }))).toEqual(lists('approved'))
  })
  test('approved but all three lists empty: none, so the section stays hidden', () => {
    expect(clientTrends(t({ approved: { emerging: [], decreasing: [], newThemes: [] } }))).toBeNull()
  })
})
