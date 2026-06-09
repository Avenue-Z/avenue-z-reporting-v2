// components/report-sections/peec-ai/provider-tabs.tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type AeoProvider = 'peec' | 'profound'

const LABELS: Record<AeoProvider, string> = { peec: 'Peec AI', profound: 'Profound' }

export function ProviderTabs({
  availableProviders,
  clientSlug,
  sections,
}: {
  availableProviders: AeoProvider[]
  clientSlug: string
  sections: Partial<Record<AeoProvider, ReactNode>>
}) {
  const storageKey = `aeo-provider:${clientSlug}`
  // First render is deterministic (first available) to avoid hydration mismatch;
  // the persisted choice is applied after mount.
  const [selected, setSelected] = useState<AeoProvider>(availableProviders[0])

  useEffect(() => {
    if (availableProviders.length < 2) return
    const saved = window.localStorage.getItem(storageKey) as AeoProvider | null
    if (saved && availableProviders.includes(saved)) setSelected(saved)
  }, [storageKey, availableProviders])

  function pick(p: AeoProvider) {
    setSelected(p)
    window.localStorage.setItem(storageKey, p)
  }

  if (availableProviders.length < 2) {
    return <>{sections[availableProviders[0]]}</>
  }

  return (
    <div className="space-y-8">
      <div className="flex w-fit gap-1 rounded-lg bg-white/[0.04] p-1">
        {availableProviders.map((p) => (
          <button
            key={p}
            onClick={() => pick(p)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-semibold transition-all',
              selected === p ? 'bg-white text-black shadow-sm' : 'text-text-muted hover:text-white',
            )}
          >
            {LABELS[p]}
          </button>
        ))}
      </div>
      {sections[selected]}
    </div>
  )
}
