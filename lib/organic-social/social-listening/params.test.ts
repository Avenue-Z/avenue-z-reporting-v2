import { expect, test } from 'vitest'
import { parseSlTopic } from './params'

test('sl=industry is Industry; anything else is Brand', () => {
  expect(parseSlTopic('industry')).toBe('industry')
  for (const raw of ['brand', undefined, null, '', 'Industry', 'paid', ['industry'], 1]) expect(parseSlTopic(raw)).toBe('brand')
})
