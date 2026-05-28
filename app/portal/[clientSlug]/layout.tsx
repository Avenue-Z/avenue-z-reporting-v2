import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { PortalSidebar } from '@/components/layout/portal-sidebar'
import { getAllClients } from '@/lib/db/queries'

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

  const clients = await getAllClients()

  return (
    <div className="flex h-screen bg-black" data-print-layout>
      <Suspense>
        <PortalSidebar clients={clients} />
      </Suspense>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
