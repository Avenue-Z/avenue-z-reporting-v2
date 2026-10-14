'use client'
// The in-app dialog that replaces every window.confirm (spec v1.1 §11): it names the consequence, uses verb buttons,
// focuses the safe button (or the first field), keeps Tab inside, closes on Escape and gives focus back to the opener.
import { useEffect, useRef, type ReactNode } from 'react'
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
  const propsRef = useRef(p)
  propsRef.current = p
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (p.initialFocus === 'input') ref.current?.querySelector<HTMLElement>('input,textarea')?.focus()
    else cancelRef.current?.focus()
    const focusables = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]') ?? [])]
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!propsRef.current.busy) propsRef.current.onCancel()
        return
      }
      if (e.key !== 'Tab' || !ref.current) return
      const items = focusables()
      if (!items.length) { e.preventDefault(); ref.current.focus(); return }
      const active = document.activeElement
      const inside = active instanceof Node && ref.current.contains(active) && active !== ref.current
      if (!inside) { e.preventDefault(); (e.shiftKey ? items[items.length - 1] : items[0]).focus(); return }
      if (e.shiftKey && active === items[0]) { e.preventDefault(); items[items.length - 1].focus() }
      else if (!e.shiftKey && active === items[items.length - 1]) { e.preventDefault(); items[0].focus() }
    }
    function onFocusIn(e: FocusEvent) {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) ref.current.focus()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocusIn)
      opener?.focus()
    }
    // Runs once per opening: focus moves in on open and back out on close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    // A focused button that becomes disabled while busy would drop focus to the page: keep it in the dialog.
    if (!p.busy || !ref.current) return
    const a = document.activeElement
    if (!(a instanceof HTMLElement) || !ref.current.contains(a) || a === ref.current || (a as HTMLButtonElement).disabled) ref.current.focus()
  }, [p.busy])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="aeo-dialog-title" tabIndex={-1} className={`${cardCls} w-full max-w-md`}>
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
