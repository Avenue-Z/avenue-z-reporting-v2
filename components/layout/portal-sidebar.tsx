'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { demoLogout } from '@/app/actions/demo-auth'
import { REPORT_NAMES, ALL_REPORT_SLUGS } from '@/lib/constants'
import { getAllClients } from '@/lib/clients.config'
import { LogOut, Lock } from 'lucide-react'

export function PortalSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Extract client slug from /portal/[clientSlug]/...
  const pathParts = pathname.split('/')
  const clientSlug = pathParts[2] ?? ''
  const clients = getAllClients()
  const client = clients.find((c) => c.slug === clientSlug)

  if (!client) return null

  const activeSection = searchParams.get('section')
  const dateRange = searchParams.get('dateRange')
  const isOnReports = pathname.includes('/reports')

  return (
    <aside className="flex h-screen w-64 flex-col bg-bg-surface">
      {/* Client branding */}
      <div className="flex h-16 shrink-0 items-center gap-3 px-6">
        {client.logoUrl ? (
          <Image
            src={client.logoUrl}
            alt={client.name}
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-sm font-bold text-white">
            {client.name.charAt(0)}
          </span>
        )}
        <span className="truncate text-sm font-bold text-white">{client.name}</span>
      </div>

      {/* Report section tabs */}
      <nav className="flex flex-1 flex-col overflow-y-auto border-t border-white/[0.06] px-3 pt-4 scrollbar-dark">
        <p className="mb-2 px-3 text-xs font-semibold text-text-muted">
          Reports
        </p>
        <ul className="flex flex-col gap-0.5">
          {ALL_REPORT_SLUGS.filter((slug) => slug !== 'meeting-prep' && !client.hiddenReports?.includes(slug as any)).map((slug) => {
            const isEnabled = client.enabledReports.includes(slug as any)
            const isActive =
              isEnabled &&
              isOnReports &&
              (activeSection === slug ||
                (!activeSection && slug === client.enabledReports.filter(s => s !== 'meeting-prep')[0]))
            const linkParams = new URLSearchParams()
            linkParams.set('section', slug)
            if (dateRange) linkParams.set('dateRange', dateRange)

            if (!isEnabled) {
              return (
                <li key={slug}>
                  <span
                    title="Interested in gaining visibility here? Contact your account manager to explore this service line."
                    className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold text-white/20 cursor-not-allowed"
                  >
                    <span>{REPORT_NAMES[slug] ?? slug}</span>
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                  </span>
                </li>
              )
            }

            return (
              <li key={slug}>
                <Link
                  href={`/portal/${clientSlug}/reports?${linkParams.toString()}`}
                  className={cn(
                    'block rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-white/[0.08] text-white'
                      : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                  )}
                >
                  {REPORT_NAMES[slug] ?? slug}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="border-t border-white/[0.06] p-3">
        <form action={demoLogout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0 opacity-50" />
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  )
}
