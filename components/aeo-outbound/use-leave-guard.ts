'use client'
// The leave guard shared by the editor and Settings (spec v1.1 §17.9): while there are unsaved edits the browser warns on
// unload, and in-app navigation asks first. `ask` receives the navigation to run if the person chooses to leave.
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/** The browser's Navigation API, where it exists (Chrome and Edge): enough of it to cancel a Back and redo it later. */
type NavigateLike = Event & { navigationType?: string; cancelable: boolean; destination?: { key?: string } }
type NavigationLike = EventTarget & { traverseTo?: (key: string) => unknown }

export function useLeaveGuard(unsaved: boolean, ask: (go: () => void) => void): void {
  const router = useRouter()
  const unsavedRef = useRef(unsaved)
  const askRef = useRef(ask)
  useEffect(() => { unsavedRef.current = unsaved; askRef.current = ask })
  // The browser Back and Forward buttons (spec v1.1 §19.7, A2): with unsaved edits the traversal is cancelled and the
  // same Leave / Stay dialog asks; Leave then goes where the button was taking Ryan. This uses the browser's Navigation
  // API, which cancels a traversal without adding history entries. Live test 2026-10-14: an extra history entry, the
  // first design, lost its mark whenever Next.js refreshed the page, so Back stopped asking. Where the API is missing
  // (older Safari and Firefox) Back behaves as before and closing the tab still warns.
  useEffect(() => {
    const nav = (window as unknown as { navigation?: NavigationLike }).navigation
    if (!nav || typeof nav.addEventListener !== 'function' || typeof nav.traverseTo !== 'function') return
    let leaving = false
    const onNavigate = (event: Event) => {
      const e = event as NavigateLike
      const key = e.destination?.key
      if (leaving || e.navigationType !== 'traverse' || !e.cancelable || !unsavedRef.current || !key) return
      e.preventDefault()
      askRef.current(() => {
        leaving = true
        // A traversal that does not happen (the entry is gone) hands the guard back.
        const r = nav.traverseTo!(key) as { finished?: Promise<unknown> } | undefined
        r?.finished?.catch(() => { leaving = false })
      })
    }
    nav.addEventListener('navigate', onNavigate)
    return () => nav.removeEventListener('navigate', onNavigate)
  }, [])
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])
  // In-app links outside the page (the sidebar) would unmount it and drop an edit: ask first. The browser's Back and
  // Forward buttons are guarded above; beforeunload covers a full unload.
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
