'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { REPORT_NAMES } from '@/lib/constants'
import type { ReportSlug } from '@/lib/clients.config'

export function ReportNav({ sections }: { sections: ReportSlug[] }) {
  const [activeSection, setActiveSection] = useState<string>(sections[0])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const slug = entry.target.id.replace('section-', '')
            setActiveSection(slug)
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    )

    for (const slug of sections) {
      const el = document.getElementById(`section-${slug}`)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [sections])

  const scrollTo = (slug: string) => {
    const el = document.getElementById(`section-${slug}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="sticky top-0 z-20 -mx-12 mb-8 border-b border-white/[0.06] bg-black/80 px-12 py-3 backdrop-blur-md">
      <div className="flex flex-wrap gap-2">
        {sections.map((slug) => (
          <button
            key={slug}
            onClick={() => scrollTo(slug)}
            className={cn(
              'rounded-[100px] px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors',
              activeSection === slug
                ? 'bg-white text-black'
                : 'text-text-muted hover:bg-bg-subtle hover:text-white'
            )}
          >
            {REPORT_NAMES[slug] ?? slug}
          </button>
        ))}
      </div>
    </div>
  )
}
