// Next.js 16 proxy (replaces middleware.ts).
// Every request under the matcher passes here, so this is where access is enforced: signed out goes
// to /login, and a client may open only its own /portal/<slug> (lib/auth/route-access.ts). Each page
// also checks its own slug first (lib/auth/page-access.ts), and the layouts keep their checks.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { routeAccess } from '@/lib/auth/route-access'

/** The caller chooses the path, so the log keeps only this much of it. */
const LOG_PATH_MAX = 120

/** A short, stable, non-personal id for the log: the first 8 hex characters of the email's SHA-256,
 *  so two people at one client can be told apart without the email ever being written. */
async function shortId(email: string | null | undefined): Promise<string> {
  if (!email) return 'none'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase()))
  return [...new Uint8Array(digest).slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default async function proxy(req: NextRequest) {
  const session = await auth()
  const access = routeAccess(req.nextUrl.pathname, session ? session.user : null)
  if (access === 'login') {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (access === 'unauthorized') {
    console.warn(`[access] refused path=${req.nextUrl.pathname.slice(0, LOG_PATH_MAX)} role=${session?.user.role ?? 'none'} ` +
      `client=${session?.user.clientSlug ?? 'none'} who=${await shortId(session?.user.email)}`)
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/portal/:path*', '/tools/:path*'],
}
