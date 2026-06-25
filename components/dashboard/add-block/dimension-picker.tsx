'use client'

import { useEffect, useState, useTransition } from 'react'
import { getSmFields } from '@/app/actions/dashboard'
import { SearchCombobox, type ComboOption } from './search-combobox'
import type { LeafDraft } from './build-config'

/** Hand-curated TW pixel-joined-tvf safe dimension allowlist. v1 list; review with Paul. */
const TW_DIMENSION_OPTIONS: ComboOption[] = [
  { value: 'channel',        label: 'Channel' },
  { value: 'country',        label: 'Country' },
  { value: 'device',         label: 'Device' },
  { value: 'campaign_name',  label: 'Campaign' },
  { value: 'ad_name',        label: 'Ad' },
  { value: 'utm_source',     label: 'UTM source' },
  { value: 'utm_campaign',   label: 'UTM campaign' },
]

const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

export function DimensionPicker({
  leaf,
  slug,
  value,
  onChange,
}: {
  leaf: LeafDraft
  slug: string
  value: string
  onChange: (dim: string) => void
}) {
  const [smDimOpts, setSmDimOpts] = useState<ComboOption[]>([])
  const [loading, startLoad] = useTransition()
  const dsId = leaf.source === 'supermetrics' ? leaf.dsId : ''

  useEffect(() => {
    if (leaf.source !== 'supermetrics' || dsId === '') { setSmDimOpts([]); return }
    startLoad(async () => {
      try {
        const r = await getSmFields(slug, dsId)
        if (r.ok) setSmDimOpts(r.dimensions.map((o) => ({ value: o.value, label: o.label, group: o.group })))
        else setSmDimOpts([])
      } catch { setSmDimOpts([]) }
    })
  }, [leaf.source, dsId, slug])

  const options = leaf.source === 'triplewhale' ? TW_DIMENSION_OPTIONS : smDimOpts
  const disabled = leaf.source === 'supermetrics' && dsId === ''

  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>Dimension (group by)</span>
      <SearchCombobox
        value={value}
        options={options}
        disabled={disabled}
        loading={loading}
        placeholder={disabled ? 'Pick a data source first' : 'Select dimension'}
        onChange={onChange}
      />
    </label>
  )
}
