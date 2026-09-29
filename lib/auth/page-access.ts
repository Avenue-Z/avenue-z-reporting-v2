import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { canOpenPortal, isStaff } from './route-access'

// The first thing every protected page runs, before it loads any data. The proxy and the layouts
// check too, but a layout is skipped when a navigation request says the browser already holds it,
// and a proxy check depends on the framework routing every request through it. This one runs with
// the very slug the page is about to load, so the check and the data always agree.

/** Top of every /portal/[clientSlug] page: staff, or a client role on its own slug. */
export async function requirePortalAccess(slug: string) {
  const session = await auth()
  if (!session) redirect('/login')
  if (!canOpenPortal(slug, session.user)) redirect('/unauthorized')
  return session
}

/** Top of every /dashboard and /tools page: staff only. */
export async function requireStaff() {
  const session = await auth()
  if (!session) redirect('/login')
  if (!isStaff(session.user)) redirect('/unauthorized')
  return session
}
