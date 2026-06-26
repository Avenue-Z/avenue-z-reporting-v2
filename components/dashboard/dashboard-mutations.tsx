'use client'

import { createContext, useContext, useEffect, useOptimistic, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { saveDashboardConfig } from '@/app/actions/dashboard'
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

  // Latest persisted block list, so rapid successive mutations build on each
  // other's result instead of all basing off the stale `config` prop (which only
  // updates after router.refresh()). Rebase to the server prop whenever it changes.
  // pendingBlocks is only read inside event handlers, never during render.
  const pendingBlocks = useRef(config.blocks)
  useEffect(() => {
    pendingBlocks.current = config.blocks
  }, [config.blocks])

  const optimisticAdd = (block: PersistedBlock) => {
    setError(null)
    const nextBlocks = optimisticBlocksReducer(pendingBlocks.current, { type: 'add', block })
    pendingBlocks.current = nextBlocks
    startTransition(async () => {
      applyOptimistic({ type: 'add', block })
      const res = await saveDashboardConfig(slug, { ...config, blocks: nextBlocks })
      if (!res.ok) { setError(res.error); pendingBlocks.current = config.blocks; return }
      router.refresh()
    })
  }

  const optimisticRemove = (id: string) => {
    setError(null)
    const nextBlocks = optimisticBlocksReducer(pendingBlocks.current, { type: 'remove', id })
    pendingBlocks.current = nextBlocks
    startTransition(async () => {
      applyOptimistic({ type: 'remove', id })
      const res = await saveDashboardConfig(slug, { ...config, blocks: nextBlocks })
      if (!res.ok) { setError(res.error); pendingBlocks.current = config.blocks; return }
      router.refresh()
    })
  }

  return (
    <Ctx.Provider value={{ optimisticBlocks, optimisticAdd, optimisticRemove, error }}>
      {children}
    </Ctx.Provider>
  )
}
