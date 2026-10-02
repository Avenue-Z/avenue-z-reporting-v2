// Next.js 16 proxy (replaces middleware.ts).
// Every request under the matcher passes here, so this is where access is enforced: signed out goes
// to /login, and a client may open only its own /portal/<slug> (lib/auth/route-access.ts). Each page
// also checks its own slug first (lib/auth/page-access.ts), and the layouts keep their checks.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { refusalLine } from '@/lib/auth/log-id'
import { routeAccess } from '@/lib/auth/route-access'

export default async function proxy(req: NextRequest) {
  const session = await auth()
  const access = routeAccess(req.nextUrl.pathname, session ? session.user : null)
  if (access === 'login') {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (access === 'unauthorized') {
    // The caller chooses the path; refusalLine escapes and caps it.
    console.warn(await refusalLine('refused', session?.user, ['path', req.nextUrl.pathname]))
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/portal/:path*', '/tools/:path*'],
}
