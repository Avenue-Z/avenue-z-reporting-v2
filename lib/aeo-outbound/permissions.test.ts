import { expect, test } from 'vitest'
import { accessFor, originAllowed, outboundUsers } from './permissions'

const LIST = 'ryan@avenuez.com, Other@AvenueZ.com'
test('the list is trimmed, lowercased and empty-safe', () => {
  expect([...outboundUsers(LIST)]).toEqual(['ryan@avenuez.com', 'other@avenuez.com'])
  expect(outboundUsers(undefined).size).toBe(0)
  expect(outboundUsers('').size).toBe(0)
})
const NONE = { users: [] as string[], admins: [] as string[] }
test('accessFor: env staff are users and admins; the settings lists add users and admins', () => {
  const env = outboundUsers(LIST)
  expect(accessFor({ role: 'INTERNAL_ANALYST', email: 'Ryan@avenuez.com' }, env, NONE)).toEqual({ email: 'ryan@avenuez.com', admin: true })
  expect(accessFor({ role: 'INTERNAL_ADMIN', email: 'someone@avenuez.com' }, env, NONE)).toBeNull()
  expect(accessFor({ role: 'INTERNAL_ADMIN', email: 'someone@avenuez.com' }, env, { users: ['someone@avenuez.com'], admins: [] })).toEqual({ email: 'someone@avenuez.com', admin: false })
  expect(accessFor({ role: 'INTERNAL_ADMIN', email: 'boss@avenuez.com' }, env, { users: [], admins: ['boss@avenuez.com'] })).toEqual({ email: 'boss@avenuez.com', admin: true })
  expect(accessFor({ role: 'CLIENT_ADMIN', email: 'ryan@avenuez.com' }, env, NONE)).toBeNull()
  expect(accessFor({ role: 'INTERNAL_ANALYST', email: 'ryan@gmail.com' }, outboundUsers('ryan@gmail.com'), { users: ['ryan@gmail.com'], admins: [] })).toBeNull()
  expect(accessFor({ role: 'INTERNAL_ANALYST', email: null }, env, NONE)).toBeNull()
  expect(accessFor(null, env, NONE)).toBeNull()
})
test('an unset env list and empty settings mean nobody', () => {
  expect(accessFor({ role: 'INTERNAL_ADMIN', email: 'ryan@avenuez.com' }, outboundUsers(undefined), NONE)).toBeNull()
})
test('origin check: absent passes, same host passes, anything else fails', () => {
  expect(originAllowed(null, 'app.example')).toBe(true)
  expect(originAllowed('https://app.example', 'app.example')).toBe(true)
  expect(originAllowed('https://evil.example', 'app.example')).toBe(false)
  expect(originAllowed('null', 'app.example')).toBe(false)
  expect(originAllowed('https://app.example', null)).toBe(false)
})
