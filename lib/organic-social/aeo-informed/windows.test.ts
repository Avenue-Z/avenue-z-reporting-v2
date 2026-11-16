// lib/organic-social/aeo-informed/windows.test.ts
import { describe, it, expect } from 'vitest'
import { lastNDays, calendarMonth, ytd, allTime, previousWindow, weeklyBuckets, daysIn, assertIsoDate } from './windows'

describe('lastNDays', () => {
  it('is inclusive of both ends: the 30 days ending 2026-11-05 start on 2026-10-07', () => {
    expect(lastNDays('2026-11-05', 30)).toEqual({ start: '2026-10-07', end: '2026-11-05' })
  })
  it('one day is a single-day window', () => {
    expect(lastNDays('2026-11-05', 1)).toEqual({ start: '2026-11-05', end: '2026-11-05' })
  })
  it('crosses a year boundary', () => {
    expect(lastNDays('2027-01-03', 7)).toEqual({ start: '2026-12-28', end: '2027-01-03' })
  })
  it('rejects n below 1 and a non-integer n', () => {
    expect(() => lastNDays('2026-11-05', 0)).toThrow(RangeError)
    expect(() => lastNDays('2026-11-05', 2.5)).toThrow(RangeError)
  })
})

describe('calendarMonth', () => {
  it('30-day month', () => expect(calendarMonth('2026-09')).toEqual({ start: '2026-09-01', end: '2026-09-30' }))
  it('31-day month', () => expect(calendarMonth('2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31' }))
  it('February in a common year and a leap year', () => {
    expect(calendarMonth('2026-02').end).toBe('2026-02-28')
    expect(calendarMonth('2028-02').end).toBe('2028-02-29')
  })
  it('rejects a malformed month', () => {
    expect(() => calendarMonth('2026-13')).toThrow(RangeError)
    expect(() => calendarMonth('2026-9')).toThrow(RangeError)
  })
})

describe('ytd and allTime', () => {
  it('ytd runs from January 1 of the same year to today', () => {
    expect(ytd('2026-11-09')).toEqual({ start: '2026-01-01', end: '2026-11-09' })
  })
  it('allTime runs from the first data date to today', () => {
    expect(allTime('2025-03-02', '2026-11-09')).toEqual({ start: '2025-03-02', end: '2026-11-09' })
  })
  it('allTime rejects a first date after today', () => {
    expect(() => allTime('2026-11-10', '2026-11-09')).toThrow(RangeError)
  })
})

describe('previousWindow: the same length, ending the day before', () => {
  it('September (30 days) compares with 2026-08-02..2026-08-31, not all of August', () => {
    expect(previousWindow(calendarMonth('2026-09'))).toEqual({ start: '2026-08-02', end: '2026-08-31' })
  })
  it('the 30 days ending 2026-11-05 compare with 2026-09-07..2026-10-06', () => {
    expect(previousWindow(lastNDays('2026-11-05', 30))).toEqual({ start: '2026-09-07', end: '2026-10-06' })
  })
  it('a one-day window compares with the day before', () => {
    expect(previousWindow({ start: '2026-03-01', end: '2026-03-01' })).toEqual({ start: '2026-02-28', end: '2026-02-28' })
  })
  it('keeps the length equal across a leap day', () => {
    const w = { start: '2028-03-01', end: '2028-03-10' }
    const p = previousWindow(w)
    expect(daysIn(p)).toBe(daysIn(w))
    expect(p.end).toBe('2028-02-29')
  })
})

describe('weeklyBuckets: 7 days from the chart start, not ISO weeks', () => {
  it('starting on a Thursday gives Thursday to Wednesday buckets', () => {
    expect(weeklyBuckets('2026-09-03', 3)).toEqual([
      { start: '2026-09-03', end: '2026-09-09' },
      { start: '2026-09-10', end: '2026-09-16' },
      { start: '2026-09-17', end: '2026-09-23' },
    ])
  })
  it('zero or negative counts are rejected', () => {
    expect(() => weeklyBuckets('2026-09-03', 0)).toThrow(RangeError)
  })
})

describe('validation', () => {
  it('daysIn counts both ends', () => expect(daysIn({ start: '2026-09-01', end: '2026-09-30' })).toBe(30))
  it('assertIsoDate rejects a non-date and an impossible date', () => {
    expect(() => assertIsoDate('2026-9-1')).toThrow(RangeError)
    expect(() => assertIsoDate('2026-02-30')).toThrow(RangeError)
    expect(() => assertIsoDate('')).toThrow(RangeError)
  })
  it('a window whose start is after its end is rejected', () => {
    expect(() => previousWindow({ start: '2026-09-30', end: '2026-09-01' })).toThrow(RangeError)
  })
})
