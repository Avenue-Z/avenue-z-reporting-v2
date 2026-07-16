import { describe, it, expect } from 'vitest'
import { formatDaysToFirst } from './format-speed'

describe('formatDaysToFirst', () => {
  it('renders null as None', () => {
    expect(formatDaysToFirst(null)).toBe('None')
  })

  it('renders zero days as Same day', () => {
    expect(formatDaysToFirst(0)).toBe('Same day')
  })

  it('renders one day as singular', () => {
    expect(formatDaysToFirst(1)).toBe('1 day')
  })

  it('renders two days as plural', () => {
    expect(formatDaysToFirst(2)).toBe('2 days')
  })

  it('renders five days as plural', () => {
    expect(formatDaysToFirst(5)).toBe('5 days')
  })

  it('renders a fraction rounding to zero as Same day', () => {
    expect(formatDaysToFirst(0.4)).toBe('Same day')
  })

  it('renders a fraction rounding to one as singular', () => {
    expect(formatDaysToFirst(0.5)).toBe('1 day')
  })

  it('renders a fraction rounding down to one as singular', () => {
    expect(formatDaysToFirst(1.4)).toBe('1 day')
  })

  it('renders a fraction rounding up to two as plural', () => {
    expect(formatDaysToFirst(1.6)).toBe('2 days')
  })
})
