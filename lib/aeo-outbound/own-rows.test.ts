import { expect, test } from 'vitest'
import { ownDomainMatch, ownRowsOf } from './own-rows'

const row = (domain: string, classification = 'EDITORIAL') => ({ domain, classification })

test('a row is own when Peec classifies it OWN, or it is an own domain or a subdomain of one (spec 2026-11-02 S2)', () => {
  const rows = [row('elsewhere.example', 'OWN'), row('example.com'), row('WWW.Example.com'), row('shop.example.com'), row('notexample.com'), row('rival.com')]
  expect(ownRowsOf(rows, ['www.example.com']).map((r) => r.domain)).toEqual(['elsewhere.example', 'example.com', 'WWW.Example.com', 'shop.example.com'])
})

test('an empty own domain never matches by suffix, and no own domains leaves only OWN rows', () => {
  const rows = [row('a.com'), row('b.com', 'OWN')]
  expect(ownRowsOf(rows, ['', '  '])).toEqual([row('b.com', 'OWN')])
  expect(ownRowsOf(rows, null)).toEqual([row('b.com', 'OWN')])
  expect(ownDomainMatch([' www.Example.com ', '', 'shop.io'])).toEqual(['example.com', 'shop.io'])
})
