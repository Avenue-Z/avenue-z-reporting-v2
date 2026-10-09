import { expect, test } from 'vitest'
import { hasSessionCookie, shouldCountOpen } from './opens'

const req = (method: string, h: Record<string, string> = {}) => ({ method, headers: new Headers(h) })
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'

test('a normal browser GET counts', () => {
  expect(shouldCountOpen(req('GET', { 'user-agent': UA }), false)).toBe(true)
})

test('HEAD does not count', () => {
  expect(shouldCountOpen(req('HEAD', { 'user-agent': UA }), false)).toBe(false)
})

test.each(['slackbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot', 'discordbot', 'whatsapp', 'telegrambot', 'skypeuripreview', 'googlebot', 'bingbot'])(
  'link preview bot %s does not count, in any case', (bot) => {
    const mixed = bot.split('').map((c, i) => (i % 2 ? c.toUpperCase() : c)).join('')
    expect(shouldCountOpen(req('GET', { 'user-agent': `Mozilla/5.0 (compatible; ${mixed}/1.0)` }), false)).toBe(false)
  })

test('staff do not count, and a client-portal session cookie does', () => {
  const withCookie = req('GET', { 'user-agent': UA, cookie: 'authjs.session-token=x' })
  expect(shouldCountOpen(withCookie, true)).toBe(false)
  expect(shouldCountOpen(withCookie, false)).toBe(true)
  expect(shouldCountOpen(req('GET', { 'user-agent': UA }), true)).toBe(false)
})

test('hasSessionCookie finds the Auth.js cookie plain, __Secure- and chunked', () => {
  for (const c of ['authjs.session-token=x', '__Secure-authjs.session-token=x', 'authjs.session-token.0=x']) {
    expect(hasSessionCookie(new Headers({ cookie: `theme=dark; ${c}; other=1` }))).toBe(true)
  }
  expect(hasSessionCookie(new Headers())).toBe(false)
})

test('look-alike cookie names are not a session cookie', () => {
  expect(hasSessionCookie(new Headers({ cookie: 'xauthjs.session-token=x' }))).toBe(false)
  expect(hasSessionCookie(new Headers({ cookie: 'theme=dark' }))).toBe(false)
  expect(shouldCountOpen(req('GET', { 'user-agent': UA, cookie: 'xauthjs.session-token=x' }), false)).toBe(true)
})

test('a missing User-Agent counts, and so does a prefetch', () => {
  expect(shouldCountOpen(req('GET'), false)).toBe(true)
  expect(shouldCountOpen(req('GET', { 'user-agent': UA, 'sec-purpose': 'prefetch' }), false)).toBe(true)
})
