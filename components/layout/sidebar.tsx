'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { signOutAction } from '@/app/actions/auth'
import { DemoModeToggle } from './demo-mode-toggle'
import { REPORT_NAMES, NAV_GROUPS, AEO_SUBSECTIONS, GA4_SUBSECTIONS } from '@/lib/constants'
import type { Client } from '@/lib/db/schema'
import {
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
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

interface SidebarUser {
  name?: string | null
  email?: string | null
  image?: string | null
  /** True when the signed-in user has the users.demoMode DB flag set. */
  demoMode?: boolean
}

interface SidebarProps {
  user?: SidebarUser
  clients: Client[]
  /** Whether demoMode is currently effective for this render — drives the
   *  toggle's visual state. Computed by the layout from the user's flag
   *  AND the demoMode cookie (which the user can flip via the toggle). */
  demoModeEffective?: boolean
}

export function Sidebar({ user, clients, demoModeEffective = false }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)

  const pathParts = pathname.split('/')
  const clientSlug =
    pathParts[1] === 'dashboard' && pathParts.length >= 3 && pathParts[2] !== ''
      ? pathParts[2]
      : null

  const isTopLevel = !clientSlug || ['reports', 'connections', 'settings'].includes(clientSlug)

  if (!isTopLevel && clientSlug) {
    return (
      <ClientSidebar
        clientSlug={clientSlug}
        pathname={pathname}
        activeSection={searchParams.get('section')}
        activeSubsection={searchParams.get('subsection')}
        dateRange={searchParams.get('dateRange')}
        user={user}
        clients={clients}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        demoModeEffective={demoModeEffective}
      />
    )
  }

  return (
    <MainSidebar
      pathname={pathname}
      user={user}
      clients={clients}
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
      demoModeEffective={demoModeEffective}
    />
  )
}

// ─── Toggle button ────────────────────────────────────────────────────────────

function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
    >
      {collapsed ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </button>
  )
}

// ─── Main sidebar (dashboard home) ───────────────────────────────────────────

function MainSidebar({
  pathname,
  user,
  clients,
  collapsed,
  onToggle,
  demoModeEffective,
}: {
  pathname: string
  user?: SidebarUser
  clients: Client[]
  collapsed: boolean
  onToggle: () => void
  demoModeEffective: boolean
}) {

  return (
    <aside
      className={cn(
        'flex h-screen flex-col bg-bg-surface transition-all duration-200',
        collapsed ? 'w-14' : 'w-64'
      )}
    >
      {/* Logo + toggle */}
      <div className="flex h-16 shrink-0 items-center justify-between px-3">
        {!collapsed && (
          <Link href="/dashboard" className="px-3 text-white">
            <AvenueZLogo height={20} />
          </Link>
        )}
        <CollapseToggle collapsed={collapsed} onToggle={onToggle} />
      </div>

      {/* Navigation */}
      <nav className={cn('flex flex-1 flex-col', collapsed ? 'items-center px-1 pt-1' : 'px-2')}>
        <ul className="flex flex-col gap-1">
          <li>
            <Link
              href="/dashboard"
              title="Dashboard"
              className={cn(
                'flex items-center rounded-md transition-colors',
                collapsed
                  ? cn(
                      'h-9 w-9 justify-center',
                      pathname === '/dashboard'
                        ? 'bg-white/[0.08] text-white'
                        : 'text-text-muted hover:bg-white/[0.06] hover:text-white'
                    )
                  : cn(
                      'gap-3 px-2 py-2 text-sm font-semibold',
                      pathname === '/dashboard'
                        ? 'bg-white/[0.08] text-white'
                        : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                    )
              )}
            >
              <LayoutGrid className="h-5 w-5 shrink-0" />
              {!collapsed && <span>Dashboard</span>}
            </Link>
          </li>
        </ul>

        {/* Clients section */}
        <div className={collapsed ? 'mt-2 flex flex-col gap-1' : 'mt-6'}>
          {!collapsed && (
            <p className="mb-2 px-2 text-xs font-semibold text-text-muted">Your clients</p>
          )}
          <ul className="flex flex-col gap-1">
            {clients.map((client) => {
              const isActive = pathname.startsWith(`/dashboard/${client.slug}`)
              return (
                <li key={client.slug}>
                  <Link
                    href={`/dashboard/${client.slug}/reports`}
                    title={client.name}
                    className={cn(
                      'group flex items-center rounded-md transition-colors',
                      collapsed
                        ? cn(
                            'h-9 w-9 justify-center',
                            isActive
                              ? 'bg-white/[0.08] text-white'
                              : 'text-text-muted hover:bg-white/[0.06] hover:text-white'
                          )
                        : cn(
                            'gap-3 px-2 py-2 text-sm font-semibold',
                            isActive
                              ? 'bg-white/[0.08] text-white'
                              : 'text-text-muted hover:bg-white/[0.04] hover:text-white'
                          )
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
                    {!collapsed && <span className="truncate">{client.name}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>

      {/* User section */}
      <div className="mt-auto border-t border-white/[0.06] p-2">
        <UserFooter user={user} collapsed={collapsed} demoModeEffective={demoModeEffective} />
      </div>
    </aside>
  )
}

// ─── Client sidebar (per-client reports view) ────────────────────────────────

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
  user,
  clients,
  collapsed,
  onToggle,
  demoModeEffective,
}: {
  clientSlug: string
  pathname: string
  activeSection: string | null
  activeSubsection: string | null
  dateRange: string | null
  user?: SidebarUser
  clients: Client[]
  collapsed: boolean
  onToggle: () => void
  demoModeEffective: boolean
}) {
  const client = clients.find((c) => c.slug === clientSlug)
  const clientName = client?.name ?? clientSlug
  const isOnReports = pathname === `/dashboard/${clientSlug}/reports`

  return (
    <aside
      className={cn(
        'flex h-screen flex-col bg-bg-surface transition-all duration-200',
        collapsed ? 'w-14' : 'w-64'
      )}
    >
      {/* Logo + toggle */}
      <div className="flex h-16 shrink-0 items-center justify-between px-3">
        {!collapsed && (
          <Link href="/dashboard" className="px-3 text-white">
            <AvenueZLogo height={20} />
          </Link>
        )}
        <CollapseToggle collapsed={collapsed} onToggle={onToggle} />
      </div>

      {/* Back + Client name */}
      {!collapsed && (
        <div className="px-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            All Clients
          </Link>
        </div>
      )}

      {/* Collapsed — back arrow only */}
      {collapsed && (
        <div className="flex flex-col items-center px-1 pb-2">
          <Link href="/dashboard" title="All Clients" className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-white/[0.06] hover:text-white">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Report nav */}
      {!collapsed && (
        <nav className="flex flex-1 flex-col overflow-y-auto border-t border-white/[0.06] px-3 pt-4 scrollbar-dark">
          {client && (
            <div className="flex flex-col gap-4">
              {NAV_GROUPS.map((group, gi) => {
                if (group.comingSoon) {
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

                        // Answer Engine Optimization — expandable sub-menu
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

                        // GA4 — expandable sub-menu
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
      )}

      {/* User section */}
      <div className={cn('border-t border-white/[0.06] p-2', !collapsed && 'mt-auto')}>
        <UserFooter user={user} collapsed={collapsed} demoModeEffective={demoModeEffective} />
      </div>
    </aside>
  )
}

// ─── User footer ─────────────────────────────────────────────────────────────

function UserFooter({ user, collapsed, demoModeEffective }: { user?: SidebarUser; collapsed: boolean; demoModeEffective: boolean }) {
  const displayName = user?.name ?? user?.email ?? 'Avenue Z'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const avatar = user?.image ? (
    <Image
      src={user.image}
      alt={displayName}
      width={32}
      height={32}
      className="h-8 w-8 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-white">
      {initials}
    </span>
  )

  return (
    <div className="flex flex-col gap-2">
      {user?.demoMode && (
        <DemoModeToggle enabled={demoModeEffective} collapsed={collapsed} />
      )}
    <form action={signOutAction}>
      <button
        type="submit"
        title="Log out"
        className={cn(
          'flex items-center rounded-md transition-colors',
          collapsed
            ? 'h-9 w-9 justify-center text-text-muted hover:bg-white/[0.06] hover:text-white'
            : 'w-full gap-3 px-2 py-2 text-sm font-semibold text-text-muted hover:bg-white/[0.04] hover:text-white'
        )}
      >
        {avatar}
        {!collapsed && (
          <>
            <div className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate text-sm font-semibold text-white/80">{displayName}</span>
              {user?.email && user.name && (
                <span className="truncate text-[11px] text-text-muted">{user.email}</span>
              )}
            </div>
            <LogOut className="h-4 w-4 shrink-0 opacity-50" />
          </>
        )}
      </button>
    </form>
    </div>
  )
}

// ─── NavLink ─────────────────────────────────────────────────────────────────

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
