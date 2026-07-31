import { expect, test } from 'vitest'
import { canSetDesignation } from './permissions'

test('internal staff may set a designation', () => {
  expect(canSetDesignation('INTERNAL_ADMIN')).toBe(true)
  expect(canSetDesignation('INTERNAL_ANALYST')).toBe(true)
})
test('client roles may not', () => {
  expect(canSetDesignation('CLIENT_ADMIN')).toBe(false)
  expect(canSetDesignation('CLIENT_VIEWER')).toBe(false)
})
