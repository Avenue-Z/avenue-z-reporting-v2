import { expect, test } from 'vitest'
import { initialPeriod } from './initial-period'

test('an edited entry keeps its period; a new entry starts from the month on screen; otherwise empty, as today', () => {
  const month = { start: '2026-09-01', end: '2026-09-30' }
  expect(initialPeriod({ periodStart: '2026-08-01', periodEnd: '2026-08-31' }, month)).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  expect(initialPeriod(undefined, month)).toEqual(month)
  expect(initialPeriod(undefined, undefined)).toEqual({ start: '', end: '' })
  expect(initialPeriod({ periodStart: '2026-08-01', periodEnd: '2026-08-31' }, undefined)).toEqual({ start: '2026-08-01', end: '2026-08-31' })
})
