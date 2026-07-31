import { describe, expect, test } from 'vitest'
import { money } from './format'

describe('money (Paid Media cents formatter)', () => {
  test('always shows two decimals', () => {
    expect(money(1234.5)).toBe('$1,234.50')
    expect(money(1000000)).toBe('$1,000,000.00')
    expect(money(0)).toBe('$0.00')
  })
  test('a sub-dollar cost does not collapse to a whole dollar', () => {
    expect(money(0.42)).toBe('$0.42')
    expect(money(1.92)).toBe('$1.92')
  })
  test('rounds to the cent', () => {
    expect(money(3.456)).toBe('$3.46')
  })
})
