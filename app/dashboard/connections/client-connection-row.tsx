'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlatformCard } from '@/components/auth-hub/platform-card'
import type { PlatformId } from '@/lib/platforms/constants'

interface ClientConnectionRowProps {
  clientSlug: string
  clientName: string
  platforms: PlatformId[]
  connectionMap: Record<PlatformId, boolean>
  configuredCount: number
  totalCount: number
}

export function ClientConnectionRow({
  clientName,
  platforms,
  connectionMap,
  configuredCount,
  totalCount,
}: ClientConnectionRowProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-bg-surface">
      {/* Summary row */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-4">
          <h3 className="text-base font-extrabold text-white">{clientName}</h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-brand-green">
              <span className="inline-block h-2 w-2 rounded-full bg-brand-green" />
              {configuredCount} configured
            </span>
            <span className="text-text-muted">
              {totalCount - configuredCount} remaining
            </span>
          </div>
        </div>

        <ChevronDown
          className={cn(
            'h-4 w-4 text-text-muted transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Expanded platform grid */}
      {isOpen && (
        <div className="border-t border-white/[0.06] px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {platforms.map((platformId) => (
              <PlatformCard
                key={platformId}
                platformId={platformId}
                status={connectionMap[platformId] ? 'CONNECTED' : 'NOT_CONFIGURED'}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
