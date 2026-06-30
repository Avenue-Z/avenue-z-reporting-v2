import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getDashboardShareByToken, getDashboardConfig } from '@/lib/db/queries'
import { renderBlockNode } from '@/components/dashboard/render-block'
import { filterSharedBlocks, reflowBlocks } from '@/lib/dashboard/share'
import { SharedDashboardGrid } from '@/components/dashboard/share/shared-dashboard-grid'
import type { BlockConfig } from '@/lib/dashboard/types'

// Public, unauthenticated read-only view. Not matched by proxy.ts (which only guards
// /dashboard, /portal, /tools), so no login is required — the token is the credential.
// Self-contained: root layout has no sidebar/nav, so the link exposes only this one
// dashboard and offers no path into the rest of the app.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const share = await getDashboardShareByToken(token)
  return { title: share?.title ?? 'Shared dashboard', robots: { index: false, follow: false } }
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const share = await getDashboardShareByToken(token)
  if (!share) notFound() // unknown or expired token

  const config = await getDashboardConfig(share.clientSlug)
  if (!config) notFound()

  const sharedBlocks = reflowBlocks(filterSharedBlocks(config.blocks, new Set(share.blockIds)))
  if (sharedBlocks.length === 0) notFound()

  const activeDefault = {
    dateRange: config.defaultRange.dateRange,
    compareRange: config.defaultRange.compareRange ?? null,
  }
  // Formula @ref operands can point at blocks outside the shared subset, so resolve
  // against the FULL block map even though we only render the selected blocks.
  const blocksById = new Map<string, BlockConfig>(config.blocks.map((b) => [b.id, b]))
  const sharedConfig = { ...config, blocks: sharedBlocks }

  const blockNodes: Record<string, ReactNode> = {}
  for (const block of sharedBlocks) {
    blockNodes[block.id] = renderBlockNode(block, activeDefault, share.clientSlug, false, sharedConfig, blocksById)
  }

  return (
    <main className="min-h-screen bg-black">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="mb-8 text-2xl font-bold text-white">{share.title}</h1>
        <SharedDashboardGrid blocks={sharedBlocks} config={sharedConfig} slug={share.clientSlug} blockNodes={blockNodes} />
        <p className="mt-12 text-center text-[11px] text-text-muted">Shared via Avenue&nbsp;Z</p>
      </div>
    </main>
  )
}
