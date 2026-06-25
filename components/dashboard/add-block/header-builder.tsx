'use client'

import type { HeaderDraft } from './build-config'

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

export function HeaderBuilder({
  value, onChange,
}: {
  value: HeaderDraft
  onChange: (v: HeaderDraft) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>Heading level</span>
      <select
        className={ctrl}
        value={String(value.level)}
        onChange={(e) => onChange({ ...value, level: Number(e.target.value) as 1 | 2 | 3 })}
      >
        <option value="1">H1 — largest</option>
        <option value="2">H2 — section</option>
        <option value="3">H3 — small</option>
      </select>
    </label>
  )
}
