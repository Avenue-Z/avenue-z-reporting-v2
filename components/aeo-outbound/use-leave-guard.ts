'use client'
// The leave guard shared by the editor and Settings (spec v1.1 §17.9): while there are unsaved edits the browser warns on
// unload, and in-app navigation asks first. `ask` receives the navigation to run if the person chooses to leave.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function useLeaveGuard(unsaved: boolean, ask: (go: () => void) => void): void {
  const router = useRouter()
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])
  // In-app links outside the page (the sidebar) would unmount it and drop an edit: ask first. The browser Back
  // button (popstate) is not guarded; only beforeunload covers a full unload.
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
