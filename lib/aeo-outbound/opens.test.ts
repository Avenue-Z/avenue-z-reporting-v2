import { expect, test } from 'vitest'
import { shouldCountOpen } from './opens'

const req = (method: string, h: Record<string, string> = {}) => ({ method, headers: new Headers(h) })
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'

test('a normal browser GET counts', () => {
  expect(shouldCountOpen(req('GET', { 'user-agent': UA }))).toBe(true)
})

test('HEAD does not count', () => {
  expect(shouldCountOpen(req('HEAD', { 'user-agent': UA }))).toBe(false)
})

test.each(['slackbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot', 'discordbot', 'whatsapp', 'telegrambot', 'skypeuripreview', 'googlebot', 'bingbot'])(
  'link preview bot %s does not count, in any case', (bot) => {
    const mixed = bot.split('').map((c, i) => (i % 2 ? c.toUpperCase() : c)).join('')
    expect(shouldCountOpen(req('GET', { 'user-agent': `Mozilla/5.0 (compatible; ${mixed}/1.0)` }))).toBe(false)
  })

test('a signed-in staff session does not count', () => {
  for (const c of ['authjs.session-token=x', '__Secure-authjs.session-token=x', 'authjs.session-token.0=x']) {
    expect(shouldCountOpen(req('GET', { 'user-agent': UA, cookie: `theme=dark; ${c}; other=1` }))).toBe(false)
  }
})

test('look-alike cookie names still count', () => {
  expect(shouldCountOpen(req('GET', { 'user-agent': UA, cookie: 'xauthjs.session-token=x' }))).toBe(true)
  expect(shouldCountOpen(req('GET', { 'user-agent': UA, cookie: 'theme=dark' }))).toBe(true)
})

test('a missing User-Agent counts, and so does a prefetch', () => {
  expect(shouldCountOpen(req('GET'))).toBe(true)
  expect(shouldCountOpen(req('GET', { 'user-agent': UA, 'sec-purpose': 'prefetch' }))).toBe(true)
})
