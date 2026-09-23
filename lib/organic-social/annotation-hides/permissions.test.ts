import { expect, test } from 'vitest'
import { canHideAnnotation } from './permissions'

test('internal staff may hide an annotation', () => {
  expect(canHideAnnotation('INTERNAL_ADMIN')).toBe(true)
  expect(canHideAnnotation('INTERNAL_ANALYST')).toBe(true)
})

test('client roles may not', () => {
  expect(canHideAnnotation('CLIENT_ADMIN')).toBe(false)
  expect(canHideAnnotation('CLIENT_VIEWER')).toBe(false)
})
