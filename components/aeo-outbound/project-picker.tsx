'use client'
// The searchable project picker (spec v1.1 §11). Each project shows its status and "{n} snapshots, last {date}" from the
// hub's own rows; while Peec answers it says "Loading Peec projects…".
import { useId, useMemo, useState } from 'react'
import { fmtEasternDay } from '@/lib/aeo-outbound/metrics'
import type { ProjectStat } from '@/lib/aeo-outbound/store'
import { LOADING_PROJECTS, NO_PROJECT_MATCH, PEEC_DOWN_RETRY, PICK_PROJECT, PROJECT_LABEL } from './messages'
import { btnCls, inputCls } from './ui'

export interface PickerProject { id: string; name: string; status: string }
const statusLabel = (s: string) => (s === 'PITCH' ? 'Pitch' : s === 'PITCH_ENDED' ? 'Pitch ended' : s)
export function projectLine(p: PickerProject, stat: ProjectStat | undefined): string {
  const history = stat ? `${stat.count} ${stat.count === 1 ? 'snapshot' : 'snapshots'}, last ${fmtEasternDay(new Date(stat.last))}` : 'No snapshots yet'
  return `${statusLabel(p.status)} · ${history}`
}

export interface ProjectPickerProps {
  projects: PickerProject[] | null
  failed: boolean
  onRetry: () => void
  value: string
  onChange: (id: string) => void
  stats: Record<string, ProjectStat>
}

export function ProjectPicker({ projects, failed, onRetry, value, onChange, stats }: ProjectPickerProps) {
  const inputId = useId()
  const listId = useId()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const selected = projects?.find((p) => p.id === value) ?? null
  const shown = useMemo(() => (projects ?? []).filter((p) => p.name.toLowerCase().includes(text.trim().toLowerCase())), [projects, text])
  const choose = (p: PickerProject) => { onChange(p.id); setText(''); setOpen(false) }
  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={inputId} className="text-xs text-text-muted">{PROJECT_LABEL}</label>
      {failed ? (
        <button type="button" className={btnCls} onClick={onRetry}>{PEEC_DOWN_RETRY}</button>
      ) : (
        <input
          id={inputId} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          className={`${inputCls} w-72`} disabled={!projects} placeholder={projects ? PICK_PROJECT : LOADING_PROJECTS}
          value={open ? text : selected?.name ?? ''}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(shown.length - 1, 0))) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); choose(shown[active]) }
            else if (e.key === 'Escape') setOpen(false)
          }}
        />
      )}
      {open && projects && !failed && (
        <ul id={listId} role="listbox" className="absolute top-full z-30 mt-1 max-h-72 w-96 overflow-y-auto rounded-md border border-white/[0.08] bg-bg-surface py-1">
          {shown.length === 0 && <li className="px-3 py-2 text-xs text-text-muted">{NO_PROJECT_MATCH}</li>}
          {shown.map((p, i) => (
            <li key={p.id} role="option" aria-selected={p.id === value} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? 'bg-white/[0.06]' : ''}`}>
              <span className="block text-sm text-white">{p.name}</span>
              <span className="block text-xs text-text-muted">{projectLine(p, stats[p.id])}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
