// Next.js 16 proxy (replaces middleware.ts).
// Every request under the matcher passes here, so this is where access is enforced: signed out goes
// to /login, and a client may open only its own /portal/<slug> (lib/auth/route-access.ts). Each page
// also checks its own slug first (lib/auth/page-access.ts), and the layouts keep their checks.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logId } from '@/lib/auth/log-id'
import { routeAccess } from '@/lib/auth/route-access'

/** The caller chooses the path, so the log keeps only this much of it. */
const LOG_PATH_MAX = 120

export default async function proxy(req: NextRequest) {
  const session = await auth()
  const access = routeAccess(req.nextUrl.pathname, session ? session.user : null)
  if (access === 'login') {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (access === 'unauthorized') {
    console.warn(`[access] refused path=${req.nextUrl.pathname.slice(0, LOG_PATH_MAX)} role=${session?.user.role ?? 'none'} ` +
      `client=${session?.user.clientSlug ?? 'none'} who=${await logId(session?.user.email)}`)
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/portal/:path*', '/tools/:path*'],
}
