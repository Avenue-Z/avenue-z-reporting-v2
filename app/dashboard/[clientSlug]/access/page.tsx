import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { getClientAccessOverview } from '@/lib/db/admin-queries'
import { AccessPanel } from './access-panel'

export default async function ClientAccessPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>
}) {
  const { clientSlug } = await params
  const overview = await getClientAccessOverview(clientSlug)
  if (!overview) notFound()

  return (
    <>
      <Header title={overview.name} subtitle="Manage Access" />
      <div className="divider-full mb-8" />
      <AccessPanel slug={overview.slug} hasPassword={overview.hasPassword} maxSeats={overview.maxSeats} users={overview.users} />
    </>
  )
}
