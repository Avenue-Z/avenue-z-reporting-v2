'use client'
// The in-app dialog that replaces every window.confirm (spec v1.1 §11): it names the consequence, uses verb buttons,
// focuses the safe button (or the first field), keeps Tab inside, closes on Escape and gives focus back to the opener.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { btnCls, cardCls } from './ui'

export interface ConfirmDialogProps {
  title: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  error?: string | null
  confirmDisabled?: boolean
  initialFocus?: 'cancel' | 'input'
}

export function ConfirmDialog(p: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (p.initialFocus === 'input') ref.current?.querySelector<HTMLElement>('input,textarea')?.focus()
    else cancelRef.current?.focus()
    return () => { opener?.focus() }
    // Runs once per opening: focus moves in on open and back out on close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (!p.busy) p.onCancel()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const items = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]')]
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="aeo-dialog-title" onKeyDown={onKeyDown} className={`${cardCls} w-full max-w-md`}>
        <p id="aeo-dialog-title" className="mb-4 text-sm text-white">{p.title}</p>
        {p.children}
        {p.error && <p role="alert" className="mt-2 text-xs text-[#FF6B6B]">{p.error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button ref={cancelRef} type="button" className={btnCls} disabled={p.busy} onClick={p.onCancel}>{p.cancelLabel}</button>
          <button type="button" className={btnCls} disabled={p.busy || p.confirmDisabled} onClick={p.onConfirm}>{p.confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
