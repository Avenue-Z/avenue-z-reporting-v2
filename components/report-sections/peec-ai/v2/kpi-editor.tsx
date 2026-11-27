'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useExportMode } from '@/components/export/export-mode'
import { setAeoKpis } from '@/app/actions/aeo-kpis'
import { AEO_KPI_IDS, MAX_KPIS, type KpiId } from '@/lib/report-sections/aeo-kpis'

type Option = { id: KpiId; label: string; group: string; disabledReason: string | null }

export function KpiEditor({ clientSlug, selected, options }: { clientSlug: string; selected: KpiId[]; options: Option[] }) {
  const router = useRouter()
  const exporting = useExportMode()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<KpiId[]>(selected)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (exporting) return null

  const groups = [...new Set(options.map((o) => o.group))]
  const full = picked.length >= MAX_KPIS

  function toggle(id: KpiId) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }
  function cancel() {
    setPicked(selected)
    setError(null)
    setOpen(false)
  }
  function save() {
    const ids = AEO_KPI_IDS.filter((id) => picked.includes(id))
    start(async () => {
      let res: Awaited<ReturnType<typeof setAeoKpis>>
      try {
        res = await setAeoKpis(clientSlug, ids)
      } catch {
        // A throw inside the transition would reach the error boundary and replace the staff's section.
        setError('Save failed')
        return
      }
      if (res.ok) {
        setError(null)
        setOpen(false)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  if (!open) {
    return (
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => { setPicked(selected); setOpen(true) }}
          className="rounded-md border border-white/[0.12] px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-text-muted hover:text-white"
        >
          Edit KPIs
        </button>
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5">
      <div className="space-y-4">
        {groups.map((g) => (
          <fieldset key={g}>
            <legend className="mb-2 text-xs font-extrabold uppercase tracking-widest text-text-muted">{g}</legend>
            <div className="space-y-1.5">
              {options.filter((o) => o.group === g).map((o) => {
                const checked = picked.includes(o.id)
                // A saved KPI whose source is gone stays uncheckable-off: it can be dropped, never newly picked.
                const disabled = (o.disabledReason !== null && !checked) || (!checked && full)
                return (
                  <div key={o.id} className="flex items-center gap-2 text-sm text-white">
                    <input
                      id={`kpi-opt-${o.id}`}
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(o.id)}
                    />
                    <label htmlFor={`kpi-opt-${o.id}`} className={disabled ? 'opacity-50' : undefined}>{o.label}</label>
                    {o.disabledReason && <span className="text-xs text-text-muted">{o.disabledReason}</span>}
                  </div>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs text-text-muted">{`${picked.length} of ${MAX_KPIS} selected`}</span>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-50"
        >
          Save
        </button>
        <button type="button" onClick={cancel} className="text-xs font-semibold text-text-muted hover:text-white">
          Cancel
        </button>
        {error && <span className="text-xs text-[#FF4444]">{error}</span>}
      </div>
    </div>
  )
}
