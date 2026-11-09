// lib/organic-social/aeo-informed/chunks.test.ts
import { describe, it, expect } from 'vitest'
import { chunkWindow, pullChunks } from './chunks'
import { PeecPageCapError, PeecHttpError } from './peec-read'
import type { PeecReader } from './peec-read'
import { daysIn } from './windows'

type Body = { start_date: string; end_date: string; offset: number; limit: number; [k: string]: unknown }

describe('chunkWindow', () => {
  it('keeps a window of 31 days or fewer as one chunk', () => {
    expect(chunkWindow({ start: '2026-10-07', end: '2026-11-05' })).toEqual([{ start: '2026-10-07', end: '2026-11-05' }])
    expect(chunkWindow({ start: '2026-10-01', end: '2026-10-31' })).toHaveLength(1)
  })
  it('splits 2026-08-14..2026-11-09 into 31, 31 and 26 days with no gap and no overlap', () => {
    const c = chunkWindow({ start: '2026-08-14', end: '2026-11-09' })
    expect(c).toEqual([
      { start: '2026-08-14', end: '2026-09-13' },
      { start: '2026-09-14', end: '2026-10-14' },
      { start: '2026-10-15', end: '2026-11-09' },
    ])
    expect(c.map(daysIn)).toEqual([31, 31, 26])
  })
  it('a one-day window is one chunk', () => {
    expect(chunkWindow({ start: '2026-02-28', end: '2026-02-28' })).toEqual([{ start: '2026-02-28', end: '2026-02-28' }])
  })
  it('crosses a leap day and a year end without losing a day', () => {
    const c = chunkWindow({ start: '2027-12-01', end: '2028-03-15' })
    expect(c.reduce((n, w) => n + daysIn(w), 0)).toBe(daysIn({ start: '2027-12-01', end: '2028-03-15' }))
    expect(c[0].start).toBe('2027-12-01')
    expect(c[c.length - 1].end).toBe('2028-03-15')
  })
  it('honours a smaller maximum', () => {
    expect(chunkWindow({ start: '2026-09-01', end: '2026-09-10' }, 4).map(daysIn)).toEqual([4, 4, 2])
  })
  it('rejects a start after the end and a maximum below 1', () => {
    expect(() => chunkWindow({ start: '2026-09-10', end: '2026-09-01' })).toThrow(RangeError)
    expect(() => chunkWindow({ start: '2026-09-01', end: '2026-09-10' }, 0)).toThrow(RangeError)
  })
})

function fakeReader(pageRows: (i: number) => unknown[], failAt = -1) {
  const bodies: Record<string, unknown>[] = []
  const labels: (string | undefined)[] = []
  let i = 0
  const reader: PeecReader = {
    get: async () => ({}),
    post: async (_path, body, label) => {
      bodies.push(body); labels.push(label)
      if (i === failAt) throw new PeecHttpError(500, '/reports/urls', 'boom', label)
      return { data: pageRows(i++) }
    },
  }
  return { reader, bodies, labels }
}
const parse = (b: unknown) => (b as { data: unknown[] }).data

describe('pullChunks', () => {
  it('sends one request per chunk with that chunk\'s dates, limit 10000, offset 0, and keeps the base body', async () => {
    const f = fakeReader((i) => [{ i }])
    const rows = await pullChunks(f.reader, '/reports/urls', { dimensions: ['date'], filters: [] }, { start: '2026-08-14', end: '2026-11-09' }, parse, 'socials-by-day')
    expect(f.bodies).toHaveLength(3)
    expect(f.bodies.map((b) => [b.start_date, b.end_date, b.offset, b.limit])).toEqual([
      ['2026-08-14', '2026-09-13', 0, 10000], ['2026-09-14', '2026-10-14', 0, 10000], ['2026-10-15', '2026-11-09', 0, 10000],
    ])
    expect(f.bodies.every((b) => JSON.stringify(b.dimensions) === '["date"]')).toBe(true)
    expect(rows).toEqual([{ i: 0 }, { i: 1 }, { i: 2 }])
  })
  it('puts the label and the chunk window in the label it passes to the reader', async () => {
    const f = fakeReader(() => [])
    await pullChunks(f.reader, '/reports/urls', {}, { start: '2026-09-01', end: '2026-09-30' }, parse, 'gaps-by-day')
    expect(f.labels[0]).toBe('gaps-by-day 2026-09-01..2026-09-30')
  })
  it('splits a chunk that returns a full page in half and retries, keeping every row once and in date order', async () => {
    const bodies: Body[] = []
    const reader: PeecReader = {
      get: async () => ({}),
      post: async (_p, rb) => {
        const body = rb as Body
        bodies.push(body)
        const n = daysIn({ start: body.start_date, end: body.end_date })
        return { data: n > 5 ? Array.from({ length: 10000 }, (_, k) => ({ k })) : [{ start: body.start_date, n }] }
      },
    }
    const rows = (await pullChunks(reader, '/reports/urls', {}, { start: '2026-09-01', end: '2026-09-30' }, parse, 'x')) as { start: string; n: number }[]
    expect(rows.map((r) => r.start)).toEqual([...rows.map((r) => r.start)].sort())
    expect(rows.reduce((t, r) => t + r.n, 0)).toBe(30)
    expect(rows.every((r) => r.n <= 5)).toBe(true)
    expect(bodies.every((b) => b.offset === 0 && b.limit === 10000)).toBe(true)
  })
  it('a one-day chunk that still returns a full page throws instead of returning a partial day', async () => {
    const f = fakeReader(() => Array.from({ length: 10000 }, (_, k) => ({ k })))
    await expect(pullChunks(f.reader, '/reports/urls', {}, { start: '2026-09-01', end: '2026-09-01' }, parse, 'x')).rejects.toBeInstanceOf(PeecPageCapError)
    expect(f.bodies).toHaveLength(1)
  })
  it('uses the chunk size it is given (the chat-level pull uses 14 days)', async () => {
    const f = fakeReader(() => [])
    await pullChunks(f.reader, '/reports/urls', {}, { start: '2026-09-01', end: '2026-09-30' }, parse, 'x', { chunkDays: 14 })
    expect(f.bodies.map((b) => [b.start_date, b.end_date])).toEqual([['2026-09-01', '2026-09-14'], ['2026-09-15', '2026-09-28'], ['2026-09-29', '2026-09-30']])
  })
  it('accepts a chunk one row under a full page', async () => {
    const f = fakeReader(() => Array.from({ length: 9999 }, (_, k) => ({ k })))
    expect(await pullChunks(f.reader, '/reports/urls', {}, { start: '2026-09-01', end: '2026-09-30' }, parse, 'x')).toHaveLength(9999)
  })
  it('a failed chunk rejects the whole pull and later chunks are not requested', async () => {
    const f = fakeReader(() => [{}], 1)
    await expect(pullChunks(f.reader, '/reports/urls', {}, { start: '2026-08-14', end: '2026-11-09' }, parse, 'x')).rejects.toBeInstanceOf(PeecHttpError)
    expect(f.bodies).toHaveLength(2)
  })
})
