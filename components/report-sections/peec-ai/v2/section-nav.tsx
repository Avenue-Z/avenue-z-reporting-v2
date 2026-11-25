'use client'

import { useExportMode } from '@/components/export/export-mode'
import { OVERVIEW_SECTIONS, type OverviewSectionId } from './sections'

export function OverviewSectionNav({ sections }: { sections: OverviewSectionId[] }) {
  const exporting = useExportMode()
  if (exporting) return null
  return (
    <nav aria-label="Overview sections" className="hidden lg:block sticky top-24 self-start">
      <ul className="space-y-2">
        {sections.map((id) => (
          <li key={id}>
            <a
              href={`#aeo-section-${id}`}
              className="text-xs font-semibold uppercase tracking-widest text-text-muted hover:text-white"
            >
              {`${id} ${OVERVIEW_SECTIONS[id].label}`}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
