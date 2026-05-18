import Image from 'next/image'
import { cn } from '@/lib/utils'
import { PLATFORM_NAMES, PLATFORM_LOGOS } from '@/lib/platforms/constants'
import type { PlatformId } from '@/lib/platforms/constants'

export type ConnectionStatus = 'CONNECTED' | 'NOT_CONFIGURED'

interface PlatformCardProps {
  platformId: PlatformId
  status: ConnectionStatus
}

const statusConfig: Record<ConnectionStatus, { label: string; className: string }> = {
  CONNECTED: {
    label: 'Configured',
    className: 'border-brand-green text-brand-green',
  },
  NOT_CONFIGURED: {
    label: 'Not Configured',
    className: 'border-text-muted/30 text-text-muted',
  },
}

export function PlatformCard({ platformId, status }: PlatformCardProps) {
  const badge = statusConfig[status]
  const logo = PLATFORM_LOGOS[platformId]
  const name = PLATFORM_NAMES[platformId]

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <div className="mb-4">
        <Image src={logo} alt={name} width={32} height={32} className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-bold text-white">{name}</h3>

      <span
        className={cn(
          'mt-2 inline-flex items-center rounded-[100px] border px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest',
          badge.className
        )}
      >
        {badge.label}
      </span>

      {status === 'NOT_CONFIGURED' && (
        <p className="mt-3 text-xs text-text-muted">
          Set the env var in Vercel to enable this integration.
        </p>
      )}
    </div>
  )
}
