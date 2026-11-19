'use client'
// Staff upload of one Talkwalker export (spec section 6). The server decides the month from the page's range and checks
// every rule; this only sends the file and shows what came back. Never rendered for a client or in the PDF export.
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useExportMode } from '@/components/export/export-mode'
import { uploadSocialListeningExport } from '@/app/actions/social-listening'
import type { SlTopic } from '@/lib/organic-social/social-listening/types'

export function UploadControl({ clientSlug, topic, range, label }: { clientSlug: string; topic: SlTopic; range: string; label: string }) {
  const exportMode = useExportMode()
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (exportMode) return null

  function send(file: File) {
    const form = new FormData()
    form.set('clientSlug', clientSlug)
    form.set('topic', topic)
    form.set('range', range)
    form.set('file', file)
    setErrors([])
    setNote(null)
    start(async () => {
      const r = await uploadSocialListeningExport(form)
      if (input.current) input.current.value = ''
      if (!r.ok) { setErrors(r.errors); return }
      if (!r.beforeOpen) setNote('Uploaded after the month opened to the client. Later months still compare with the earlier numbers.')
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-bg-surface px-5 py-4">
      <label className="flex flex-wrap items-center gap-3 text-sm text-white">
        <span className="font-semibold">{label}</span>
        <input
          ref={input}
          type="file"
          accept=".xls,application/vnd.ms-excel"
          disabled={pending}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f) }}
          className="text-xs text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-white/[0.12] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
        />
        {pending && <span className="text-xs text-text-muted">Checking the file...</span>}
      </label>
      <p className="mt-2 text-xs text-text-muted">The Talkwalker .xls export as downloaded, for this month and this topic.</p>
      {errors.length > 0 && (
        <ul role="alert" className="mt-3 list-disc space-y-1 pl-5 text-xs text-[#FF4444]">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
      )}
      {note && <p className="mt-3 text-xs text-[#FFFC60]">{note}</p>}
    </div>
  )
}
