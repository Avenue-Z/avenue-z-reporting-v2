import type { ReactNode } from 'react'
import type { ResolvedPart } from '@/lib/report-sections/types'
import { OVERVIEW_SECTIONS, type PartGroup } from './sections'

export function OverviewBody({
  groups,
  renderPart,
}: {
  groups: PartGroup[]
  renderPart: (r: ResolvedPart) => ReactNode
}) {
  let headersSeen = 0
  return (
    <div className="space-y-8">
      {groups.map((g, i) => {
        const parts = g.parts.map((r) => (
          <div key={`${r.id}@${r.version}`}>{renderPart(r)}</div>
        ))
        if (g.section === null || !g.showHeader) {
          return <div key={i} className="space-y-6">{parts}</div>
        }
        const meta = OVERVIEW_SECTIONS[g.section]
        const first = headersSeen++ === 0
        return (
          <section
            key={i}
            id={`aeo-section-${g.section}`}
            className={`scroll-mt-24 space-y-6 ${first ? '' : 'border-t border-white/10 pt-8'}`}
          >
            <header>
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
                {`${g.section} · ${meta.label}`}
              </p>
              <h2 className="mt-1 text-lg font-bold text-white">{meta.headline}</h2>
              <p className="mt-0.5 text-sm text-text-muted">{meta.description}</p>
            </header>
            {parts}
          </section>
        )
      })}
    </div>
  )
}
