import { describe, expect, test } from 'vitest'
import { isAvenueZEmail, getApprovers, canEditCommentary, canApproveCommentary } from './permissions'

describe('isAvenueZEmail', () => {
  test('accepts @avenuez.com case-insensitively', () => {
    expect(isAvenueZEmail('paul.ramirez@avenuez.com')).toBe(true)
    expect(isAvenueZEmail('Maddie@AvenueZ.com')).toBe(true)
  })
  test('rejects other domains and empties', () => {
    expect(isAvenueZEmail('someone@client.com')).toBe(false)
    expect(isAvenueZEmail('evil@avenuez.com.attacker.io')).toBe(false)
    expect(isAvenueZEmail(null)).toBe(false)
    expect(isAvenueZEmail(undefined)).toBe(false)
  })
})

describe('getApprovers / canApproveCommentary', () => {
  const env = 'maddie@avenuez.com, Dianna@avenuez.com'
  test('parses comma list, trims, lowercases', () => {
    expect(getApprovers(env)).toEqual(new Set(['maddie@avenuez.com', 'dianna@avenuez.com']))
    expect(getApprovers('')).toEqual(new Set())
    expect(getApprovers(undefined)).toEqual(new Set())
  })
  test('approve requires Avenue Z email AND allowlist membership', () => {
    expect(canApproveCommentary('maddie@avenuez.com', env)).toBe(true)
    expect(canApproveCommentary('Dianna@avenuez.com', env)).toBe(true)  // case-insensitive
    expect(canApproveCommentary('paul.ramirez@avenuez.com', env)).toBe(false) // AZ but not approver
    expect(canApproveCommentary('dianna@client.com', env)).toBe(false)  // not AZ
  })
  test('denies a non-Avenue-Z email even when present in the allowlist string', () => {
    expect(canApproveCommentary('attacker@evil.com', 'attacker@evil.com,maddie@avenuez.com')).toBe(false)
  })
})

describe('canEditCommentary', () => {
  test('any Avenue Z email may edit', () => {
    expect(canEditCommentary('paul.ramirez@avenuez.com')).toBe(true)
    expect(canEditCommentary('client@acme.com')).toBe(false)
  })
})
