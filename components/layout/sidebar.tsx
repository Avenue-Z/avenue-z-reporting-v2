'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { demoLogout } from '@/app/actions/demo-auth'
import { REPORT_NAMES, NAV_GROUPS, AEO_SUBSECTIONS, GA4_SUBSECTIONS } from '@/lib/constants'
import { getAllClients } from '@/lib/clients.config'
import {
  LayoutGrid,
  ChevronLeft,
  LogOut,
} from 'lucide-react'
import { AvenueZLogo } from './avenue-z-logo'

// Generate a consistent color from a string
const AVATAR_COLORS = [
  'bg-brand-yellow text-black',
  'bg-brand-green text-black',
  'bg-brand-cyan text-black',
  'bg-brand-blue text-white',
  'bg-brand-purple text-white',
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitial(name: string) {
  return name.charAt(0).toUpperCase()
}

export function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const pathParts = pathname.split('/')
  const clientSlug =
    pathParts[1] === 'dashboard' && pathParts.length >= 3 && pathParts[2] !== ''
      ? pathParts[2]
      : null

  const isTopLevel = !clientSlug || ['reports', 'connections', 'settings'].includes(clientSlug)

  if (!isTopLevel && clientSlug) {
    return <ClientSidebar clientSlug={clientSlug} pathname={pathname} activeSection={searchParams.get('section')} activeSubsection={searchParams.get('subsection')} dateRange={searchParams.get('dateRange')} />
  }

  return <MainSidebar pathname={pathname} />
}

function MainSidebar({ pathname }: { pathname: string }) {
  const clients = getAllClients()

  return (
    <aside className="flex h-screen w-64 flex-col bg-bg-surface">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center px-6">
        <Link href="/dashboard" className="text-white">
          <AvenueZLogo height={20} />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col px-3">
        <ul className="flex flex-col gap-1">
          <li>
            <NavLink
              href="/dashboard"
              icon={LayoutGrid}
              label="Dashboard"
              isActive={pathname === '/dashboard'}
            />
          </li>
        </ul>

        {/* Clients section */}
        <div className="mt-6">
          <p className="mb-2 px-3 text-xs font-semibold text-text-muted">
            Your clients
          </p>
          <ul className="flex flex-col gap-1">
            {clients.map((client) => {
              const isActive = pathname.startsWith(`/dashboard/${client.slug}`)
              return (
                <li key={client.slug}>
                  <Link
                    href={`/dashboard/${client.slug}/reports`}
                    className={cn(
                      'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                      isActive
                        ? 'bg-white/[0.08] text-white'
                        : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                    )}
                  >
                    {client.logoUrl ? (
                      <span className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md overflow-hidden',
                        client.slug === 'avenue-z' ? 'bg-black p-1' : ''
                      )}>
                        <Image
                          src={client.logoUrl}
                          alt={client.name}
                          width={24}
                          height={24}
                          className={cn(
                            'shrink-0 object-cover',
                            client.slug === 'avenue-z' ? 'h-4 w-4 object-contain' : 'h-6 w-6 rounded-md'
                          )}
                        />
                      </span>
                    ) : (
                      <span className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold',
                        isActive
                          ? getAvatarColor(client.name)
                          : 'border border-white/[0.12] text-text-muted group-hover:text-white'
                      )}>
                        {getInitial(client.name)}
                      </span>
                    )}
                    <span className="truncate">{client.name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>

      {/* User section */}
      <div className="mt-auto border-t border-white/[0.06] p-3">
        <form action={demoLogout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-white">
              AZ
            </span>
            <span className="flex-1 truncate text-left">Avenue Z</span>
            <LogOut className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </form>
      </div>
    </aside>
  )
}

const INBOUND_FUNNEL_SUBSECTIONS: { id: string | null; label: string }[] = [
  { id: null,     label: 'Overview' },
  { id: 'forms',  label: 'Forms'    },
  { id: 'pacing', label: 'Pacing'   },
]

function ClientSidebar({
  clientSlug,
  pathname,
  activeSection,
  activeSubsection,
  dateRange,
}: {
  clientSlug: string
  pathname: string
  activeSection: string | null
  activeSubsection: string | null
  dateRange: string | null
}) {
  const clients = getAllClients()
  const client = clients.find((c) => c.slug === clientSlug)
  const clientName = client?.name ?? clientSlug
  const isOnReports = pathname === `/dashboard/${clientSlug}/reports`

  return (
    <aside className="flex h-screen w-64 flex-col bg-bg-surface">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center px-6">
        <Link href="/dashboard" className="text-white">
          <AvenueZLogo height={20} />
        </Link>
      </div>

      {/* Back + Client name */}
      <div className="px-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          All Clients
        </Link>

        <div className="mt-3 flex items-center gap-3 px-3 pb-4">
          {client?.logoUrl ? (
            <span className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md overflow-hidden',
              clientSlug === 'avenue-z' ? 'bg-black p-1' : ''
            )}>
              <Image
                src={client.logoUrl}
                alt={clientName}
                width={32}
                height={32}
                className={cn(
                  'shrink-0 object-cover',
                  clientSlug === 'avenue-z' ? 'h-5 w-5 object-contain' : 'h-8 w-8 rounded-md'
                )}
              />
            </span>
          ) : (
            <span className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold',
              getAvatarColor(clientName)
            )}>
              {getInitial(clientName)}
            </span>
          )}
          <span className="truncate text-sm font-bold text-white">{clientName}</span>
        </div>
      </div>

      {/* Report nav */}
      <nav className="flex flex-1 flex-col overflow-y-auto border-t border-white/[0.06] px-3 pt-4 scrollbar-dark">
        {client && (
          <div className="flex flex-col gap-4">
            {NAV_GROUPS.map((group, gi) => {
              if (group.comingSoon) {
                // Coming Soon group — show all slugs, non-clickable
                return (
                  <div key={gi}>
                    {group.label && (
                      <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted/50">
                        {group.label}
                      </p>
                    )}
                    <ul className="flex flex-col gap-0.5">
                      {group.slugs.map((slug) => (
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
                      ))}
                    </ul>
                  </div>
                )
              }

              // Regular group — filter by enabledReports
              const visibleSlugs = group.slugs.filter((slug) =>
                client.enabledReports.includes(slug as any)
              )
              if (visibleSlugs.length === 0) return null
              return (
                <div key={gi}>
                  {group.label && (
                    <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                      {group.label}
                    </p>
                  )}
                  <ul className="flex flex-col gap-0.5">
                    {visibleSlugs.map((slug) => {
                      const isActive = isOnReports && (
                        activeSection === slug || (!activeSection && slug === client.enabledReports[0])
                      )
                      const linkParams = new URLSearchParams()
                      linkParams.set('section', slug)

                      // Inbound Funnel — expandable sub-menu
                      if (slug === 'inbound-funnel') {
                        const ifBaseParams = new URLSearchParams()
                        ifBaseParams.set('section', 'inbound-funnel')
                        return (
                          <li key={slug}>
                            <Link
                              href={`/dashboard/${clientSlug}/reports?${ifBaseParams.toString()}`}
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
                                  const subIsActive = sub.id === null
                                    ? !activeSubsection
                                    : activeSubsection === sub.id
                                  return (
                                    <li key={sub.id ?? 'overview'}>
                                      <Link
                                        href={`/dashboard/${clientSlug}/reports?${subParams.toString()}`}
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
                        return (
                          <li key={slug}>
                            <Link
                              href={`/dashboard/${clientSlug}/reports?${aeoBaseParams.toString()}`}
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
                                  const subIsActive = sub.id === null
                                    ? !activeSubsection
                                    : activeSubsection === sub.id
                                  return (
                                    <li key={sub.id ?? 'peec'}>
                                      <Link
                                        href={`/dashboard/${clientSlug}/reports?${subParams.toString()}`}
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

                      // GA4 — show expandable sub-menu when active
                      if (slug === 'ga4') {
                        const ga4BaseParams = new URLSearchParams()
                        ga4BaseParams.set('section', 'ga4')
                        return (
                          <li key={slug}>
                            <Link
                              href={`/dashboard/${clientSlug}/reports?${ga4BaseParams.toString()}`}
                              className={cn(
                                'block rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                                isActive
                                  ? 'text-white'
                                  : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                              )}
                            >
                              {REPORT_NAMES[slug] ?? slug}
                            </Link>

                            {/* Sub-items — visible when ga4 is the active section */}
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
                                  const subIsActive = sub.id === null
                                    ? !activeSubsection
                                    : activeSubsection === sub.id
                                  return (
                                    <li key={sub.id ?? 'overview'}>
                                      <Link
                                        href={`/dashboard/${clientSlug}/reports?${subParams.toString()}`}
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
                            href={`/dashboard/${clientSlug}/reports?${linkParams.toString()}`}
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
                </div>
              )
            })}
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="border-t border-white/[0.06] p-3">
        <form action={demoLogout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-white">
              AZ
            </span>
            <span className="flex-1 truncate text-left">Avenue Z</span>
            <LogOut className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </form>
      </div>
    </aside>
  )
}

function NavLink({
  href,
  icon: Icon,
  label,
  isActive,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  isActive: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
        isActive
          ? 'bg-white/[0.08] text-white'
          : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </Link>
  )
}
