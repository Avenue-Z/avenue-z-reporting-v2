import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { PortalSidebar } from '@/components/layout/portal-sidebar'
import { getClientBySlug } from '@/lib/db/queries'
import { toPortalSidebarClient } from '@/lib/portal/sidebar-client'

const INTERNAL_ROLES = new Set(['INTERNAL_ADMIN', 'INTERNAL_ANALYST'])

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
  const isInternal = INTERNAL_ROLES.has(session.user.role ?? '')

  // Client users may only access their own portal slug
  if (!isInternal && session.user.clientSlug !== clientSlug) {
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
