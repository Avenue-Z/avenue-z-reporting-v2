import { expect, test } from 'vitest'
import { cleanRecipient, MAX_RECIPIENT, RECIPIENT_ERROR } from './recipient'

test('a recipient is cleaned like any other value', () => {
  expect(cleanRecipient('  Jane Doe,\n Acme ')).toEqual({ ok: true, value: 'Jane Doe, Acme' })
})

test('empty, blank, non-string and over-long recipients are refused', () => {
  const bad = { ok: false, error: RECIPIENT_ERROR }
  expect(cleanRecipient('')).toEqual(bad)
  expect(cleanRecipient('   ')).toEqual(bad)
  expect(cleanRecipient(5)).toEqual(bad)
  expect(cleanRecipient(undefined)).toEqual(bad)
  expect(cleanRecipient('a'.repeat(MAX_RECIPIENT + 1))).toEqual(bad)
  expect(cleanRecipient(`  ${'a'.repeat(MAX_RECIPIENT + 1)}  `)).toEqual(bad)
})

test('exactly 200 characters passes', () => {
  expect(MAX_RECIPIENT).toBe(200)
  expect(cleanRecipient('a'.repeat(200))).toEqual({ ok: true, value: 'a'.repeat(200) })
})
