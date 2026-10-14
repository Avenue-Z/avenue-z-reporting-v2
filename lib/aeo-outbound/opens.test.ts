import { expect, test } from 'vitest'
import { hasSessionCookie, LINK_FRESH_MS, OPEN_REASONS, shouldCountOpen, uaFamily } from './opens'

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

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)'
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko)'
test.each([
  [`${MAC} Chrome/129.0.0.0 Safari/537.36`, 'Chrome on Mac'],
  [`${WIN} Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0`, 'Edge on Windows'],
  [`${WIN} Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0`, 'Opera on Windows'],
  [`${IPHONE} Version/18.0 Mobile/15E148 Safari/604.1`, 'Safari on iOS'],
  [`${IPHONE} CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1`, 'Chrome on iOS'],
  [`${IPHONE} FxiOS/131.0 Mobile/15E148 Safari/605.1.15`, 'Firefox on iOS'],
  [`${IPHONE} EdgiOS/129.0 Mobile/15E148 Safari/605.1.15`, 'Edge on iOS'],
  [`${ANDROID} Chrome/129.0.0.0 Mobile Safari/537.36`, 'Chrome on Android'],
  [`${ANDROID} Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0`, 'Edge on Android'],
  ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox on Linux'],
  [`${MAC} Version/18.0 Safari/605.1.15`, 'Safari on Mac'],
  ['Mozilla/5.0 (Unknown OS) Gecko/20100101 Firefox/131.0', 'Firefox'],
  [`${MAC} HeadlessChrome/129.0.0.0 Safari/537.36`, 'Other'],
  ['curl/8.7.1', 'Other'],
  ['', 'Other'],
])('ua_family patterns: Edge and Opera before Chrome, CriOS is Chrome, FxiOS is Firefox (%s)', (ua, family) => {
  expect(uaFamily(ua)).toBe(family)
})

test('a missing user agent is Other, and the three reasons and the one-minute rule are fixed', () => {
  expect(uaFamily(null)).toBe('Other')
  expect(uaFamily(undefined)).toBe('Other')
  expect(LINK_FRESH_MS).toBe(60_000)
  expect(OPEN_REASONS).toEqual({
    fresh: 'Opened within a minute of the link being created',
    quick: 'Opened within 10 seconds of the previous open',
    unknown: 'Not a known browser',
  })
})

test('C5: an iOS in-app browser (WebKit, Mobile/, no browser token) is its own family; Safari and curl are unchanged', () => {
  const LINKEDIN = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30'
  const OUTLOOK = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  expect(uaFamily(LINKEDIN)).toBe('In-app browser on iOS')
  expect(uaFamily(OUTLOOK)).toBe('In-app browser on iOS')
  expect(uaFamily(`${OUTLOOK.replace('Mobile/15E148', '')}Version/18.0 Mobile/15E148 Safari/604.1`)).toBe('Safari on iOS')
  expect(uaFamily('curl/8.0')).toBe('Other')
  expect(uaFamily('Mozilla/5.0 (iPhone) HeadlessChrome/129.0 AppleWebKit/605 Mobile/15E148')).toBe('Other')
})
