// Next.js 16 proxy (replaces middleware.ts).
// Handles unauthenticated → /login redirect for all protected routes.
// Role and slug-level access control is enforced in each layout via auth().
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export default async function proxy(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/portal/:path*'],
}
