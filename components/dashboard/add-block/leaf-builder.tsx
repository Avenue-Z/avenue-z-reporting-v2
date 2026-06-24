'use client'

import type React from 'react'
import { useEffect, useState, useTransition } from 'react'
import { DS_IDS } from '@/lib/supermetrics/constants'
import { getTwFields, getTwDimensionValues, getSmFields, getAccountOptions, getSmDimensionValues } from '@/app/actions/dashboard'
import type { TwFields } from '@/lib/triplewhale/discovery'
import { SearchCombobox, type ComboOption } from './search-combobox'
import { MultiSelectCombobox } from './multi-select-combobox'
import { formatFromDataType, COMMON_TW_METRICS, type LeafDraft } from './build-config'
import type { MetricFormat } from '@/lib/dashboard/types'

const DS_OPTIONS: { value: string; label: string }[] = [
  { value: DS_IDS.GA4, label: 'Google Analytics 4' },
  { value: DS_IDS.GOOGLE_ADS, label: 'Google Ads' },
  { value: DS_IDS.META, label: 'Meta (Facebook) Ads' },
  { value: DS_IDS.LINKEDIN, label: 'LinkedIn Ads' },
  { value: DS_IDS.SHOPIFY, label: 'Shopify' },
]
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
  const [dimOpts, setDimOpts] = useState<ComboOption[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()

  useEffect(() => {
    if (source !== 'supermetrics' || dsId === '') {
      setMetricOpts([]); setAcctOpts([]); setDataTypeByMetric({}); setDimOpts([]); setErr(null)
      return
    }
    setErr(null)
    startLoad(async () => {
      try {
        const [m, a] = await Promise.all([getSmFields(slug, dsId), getAccountOptions(slug, dsId)])
        if (m.ok) {
          setMetricOpts(m.metrics.map((o) => ({ value: o.value, label: o.label, group: o.group })))
          setDataTypeByMetric(Object.fromEntries(m.metrics.map((o) => [o.value, o.dataType])))
          setDimOpts(m.dimensions.map((o) => ({ value: o.value, label: o.label, group: o.group })))
        } else {
          setErr(m.error); setMetricOpts([]); setDataTypeByMetric({}); setDimOpts([])
        }
        setAcctOpts(a.ok ? a.options.map((o) => ({ value: o.value, label: o.label, disabled: o.disabled })) : [])
      } catch {
        setErr('discovery unavailable'); setMetricOpts([]); setDataTypeByMetric({}); setAcctOpts([]); setDimOpts([])
      }
    })
  }, [source, dsId, slug])

  if (source === 'triplewhale') {
    const tw = value.source === 'triplewhale' ? value : { source: 'triplewhale' as const, metric: '' }
    const filters = tw.filters ?? []
    return (
      <TwLeafFields
        metric={tw.metric}
        filters={filters}
        slug={slug}
        onChange={(next) => onChange({ source: 'triplewhale', metric: next.metric, ...(next.filters.length ? { filters: next.filters } : {}) })}
      />
    )
  }

  const v = sm ?? { source: 'supermetrics' as const, dsId: '', metricField: '', account: '' }
  const set = (patch: Partial<Extract<LeafDraft, { source: 'supermetrics' }>>) =>
    onChange({ source: 'supermetrics', dsId: v.dsId, metricField: v.metricField, account: v.account, ...(v.filters ? { filters: v.filters } : {}), ...patch })

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
          {v.dsId !== '' && (
            <>
              {(v.filters ?? []).map((f, i) => (
                <SmFilterRow
                  key={i}
                  filter={f}
                  dimensions={dimOpts}
                  slug={slug}
                  dsId={v.dsId}
                  account={v.account}
                  onChange={(nf) => set({ filters: (v.filters ?? []).map((x, j) => (j === i ? nf : x)) })}
                  onRemove={() => set({ filters: (v.filters ?? []).filter((_, j) => j !== i) })}
                />
              ))}
              <button
                type="button"
                onClick={() => set({ filters: [...(v.filters ?? []), { column: '', values: [] }] })}
                className="self-start rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
              >
                + Add filter
              </button>
            </>
          )}
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

function TwLeafFields({
  metric,
  filters,
  slug,
  onChange,
}: {
  metric: string
  filters: { column: string; values: string[] }[]
  slug: string
  onChange: (next: { metric: string; filters: { column: string; values: string[] }[] }) => void
}) {
  const [fields, setFields] = useState<TwFields>({ metrics: [], dimensions: [] })
  const [err, setErr] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()

  useEffect(() => {
    setErr(null)
    startLoad(async () => {
      try {
        const r = await getTwFields(slug)
        if (r.ok) setFields(r.fields)
        else { setErr(r.error); setFields({ metrics: [], dimensions: [] }) }
      } catch {
        setErr('discovery unavailable'); setFields({ metrics: [], dimensions: [] })
      }
    })
  }, [slug])

  const setMetric = (m: string) => onChange({ metric: m, filters })
  const setFilter = (i: number, f: { column: string; values: string[] }) =>
    onChange({ metric, filters: filters.map((x, j) => (j === i ? f : x)) })
  const addFilter = () => onChange({ metric, filters: [...filters, { column: '', values: [] }] })
  const removeFilter = (i: number) => onChange({ metric, filters: filters.filter((_, j) => j !== i) })

  return (
    <div className="flex flex-col gap-3">
      <Field label="Metric">
        {err ? (
          <input className={ctrl} value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="column id (e.g. spend)" />
        ) : (
          <SearchCombobox value={metric} options={[...COMMON_TW_METRICS, ...fields.metrics]} loading={loading} placeholder="Select metric" onChange={setMetric} />
        )}
      </Field>
      {err && <p className="text-xs text-[#FF6666]">Discovery unavailable ({err}). Enter column ids manually.</p>}

      {filters.map((f, i) => (
        <TwFilterRow
          key={i}
          filter={f}
          dimensions={fields.dimensions}
          slug={slug}
          disabled={err !== null}
          onChange={(nf) => setFilter(i, nf)}
          onRemove={() => removeFilter(i)}
        />
      ))}

      <button
        type="button"
        onClick={addFilter}
        className="self-start rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
      >
        + Add filter
      </button>
    </div>
  )
}

function TwFilterRow({
  filter,
  dimensions,
  slug,
  disabled,
  onChange,
  onRemove,
}: {
  filter: { column: string; values: string[] }
  dimensions: ComboOption[]
  slug: string
  disabled: boolean
  onChange: (f: { column: string; values: string[] }) => void
  onRemove: () => void
}) {
  const [values, setValues] = useState<ComboOption[]>([])
  const [loading, startLoad] = useTransition()

  useEffect(() => {
    if (filter.column === '') { setValues([]); return }
    startLoad(async () => {
      try {
        const r = await getTwDimensionValues(slug, filter.column)
        setValues(r.ok ? r.values.map((v) => ({ value: v, label: v })) : [])
      } catch { setValues([]) }
    })
  }, [filter.column, slug])

  return (
    <div className="flex items-center gap-2">
      <SearchCombobox
        value={filter.column}
        options={dimensions}
        disabled={disabled}
        placeholder="Dimension"
        onChange={(column) => onChange({ column, values: [] })}
      />
      <MultiSelectCombobox
        values={filter.values}
        options={values}
        disabled={disabled || filter.column === ''}
        loading={loading}
        placeholder="Values"
        onChange={(vs) => onChange({ column: filter.column, values: vs })}
      />
      <button type="button" onClick={onRemove} className="text-text-muted hover:text-white" aria-label="Remove filter">✕</button>
    </div>
  )
}

function SmFilterRow({
  filter,
  dimensions,
  slug,
  dsId,
  account,
  onChange,
  onRemove,
}: {
  filter: { column: string; values: string[] }
  dimensions: ComboOption[]
  slug: string
  dsId: string
  account: string
  onChange: (f: { column: string; values: string[] }) => void
  onRemove: () => void
}) {
  const [values, setValues] = useState<ComboOption[]>([])
  const [cached, setCached] = useState(false)
  const [loading, startLoad] = useTransition()
  const [refreshing, setRefreshing] = useState(false)

  const read = () => {
    if (filter.column === '' || account === '') { setValues([]); setCached(false); return }
    startLoad(async () => {
      try {
        const r = await getSmDimensionValues(slug, dsId, account, filter.column)
        if (r.ok && r.cached) { setValues(r.values.map((v) => ({ value: v, label: v }))); setCached(true) }
        else { setValues([]); setCached(false) }
      } catch { setValues([]); setCached(false) }
    })
  }

  useEffect(read, [filter.column, slug, dsId, account])

  const loadValues = async () => {
    if (filter.column === '' || account === '') return
    setRefreshing(true)
    try {
      await fetch('/api/discovery/sm-dimension-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, dsId, account, column: filter.column }),
      })
    } catch { /* fall through to re-read */ }
    setRefreshing(false)
    read()
  }

  return (
    <div className="flex items-start gap-2">
      <SearchCombobox
        value={filter.column}
        options={dimensions}
        placeholder="Dimension"
        onChange={(column) => onChange({ column, values: [] })}
      />
      {cached ? (
        <MultiSelectCombobox
          values={filter.values}
          options={values}
          disabled={filter.column === '' || account === ''}
          loading={loading}
          placeholder="Values"
          onChange={(vs) => onChange({ column: filter.column, values: vs })}
        />
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          <MultiSelectCombobox
            values={filter.values}
            options={[]}
            allowCustom
            disabled={filter.column === '' || account === ''}
            placeholder="Type values, or load"
            onChange={(vs) => onChange({ column: filter.column, values: vs })}
          />
          <button
            type="button"
            onClick={loadValues}
            disabled={refreshing || filter.column === '' || account === ''}
            className="self-start shrink-0 rounded-md border border-white/10 px-2 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] disabled:opacity-40"
          >
            {refreshing ? 'Loading… (~1–2 min)' : 'Load values'}
          </button>
        </div>
      )}
      <button type="button" onClick={onRemove} className="text-text-muted hover:text-white" aria-label="Remove filter">✕</button>
    </div>
  )
}
