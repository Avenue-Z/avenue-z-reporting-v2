import { expect, test } from 'vitest'
import { errorLabel } from './log'

test('uses the string code, walking .cause up to 5 levels', () => {
  expect(errorLabel(Object.assign(new Error('boom'), { code: '57P01' }))).toBe('57P01')
  expect(errorLabel(new Error('outer', { cause: Object.assign(new Error('inner'), { code: 'ECONNRESET' }) }))).toBe('ECONNRESET')
  let deep: Error = Object.assign(new Error('x'), { code: 'TOO_DEEP' })
  for (let i = 0; i < 5; i++) deep = new Error('wrap', { cause: deep })
  expect(errorLabel(deep)).toBe('Error')
})

test('falls back to the name, never the message', () => {
  const e = new TypeError('secret@example.com value')
  expect(errorLabel(e)).toBe('TypeError')
  expect(errorLabel('plain string')).toBe('error')
  expect(errorLabel(Object.assign(new Error('n'), { code: 42 }))).toBe('Error')
})
