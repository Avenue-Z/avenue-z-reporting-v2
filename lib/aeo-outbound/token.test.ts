import { expect, test } from 'vitest'
import { isShareTokenShape, newShareToken } from './token'

test('tokens are 24 url-safe characters and differ', () => {
  const a = newShareToken(), b = newShareToken()
  expect(isShareTokenShape(a)).toBe(true)
  expect(a).not.toBe(b)
})
test('shape check rejects anything else', () => {
  for (const t of ['', 'short', 'a'.repeat(25), 'abc/def'.padEnd(24, 'x'), '../'.padEnd(24, 'x')]) expect(isShareTokenShape(t)).toBe(false)
})
