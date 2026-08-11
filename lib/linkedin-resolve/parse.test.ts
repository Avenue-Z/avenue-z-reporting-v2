import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseCanonicalUrl, parseAuthorUrl } from './parse'

const post = readFileSync(join(__dirname, '../organic-social/__fixtures__/linkedin-post.html'), 'utf8')
const pulse = readFileSync(join(__dirname, '../organic-social/__fixtures__/linkedin-pulse.html'), 'utf8')

test('parseCanonicalUrl reads the public /posts url from a post page', () => {
  expect(parseCanonicalUrl(post)).toMatch(/\/posts\/.*activity-\d+/)
})
test('parseAuthorUrl reads the JSON-LD author company page from a pulse page', () => {
  expect(parseAuthorUrl(pulse)).toBe('https://www.linkedin.com/company/renaissancebenefits')
})
test('missing markup returns null, never throws', () => {
  expect(parseCanonicalUrl('<html></html>')).toBeNull()
  expect(parseAuthorUrl('<html></html>')).toBeNull()
})
