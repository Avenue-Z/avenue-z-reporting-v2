import { describe, it, expect } from 'vitest'
import { resolveScatterWindow } from './scatter-window'

// today = 2026-02-15 => 30-day floor = 2026-01-16 for every test below.
const TODAY = '2026-02-15'
const FLOOR = '2026-01-16'

describe('resolveScatterWindow', () => {
  it('range fully inside the last 30 days passes through unchanged, locked:false', () => {
    const result = resolveScatterWindow({ startDate: '2026-01-20', endDate: '2026-02-01' }, TODAY)
    expect(result).toEqual({ start_date: '2026-01-20', end_date: '2026-02-01', locked: false })
  })

  it('range starting before the floor clamps start to the floor, locked:true', () => {
    const result = resolveScatterWindow({ startDate: '2026-01-01', endDate: '2026-02-01' }, TODAY)
    expect(result).toEqual({ start_date: FLOOR, end_date: '2026-02-01', locked: true })
  })

  it('range entirely older than 30 days falls back to the default last-30 window, locked:true', () => {
    const result = resolveScatterWindow({ startDate: '2025-11-01', endDate: '2025-12-01' }, TODAY)
    expect(result).toEqual({ start_date: FLOOR, end_date: TODAY, locked: true })
  })

  it('exact boundary: start === floor and end === today, fully in range, locked:false', () => {
    const result = resolveScatterWindow({ startDate: FLOOR, endDate: TODAY }, TODAY)
    expect(result).toEqual({ start_date: FLOOR, end_date: TODAY, locked: false })
  })

  it('exact boundary: end === floor (not older than floor, still clamps start), locked:true', () => {
    const result = resolveScatterWindow({ startDate: '2026-01-01', endDate: FLOOR }, TODAY)
    expect(result).toEqual({ start_date: FLOOR, end_date: FLOOR, locked: true })
  })

  it('exact boundary: end === floor minus one day IS entirely older, locked:true default window', () => {
    const result = resolveScatterWindow({ startDate: '2025-12-01', endDate: '2026-01-15' }, TODAY)
    expect(result).toEqual({ start_date: FLOOR, end_date: TODAY, locked: true })
  })

  it('selected end beyond today clamps end to today, locked:true', () => {
    const result = resolveScatterWindow({ startDate: FLOOR, endDate: '2026-02-20' }, TODAY)
    expect(result).toEqual({ start_date: FLOOR, end_date: TODAY, locked: true })
  })
})
