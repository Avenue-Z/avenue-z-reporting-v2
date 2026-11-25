'use client'
// One Search Console .xlsx upload slot in the staff checklist. The server parses and validates the file; this only
// sends it and shows what came back.
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uploadGscExport } from '@/app/actions/tech-audit'
import type { GscSlot } from '@/lib/technical-audit/checklist'

export function GscUploadSlot({ clientSlug, snapshotId, slot, label }: { clientSlug: string; snapshotId: string; slot: GscSlot; label: string }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function send(file: File) {
    const form = new FormData()
    form.set('clientSlug', clientSlug)
    form.set('snapshotId', snapshotId)
    form.set('slot', slot)
    form.set('file', file)
    setError(null)
    start(async () => {
      const r = await uploadGscExport(form)
      if (input.current) input.current.value = ''
      if (!r.ok) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="mt-2">
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        disabled={pending}
        aria-label={label}
        className="text-xs text-text-muted"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f) }}
      />
      {pending && <span className="ml-2 text-xs text-text-muted">Checking the file...</span>}
      {error && <p role="alert" className="mt-1 text-xs" style={{ color: '#FF4444' }}>{error}</p>}
    </div>
  )
}
