'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AddReportDialog } from './add-report-dialog'

export function AddReportCard() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex min-h-[84px] items-center gap-4 rounded-lg border border-dashed border-white/[0.14] bg-transparent p-5 text-left transition-all hover:border-white/30 hover:bg-white/[0.02]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white">
          <Plus className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">Add new report</p>
          <p className="mt-0.5 text-xs text-text-muted">Provision a client dashboard</p>
        </div>
      </button>
      {open && <AddReportDialog onClose={() => setOpen(false)} />}
    </>
  )
}
