'use client'

import { useState, useTransition, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { proposeBlock, saveDashboardConfig, type ProposeBlockInput } from '@/app/actions/dashboard'
import { addBlock, updateBlock } from '../config-mutations'
import { useOptionalDashboardMutations } from '../dashboard-mutations'
import { applySelections, type BlockSelections } from './draft'
import { BlockPreviewCard } from './block-preview-card'
import { ManualBlockForm } from './manual-block-form'
import { blockToManualDraft } from './build-config'
import type { BlockConfig, BlockKind, DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'
import type { BlockProposal } from '@/lib/dashboard/nl/types'
import type { AggregateProposal } from '@/lib/dashboard/nl/aggregate-types'

type Source = ProposeBlockInput['source'] | 'formula' | 'shopify'

const KIND_OPTIONS: { value: BlockKind; label: string; available: boolean; hint?: string }[] = [
  { value: 'kpi',       label: 'KPI tile',            available: true },
  { value: 'bar',       label: 'Bar chart',           available: true },
  { value: 'line',      label: 'Line chart',          available: true },
  { value: 'table',     label: 'Table',               available: true },
  { value: 'narrative', label: 'Narrative panel',     available: true },
  { value: 'header',    label: 'Section header',      available: true },
]

const SOURCES_BY_KIND: Record<BlockKind, { value: Source; label: string }[]> = {
  kpi: [
    { value: 'supermetrics', label: 'Supermetrics' },
    { value: 'triplewhale',  label: 'TripleWhale' },
    { value: 'shopify',      label: 'Shopify (ShopifyQL)' },
    { value: 'formula',      label: 'Formula' },
  ],
  bar:       [{ value: 'supermetrics', label: 'Supermetrics' }, { value: 'triplewhale', label: 'TripleWhale' }, { value: 'shopify', label: 'Shopify (ShopifyQL)' }],
  line:      [{ value: 'supermetrics', label: 'Supermetrics' }, { value: 'triplewhale', label: 'TripleWhale' }, { value: 'shopify', label: 'Shopify (ShopifyQL)' }],
  table:     [{ value: 'supermetrics', label: 'Supermetrics' }, { value: 'triplewhale', label: 'TripleWhale' }, { value: 'shopify', label: 'Shopify (ShopifyQL)' }],
  narrative: [],
  header:    [],
}

const DEFAULT_CONFIG: DashboardConfig = { defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' }, blocks: [] }

export function AddBlockDialog({ slug, config, onClose, onAdded, editing }: { slug: string; config: DashboardConfig | null; onClose: () => void; onAdded?: (b: { id: string; name: string }) => void; editing?: PersistedBlock }) {
  const router = useRouter()
  const editSeed = editing ? blockToManualDraft(editing) : null
  const [step, setStep] = useState<'kind' | 'pick' | 'mode' | 'prompt' | 'preview' | 'build'>(editing ? 'build' : 'kind')
  const [kind, setKind] = useState<BlockKind>(editing?.kind ?? 'kpi')
  const [source, setSource] = useState<Source>(editSeed?.source ?? 'supermetrics')
  const [prompt, setPrompt] = useState('')
  const [clarify, setClarify] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<BlockProposal | AggregateProposal | null>(null)
  const [pending, startTransition] = useTransition()
  const mutations = useOptionalDashboardMutations()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function resolve() {
    // formula and shopify are manual-only; they never go through the NL proposer.
    if (source === 'formula' || source === 'shopify') return
    setClarify(null); setError(null)
    startTransition(async () => {
      const r = await proposeBlock({ source: source as ProposeBlockInput['source'], prompt, slug })
      if (r.kind === 'clarify') setClarify(r.question)
      else if (r.kind === 'error') setError(r.error)
      else { setProposal(r.proposal); setStep('preview') }
    })
  }

  function confirm(sel: BlockSelections) {
    if (!proposal) return
    setError(null)
    const block = applySelections(proposal.config, sel, crypto.randomUUID())
    if (mutations) { mutations.optimisticAdd(block); onAdded?.({ id: block.id, name: block.name }); onClose(); return }
    startTransition(async () => {
      const next = addBlock(config ?? DEFAULT_CONFIG, block)
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) setError(res.error)
      else { onAdded?.({ id: block.id, name: block.name }); onClose(); router.refresh() }
    })
  }

  function confirmManual(cfg: Omit<BlockConfig, 'id'>) {
    setError(null)
    if (editing) {
      startTransition(async () => {
        const next = updateBlock(config ?? DEFAULT_CONFIG, editing.id, cfg)
        const res = await saveDashboardConfig(slug, next)
        if (!res.ok) { setError(res.error); return }
        onClose(); router.refresh()
      })
      return
    }
    const block = { id: crypto.randomUUID(), ...cfg }
    if (mutations) { mutations.optimisticAdd(block); onAdded?.({ id: block.id, name: block.name }); onClose(); return }
    startTransition(async () => {
      const next = addBlock(config ?? DEFAULT_CONFIG, block)
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) { setError(res.error); return }
      onAdded?.({ id: block.id, name: block.name })
      onClose(); router.refresh()
    })
  }

  const input = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
  // Bar/Line/Table are leaf-only — skip the AI/manual mode step and go directly to 'build'.
  // KPI keeps the full prompt/mode flow.
  const isDataChartKind = kind === 'bar' || kind === 'line' || kind === 'table'
  // Static kinds need no data source — skip 'pick' entirely and jump from 'kind' → 'build'.
  const isStaticKind = kind === 'header' || kind === 'narrative'

  // Render into a portal on document.body: the dialog is mounted from inside a
  // react-grid-layout grid item, whose CSS transform would otherwise become the
  // containing block for `position: fixed`, trapping the overlay inside the block.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-lg border border-white/[0.08] bg-[#1a1a1a] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">{editing ? 'Edit block' : 'Add block'}</p>
          <button className="text-text-muted hover:text-white" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {step === 'kind' && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Block kind</p>
            {KIND_OPTIONS.map((k) => (
              <button
                key={k.value}
                disabled={!k.available}
                onClick={() => {
                  setKind(k.value)
                  setSource(SOURCES_BY_KIND[k.value][0]?.value ?? 'supermetrics')
                  // Static kinds (header/narrative) have no source step — jump straight to 'build'.
                  setStep(k.value === 'header' || k.value === 'narrative' ? 'build' : 'pick')
                }}
                className={cn(
                  'rounded-md border px-3 py-2 text-left text-sm',
                  k.available
                    ? 'border-white/10 text-white/90 hover:border-white/25 hover:bg-white/[0.04]'
                    : 'cursor-not-allowed border-white/[0.04] text-white/30',
                )}
              >
                {k.label}{k.hint ? <span className="ml-2 text-[10px] uppercase tracking-widest text-white/40">· {k.hint}</span> : null}
              </button>
            ))}
          </div>
        )}

        {step === 'pick' && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Source · {kind}</p>
            {SOURCES_BY_KIND[kind].map((s) => (
              <button key={s.value} onClick={() => { setSource(s.value); setStep(isDataChartKind ? 'build' : 'mode') }}
                className="rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 hover:bg-white/[0.04]">
                {s.label}
              </button>
            ))}
            <button className="mt-1 self-start rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={() => setStep('kind')} disabled={pending}>Back</button>
          </div>
        )}

        {step === 'mode' && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">How to build it · {source}</p>
            {source !== 'formula' && source !== 'shopify' && (
              <button disabled aria-disabled="true"
                className="flex cursor-not-allowed items-center justify-between rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/40">
                Describe with AI
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/40">Coming soon</span>
              </button>
            )}
            <button onClick={() => setStep('build')}
              className="rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 hover:bg-white/[0.04]">
              Build manually
            </button>
            <button className="mt-1 self-start rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={() => setStep('pick')} disabled={pending}>Back</button>
          </div>
        )}

        {step === 'build' && (
          <>
            <ManualBlockForm
              kind={kind}
              source={source as 'supermetrics' | 'triplewhale' | 'shopify' | 'formula'}
              slug={slug}
              pending={pending}
              existingBlocks={(config?.blocks ?? []).filter((b) => b.id !== editing?.id).map((b) => ({ id: b.id, name: b.name }))}
              initial={editSeed?.draft}
              onConfirm={confirmManual}
              onBack={editing ? onClose : () => setStep(isStaticKind ? 'kind' : isDataChartKind ? 'pick' : 'mode')}
            />
            {error && <p className="mt-2 text-xs text-[#FF6666]">Error: {error}</p>}
          </>
        )}

        {step === 'prompt' && (
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
              Describe the metric · {source}
            </p>
            <textarea className={cn(input, 'min-h-[88px] resize-y')} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="Facebook ad spend last 30 days" />
            {clarify && <p className="text-xs text-brand-cyan">{clarify}</p>}
            {error && <p className="text-xs text-[#FF6666]">Error: {error}</p>}
            <div className="flex justify-between">
              <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={() => setStep('mode')} disabled={pending}>Back</button>
              <button className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
                onClick={resolve} disabled={pending || prompt.trim() === ''}>{pending ? 'Resolving…' : 'Resolve'}</button>
            </div>
          </div>
        )}

        {step === 'preview' && proposal && (
          <>
            <BlockPreviewCard proposal={proposal} pending={pending} onConfirm={confirm} onCancel={() => setStep('prompt')} />
            {error && <p className="mt-2 text-xs text-[#FF6666]">Error: {error}</p>}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
