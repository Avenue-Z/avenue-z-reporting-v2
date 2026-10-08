'use client'

import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { isDocumentReady } from '@/lib/export/readiness'

/** True inside the PDF export page (app/export/...). Client components read it to render their
 *  static, page-aware form: no hover cards or editors, animations off, unbreakable blocks. */
const ExportMode = createContext(false)

export function ExportModeProvider({ children }: { children: ReactNode }) {
  return <ExportMode.Provider value={true}>{children}</ExportMode.Provider>
}

export function useExportMode(): boolean {
  return useContext(ExportMode)
}

declare global {
  interface Window { __exportReady?: boolean }
}

/** Sets `window.__exportReady` once the page has fully loaded (lib/export/readiness.ts) on two
 *  consecutive frames after the fonts are ready: the renderer (lib/export/render-pdf.ts) waits for
 *  it, so a PDF is never taken of a page still showing a placeholder. */
export function ExportReadyReporter() {
  useEffect(() => {
    let frame = 0
    let streak = 0
    let stopped = false
    const tick = () => {
      if (stopped) return
      streak = isDocumentReady(document) ? streak + 1 : 0
      if (streak >= 2) { window.__exportReady = true; return }
      frame = requestAnimationFrame(tick)
    }
    document.fonts.ready.then(() => { if (!stopped) frame = requestAnimationFrame(tick) })
    return () => { stopped = true; cancelAnimationFrame(frame) }
  }, [])
  return null
}
