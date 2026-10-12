'use client'
// Copy link with feedback (spec v1.1 §11): it awaits the clipboard, says Copied for 2 seconds and announces it; on
// failure it says so and shows the link in a read-only field to copy by hand.
import { useEffect, useState } from 'react'
import { COPIED, COPY_FAILED, COPY_LINK, LINK_COPIED, LINK_FIELD } from './messages'
import { btnCls, inputCls } from './ui'

export function CopyLink({ url, showField = false }: { url: string; showField?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state !== 'copied') return
    const t = setTimeout(() => setState('idle'), 2000)
    return () => clearTimeout(t)
  }, [state])
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      setState('failed')
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {(showField || state === 'failed') && (
        <input readOnly aria-label={LINK_FIELD} value={url} onFocus={(e) => e.currentTarget.select()} className={`${inputCls} w-72 text-xs`} />
      )}
      <button type="button" className={btnCls} onClick={() => void copy()}>{state === 'copied' ? COPIED : COPY_LINK}</button>
      <span role="status" aria-live="polite" className={state === 'failed' ? 'text-xs text-[#FF6B6B]' : 'sr-only'}>
        {state === 'copied' ? LINK_COPIED : state === 'failed' ? COPY_FAILED : ''}
      </span>
    </span>
  )
}
