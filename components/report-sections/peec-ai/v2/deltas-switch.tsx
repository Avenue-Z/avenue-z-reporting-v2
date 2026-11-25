'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useExportMode } from '@/components/export/export-mode'

export function DeltasSwitch({ showDeltas, disabled }: { showDeltas: boolean; disabled: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const exporting = useExportMode()
  if (exporting) return null

  function toggle() {
    if (disabled) return
    const params = new URLSearchParams(searchParams.toString())
    if (showDeltas) params.set('deltas', 'off')
    else params.delete('deltas')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={showDeltas}
        aria-disabled={disabled}
        aria-label="Show deltas"
        onClick={toggle}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          showDeltas && !disabled ? 'bg-[#60FF80]' : 'bg-white/20'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            showDeltas ? 'translate-x-4' : ''
          }`}
        />
      </button>
      <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">Show deltas</span>
      {disabled && <span className="text-xs text-text-muted">No comparison selected</span>}
    </div>
  )
}
