'use client'
// The leave guard shared by the editor and Settings (spec v1.1 §17.9): while there are unsaved edits the browser warns on
// unload, and in-app navigation asks first. `ask` receives the navigation to run if the person chooses to leave.
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/** Marks the history entry the guard adds on top of the page's own (spec v1.1 §19.7). */
export const GUARD_STATE_KEY = '__aeoLeaveGuard'

export function useLeaveGuard(unsaved: boolean, ask: (go: () => void) => void): void {
  const router = useRouter()
  const unsavedRef = useRef(unsaved)
  const askRef = useRef(ask)
  useEffect(() => { unsavedRef.current = unsaved; askRef.current = ask })
  // The browser Back button (spec v1.1 §19.7, A2): one extra history entry for this same address sits on top of the
  // page's own. Back lands on the page's entry without leaving it: with unsaved edits the entry is added again and the
  // same Leave / Stay dialog asks (Leave goes back past both); with nothing unsaved it goes straight back, so Back still
  // takes one press. The router's own state is kept in the entry, and a remount on the guard entry adds no second one.
  useEffect(() => {
    const here = window.location.href
    const guarded = () => ({ ...(window.history.state ?? {}), [GUARD_STATE_KEY]: true })
    if (!(window.history.state ?? {})[GUARD_STATE_KEY]) window.history.pushState(guarded(), '', here)
    let leaving = false
    const onPop = (e: PopStateEvent) => {
      if (leaving || window.location.href !== here || (e.state ?? {})[GUARD_STATE_KEY]) return
      if (!unsavedRef.current) { leaving = true; window.history.back(); return }
      window.history.pushState(guarded(), '', here)
      askRef.current(() => { leaving = true; window.history.go(-2) })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])
  // In-app links outside the page (the sidebar) would unmount it and drop an edit: ask first. The browser Back button is
  // guarded above; beforeunload covers a full unload.
  useEffect(() => {
    if (!unsaved) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target instanceof Element ? e.target.closest('a') : null
      if (!a || a.target === '_blank' || a.closest('[role="dialog"]')) return
      const href = a.getAttribute('href')
      if (!href) return
      let url: URL
      try { url = new URL(href, window.location.href) } catch { return }
      if (url.origin !== window.location.origin) return
      e.preventDefault()
      e.stopPropagation()
      ask(() => router.push(`${url.pathname}${url.search}${url.hash}`))
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
    // `ask` is a state-setter wrapper and the router is stable, so the listeners only depend on `unsaved`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsaved])
}
