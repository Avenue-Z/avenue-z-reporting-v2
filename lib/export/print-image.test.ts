import { expect, test } from 'vitest'
import { printImageUrl } from './print-image'

const DASH = 'https://images.dashsocial.com/aHR0cHM6Ly9jZG4uZXhhbXBsZS9tZWRpYS5qcGc=?w=640&h=640&fit=cover'

test('a Dash Social image is asked for as a small JPEG at the printed size', () => {
  const u = new URL(printImageUrl(DASH, 360, 270))
  expect(u.origin + u.pathname).toBe('https://images.dashsocial.com/aHR0cHM6Ly9jZG4uZXhhbXBsZS9tZWRpYS5qcGc=')
  expect(Object.fromEntries(u.searchParams)).toEqual({ w: '360', h: '270', fit: 'cover', format: 'jpeg', quality: '70' })
})

test.each([
  ['another host', 'https://scontent.cdninstagram.com/v/abc.jpg?x=1'],
  ['plain http', 'http://images.dashsocial.com/abc'],
  ['a look-alike host', 'https://images.dashsocial.com.evil.example/abc'],
  ['not a URL', 'not a url'],
])('%s is left exactly as it is', (_, src) => {
  expect(printImageUrl(src, 360, 270)).toBe(src)
})
