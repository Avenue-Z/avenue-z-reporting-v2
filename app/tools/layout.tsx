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
      {/* Spec 2026-10-14 editor space (#396): the report editor marks its root (EDITOR_MARKER), and only there the 1280px
          cap and the bottom padding go (the editor keeps its own 16px), so the report fills the screen, and the
          scrollbar's room is kept, so a toolbar that grows never brings a scrollbar in and out (Paul, #399 review). Every
          other tools page is unchanged. This relies on the editor leaving the DOM on navigation: if Next's
          cacheComponents is ever enabled, a hidden editor kept mounted would still match here. */}
      <main className="flex-1 overflow-y-auto has-[[data-aeo-editor]]:[scrollbar-gutter:stable]">
        <div className="mx-auto max-w-7xl px-8 py-8 has-[[data-aeo-editor]]:max-w-none has-[[data-aeo-editor]]:pb-0">{children}</div>
      </main>
    </div>
  )
}
