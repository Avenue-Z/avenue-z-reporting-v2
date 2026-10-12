'use client'
// The More menu on a hub row (spec v1.1 §17.9): the secondary row actions behind one button. The list is positioned
// fixed from the button because the table card scrolls sideways and would clip an absolutely positioned list. It closes
// on Escape (focus back on the button), a mousedown outside, any scroll, a resize and after an item is chosen; opening
// one menu closes any other. Every document and window listener lives only while the menu is open.
import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { btnCls } from './ui'

export interface RowMenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
}

const OPEN_EVENT = 'aeo-row-menu-open'

export function RowMenu({ items, label }: { items: RowMenuItem[]; label: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const wrapRef = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btnRef.current?.focus()
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target
      if (t instanceof Node && wrapRef.current?.contains(t)) return
      setOpen(false)
    }
    // Focus moving to an element outside the menu (Tab past the last item) closes it; focus stays where the user sent it.
    // A null relatedTarget is ignored: Safari does not focus a clicked button, and focus leaving the page also gives
    // null. Outside mousedown, Escape, scroll and resize still close the menu.
    const onFocusOut = (e: FocusEvent) => {
      const to = e.relatedTarget
      if (to instanceof Element && !wrapRef.current?.contains(to)) setOpen(false)
    }
    const wrap = wrapRef.current
    wrap?.addEventListener('focusout', onFocusOut)
    const onOther = (e: Event) => { if ((e as CustomEvent<string>).detail !== id) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('scroll', close, true)
    document.addEventListener(OPEN_EVENT, onOther)
    window.addEventListener('resize', close)
    return () => {
      wrap?.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('scroll', close, true)
      document.removeEventListener(OPEN_EVENT, onOther)
      window.removeEventListener('resize', close)
    }
  }, [open, id])

  function toggle() {
    if (open) { setOpen(false); return }
    const rect = btnRef.current?.getBoundingClientRect()
    // clientWidth, not innerWidth: innerWidth includes a visible scrollbar, which would shift the fixed list right.
    if (rect) setPos({ top: rect.bottom + 4, right: document.documentElement.clientWidth - rect.right })
    document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }))
    setOpen(true)
  }

  function choose(item: RowMenuItem) {
    // Focus More first: a dialog the item opens records the focused element as its opener and gives focus back to it.
    btnRef.current?.focus()
    setOpen(false)
    item.onSelect()
  }

  return (
    <span ref={wrapRef} className="inline-flex">
      <button ref={btnRef} type="button" className={`${btnCls} inline-flex items-center gap-1`} aria-label={`More actions for ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        More
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <div role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right }} className="z-30 min-w-[160px] rounded-md border border-white/[0.08] bg-bg-surface p-1 shadow-lg">
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" disabled={item.disabled} onClick={() => choose(item)}
              className="block w-full rounded px-3 py-1.5 text-left text-xs text-white hover:bg-white/[0.06] disabled:opacity-50">{item.label}</button>
          ))}
        </div>
      )}
    </span>
  )
}
