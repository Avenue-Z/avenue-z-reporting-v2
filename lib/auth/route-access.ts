const INTERNAL_ROLES = new Set(['INTERNAL_ADMIN', 'INTERNAL_ANALYST'])

export type RouteAccess = 'allow' | 'login' | 'unauthorized'

/** Who may open a path under /dashboard, /tools or /portal (the proxy's matcher). The same rules the
 *  layouts apply, enforced where every request passes: staff reach everything, a client reaches only
 *  /portal/<its own slug>. A layout alone cannot guard a page, because a navigation request tells the
 *  server which layouts the browser already holds and Next skips rendering those.
 *  The slug is compared exactly as it appears in the path, never decoded, so anything that is not
 *  literally the client's own slug is refused (fail closed). */
export function routeAccess(
  pathname: string,
  session: { role?: string | null; clientSlug?: string | null } | null,
): RouteAccess {
  if (!session) return 'login'
  if (INTERNAL_ROLES.has(session.role ?? '')) return 'allow'
  const [, area, slug] = pathname.split('/')
  if (area === 'portal' && slug && slug === session.clientSlug) return 'allow'
  return 'unauthorized'
}
