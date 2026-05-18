import Image from 'next/image'
import Link from 'next/link'
import { getAllClients } from '@/lib/clients.config'
import { cn } from '@/lib/utils'
import { ArrowRight } from 'lucide-react'

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

export default function DashboardPage() {
  const clients = getAllClients()

  return (
    <>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">
          Select a client to view their reports and manage connections.
        </p>
      </div>

      {/* Client cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <Link
            key={client.slug}
            href={`/dashboard/${client.slug}/reports`}
            className="group relative flex items-center gap-4 rounded-lg border border-white/[0.06] bg-bg-surface p-5 transition-all hover:border-white/[0.12] hover:bg-white/[0.02]"
          >
            {/* Avatar / Logo */}
            {client.logoUrl ? (
              <span className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg overflow-hidden',
                client.slug === 'avenue-z' ? 'bg-black p-1.5' : ''
              )}>
                <Image
                  src={client.logoUrl}
                  alt={client.name}
                  width={40}
                  height={40}
                  className={cn(
                    'shrink-0',
                    client.slug === 'avenue-z' ? 'h-7 w-7 object-contain' : 'h-10 w-10 rounded-lg object-cover'
                  )}
                />
              </span>
            ) : (
              <span className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-bold',
                getAvatarColor(client.name)
              )}>
                {client.name.charAt(0).toUpperCase()}
              </span>
            )}

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {client.name}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {client.enabledReports.length} report{client.enabledReports.length !== 1 ? 's' : ''} configured
              </p>
            </div>

            {/* Arrow */}
            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </>
  )
}
