'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { setClientVisible } from '@/app/actions/report-sections'

/** Admin-only switch that opens an internal-by-default block to the client. */
export function ClientVisibleSwitch({
  clientSlug,
  viewKey,
  blockId,
  checked,
}: {
  clientSlug: string
  viewKey: string
  blockId: string
  checked: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle() {
    setError(null)
    startTransition(async () => {
      const res = await setClientVisible(clientSlug, viewKey, blockId, !checked)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-white/60">Visible to client</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Visible to client"
        disabled={pending}
        onClick={toggle}
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-[#60FF80]/60' : 'bg-white/20',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </div>
  )
}
