import Link from 'next/link'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getClientBySlug } from '@/lib/db/queries'
import { REPORT_NAMES, NAV_SLUG_ORDER } from '@/lib/constants'
import { Header } from '@/components/layout/header'

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>
}) {
  const { clientSlug } = await params
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  const session = await auth()
  const isAdmin = session?.user?.role === 'INTERNAL_ADMIN'

  return (
    <>
      <Header title={client.name} subtitle="Client Overview">
        {isAdmin && (
          <>
            <Link
              href={`/dashboard/${client.slug}/auth`}
              className="rounded-[100px] bg-[#3a3a3a] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-bg-subtle"
            >
              Manage Connections
            </Link>
            <Link
              href={`/dashboard/${client.slug}/access`}
              className="rounded-[100px] bg-[#3a3a3a] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-bg-subtle"
            >
              Manage Access
            </Link>
          </>
        )}
      </Header>

      <div className="mb-8">
        <Link
          href={`/dashboard/${client.slug}/reports`}
          className="inline-flex items-center gap-3 rounded-[100px] bg-gradient-full px-8 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90"
        >
          View Full Report →
        </Link>
      </div>

      <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-text-muted">
        Individual Sections
      </h3>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_SLUG_ORDER.filter((slug) =>
          client.enabledReports.includes(slug as (typeof client.enabledReports)[number]),
        ).map((reportSlug) => (
          <Link
            key={reportSlug}
            href={`/dashboard/${client.slug}/reports?section=${reportSlug}`}
            className="group relative overflow-hidden rounded-lg border border-white/[0.06] bg-bg-surface p-6 transition-colors hover:border-white/[0.12]"
          >
            <div className="card-metric-accent" />
            <h3 className="text-lg font-bold text-white">
              {REPORT_NAMES[reportSlug] ?? reportSlug}
            </h3>
            <p className="mt-1 text-sm text-text-muted">View report →</p>
          </Link>
        ))}
      </div>
    </>
  )
}
