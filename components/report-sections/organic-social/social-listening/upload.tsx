'use client'
// Staff upload of one Talkwalker export (spec section 6). The server decides the month from the page's range and checks
// every rule; this only sends the file and shows what came back. Never rendered for a client or in the PDF export.
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useExportMode } from '@/components/export/export-mode'
import { uploadSocialListeningExport } from '@/app/actions/social-listening'
import type { SlTopic } from '@/lib/organic-social/social-listening/types'
import s from './sl.module.css'

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
    <div className={s.slot}>
      <span className={s.whoTag}>Staff only</span>
      <h4>{label}</h4>
      <p>The Talkwalker .xls export as downloaded, for this month and this topic.</p>
      <label className={s.editRow}>
        <input ref={input} type="file" accept=".xls,application/vnd.ms-excel" disabled={pending} aria-label={label}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f) }} />
        {pending && <span className={s.status}>Checking the file...</span>}
      </label>
      {errors.length > 0 && <ul role="alert" className={s.errors}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {note && <p className={s.status}>{note}</p>}
    </div>
  )
}
