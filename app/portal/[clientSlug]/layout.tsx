import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { PortalSidebar } from '@/components/layout/portal-sidebar'
import { getClientBySlug } from '@/lib/db/queries'
import { toPortalSidebarClient } from '@/lib/portal/sidebar-client'
import { canOpenPortal } from '@/lib/auth/route-access'

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clientSlug: string }>
}) {
  const session = await auth()

  if (!session) redirect('/login')

  const { clientSlug } = await params

  // Staff, or a client role on its own slug (lib/auth/route-access.ts, the rule the proxy and every
  // page apply too).
  if (!canOpenPortal(clientSlug, session.user)) {
    redirect('/unauthorized')
  }

  // Only this client, trimmed to what the sidebar reads. The sidebar is a client component, so
  // its props reach the browser; every other client's record, and this one's secrets, stay here.
  const client = await getClientBySlug(clientSlug)

  return (
    <div className="flex h-screen bg-black" data-print-layout>
      <Suspense>
        <PortalSidebar client={client ? toPortalSidebarClient(client) : null} userRole={session.user.role} />
      </Suspense>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
