'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { proposeBlock, saveDashboardConfig, type ProposeBlockInput } from '@/app/actions/dashboard'
import { addBlock } from '../config-mutations'
import { applySelections, type BlockSelections } from './draft'
import { BlockPreviewCard } from './block-preview-card'
import { ManualBlockForm } from './manual-block-form'
import type { DashboardConfig, BlockConfig } from '@/lib/dashboard/types'
import type { BlockProposal } from '@/lib/dashboard/nl/types'
import type { AggregateProposal } from '@/lib/dashboard/nl/aggregate-types'

type Source = 'supermetrics' | 'triplewhale' | 'formula'
const SOURCES: { value: Source; label: string }[] = [
  { value: 'supermetrics', label: 'Supermetrics' },
  { value: 'triplewhale', label: 'TripleWhale' },
  { value: 'formula', label: 'Formula' },
]
const DEFAULT_CONFIG: DashboardConfig = { defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' }, blocks: [] }

export function AddBlockDialog({ slug, config, onClose }: { slug: string; config: DashboardConfig | null; onClose: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState<'pick' | 'mode' | 'prompt' | 'preview' | 'build'>('pick')
  const [source, setSource] = useState<Source>('supermetrics')
  const [prompt, setPrompt] = useState('')
  const [clarify, setClarify] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<BlockProposal | AggregateProposal | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function resolve() {
    setClarify(null); setError(null)
    startTransition(async () => {
      const r = await proposeBlock({ source: source as ProposeBlockInput['source'], prompt, slug }) // 'formula' never reaches here (guard above)
      if (r.kind === 'clarify') setClarify(r.question)
      else if (r.kind === 'error') setError(r.error)
      else { setProposal(r.proposal); setStep('preview') }
    })
  }

  function confirm(sel: BlockSelections) {
    if (!proposal) return
    setError(null)
    startTransition(async () => {
      const id = crypto.randomUUID()
      const block = applySelections(proposal.config, sel, id)
      const next = addBlock(config ?? DEFAULT_CONFIG, block)
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) setError(res.error)
      else { onClose(); router.refresh() }
    })
  }

  function confirmManual(cfg: Omit<BlockConfig, 'id'>) {
    setError(null)
    startTransition(async () => {
      const block = { id: crypto.randomUUID(), ...cfg }
      const next = addBlock(config ?? DEFAULT_CONFIG, block)
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) setError(res.error)
      else { onClose(); router.refresh() }
    })
  }

  const input = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-lg border border-white/[0.08] bg-[#1a1a1a] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Add block</p>
          <button className="text-text-muted hover:text-white" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {step === 'pick' && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Source</p>
            {SOURCES.map((s) => (
              <button key={s.value} onClick={() => { setSource(s.value); setStep('mode') }}
                className="rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 hover:bg-white/[0.04]">
                {s.label}
              </button>
            ))}
          </div>
        )}

        {step === 'mode' && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">How to build it · {source}</p>
            {source !== 'formula' && (
              <button onClick={() => setStep('prompt')}
                className="rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 hover:bg-white/[0.04]">
                Describe with AI
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
              source={source}
              slug={slug}
              pending={pending}
              existingBlocks={(config?.blocks ?? []).map((b) => ({ id: b.id, name: b.name }))}
              onConfirm={confirmManual}
              onBack={() => setStep('mode')}
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
    </div>
  )
}
