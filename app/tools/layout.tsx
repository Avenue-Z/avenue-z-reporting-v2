import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { resolveDemoMode } from '@/lib/demo-data/resolve'

const INTERNAL_ROLES = new Set(['INTERNAL_ADMIN', 'INTERNAL_ANALYST'])

export default async function ToolsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) redirect('/login')
  if (!INTERNAL_ROLES.has(session.user.role ?? '')) redirect('/unauthorized')

  const cookieStore = await cookies()
  const demoModeEffective = resolveDemoMode({
    userDemoFlag: session.user.demoMode === true,
    cookieValue: cookieStore.get('demoMode')?.value,
  })

  return (
    <div className="flex h-screen bg-black" data-print-layout>
      <Suspense>
        <Sidebar user={session.user} demoModeEffective={demoModeEffective} />
      </Suspense>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
