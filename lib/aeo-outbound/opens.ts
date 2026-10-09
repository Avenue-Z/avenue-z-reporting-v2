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
