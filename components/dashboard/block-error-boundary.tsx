'use client'

import type { ReactNode } from 'react'
import { ReportErrorBoundary } from '../report-sections/error-boundary'

/** Per-block isolation. A block that throws during render (e.g. an RSC boundary
 *  violation, or an unexpected throw in a kind renderer) degrades to this inline
 *  card instead of taking down the entire dashboard page. Each block gets its own
 *  boundary instance, so one failure never blanks its neighbors. The fallback
 *  mirrors BlockBodyError's card shape so it sits cleanly in the grid cell. */
export function BlockErrorBoundary({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ReportErrorBoundary
      fallback={
        <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 h-full flex flex-col">
          <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
          <div className="mt-auto">
            <p className="text-base font-bold text-white">Couldn’t load this block</p>
            <p className="mt-1 text-xs text-text-muted">Something went wrong rendering it. Try editing or removing the block.</p>
          </div>
        </div>
      }
    >
      {children}
    </ReportErrorBoundary>
  )
}
