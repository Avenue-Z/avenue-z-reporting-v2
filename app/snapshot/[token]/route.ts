// The public, no-login link (spec §8). Outside the proxy matcher (proxy.ts:24-26). The token is the credential;
// unknown, revoked and discarded tokens get the same response. A live GET responds at once and counts the open after
// the response is sent (`after`, spec v1.1 §18.5), so counting never delays the page. Never logs the token or the recipient.
import { after } from 'next/server'
import { auth } from '@/auth'
import { isStaff } from '@/lib/auth/route-access'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { hasSessionCookie, LINK_FRESH_MS, shouldCountOpen, uaFamily } from '@/lib/aeo-outbound/opens'
import { getLiveByToken, recordOpen } from '@/lib/aeo-outbound/store'
import { REPORT_CSP } from '@/lib/aeo-outbound/sandbox'
import { tokenFromSegment } from '@/lib/aeo-outbound/share-link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** How long the open work may run before one `open slow` line says so. It keeps waiting after that (spec v1.1 §18.5). */
const OPEN_SLOW_MS = 10_000
const BASE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' }
const GONE = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>Not available</title></head><body style="background:#000;color:#A6A6A6;font-family:sans-serif;padding:48px">This link is not available.</body></html>'

type Ctx = { params: Promise<{ token: string }> }
type Reason = 'session' | 'error'

function respond(html: string | undefined, withBody: boolean): Response {
  if (!html) return new Response(withBody ? GONE : null, { status: 404, headers: { ...BASE, 'Content-Type': 'text/html; charset=utf-8' } })
  return new Response(withBody ? html : null, { headers: { ...BASE, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': REPORT_CSP } })
}

/** The live row for a /snapshot segment (spec v1.1 §16.2), or undefined. A failed lookup answers like an unknown token, logged without the token. */
async function live(segment: string) {
  const token = tokenFromSegment(segment)
  if (!token) return undefined
  try {
    return await getLiveByToken(token)
  } catch (e) {
    console.error(`[aeo-outbound] snapshot lookup failed reason=${errorLabel(e)}`)
    return undefined
  }
}

/** Counts the open when the viewer is a recipient, as the counter and one event in one statement (v1.1 §6). Runs after the
 *  response (spec v1.1 §18.5): the session read and the write are awaited with no race, so a slow write is never cut off,
 *  and past OPEN_SLOW_MS one `open slow` line makes a hang visible. Never throws. */
async function countOpen(req: Request, found: { id: string; approvedAt: Date | null }): Promise<void> {
  let reason: Reason | null = null
  const timer = setTimeout(() => console.warn(`[aeo-outbound] open slow id=${found.id}`), OPEN_SLOW_MS)
  try {
    let staff = false
    if (hasSessionCookie(req.headers)) {
      try { staff = isStaff((await auth())?.user ?? {}) } catch { reason = 'session'; return }
    }
    if (!shouldCountOpen(req, staff)) return
    const now = new Date()
    const linkFresh = found.approvedAt ? now.getTime() - found.approvedAt.getTime() < LINK_FRESH_MS : false
    await recordOpen(found.id, now, { uaFamily: uaFamily(req.headers.get('user-agent')), linkFresh })
  } catch {
    reason = 'error'
  } finally {
    clearTimeout(timer)
    if (reason) console.warn(`[aeo-outbound] open not recorded id=${found.id} reason=${reason}`)
  }
}

export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params
  const found = await live(token)
  if (!found) return respond(undefined, true)
  after(() => countOpen(req, found))
  return respond(found.html, true)
}

/** Same status and headers as GET, no body. Never reads the session and never records. */
export async function HEAD(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params
  return respond((await live(token))?.html, false)
}
