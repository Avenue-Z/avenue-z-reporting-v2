// Next.js 16 proxy (replaces middleware.ts).
// Every request under the matcher passes here, so this is where access is enforced: signed out goes
// to /login, and a client may open only its own /portal/<slug> (lib/auth/route-access.ts). The
// layouts keep their own checks as a second line.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { routeAccess } from '@/lib/auth/route-access'

export default async function proxy(req: NextRequest) {
  const session = await auth()
  const access = routeAccess(req.nextUrl.pathname, session ? session.user : null)
  if (access === 'login') {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (access === 'unauthorized') {
    console.warn(`[access] refused path=${req.nextUrl.pathname} role=${session?.user.role ?? 'none'} client=${session?.user.clientSlug ?? 'none'}`)
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/portal/:path*', '/tools/:path*'],
}
