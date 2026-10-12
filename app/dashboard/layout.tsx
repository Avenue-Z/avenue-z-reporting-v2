import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isStaff } from '@/lib/auth/route-access'
import { Sidebar } from '@/components/layout/sidebar'
import { getVisibleClients } from '@/lib/db/queries'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) redirect('/login')
  if (!isStaff(session.user)) redirect('/unauthorized')

  const clients = await getVisibleClients()

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
