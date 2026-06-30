import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { auth } from '@/auth'
import { getClientsWithDashboards } from '@/lib/db/queries'
import { isInternalStaff } from '@/lib/dashboard/permissions'
import { AddReportCard } from '@/components/dashboard/add-report/add-report-card'

const cardCls =
  'group relative flex min-h-[84px] items-center gap-4 rounded-lg border border-white/[0.06] bg-bg-surface p-5 transition-all hover:border-white/[0.12] hover:bg-white/[0.02]'

export default async function ReportingHubPage() {
  const [session, dashboards] = await Promise.all([auth(), getClientsWithDashboards()])
  const canAdd = isInternalStaff(session?.user?.role ?? '')

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Reporting</h1>
        <p className="mt-1 text-sm text-text-muted">Client dashboards. {canAdd ? 'Add a new one any time.' : ''}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dashboards.map((d) => (
          <Link key={d.slug} href={`/dashboard/${d.slug}/configurable-dashboard`} className={cardCls}>
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-extrabold text-black"
              style={{ backgroundImage: 'linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF, #39A0FF, #6034FF)' }}
            >
              {d.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{d.name}</p>
              <p className="mt-0.5 text-xs text-text-muted">Configurable dashboard</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
        {canAdd && <AddReportCard />}
      </div>
    </>
  )
}
