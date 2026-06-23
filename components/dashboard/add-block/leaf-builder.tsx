'use client'

import type React from 'react'
import { useEffect, useState, useTransition } from 'react'
import { DS_IDS } from '@/lib/supermetrics/constants'
import { TW_METRIC_SQL } from '@/lib/triplewhale/queries'
import { getMetricOptions, getAccountOptions } from '@/app/actions/dashboard'
import { SearchCombobox, type ComboOption } from './search-combobox'
import { formatFromDataType, type LeafDraft } from './build-config'
import type { MetricFormat } from '@/lib/dashboard/types'

const DS_OPTIONS: { value: string; label: string }[] = [
  { value: DS_IDS.GA4, label: 'Google Analytics 4' },
  { value: DS_IDS.GOOGLE_ADS, label: 'Google Ads' },
  { value: DS_IDS.META, label: 'Meta (Facebook) Ads' },
  { value: DS_IDS.LINKEDIN, label: 'LinkedIn Ads' },
]
const TW_OPTIONS: ComboOption[] = Object.keys(TW_METRIC_SQL).map((m) => ({ value: m, label: humanize(m) }))

function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'

export function LeafBuilder({
  source,
  value,
  onChange,
  slug,
  onSuggestFormat,
}: {
  source: 'supermetrics' | 'triplewhale'
  value: LeafDraft
  onChange: (v: LeafDraft) => void
  slug: string
  onSuggestFormat?: (f: MetricFormat) => void
}) {
  const sm = value.source === 'supermetrics' ? value : null
  const dsId = sm?.dsId ?? ''

  const [metricOpts, setMetricOpts] = useState<ComboOption[]>([])
  const [acctOpts, setAcctOpts] = useState<ComboOption[]>([])
  const [dataTypeByMetric, setDataTypeByMetric] = useState<Record<string, string | undefined>>({})
  const [err, setErr] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()

  useEffect(() => {
    if (source !== 'supermetrics' || dsId === '') {
      setMetricOpts([]); setAcctOpts([]); setDataTypeByMetric({}); setErr(null)
      return
    }
    setErr(null)
    startLoad(async () => {
      const [m, a] = await Promise.all([getMetricOptions(slug, dsId), getAccountOptions(slug, dsId)])
      if (m.ok) {
        setMetricOpts(m.options.map((o) => ({ value: o.value, label: o.label, group: o.group })))
        setDataTypeByMetric(Object.fromEntries(m.options.map((o) => [o.value, o.dataType])))
      } else {
        setErr(m.error); setMetricOpts([]); setDataTypeByMetric({})
      }
      setAcctOpts(a.ok ? a.options.map((o) => ({ value: o.value, label: o.label, disabled: o.disabled })) : [])
    })
  }, [source, dsId, slug])

  if (source === 'triplewhale') {
    const metric = value.source === 'triplewhale' ? value.metric : ''
    return (
      <Field label="Metric">
        <SearchCombobox
          value={metric}
          options={TW_OPTIONS}
          placeholder="Select metric"
          onChange={(m) => onChange({ source: 'triplewhale', metric: m })}
        />
      </Field>
    )
  }

  const v = sm ?? { source: 'supermetrics' as const, dsId: '', metricField: '', account: '' }
  const set = (patch: Partial<Extract<LeafDraft, { source: 'supermetrics' }>>) =>
    onChange({ source: 'supermetrics', dsId: v.dsId, metricField: v.metricField, account: v.account, ...patch })

  return (
    <div className="flex flex-col gap-3">
      <Field label="Data source">
        <select className={ctrl} value={v.dsId} onChange={(e) => set({ dsId: e.target.value, metricField: '', account: '' })}>
          <option value="">Select data source…</option>
          {DS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      {err ? (
        <>
          <p className="text-xs text-[#FF6666]">Discovery unavailable ({err}). Enter ids manually.</p>
          <Field label="Metric field">
            <input className={ctrl} value={v.metricField} onChange={(e) => set({ metricField: e.target.value })} placeholder="e.g. SocialSpend" />
          </Field>
          <Field label="Account">
            <input className={ctrl} value={v.account} onChange={(e) => set({ account: e.target.value })} placeholder="e.g. act_123…" />
          </Field>
        </>
      ) : (
        <>
          <Field label="Metric">
            <SearchCombobox
              value={v.metricField}
              options={metricOpts}
              disabled={v.dsId === ''}
              loading={loading}
              placeholder="Select metric"
              onChange={(metricField) => { set({ metricField }); onSuggestFormat?.(formatFromDataType(dataTypeByMetric[metricField])) }}
            />
          </Field>
          <Field label="Account">
            <SearchCombobox
              value={v.account}
              options={acctOpts}
              disabled={v.dsId === ''}
              loading={loading}
              placeholder="Select account"
              onChange={(account) => set({ account })}
            />
          </Field>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">{label}</span>
      {children}
    </label>
  )
}
