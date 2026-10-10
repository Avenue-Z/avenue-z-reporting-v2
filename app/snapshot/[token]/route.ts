// The public, no-login link (spec §8). Outside the proxy matcher (proxy.ts:24-26). The token is the credential;
// unknown, revoked and discarded tokens get the same response. A live GET may record an open, inside one 1.5s budget,
// and never logs the token or the recipient.
import { auth } from '@/auth'
import { isStaff } from '@/lib/auth/route-access'
import { hasSessionCookie, shouldCountOpen } from '@/lib/aeo-outbound/opens'
import { getLiveByToken, recordOpenQuery } from '@/lib/aeo-outbound/store'
import { isShareTokenShape } from '@/lib/aeo-outbound/token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OPEN_BUDGET_MS = 1500
const BASE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' }
const GONE = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>Not available</title></head><body style="background:#000;color:#A6A6A6;font-family:sans-serif;padding:48px">This link is not available.</body></html>'

type Ctx = { params: Promise<{ token: string }> }
type Reason = 'session' | 'error' | 'timeout'

function respond(html: string | undefined, withBody: boolean): Response {
  if (!html) return new Response(withBody ? GONE : null, { status: 404, headers: { ...BASE, 'Content-Type': 'text/html; charset=utf-8' } })
  return new Response(withBody ? html : null, { headers: { ...BASE, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': 'sandbox allow-scripts' } })
}

async function live(token: string) {
  return isShareTokenShape(token) ? await getLiveByToken(token).catch(() => undefined) : undefined
}

/** Counts the open when the viewer is a recipient. The session read and the UPDATE share one budget. Never throws. */
async function recordOpen(req: Request, id: string): Promise<void> {
  let reason: Reason | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const work = (async () => {
    let staff = false
    if (hasSessionCookie(req.headers)) {
      try { staff = isStaff((await auth())?.user ?? {}) } catch { reason = 'session'; return }
    }
    if (!shouldCountOpen(req, staff)) return
    try { await recordOpenQuery(id, new Date()) } catch { reason = 'error' }
  })()
  const budget = new Promise<void>((resolve) => { timer = setTimeout(() => { reason ??= 'timeout'; resolve() }, OPEN_BUDGET_MS) })
  try { await Promise.race([work, budget]) } finally { clearTimeout(timer) }
  if (reason) console.warn(`[aeo-outbound] open not recorded id=${id} reason=${reason}`)
}

export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params
  const found = await live(token)
  if (!found) return respond(undefined, true)
  await recordOpen(req, found.id)
  return respond(found.html, true)
}

/** Same status and headers as GET, no body. Never reads the session and never records. */
export async function HEAD(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params
  return respond((await live(token))?.html, false)
}
