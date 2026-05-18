'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { REPORT_NAMES } from '@/lib/constants'
import type { ReportSlug } from '@/lib/clients.config'

export function PortalReportNav({
  sections,
  activeSection,
  clientSlug,
}: {
  sections: ReportSlug[]
  activeSection: string
  clientSlug: string
}) {
  const searchParams = useSearchParams()
  const dateRange = searchParams.get('dateRange')

  return (
    <div className="mb-8 flex flex-wrap gap-2">
      {sections.map((slug) => {
        const params = new URLSearchParams()
        params.set('section', slug)
        if (dateRange) params.set('dateRange', dateRange)

        return (
          <Link
            key={slug}
            href={`/portal/${clientSlug}/reports?${params.toString()}`}
            className={cn(
              'rounded-[100px] px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors',
              activeSection === slug
                ? 'bg-white text-black'
                : 'text-text-muted hover:bg-bg-subtle hover:text-white'
            )}
          >
            {REPORT_NAMES[slug] ?? slug}
          </Link>
        )
      })}
    </div>
  )
}
