import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getClientBySlug } from '@/lib/clients.config'
import { REPORT_NAMES } from '@/lib/constants'

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>
}) {
  const { clientSlug } = await params
  const client = getClientBySlug(clientSlug)
  if (!client) notFound()

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      {/* Portal header */}
      <div className="mb-8 flex items-center gap-4">
        {client.logoUrl && (
          <img
            src={client.logoUrl}
            alt={client.name}
            className="h-10 w-10 rounded-md object-contain"
          />
        )}
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
            Client Portal
          </p>
          <h1 className="text-3xl font-extrabold text-white">{client.name}</h1>
        </div>
      </div>

      <div className="divider-full mb-8" />

      {/* Report cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {client.enabledReports.map((reportSlug) => (
          <Link
            key={reportSlug}
            href={`/portal/${client.slug}/reports/${reportSlug}`}
            className="group relative overflow-hidden rounded-lg border border-white/[0.06] bg-bg-surface p-6 transition-colors hover:border-white/[0.12]"
          >
            <h3 className="text-lg font-bold text-white">
              {REPORT_NAMES[reportSlug] ?? reportSlug}
            </h3>
            <p className="mt-1 text-sm text-text-muted">View report →</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
