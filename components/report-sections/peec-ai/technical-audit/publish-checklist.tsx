'use client'
// Staff-only "Before you publish" checklist for one Technical Audit snapshot. Never rendered for a client or in the
// PDF export. Publishing with GSC data missing needs a second, inline confirm (no window.confirm: browser dialogs
// break the headless export).
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useExportMode } from '@/components/export/export-mode'
import { publishSnapshot, unpublishSnapshot } from '@/app/actions/tech-audit'
import { isGscSlot, publishWarnings, type ChecklistItem } from '@/lib/technical-audit/checklist'
import { GscUploadSlot } from './gsc-upload-slot'

const GOOD = '#60FF80'
const BAD = '#FF4444'
const WARN = '#FFFC60'
const MARK = { done: { glyph: '✓', color: GOOD }, todo: { glyph: '○', color: WARN }, problem: { glyph: '!', color: BAD } } as const
const PILL = 'rounded-full px-6 py-3 text-sm font-bold disabled:opacity-50'

export function PublishChecklist({ clientSlug, snapshotId, items, status }: {
  clientSlug: string
  snapshotId: string
  items: ChecklistItem[]
  status: 'draft' | 'published'
}) {
  const exportMode = useExportMode()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (exportMode) return null

  const warnings = publishWarnings(items)

  function run(action: typeof publishSnapshot) {
    setError(null)
    start(async () => {
      const r = await action({ clientSlug, snapshotId })
      setConfirming(false)
      if (!r.ok) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <section data-print-hidden className="rounded-2xl border border-white/5 bg-bg-surface p-6">
      <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Staff only</span>
      <h3 className="mt-1 text-lg font-extrabold text-white">Before you publish</h3>
      <ul className="mt-4 space-y-3">
        {items.map((item) => {
          const m = MARK[item.state]
          return (
            <li key={item.key} className="flex gap-3">
              <span aria-hidden className="w-4 text-center font-bold" style={{ color: m.color }}>{m.glyph}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">
                  {item.label}
                  <span className="sr-only"> ({item.state === 'done' ? 'done' : item.state === 'problem' ? 'problem' : 'to do'})</span>
                </p>
                {item.detail && (
                  <p className="text-xs" style={item.state === 'problem' ? { color: BAD } : undefined}>
                    <span className={item.state === 'problem' ? undefined : 'text-text-muted'}>{item.detail}</span>
                  </p>
                )}
                {isGscSlot(item.key) && (
                  <GscUploadSlot clientSlug={clientSlug} snapshotId={snapshotId} slot={item.key} label={item.label} />
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {confirming && (
        <div role="alert" className="mt-4 rounded-xl border border-white/10 p-4">
          <p className="text-sm font-bold" style={{ color: WARN }}>Publish with these missing?</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-text-muted">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm" style={{ color: BAD }}>{error}</p>}

      <div className="mt-5 flex gap-3">
        {status === 'published' ? (
          <button type="button" disabled={pending} onClick={() => run(unpublishSnapshot)} className={PILL} style={{ background: '#3a3a3a', color: '#FFF' }}>
            Unpublish
          </button>
        ) : confirming ? (
          <>
            <button type="button" disabled={pending} onClick={() => run(publishSnapshot)} className={PILL} style={{ background: GOOD, color: '#000' }}>
              Publish anyway
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={PILL} style={{ background: '#3a3a3a', color: '#FFF' }}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => (warnings.length > 0 ? setConfirming(true) : run(publishSnapshot))}
            className={PILL}
            style={{ background: GOOD, color: '#000' }}
          >
            Publish
          </button>
        )}
      </div>
    </section>
  )
}
