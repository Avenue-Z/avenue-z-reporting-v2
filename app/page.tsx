import { redirect } from 'next/navigation'
import { auth } from '@/auth'

const INTERNAL_ROLES = new Set(['INTERNAL_ADMIN', 'INTERNAL_ANALYST'])

export default async function Home() {
  const session = await auth()

  if (!session) redirect('/login')

  if (INTERNAL_ROLES.has(session.user.role ?? '')) {
    redirect('/dashboard')
  }

  // Client users → their own portal
  if (session.user.clientSlug) {
    redirect(`/portal/${session.user.clientSlug}/reports`)
  }

  // Fallback — shouldn't normally be reached
  redirect('/login')
}
