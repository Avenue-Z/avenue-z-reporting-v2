import { expect, test } from 'vitest'
import { SLUG_MAX, brandSlug, sharePath, shareUrl, tokenFromSegment } from './share-link'

const T = 'AbCdEfGhIjKlMnOpQrStUv_-'

test('brandSlug: NFKD, marks removed, lowercase, one dash per run of other characters, trimmed, at most 40', () => {
  expect(brandSlug('Example Co')).toBe('example-co')
  expect(brandSlug('Café Société & Fils')).toBe('cafe-societe-fils')
  expect(brandSlug('  --Acme!!  Labs--  ')).toBe('acme-labs')
  expect(brandSlug('ＡＢＣ　１２３')).toBe('abc-123')
  expect(brandSlug('🙂🙂')).toBe('')
  expect(brandSlug('日本')).toBe('')
  expect(brandSlug(null)).toBe('')
  expect(brandSlug('')).toBe('')
  const long = brandSlug('alpha '.repeat(10))
  expect(long.length).toBeLessThanOrEqual(SLUG_MAX)
  expect(long.endsWith('-')).toBe(false)
  expect(long).toBe('alpha-alpha-alpha-alpha-alpha-alpha-alph')
  expect(brandSlug('a'.repeat(39) + ' b')).toBe('a'.repeat(39))
})

test('sharePath and shareUrl: brand slug then the token; no slug gives the bare token', () => {
  expect(sharePath('Example Co', T)).toBe(`/snapshot/example-co-${T}`)
  expect(sharePath(null, T)).toBe(`/snapshot/${T}`)
  expect(sharePath('🙂', T)).toBe(`/snapshot/${T}`)
  expect(shareUrl('https://reporting.avenuez.com', 'Example Co', T)).toBe(`https://reporting.avenuez.com/snapshot/example-co-${T}`)
})

test('tokenFromSegment: a bare token, or a well-formed slug then "-" then a token; anything else is null', () => {
  expect(tokenFromSegment(T)).toBe(T)
  expect(tokenFromSegment(`example-co-${T}`)).toBe(T)
  expect(tokenFromSegment(`a-${T}`)).toBe(T)
  expect(tokenFromSegment(`${'a'.repeat(40)}-${T}`)).toBe(T)
  for (const bad of [`${'a'.repeat(41)}-${T}`, `Example-${T}`, `ex_ample-${T}`, `-${T}`, `ex--co-${T}`, `x${T}`, T.slice(1), `example-co-${T.slice(1)}`, `example-co-${T}x`, `example co-${T}`, '', 'short']) {
    expect(tokenFromSegment(bad)).toBeNull()
  }
  // Every built path reads back to its token.
  for (const brand of ['Example Co', 'Café', null, '🙂', 'alpha '.repeat(10)]) {
    expect(tokenFromSegment(sharePath(brand, T).slice('/snapshot/'.length))).toBe(T)
  }
})
