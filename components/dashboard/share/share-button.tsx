'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { ShareDialog } from './share-dialog'
import type { PersistedBlock } from '@/lib/dashboard/types'

export function ShareButton({ slug, blocks }: { slug: string; blocks: PersistedBlock[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-bg-surface px-4 py-2 text-sm font-bold text-white transition-colors hover:border-white/25"
      >
        <Share2 className="h-4 w-4" /> Share
      </button>
      {open && <ShareDialog slug={slug} blocks={blocks} onClose={() => setOpen(false)} />}
    </>
  )
}
