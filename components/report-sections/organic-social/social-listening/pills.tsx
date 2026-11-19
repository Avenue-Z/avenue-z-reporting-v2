'use client'
// The Brand and Industry pills. Each sets the `sl` URL param and keeps every other one, as the AEO tab's controls do
// (aeo-informed/controls.tsx); Brand, the default, removes it. The PDF prints both topics, so there are no pills there.
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useExportMode } from '@/components/export/export-mode'
import type { SlTopic } from '@/lib/organic-social/social-listening/types'

export function TopicPills({ topic, industry, brandLabel, industryLabel }: { topic: SlTopic; industry: boolean; brandLabel: string; industryLabel: string }) {
  const exportMode = useExportMode()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  if (exportMode) return null
  const go = (t: SlTopic) => {
    const params = new URLSearchParams(searchParams.toString())
    if (t === 'brand') params.delete('sl')
    else params.set('sl', t)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }
  const pill = (t: SlTopic, label: string, dot: string) => (
    <button key={t} type="button" aria-pressed={topic === t} onClick={() => go(t)}
      className={cn('inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors',
        topic === t ? 'border-white/30 bg-white/[0.12] text-white' : 'border-white/10 text-text-muted hover:text-white')}>
      <i className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />{label}
    </button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Topic">
      {pill('brand', brandLabel, '#60FDFF')}
      {industry && pill('industry', industryLabel, '#6034FF')}
    </div>
  )
}
