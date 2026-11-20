import { expect, test } from 'vitest'
import { parseSlPreview, parseSlTopic } from './params'

test('sl=industry is Industry; anything else is Brand', () => {
  expect(parseSlTopic('industry')).toBe('industry')
  for (const raw of ['brand', undefined, null, '', 'Industry', 'paid', ['industry'], 1]) expect(parseSlTopic(raw)).toBe('brand')
})

test('slview=client is the client preview; anything else is off', () => {
  expect(parseSlPreview('client')).toBe(true)
  for (const raw of [undefined, '', 'Client', 'staff', ['client'], true]) expect(parseSlPreview(raw)).toBe(false)
})
