'use client'

import { createContext, useContext, useOptimistic, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { saveDashboardConfig } from '@/app/actions/dashboard'
import { addBlock, removeBlock } from './config-mutations'
import { optimisticBlocksReducer } from './optimistic-blocks'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

export interface DashboardMutations {
  optimisticBlocks: PersistedBlock[]
  optimisticAdd: (block: PersistedBlock) => void
  optimisticRemove: (id: string) => void
  error: string | null
}

const Ctx = createContext<DashboardMutations | null>(null)

export function useDashboardMutations(): DashboardMutations {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDashboardMutations must be used within a DashboardMutationsProvider')
  return v
}

export function useOptionalDashboardMutations(): DashboardMutations | null {
  return useContext(Ctx)
}

export function DashboardMutationsProvider({
  slug, config, children,
}: {
  slug: string
  config: DashboardConfig
  children: ReactNode
}) {
  const router = useRouter()
  // Base is the server prop, so it rebases automatically after router.refresh().
  const [optimisticBlocks, applyOptimistic] = useOptimistic(config.blocks, optimisticBlocksReducer)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const optimisticAdd = (block: PersistedBlock) => {
    setError(null)
    startTransition(async () => {
      applyOptimistic({ type: 'add', block })
      const res = await saveDashboardConfig(slug, addBlock(config, block))
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  const optimisticRemove = (id: string) => {
    setError(null)
    startTransition(async () => {
      applyOptimistic({ type: 'remove', id })
      const res = await saveDashboardConfig(slug, removeBlock(config, id))
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <Ctx.Provider value={{ optimisticBlocks, optimisticAdd, optimisticRemove, error }}>
      {children}
    </Ctx.Provider>
  )
}
