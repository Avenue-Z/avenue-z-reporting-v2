'use client'

import { useState } from 'react'
import { AddBlockDialog } from './add-block-dialog'
import type { DashboardConfig } from '@/lib/dashboard/types'

export function AddBlockButton({ slug, config }: { slug: string; config: DashboardConfig | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-white/10 bg-bg-surface px-4 py-2 text-sm font-bold text-white transition-colors hover:border-white/25"
      >
        + Add block
      </button>
      {open && <AddBlockDialog slug={slug} config={config} onClose={() => setOpen(false)} />}
    </>
  )
}
