import { expect, test } from 'vitest'
import { originAllowed, outboundEmail, outboundUsers } from './permissions'

const LIST = 'ryan@avenuez.com, Other@AvenueZ.com'
test('the list is trimmed, lowercased and empty-safe', () => {
  expect([...outboundUsers(LIST)]).toEqual(['ryan@avenuez.com', 'other@avenuez.com'])
  expect(outboundUsers(undefined).size).toBe(0)
  expect(outboundUsers('').size).toBe(0)
})
test('only allowlisted staff get through', () => {
  expect(outboundEmail({ role: 'INTERNAL_ANALYST', email: 'Ryan@avenuez.com' }, LIST)).toBe('ryan@avenuez.com')
  expect(outboundEmail({ role: 'INTERNAL_ADMIN', email: 'someone@avenuez.com' }, LIST)).toBeNull()
  expect(outboundEmail({ role: 'CLIENT_ADMIN', email: 'ryan@avenuez.com' }, LIST)).toBeNull()
  expect(outboundEmail({ role: 'INTERNAL_ANALYST', email: 'ryan@gmail.com' }, 'ryan@gmail.com')).toBeNull()
  expect(outboundEmail({ role: 'INTERNAL_ANALYST', email: null }, LIST)).toBeNull()
  expect(outboundEmail(null, LIST)).toBeNull()
})
test('unset list means nobody', () => {
  expect(outboundEmail({ role: 'INTERNAL_ADMIN', email: 'ryan@avenuez.com' }, undefined)).toBeNull()
})
test('origin check: absent passes, same host passes, anything else fails', () => {
  expect(originAllowed(null, 'app.example')).toBe(true)
  expect(originAllowed('https://app.example', 'app.example')).toBe(true)
  expect(originAllowed('https://evil.example', 'app.example')).toBe(false)
  expect(originAllowed('null', 'app.example')).toBe(false)
  expect(originAllowed('https://app.example', null)).toBe(false)
})
