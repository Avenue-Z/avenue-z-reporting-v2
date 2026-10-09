// Whether a request for a live link counts as a recipient opening it (spec §8 "Recording an open").
// Link-preview bots, HEAD requests and signed-in staff do not count. A prefetch does (spec review log item 6).

/** Auth.js's session cookie, plain or __Secure-, whole or chunked (app/api/export/pdf/route.ts:21). */
const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?$/

const BOTS = ['slackbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot', 'discordbot', 'whatsapp', 'telegrambot', 'skypeuripreview', 'googlebot', 'bingbot']

export function shouldCountOpen(req: { method: string; headers: Headers }): boolean {
  if (req.method !== 'GET') return false
  const ua = (req.headers.get('user-agent') ?? '').toLowerCase()
  if (BOTS.some((b) => ua.includes(b))) return false
  const cookies = (req.headers.get('cookie') ?? '').split(';').map((c) => c.trim().split('=')[0])
  return !cookies.some((name) => SESSION_COOKIE.test(name))
}
