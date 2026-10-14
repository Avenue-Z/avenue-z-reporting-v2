import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isStaff } from '@/lib/auth/route-access'
import { Sidebar } from '@/components/layout/sidebar'

export default async function ToolsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) redirect('/login')
  if (!isStaff(session.user)) redirect('/unauthorized')

  return (
    <div className="flex h-screen bg-black" data-print-layout>
      <Suspense>
        <Sidebar user={session.user} />
      </Suspense>
      <main className="flex-1 overflow-y-auto">
        {/* Spec 2026-10-14 editor space (#396): the report editor marks its root, and only there the 1280px cap and half
            the bottom padding go, so the report fills the screen. Every other tools page is unchanged. */}
        <div className="mx-auto max-w-7xl px-8 py-8 has-[[data-aeo-editor]]:max-w-none has-[[data-aeo-editor]]:pb-4">{children}</div>
      </main>
    </div>
  )
}
