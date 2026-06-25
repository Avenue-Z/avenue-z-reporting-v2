import { redirect, notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getClientAccessOverview } from '@/lib/db/admin-queries'
import { TeamPanel } from './team-panel'

export default async function TeamPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>
}) {
  const { clientSlug } = await params
  const session = await auth()
  // Only the external admin of THIS client may manage the team.
  if (!session || session.user.role !== 'CLIENT_ADMIN' || session.user.clientSlug !== clientSlug) {
    redirect('/unauthorized')
  }
  const overview = await getClientAccessOverview(clientSlug)
  if (!overview) notFound()

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Team</h1>
      <p className="mb-8 mt-1 text-sm text-text-muted">Invite teammates to view {overview.name}&apos;s reports. They sign in with their email and your shared password.</p>
      <TeamPanel slug={overview.slug} maxSeats={overview.maxSeats} selfEmail={(session.user.email ?? '').toLowerCase()} users={overview.users} />
    </div>
  )
}
