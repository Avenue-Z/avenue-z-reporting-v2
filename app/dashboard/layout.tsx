import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { getAllClients } from '@/lib/db/queries'

const INTERNAL_ROLES = new Set(['INTERNAL_ADMIN', 'INTERNAL_ANALYST'])

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) redirect('/login')
  if (!INTERNAL_ROLES.has(session.user.role ?? '')) redirect('/unauthorized')

  const clients = await getAllClients()

  return (
    <div className="flex h-screen bg-black" data-print-layout>
      <Suspense>
        <Sidebar user={session.user} clients={clients} />
      </Suspense>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
