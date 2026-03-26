'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { demoLogout } from '@/app/actions/demo-auth'
import { REPORT_NAMES, ALL_REPORT_SLUGS } from '@/lib/constants'
import { getAllClients } from '@/lib/clients.config'
import {
  LayoutGrid,
  Link2,
  ChevronLeft,
  Settings,
  LogOut,
  Lock,
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
    return <ClientSidebar clientSlug={clientSlug} pathname={pathname} activeSection={searchParams.get('section')} dateRange={searchParams.get('dateRange')} />
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
          <li>
            <NavLink
              href="/dashboard/connections"
              icon={Link2}
              label="Connections"
              isActive={pathname === '/dashboard/connections'}
            />
          </li>
          <li>
            <NavLink
              href="/dashboard/settings"
              icon={Settings}
              label="Settings"
              isActive={pathname === '/dashboard/settings'}
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

function ClientSidebar({
  clientSlug,
  pathname,
  activeSection,
  dateRange,
}: {
  clientSlug: string
  pathname: string
  activeSection: string | null
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

      {/* Report section tabs */}
      <nav className="flex flex-1 flex-col overflow-y-auto border-t border-white/[0.06] px-3 pt-4 scrollbar-dark">
        {client && (
          <>
            <p className="mb-2 px-3 text-xs font-semibold text-text-muted">
              Report sections
            </p>
            <ul className="flex flex-col gap-0.5">
              {ALL_REPORT_SLUGS.filter((slug) => !client.hiddenReports?.includes(slug as any)).map((slug) => {
                const isEnabled = client.enabledReports.includes(slug as any)
                const isActive = isEnabled && isOnReports && (activeSection === slug || (!activeSection && slug === client.enabledReports[0]))
                const linkParams = new URLSearchParams()
                linkParams.set('section', slug)
                if (dateRange) linkParams.set('dateRange', dateRange)
                const isMeetingPrep = slug === 'meeting-prep'

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
                    {isMeetingPrep ? (
                      <Link
                        href={`/dashboard/${clientSlug}/reports?${linkParams.toString()}`}
                        className={cn(
                          'block rounded-[100px] px-4 py-2 text-center text-sm font-bold text-black transition-opacity hover:opacity-90',
                          isActive ? 'opacity-100' : 'opacity-80'
                        )}
                        style={{
                          backgroundImage: 'linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF)',
                        }}
                      >
                        {REPORT_NAMES[slug] ?? slug}
                      </Link>
                    ) : (
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
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {/* Auth Hub link */}
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <NavLink
            href={`/dashboard/${clientSlug}/auth`}
            icon={Link2}
            label="Connections"
            isActive={pathname === `/dashboard/${clientSlug}/auth`}
          />
        </div>
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
