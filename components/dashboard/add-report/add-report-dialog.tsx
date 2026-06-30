'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClientReport } from '@/app/actions/reports'

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-sm font-bold text-white'

export function AddReportDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [shopId, setShopId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [existsUrl, setExistsUrl] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit() {
    setError(null)
    setExistsUrl(null)
    startTransition(async () => {
      const res = await createClientReport({ name, triplewhaleShopId: shopId })
      if (res.ok) { router.push(res.url); return }
      if ('code' in res) { setExistsUrl(res.url); return }
      setError(res.error)
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-8 flex w-full max-w-md flex-col gap-5 rounded-lg border border-white/[0.08] bg-[#1a1a1a] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Add new report</h2>
            <p className="mt-0.5 text-sm text-text-muted">Provision a TripleWhale dashboard for a client.</p>
          </div>
          <button className="text-text-muted hover:text-white" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Client name</span>
          <input className={ctrl} value={name} onChange={(e) => setName(e.target.value)} placeholder="Love Bug" />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>TripleWhale shop ID</span>
          <input className={ctrl} value={shopId} onChange={(e) => setShopId(e.target.value)} placeholder="your-store.myshopify.com" />
          <span className="text-[11px] text-text-muted">The shop&apos;s *.myshopify.com domain.</span>
        </label>

        {error && <p className="text-xs text-[#FF6666]">{error}</p>}
        {existsUrl && (
          <p className="text-xs text-text-muted">
            This client already has a report.{' '}
            <Link href={existsUrl} className="font-bold text-brand-cyan underline">Open it instead</Link>.
          </p>
        )}

        <button
          className="self-end rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-5 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40"
          onClick={submit}
          disabled={pending || !name.trim() || !shopId.trim()}
        >
          {pending ? 'Creating…' : 'Generate report'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
