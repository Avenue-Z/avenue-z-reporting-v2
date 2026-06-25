'use client'

import type { NarrativeDraft } from './build-config'

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

export function NarrativeBuilder({
  value, onChange,
}: {
  value: NarrativeDraft
  onChange: (v: NarrativeDraft) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>Body (markdown supported)</span>
      <textarea
        className={`${ctrl} min-h-[120px] resize-y`}
        value={value.body}
        onChange={(e) => onChange({ ...value, body: e.target.value })}
        placeholder="## Highlights&#10;- Cost down 12%&#10;- Conversions up 8%"
      />
    </label>
  )
}
