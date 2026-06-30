'use client'

import type { ReactNode } from 'react'
import { BlockGrid } from '../block-grid'
import { DashboardMutationsProvider } from '../dashboard-mutations'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

/** Read-only grid for the public /share view. Mirrors DashboardShell's block rendering
 *  but without any edit chrome, date control, or mutation provider. The renderBlock
 *  closure is created here (client-side) over the serializable blockNodes map, so no
 *  function crosses the server→client boundary. */
export function SharedDashboardGrid({
  blocks,
  config,
  slug,
  blockNodes,
}: {
  blocks: PersistedBlock[]
  config: DashboardConfig
  slug: string
  blockNodes: Record<string, ReactNode>
}) {
  // BlockChrome consumes the mutations context unconditionally; the provider is inert
  // here (no mutation fires with canEdit=false), it just satisfies the hook.
  return (
    <DashboardMutationsProvider slug={slug} config={config}>
      <BlockGrid
        blocks={blocks}
        canEdit={false}
        slug={slug}
        config={config}
        renderBlock={(b: PersistedBlock) => blockNodes[b.id]}
      />
    </DashboardMutationsProvider>
  )
}
