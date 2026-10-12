// Whether a request for a live link counts as a recipient opening it (spec §8 "Recording an open").
// Link-preview bots, HEAD requests and signed-in staff do not count. A prefetch does (spec review log item 6).

/** Auth.js's session cookie, plain or __Secure-, whole or chunked (app/api/export/pdf/route.ts:21). */
const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?$/

const BOTS = ['slackbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot', 'discordbot', 'whatsapp', 'telegrambot', 'skypeuripreview', 'googlebot', 'bingbot']

/** True when the request carries an Auth.js session cookie. The route reads the session only then. */
export function hasSessionCookie(headers: Headers): boolean {
  const cookies = (headers.get('cookie') ?? '').split(';').map((c) => c.trim().split('=')[0])
  return cookies.some((name) => SESSION_COOKIE.test(name))
}

/** viewerIsStaff is decided by the caller from the session; a client-portal session still counts. */
export function shouldCountOpen(req: { method: string; headers: Headers }, viewerIsStaff: boolean): boolean {
  if (req.method !== 'GET') return false
  const ua = (req.headers.get('user-agent') ?? '').toLowerCase()
  if (BOTS.some((b) => ua.includes(b))) return false
  return !viewerIsStaff
}

/** An open this soon after the link was created is likely an email security scanner (spec v1.1 §6). */
export const LINK_FRESH_MS = 60_000
/** The reason stored with a likely automated open, by rule, first match wins (spec v1.1 §6). */
export const OPEN_REASONS = {
  fresh: 'Opened within a minute of the link being created',
  quick: 'Opened within 10 seconds of the previous open',
  unknown: 'Not a known browser',
} as const

// The browser family of an open (spec v1.1 §6), from a fixed pattern list, first match wins. Edge and Opera carry
// "Chrome/" too, so they are tested first; CriOS is Chrome and FxiOS is Firefox (iOS). A headless browser is not a
// browser family. Only the family is stored: never the full user agent.
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOPiOS\/|\bOpera\b/, 'Opera'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
]
// iOS before Mac (an iPhone says "like Mac OS X"); Android before Linux (Android says "Linux").
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'Mac'],
  [/Linux|X11/, 'Linux'],
]

export function uaFamily(ua: string | null | undefined): string {
  const s = ua ?? ''
  if (/HeadlessChrome/.test(s)) return 'Other'
  const browser = BROWSERS.find(([re]) => re.test(s))?.[1]
  if (!browser) return 'Other'
  const system = SYSTEMS.find(([re]) => re.test(s))?.[1]
  return system ? `${browser} on ${system}` : browser
}
