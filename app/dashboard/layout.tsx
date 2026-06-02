import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { getAllClients } from '@/lib/db/queries'
import { resolveDemoMode } from '@/lib/demo-data/resolve'

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

  // The layout doesn't have access to searchParams, so the URL ?demo=1
  // override is ignored here for the toggle's display state. The route
  // handler is the source of truth for the actual demoMode the page
  // renders with; the toggle here only reflects the cookie state.
  const cookieStore = await cookies()
  const demoModeEffective = resolveDemoMode({
    userDemoFlag:    session.user.demoMode === true,
    cookieValue:     cookieStore.get('demoMode')?.value,
    urlDemoOverride: false,
  })

  return (
    <div className="flex h-screen bg-black" data-print-layout>
      <Suspense>
        <Sidebar user={session.user} clients={clients} demoModeEffective={demoModeEffective} />
      </Suspense>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
