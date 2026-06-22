'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { demoLogout } from '@/app/actions/demo-auth'
import { REPORT_NAMES, ALL_REPORT_SLUGS, AEO_SUBSECTIONS, GA4_SUBSECTIONS, SOON_REPORT_SLUGS, PAID_MEDIA_SUBSECTIONS } from '@/lib/constants'
import type { Client } from '@/lib/db/schema'
import { LogOut, Lock } from 'lucide-react'

interface PortalSidebarProps {
  clients: Client[]
}

export function PortalSidebar({ clients }: PortalSidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Extract client slug from /portal/[clientSlug]/...
  const pathParts = pathname.split('/')
  const clientSlug = pathParts[2] ?? ''
  const client = clients.find((c) => c.slug === clientSlug)

  if (!client) return null

  const activeSection    = searchParams.get('section')
  const activeSubsection = searchParams.get('subsection')
  const dateRange        = searchParams.get('dateRange')
  const isOnReports      = pathname.includes('/reports')

  const INBOUND_FUNNEL_SUBSECTIONS: { id: string | null; label: string }[] = [
    { id: null,     label: 'Overview' },
    { id: 'forms',  label: 'Forms'    },
    { id: 'pacing', label: 'Pacing'   },
  ]

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
                (!activeSection && slug === client.enabledReports[0]))
            const linkParams = new URLSearchParams()
            linkParams.set('section', slug)
            if (dateRange) linkParams.set('dateRange', dateRange)

            // "Soon" items — shown grayed out with badge, not locked
            if (SOON_REPORT_SLUGS.has(slug)) {
              return (
                <li key={slug}>
                  <div className="flex items-center justify-between rounded-md px-3 py-2">
                    <span className="text-sm font-semibold text-text-muted/40">
                      {REPORT_NAMES[slug] ?? slug}
                    </span>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted/50">
                      Soon
                    </span>
                  </div>
                </li>
              )
            }

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

            // Inbound Funnel — expandable sub-menu
            if (slug === 'inbound-funnel') {
              const ifBaseParams = new URLSearchParams()
              ifBaseParams.set('section', 'inbound-funnel')
              if (dateRange) ifBaseParams.set('dateRange', dateRange)
              return (
                <li key={slug}>
                  <Link
                    href={`/portal/${clientSlug}/reports?${ifBaseParams.toString()}`}
                    className={cn(
                      'block rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                      isActive
                        ? 'text-white'
                        : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                    )}
                  >
                    {REPORT_NAMES[slug] ?? slug}
                  </Link>
                  {isActive && (
                    <ul className="ml-3 mt-0.5 space-y-px border-l border-white/[0.08] pl-2.5">
                      {INBOUND_FUNNEL_SUBSECTIONS.map((sub) => {
                        const subParams = new URLSearchParams()
                        subParams.set('section', 'inbound-funnel')
                        if (sub.id) subParams.set('subsection', sub.id)
                        if (dateRange) subParams.set('dateRange', dateRange)
                        const subIsActive = sub.id === null ? !activeSubsection : activeSubsection === sub.id
                        return (
                          <li key={sub.id ?? 'overview'}>
                            <Link
                              href={`/portal/${clientSlug}/reports?${subParams.toString()}`}
                              className={cn(
                                'block rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                                subIsActive
                                  ? 'bg-white/[0.08] text-white'
                                  : 'text-text-muted hover:bg-white/[0.04] hover:text-white/70'
                              )}
                            >
                              {sub.label}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            }

            // Answer Engine Optimization — expandable sub-menu (PEEC.ai + Profound Soon)
            if (slug === 'peec-ai') {
              const aeoBaseParams = new URLSearchParams()
              aeoBaseParams.set('section', 'peec-ai')
              if (dateRange) aeoBaseParams.set('dateRange', dateRange)
              return (
                <li key={slug}>
                  <Link
                    href={`/portal/${clientSlug}/reports?${aeoBaseParams.toString()}`}
                    className={cn(
                      'block rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                      isActive
                        ? 'text-white'
                        : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                    )}
                  >
                    {REPORT_NAMES[slug] ?? slug}
                  </Link>
                  {isActive && (
                    <ul className="ml-3 mt-0.5 space-y-px border-l border-white/[0.08] pl-2.5">
                      {AEO_SUBSECTIONS.map((sub) => {
                        if (sub.comingSoon) {
                          return (
                            <li key={sub.id ?? 'soon'}>
                              <div className="flex items-center justify-between rounded-md px-2.5 py-1.5">
                                <span className="text-xs font-semibold text-text-muted/40">
                                  {sub.label}
                                </span>
                                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted/50">
                                  Soon
                                </span>
                              </div>
                            </li>
                          )
                        }
                        const subParams = new URLSearchParams()
                        subParams.set('section', 'peec-ai')
                        if (sub.id) subParams.set('subsection', sub.id)
                        if (dateRange) subParams.set('dateRange', dateRange)
                        const subIsActive = sub.id === null ? !activeSubsection : activeSubsection === sub.id
                        return (
                          <li key={sub.id ?? 'peec'}>
                            <Link
                              href={`/portal/${clientSlug}/reports?${subParams.toString()}`}
                              className={cn(
                                'block rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                                subIsActive
                                  ? 'bg-white/[0.08] text-white'
                                  : 'text-text-muted hover:bg-white/[0.04] hover:text-white/70'
                              )}
                            >
                              {sub.label}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            }

            // Paid Media — expandable sub-menu
            if (slug === 'paid-media') {
              const pmBaseParams = new URLSearchParams()
              pmBaseParams.set('section', 'paid-media')
              if (dateRange) pmBaseParams.set('dateRange', dateRange)
              return (
                <li key={slug}>
                  <Link
                    href={`/portal/${clientSlug}/reports?${pmBaseParams.toString()}`}
                    className={cn(
                      'block rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                      isActive
                        ? 'text-white'
                        : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                    )}
                  >
                    {REPORT_NAMES[slug] ?? slug}
                  </Link>
                  {isActive && (
                    <ul className="ml-3 mt-0.5 space-y-px border-l border-white/[0.08] pl-2.5">
                      {PAID_MEDIA_SUBSECTIONS.map((sub) => {
                        const subParams = new URLSearchParams()
                        subParams.set('section', 'paid-media')
                        if (sub.id) subParams.set('subsection', sub.id)
                        if (dateRange) subParams.set('dateRange', dateRange)
                        const subIsActive = sub.id === null ? !activeSubsection : activeSubsection === sub.id
                        return (
                          <li key={sub.id ?? 'overview'}>
                            <Link
                              href={`/portal/${clientSlug}/reports?${subParams.toString()}`}
                              className={cn(
                                'block rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                                subIsActive
                                  ? 'bg-white/[0.08] text-white'
                                  : 'text-text-muted hover:bg-white/[0.04] hover:text-white/70'
                              )}
                            >
                              {sub.label}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            }

            // GA4 — expandable sub-menu
            if (slug === 'ga4') {
              const ga4BaseParams = new URLSearchParams()
              ga4BaseParams.set('section', 'ga4')
              if (dateRange) ga4BaseParams.set('dateRange', dateRange)
              return (
                <li key={slug}>
                  <Link
                    href={`/portal/${clientSlug}/reports?${ga4BaseParams.toString()}`}
                    className={cn(
                      'block rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                      isActive
                        ? 'text-white'
                        : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                    )}
                  >
                    {REPORT_NAMES[slug] ?? slug}
                  </Link>

                  {isActive && (
                    <ul className="ml-3 mt-0.5 space-y-px border-l border-white/[0.08] pl-2.5">
                      {GA4_SUBSECTIONS.map((sub) => {
                        if (sub.comingSoon) {
                          return (
                            <li key={sub.id ?? 'soon'}>
                              <div className="flex items-center justify-between rounded-md px-2.5 py-1.5">
                                <span className="text-xs font-semibold text-text-muted/40">
                                  {sub.label}
                                </span>
                                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted/50">
                                  Soon
                                </span>
                              </div>
                            </li>
                          )
                        }
                        const subParams = new URLSearchParams()
                        subParams.set('section', 'ga4')
                        if (sub.id) subParams.set('subsection', sub.id)
                        if (dateRange) subParams.set('dateRange', dateRange)
                        const subIsActive = sub.id === null ? !activeSubsection : activeSubsection === sub.id
                        return (
                          <li key={sub.id ?? 'overview'}>
                            <Link
                              href={`/portal/${clientSlug}/reports?${subParams.toString()}`}
                              className={cn(
                                'block rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                                subIsActive
                                  ? 'bg-white/[0.08] text-white'
                                  : 'text-text-muted hover:bg-white/[0.04] hover:text-white/70'
                              )}
                            >
                              {sub.label}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
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
